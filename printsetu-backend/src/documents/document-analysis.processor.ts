import { Inject, Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { AnalysisClientService } from './analysis-client.service';
import { DocumentsRepository } from './documents.repository';
import { DOCUMENT_ANALYSIS_QUEUE } from './document-queue.constants';

export interface DocumentAnalysisJobData {
  documentId: string;
}

/**
 * BullMQ worker for the document Upload -> Processing stage (SRS §9 /
 * §10.1 / §14: "PDF page-count and color-detection processing, invoked by
 * the backend" over a "Redis-backed BullMQ queue" for "retries and
 * progress updates"). One dispatch attempt per invocation; BullMQ handles
 * backoff/retry scheduling per DOCUMENT_ANALYSIS_JOB_OPTS at enqueue time.
 */
@Processor(DOCUMENT_ANALYSIS_QUEUE)
export class DocumentAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentAnalysisProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DocumentsRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly analysisClient: AnalysisClientService,
  ) {
    super();
  }

  async process(job: Job<DocumentAnalysisJobData>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Analysis attempt ${job.attemptsMade + 1} for document ${documentId}`);

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.status === DocumentStatus.DELETED) {
      return; // deleted/retracted before analysis ran — nothing to do
    }

    if (
      document.status === DocumentStatus.UPLOADED ||
      document.status === DocumentStatus.ANALYSIS_FAILED
    ) {
      await this.repo.transition({
        documentId,
        from: document.status,
        to: DocumentStatus.PROCESSING,
      });
    } else if (document.status !== DocumentStatus.PROCESSING) {
      return; // already PROCESSED/PRINT_ELIGIBLE — nothing left to analyze
    }

    const buffer = await this.storage.getObject(document.s3Key);
    const result = await this.analysisClient.analyze(
      buffer,
      document.mimeType,
      document.originalName,
    );

    if (!result) {
      // Throwing lets BullMQ retry with backoff; the 'failed' handler below
      // marks ANALYSIS_FAILED only once retries are exhausted (SRS §13.3-style
      // "never fail the record on a single transient error").
      throw new Error(`Analysis service did not return a result for document ${documentId}.`);
    }

    await this.repo.transition({
      documentId,
      from: DocumentStatus.PROCESSING,
      to: DocumentStatus.PROCESSED,
      data: {
        pageCount: result.pageCount,
        colorPages: result.colorPages,
        colorDetectionConfidence: result.confidence,
      },
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DocumentAnalysisJobData> | undefined): Promise<void> {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // more retries scheduled; leave status as PROCESSING
    }

    const { documentId } = job.data;
    this.logger.error(
      `Document ${documentId} analysis failed permanently after ${job.attemptsMade} attempt(s).`,
    );
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.status !== DocumentStatus.PROCESSING) {
      return; // already resolved (e.g. deleted) — do not overwrite
    }
    await this.repo.transition({
      documentId,
      from: DocumentStatus.PROCESSING,
      to: DocumentStatus.ANALYSIS_FAILED,
    });
  }
}
