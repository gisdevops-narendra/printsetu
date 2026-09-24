import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentStatus, PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { PrintJobsRepository } from '../print/print-jobs.repository';
import { printReadyKey } from '../print/pdf-print-ready';

/**
 * SRS §9 Document Lifecycle "Cleanup" row: a scheduled job deletes eligible
 * S3 objects and marks metadata as deleted — it never deletes solely
 * because a print command was *attempted*, only after RETENTION_PENDING
 * (i.e. a confirmed PRINTED job). There is no retention window: a job's
 * documents are deleted on the first sweep after it completes.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly printJobsRepo: PrintJobsRepository,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async sweep() {
    const candidates = await this.prisma.printJob.findMany({
      where: { status: PrintJobStatus.RETENTION_PENDING },
      include: { items: { include: { document: true } } },
    });
    let deletedCount = 0;

    for (const job of candidates) {
      const pendingDocuments = job.items
        .map((item) => item.document)
        .filter((document) => document.status !== DocumentStatus.DELETED);

      // Print-ready copies made at dispatch (PDFs only); a missing object deletes as a no-op.
      for (const item of job.items) {
        if (item.document.status === DocumentStatus.DELETED || item.document.mimeType !== 'application/pdf') continue;
        const key = printReadyKey(item.document, item.id);
        await this.storage.deleteObject(key).catch((error: Error) => {
          this.logger.warn(`Failed to delete object ${key}: ${error.message}`);
        });
      }

      let deleteFailed = false;
      for (const document of pendingDocuments) {
        try {
          await this.storage.deleteObject(document.s3Key);
        } catch (error) {
          this.logger.error(
            `Failed to delete object ${document.s3Key}: ${(error as Error).message}`,
          );
          deleteFailed = true;
          continue; // retry this one next sweep rather than mark DELETED with an orphaned object
        }
        await this.prisma.document.update({
          where: { id: document.id },
          data: { status: DocumentStatus.DELETED, deletedAt: new Date() },
        });
      }
      if (deleteFailed) continue; // leave the job RETENTION_PENDING; next sweep retries the stragglers

      await this.printJobsRepo.transition({
        jobId: job.id,
        from: PrintJobStatus.RETENTION_PENDING,
        to: PrintJobStatus.DELETED,
        message: 'Print job completed; documents deleted.',
      });
      deletedCount += 1;
    }

    if (deletedCount > 0) {
      this.logger.log(`Retention sweep deleted ${deletedCount} document object(s).`);
    }
  }

  /**
   * SRS §13.3 "Print command accepted but result uncertain -> Job moves to
   * PRINTING/UNKNOWN and requires controlled reconciliation; do not
   * automatically delete." A job stuck in PRINTING with no update for
   * STALE_PRINTING_MS is presumed uncertain, not failed — a human
   * (shopkeeper) must resolve it via POST /shop/print-jobs/:id/reconcile.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async flagStalePrinting() {
    const staleBefore = new Date(Date.now() - STALE_PRINTING_MS);
    const stale = await this.prisma.printJob.findMany({
      where: { status: PrintJobStatus.PRINTING, updatedAt: { lt: staleBefore } },
    });
    for (const job of stale) {
      await this.printJobsRepo.transition({
        jobId: job.id,
        from: PrintJobStatus.PRINTING,
        to: PrintJobStatus.PRINT_UNKNOWN,
        message: 'No agent update received within the expected window.',
      });
    }
    if (stale.length > 0) {
      this.logger.warn(`Flagged ${stale.length} stale PRINTING job(s) as PRINT_UNKNOWN.`);
    }
  }
}

const STALE_PRINTING_MS = 3 * 60_000;
