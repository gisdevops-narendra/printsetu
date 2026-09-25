import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { AgentConfig } from './config';
import { BackendHttpClient, AgentJobPayload, AgentJobDocument, FailureReport } from './http-client';
import {
  DetectedPrinter,
  PrinterAdapter,
  PrintOptions,
  PrintOutcomeUnknownError,
} from './printing/printer-adapter.interface';
import {
  classifyDownloadError,
  classifyPrintError,
  describeError,
  errorMessage,
  JobStage,
  PrintFailure,
} from './printing/print-failure';
import { logger } from './logger';

/**
 * Orchestrates one job end-to-end: download -> print -> report. The
 * backend, not this process, owns the print-job state machine (SRS
 * §13.1: "the agent is not trusted to change print-eligibility or order
 * status") — this class only ever *reports* what happened.
 */
const PRINT_RETRY_ATTEMPTS = 2;
const PRINT_RETRY_DELAY_MS = 2000;
// If the final report can't reach the backend, the order would sit in
// PRINTING with no outcome or reason at all — try a few times before giving up.
const FAILURE_REPORT_DELAYS_MS = [0, 3000, 10000];

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

    let stage: JobStage = 'report';
    let printerName: string | undefined;
    let current: { doc: AgentJobDocument; index: number; bytes?: number } | undefined;
    try {
      await this.http.reportStatus(job.jobId, 'ACCEPTED', attemptId);
      stage = 'choose-printer';
      printerName = await this.resolvePrinter(job.printerName);
      logger.info(`Job ${job.jobId} will print on "${printerName ?? '(OS default)'}".`);
      stage = 'report';
      await this.http.reportStatus(job.jobId, 'PRINTING', attemptId);

      // One print request can carry several documents (each with its own
      // options) — print them in order, as one atomic outcome: the backend
      // still only tracks accepted/printing/printed/failed per JOB, not
      // per document, so if any document fails the whole job reports
      // PRINT_FAILED (documents already sent to the spooler before the
      // failure cannot be un-printed; the shopkeeper resolves it manually).
      for (const [index, doc] of job.documents.entries()) {
        current = { doc, index };
        const extension = doc.mimeType === 'application/pdf' ? '.pdf' : doc.mimeType === 'image/png' ? '.png' : '.jpg';
        const filePath = path.join(this.config.downloadDir, `${job.jobId}-${doc.documentId}${extension}`);
        try {
          stage = 'download';
          try {
            current.bytes = await this.http.downloadToFile(doc.documentSignedUrl, filePath);
          } catch (error) {
            throw classifyDownloadError(error);
          }
          stage = 'print';
          await this.printWithRetry(filePath, printerName, doc.options);
        } finally {
          fs.promises.unlink(filePath).catch(() => undefined);
        }
      }

      stage = 'report-printed';
      current = undefined;
      await this.http.reportStatus(job.jobId, 'PRINTED', attemptId);
      logger.info(`Job ${job.jobId} printed successfully (${job.documents.length} document(s)).`);
    } catch (error) {
      if (stage === 'report-printed') {
        // Everything printed — only telling the backend failed. Never turn that into PRINT_FAILED.
        logger.error(`Job ${job.jobId} printed, but reporting it failed: ${errorMessage(error)}`);
        await this.reportWithRetry(job.jobId, 'PRINTED', attemptId);
        return;
      }
      // SRS §13.3 "Paper unavailable / driver error" -> fail safely, keep the job retryable.
      const failure =
        error instanceof PrintFailure
          ? error
          : stage === 'print'
            ? await this.explainPrintError(error, printerName)
            : new PrintFailure(
                'UNKNOWN',
                'The Printer App could not update this order in PrintSetu. Check the internet connection, then print again.',
                describeError(error),
              );

      // Which document broke matters when an order has several: earlier ones are already printed.
      let message = failure.message;
      if (current && job.documents.length > 1) {
        const alreadySent =
          current.index === 0 ? '' : current.index === 1 ? '; document 1 was already sent to the printer' : `; documents 1–${current.index} were already sent to the printer`;
        message += ` (document ${current.index + 1} of ${job.documents.length}: "${current.doc.originalName}"${alreadySent})`;
      }
      const context = [
        `stage=${stage}`,
        `printer=${printerName ?? '(OS default)'}`,
        current ? `document=${current.doc.documentId} (${current.doc.mimeType}, ${current.bytes ?? '?'} bytes)` : undefined,
        `agent=${os.hostname()} ${process.platform} ${os.release()}`,
      ].filter(Boolean).join('; ');
      const detail = `${context} | ${failure.detail}`;

      logger.error(`Job ${job.jobId} ${failure.outcomeUnknown ? 'has an unknown outcome' : 'failed'} [${failure.code}]: ${message}`, {
        attemptId,
        detail,
        stack: error instanceof Error ? error.stack : undefined,
      });
      await this.reportWithRetry(job.jobId, failure.outcomeUnknown ? 'PRINT_UNKNOWN' : 'PRINT_FAILED', attemptId, {
        message,
        errorCode: failure.code,
        errorDetail: detail,
      });
    } finally {
      this.inProgress.delete(job.jobId);
    }
  }

  /** The print command's own error rarely says why — ask the OS about the printer before classifying it. */
  private async explainPrintError(error: unknown, printerName: string | undefined): Promise<PrintFailure> {
    const diagnostics = await this.printer.diagnose?.(printerName).catch(() => undefined);
    return classifyPrintError(error, printerName, diagnostics);
  }

  private async reportWithRetry(
    jobId: string,
    status: 'PRINTED' | 'PRINT_FAILED' | 'PRINT_UNKNOWN',
    attemptId: string,
    failure?: FailureReport,
  ): Promise<void> {
    for (const [i, delay] of FAILURE_REPORT_DELAYS_MS.entries()) {
      if (delay) await sleep(delay);
      try {
        await this.http.reportStatus(jobId, status, attemptId, failure);
        return;
      } catch (reportError) {
        logger.error(
          `Could not report ${status} for job ${jobId} (try ${i + 1}/${FAILURE_REPORT_DELAYS_MS.length}): ${errorMessage(reportError)}`,
        );
      }
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
      logger.warn(`Could not list printers, printing without validation: ${errorMessage(error)}`);
    }

    if (requested) {
      if (printers && !printers.some((p) => p.name === requested)) {
        throw new PrintFailure(
          'PRINTER_NOT_FOUND',
          `Printer "${requested}" is not installed on this computer. Choose a printer again on the Printer App page.`,
          `installed printers: ${installedList(printers)}`,
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
      throw new PrintFailure('PRINTER_NOT_FOUND', 'No printers are installed on this computer.', 'installed printers: (none)');
    }
    throw new PrintFailure(
      'PRINTER_NOT_FOUND',
      'This computer has several printers and none is set as default. Choose one on the Printer App page.',
      `installed printers: ${installedList(printers)}`,
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
          logger.warn(`Print attempt ${attempt} failed, retrying in ${PRINT_RETRY_DELAY_MS}ms: ${errorMessage(error)}`, {
            detail: describeError(error),
          });
          await sleep(PRINT_RETRY_DELAY_MS);
        }
      }
    }
    throw lastError;
  }
}

function installedList(printers: DetectedPrinter[]): string {
  return printers.map((p) => `${p.name}${p.isDefault ? ' (default)' : ''}`).join(', ') || '(none)';
}
