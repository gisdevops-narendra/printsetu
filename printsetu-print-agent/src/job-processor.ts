import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { AgentConfig } from './config';
import { BackendHttpClient, AgentJobPayload } from './http-client';
import {
  DetectedPrinter,
  PrinterAdapter,
  PrintOptions,
  PrintOutcomeUnknownError,
} from './printing/printer-adapter.interface';
import { logger } from './logger';

/**
 * Orchestrates one job end-to-end: download -> print -> report. The
 * backend, not this process, owns the print-job state machine (SRS
 * §13.1: "the agent is not trusted to change print-eligibility or order
 * status") — this class only ever *reports* what happened.
 */
const PRINT_RETRY_ATTEMPTS = 2;
const PRINT_RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JobProcessor {
  private readonly inProgress = new Set<string>();

  constructor(
    private readonly config: AgentConfig,
    private readonly http: BackendHttpClient,
    private readonly printer: PrinterAdapter,
  ) {
    if (!fs.existsSync(config.downloadDir)) fs.mkdirSync(config.downloadDir, { recursive: true });
  }

  async handle(job: AgentJobPayload): Promise<void> {
    if (this.inProgress.has(job.jobId)) {
      logger.warn(`Ignoring duplicate dispatch for job ${job.jobId} (already in progress).`);
      return;
    }
    this.inProgress.add(job.jobId);
    const attemptId = job.attemptId || uuid();

    try {
      await this.http.reportStatus(job.jobId, 'ACCEPTED', attemptId);
      const printerName = await this.resolvePrinter(job.printerName);
      logger.info(`Job ${job.jobId} will print on "${printerName ?? '(OS default)'}".`);
      await this.http.reportStatus(job.jobId, 'PRINTING', attemptId);

      // One print request can carry several documents (each with its own
      // options) — print them in order, as one atomic outcome: the backend
      // still only tracks accepted/printing/printed/failed per JOB, not
      // per document, so if any document fails the whole job reports
      // PRINT_FAILED (documents already sent to the spooler before the
      // failure cannot be un-printed; the shopkeeper resolves it manually).
      for (const doc of job.documents) {
        const extension = doc.mimeType === 'application/pdf' ? '.pdf' : doc.mimeType === 'image/png' ? '.png' : '.jpg';
        const filePath = path.join(this.config.downloadDir, `${job.jobId}-${doc.documentId}${extension}`);
        try {
          await this.http.downloadToFile(doc.documentSignedUrl, filePath);
          await this.printWithRetry(filePath, printerName, doc.options);
        } finally {
          fs.promises.unlink(filePath).catch(() => undefined);
        }
      }

      await this.http.reportStatus(job.jobId, 'PRINTED', attemptId);
      logger.info(`Job ${job.jobId} printed successfully (${job.documents.length} document(s)).`);
    } catch (error) {
      // SRS §13.3 "Paper unavailable / driver error" -> fail safely, keep the job retryable.
      const unknown = error instanceof PrintOutcomeUnknownError;
      logger.error(`Job ${job.jobId} ${unknown ? 'has an unknown outcome' : 'could not be processed'}: ${(error as Error).message}`);
      try {
        await this.http.reportStatus(job.jobId, unknown ? 'PRINT_UNKNOWN' : 'PRINT_FAILED', attemptId, (error as Error).message);
      } catch (reportError) {
        logger.error(`Also failed to report failure for job ${job.jobId}: ${(reportError as Error).message}`);
      }
    } finally {
      this.inProgress.delete(job.jobId);
    }
  }

  /**
   * Picks the OS printer for a job. The shopkeeper's dashboard choice wins;
   * without one, a locally configured name (PRINTSETU_PRINTER_NAME /
   * agent.config.json) is used only if that printer really exists — older
   * downloads baked the dashboard label "Print Agent" in there, which is not
   * an OS printer — then the OS default, then the only installed printer.
   * Never guesses between several printers: printing a customer's document
   * on the wrong machine is worse than a clear PRINT_FAILED.
   */
  private async resolvePrinter(requested: string | null | undefined): Promise<string | undefined> {
    let printers: DetectedPrinter[] | null = null;
    try {
      printers = await this.printer.listPrinters();
    } catch (error) {
      logger.warn(`Could not list printers, printing without validation: ${(error as Error).message}`);
    }

    if (requested) {
      if (printers && !printers.some((p) => p.name === requested)) {
        throw new Error(
          `Printer "${requested}" is not installed on this computer. Choose a printer again on the Print Agent page.`,
        );
      }
      return requested;
    }
    if (!printers) return undefined;

    const configured = this.config.printerName;
    if (configured && printers.some((p) => p.name === configured)) return configured;

    const osDefault = printers.find((p) => p.isDefault);
    if (osDefault) return osDefault.name;
    if (printers.length === 1) return printers[0].name;
    if (printers.length === 0) {
      throw new Error('No printers are installed on this computer.');
    }
    throw new Error(
      'This computer has several printers and none is set as default. Choose one on the Print Agent page.',
    );
  }

  // USB/IPP-class-driver printers (e.g. small HP LaserJets) can transiently
  // report "printer doesn't exist" to the spooler API under rapid/back-to-
  // back submissions even though the OS printer list is correct — a driver
  // hiccup, not a real failure. Retry once with a short delay before
  // surfacing PRINT_FAILED, rather than relying on the shopkeeper to notice
  // and re-click Print.
  private async printWithRetry(filePath: string, printerName: string | undefined, options: PrintOptions): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= PRINT_RETRY_ATTEMPTS; attempt++) {
      try {
        await this.printer.print(filePath, printerName, options);
        return;
      } catch (error) {
        // The spooler may already hold this job — retrying could print it twice.
        if (error instanceof PrintOutcomeUnknownError) throw error;
        lastError = error;
        if (attempt < PRINT_RETRY_ATTEMPTS) {
          logger.warn(
            `Print attempt ${attempt} failed, retrying in ${PRINT_RETRY_DELAY_MS}ms: ${(error as Error).message}`,
          );
          await sleep(PRINT_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError;
  }
}
