import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DocumentStatus, PrintJobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { PrintJobsRepository } from '../print/print-jobs.repository';
import { AppConfig } from '../config/configuration';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { DEFAULT_RETENTION_MINUTES_KEY } from '../system-settings/system-settings.constants';

/**
 * SRS §9 Document Lifecycle "Cleanup" row: a scheduled job deletes eligible
 * S3 objects and marks metadata as deleted — it never deletes solely
 * because a print command was *attempted*, only after RETENTION_PENDING
 * (i.e. a confirmed PRINTED job). Default window is 30 minutes (SRS §9
 * recommends 15–60, configurable — see print_settings.retention_minutes).
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly printJobsRepo: PrintJobsRepository,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly systemSettings: SystemSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep() {
    const candidates = await this.prisma.printJob.findMany({
      where: { status: PrintJobStatus.RETENTION_PENDING },
      include: {
        items: { include: { document: true } },
        shop: { include: { printSettings: true } },
      },
    });

    // SRS §6 "System settings": admin can override the platform-wide
    // default retention window at runtime; falls back to the env-sourced
    // value until an admin sets one (see system-settings module).
    const envDefaultMinutes = this.config.get('retention', { infer: true }).defaultMinutes;
    const defaultMinutes = await this.systemSettings.getOrDefault<number>(
      DEFAULT_RETENTION_MINUTES_KEY,
      envDefaultMinutes,
    );
    let deletedCount = 0;

    for (const job of candidates) {
      if (!job.printedAt) continue;
      const retentionMinutes = job.shop.printSettings?.retentionMinutes ?? defaultMinutes;
      const eligibleAt = new Date(job.printedAt.getTime() + retentionMinutes * 60_000);
      if (eligibleAt.getTime() > Date.now()) continue;

      const pendingDocuments = job.items
        .map((item) => item.document)
        .filter((document) => document.status !== DocumentStatus.DELETED);

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
        message: `Retention window (${retentionMinutes}m) elapsed.`,
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
