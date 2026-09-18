import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { AgentConfig } from './config';
import { BackendHttpClient, AgentJobPayload } from './http-client';
import { PrinterAdapter } from './printing/printer-adapter.interface';
import { logger } from './logger';

/**
 * Orchestrates one job end-to-end: download -> print -> report. The
 * backend, not this process, owns the print-job state machine (SRS
 * §13.1: "the agent is not trusted to change print-eligibility or order
 * status") — this class only ever *reports* what happened.
 */
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
          await this.printer.print(filePath, this.config.printerName, doc.options);
        } finally {
          fs.promises.unlink(filePath).catch(() => undefined);
        }
      }

      await this.http.reportStatus(job.jobId, 'PRINTED', attemptId);
      logger.info(`Job ${job.jobId} printed successfully (${job.documents.length} document(s)).`);
    } catch (error) {
      // SRS §13.3 "Paper unavailable / driver error" -> fail safely, keep the job retryable.
      logger.error(`Job ${job.jobId} could not be processed: ${(error as Error).message}`);
      try {
        await this.http.reportStatus(job.jobId, 'PRINT_FAILED', attemptId, (error as Error).message);
      } catch (reportError) {
        logger.error(`Also failed to report failure for job ${job.jobId}: ${(reportError as Error).message}`);
      }
    } finally {
      this.inProgress.delete(job.jobId);
    }
  }
}
