import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentStatus, PrintJobStatus } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { PrintJobsRepository } from './print-jobs.repository';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { signToken } from '../common/utils/signed-token.util';
import { AppConfig } from '../config/configuration';
import { StatusTokenClaims } from '../common/types/request-context';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
  PrintAgentOfflineException,
  ShopAccessDeniedException,
} from '../common/exceptions/app.exceptions';
import { ConfirmPrintJobDto, AgentJobStatusDto, ReconcileJobDto } from './dto/print.dto';
import { PRINT_DISPATCH_QUEUE } from './print-queue.constants';

const JOB_STATUS_TOKEN_TTL_SECONDS = 48 * 60 * 60;

@Injectable()
export class PrintJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrintJobsRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly agentConnections: AgentConnectionRegistry,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue(PRINT_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {}

  /**
   * Customer confirm (SRS §5, §11): no payment step — quote becomes an
   * eligible order immediately. One PrintJob covers every document in the
   * quote (SRS extension: multi-document print requests) — one token
   * number, one status lifecycle, one PrintJobItem row per document
   * carrying that document's own options/price.
   */
  async confirmFromQuote(dto: ConfirmPrintJobDto, claims: StatusTokenClaims) {
    const quote = await this.prisma.printQuote.findUnique({
      where: { id: dto.quoteId },
      include: { items: true, session: true },
    });
    if (!quote) throw new AppNotFoundException('Quote not found.');
    if (claims.sessionId !== quote.sessionId || claims.shopId !== quote.session.shopId) {
      throw new ShopAccessDeniedException('Status token does not grant access to this quote.');
    }
    if (quote.consumedAt) {
      throw new InvalidPrintOptionException('This quote has already been used.');
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      throw new InvalidPrintOptionException('Quote has expired; please recalculate the price.');
    }
    if (quote.items.length === 0) {
      throw new InvalidPrintOptionException('Quote has no documents.');
    }

    const shopId = quote.session.shopId;
    const jobId = uuid();
    const statusToken = signToken(
      {
        shopId,
        printJobId: jobId,
        exp: Math.floor(Date.now() / 1000) + JOB_STATUS_TOKEN_TTL_SECONDS,
      },
      this.config.get('security', { infer: true }).statusTokenSecret,
    );

    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.printJob.create({
        data: {
          id: jobId,
          shopId,
          quoteId: quote.id,
          amount: quote.amount,
          currency: quote.currency,
          status: PrintJobStatus.CREATED,
          idempotencyKey: `quote:${quote.id}`,
          statusToken,
          items: {
            create: quote.items.map((item, index) => ({
              documentId: item.documentId,
              paperSize: item.paperSize,
              colorMode: item.colorMode,
              sideMode: item.sideMode,
              copies: item.copies,
              pageCount: item.pageCount,
              billablePages: item.billablePages,
              amount: item.amount,
              printOrder: index,
            })),
          },
        },
      });
      await tx.printJobEvent.create({ data: { printJobId: created.id, status: PrintJobStatus.CREATED } });

      await tx.printQuote.update({ where: { id: quote.id }, data: { consumedAt: new Date() } });
      await tx.document.updateMany({
        where: { id: { in: quote.items.map((item) => item.documentId) } },
        data: { status: DocumentStatus.PRINT_ELIGIBLE },
      });
      return created;
    });

    const eligible = await this.repo.transition({
      jobId: job.id,
      from: PrintJobStatus.CREATED,
      to: PrintJobStatus.PRINT_ELIGIBLE,
    });

    return {
      jobId: eligible.id,
      tokenNumber: eligible.tokenNumber,
      status: eligible.status,
      statusToken,
      amount: eligible.amount.toFixed(2),
      currency: eligible.currency,
    };
  }

  async shopQueue(shopId: string) {
    return this.prisma.printJob.findMany({
      where: {
        shopId,
        status: {
          in: [
            PrintJobStatus.PRINT_ELIGIBLE,
            PrintJobStatus.QUEUED,
            PrintJobStatus.PRINTING,
            PrintJobStatus.AGENT_OFFLINE,
            PrintJobStatus.PRINT_UNKNOWN,
          ],
        },
      },
      include: { items: { include: { document: true }, orderBy: { printOrder: 'asc' } }, printer: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async shopHistory(shopId: string, page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where: { shopId },
        include: { items: { include: { document: true }, orderBy: { printOrder: 'asc' } }, printer: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.printJob.count({ where: { shopId } }),
    ]);
    return { items, total, page, pageSize: take };
  }

  /** SRS §17.2 example: shopkeeper's PRINT action. QUEUED here means "handed to the print pipeline", not necessarily delivered yet. */
  async triggerPrint(jobId: string, shopId: string) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');

    const printer = job.printerId
      ? await this.prisma.printer.findUnique({ where: { id: job.printerId } })
      : await this.resolveShopPrinter(shopId);

    if (!printer) {
      throw new PrintAgentOfflineException('No printer is registered for this shop yet.');
    }

    const fromStatus = job.status;
    if (
      fromStatus !== PrintJobStatus.PRINT_ELIGIBLE &&
      fromStatus !== PrintJobStatus.AGENT_OFFLINE &&
      fromStatus !== PrintJobStatus.PRINT_FAILED
    ) {
      throw new InvalidPrintOptionException(`Job cannot be queued from status ${fromStatus}.`);
    }

    const updated = await this.repo.transition({
      jobId,
      from: fromStatus,
      to: PrintJobStatus.QUEUED,
      data: {
        printerId: printer.id,
        queuedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    await this.notifications.record(shopId, jobId, 'PRINT_QUEUED');
    await this.dispatchQueue.add(
      'dispatch',
      { printJobId: jobId },
      { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
    );

    return { jobId: updated.id, status: updated.status, printerId: printer.id, message: 'Print job queued' };
  }

  private async resolveShopPrinter(shopId: string) {
    const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
    if (settings?.defaultPrinterId) {
      const printer = await this.prisma.printer.findUnique({ where: { id: settings.defaultPrinterId } });
      if (printer) return printer;
    }
    return this.prisma.printer.findFirst({ where: { shopId }, orderBy: { createdAt: 'asc' } });
  }

  /** Called by the BullMQ processor to actually push the job to a connected agent. */
  async dispatchToAgent(jobId: string) {
    const job = await this.prisma.printJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { items: { include: { document: true }, orderBy: { printOrder: 'asc' } } },
    });
    if (job.status !== PrintJobStatus.QUEUED) return; // already progressed (e.g. reconciled)
    if (!job.printerId || !this.agentConnections.isConnected(job.printerId)) {
      await this.repo.transition({
        jobId,
        from: PrintJobStatus.QUEUED,
        to: PrintJobStatus.AGENT_OFFLINE,
        message: 'No connected agent at dispatch time.',
      });
      throw new Error('AGENT_OFFLINE'); // triggers BullMQ retry/backoff
    }

    const documents = await Promise.all(
      job.items.map(async (item) => ({
        documentId: item.documentId,
        originalName: item.document.originalName,
        mimeType: item.document.mimeType,
        documentSignedUrl: await this.storage.getSignedDownloadUrl(item.document.s3Key),
        options: {
          paperSize: item.paperSize,
          colorMode: item.colorMode,
          sideMode: item.sideMode,
          copies: item.copies,
        },
      })),
    );

    this.agentConnections.pushJob(job.printerId, {
      jobId: job.id,
      documents,
      attemptId: `${job.id}:${job.attemptCount}`,
    });
  }

  /** SRS §13.1: "Agent reports accepted/printing/success/failure states with timestamps and an agent-side attempt ID." */
  async reportAgentStatus(jobId: string, printerId: string, dto: AgentJobStatusDto) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || job.printerId !== printerId) {
      throw new AppNotFoundException('Print job not found for this agent.');
    }

    const map: Record<AgentJobStatusDto['status'], PrintJobStatus | null> = {
      ACCEPTED: PrintJobStatus.PRINTING,
      PRINTING: PrintJobStatus.PRINTING,
      PRINTED: PrintJobStatus.PRINTED,
      PRINT_FAILED: PrintJobStatus.PRINT_FAILED,
      PRINT_UNKNOWN: PrintJobStatus.PRINT_UNKNOWN,
    };
    const to = map[dto.status];
    if (!to) throw new InvalidPrintOptionException('Unrecognized agent status.');

    // ACCEPTED/PRINTING both land on PRINTING; the second call is a no-op if already there.
    const from = job.status === to ? null : job.status;
    let updated = job;
    if (from) {
      updated = await this.repo.transition({
        jobId,
        from,
        to,
        agentAttemptId: dto.agentAttemptId,
        message: dto.message,
        data: to === PrintJobStatus.PRINTED ? { printedAt: new Date() } : {},
      });
    }

    if (to === PrintJobStatus.PRINTED) {
      await this.notifications.record(job.shopId, jobId, 'PRINT_COMPLETED');
      // SRS §9: "Print success -> retention countdown starts" — chained
      // immediately; RetentionService later decides *when* to actually
      // delete based on print_settings.retention_minutes.
      updated = await this.repo.transition({
        jobId,
        from: PrintJobStatus.PRINTED,
        to: PrintJobStatus.RETENTION_PENDING,
      });
    } else if (to === PrintJobStatus.PRINT_FAILED) {
      await this.notifications.record(job.shopId, jobId, 'PRINT_FAILED');
      await this.prisma.printJob.update({ where: { id: jobId }, data: { failureReason: dto.message ?? 'Reported by agent' } });
    }

    return { jobId: updated.id, status: updated.status };
  }

  /** SRS §13.3 "Print command accepted but result uncertain" — controlled, manual reconciliation only. Never auto-deletes. */
  async reconcile(jobId: string, shopId: string, dto: ReconcileJobDto) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');
    if (job.status !== PrintJobStatus.PRINT_UNKNOWN) {
      throw new InvalidPrintOptionException('Only PRINT_UNKNOWN jobs can be manually reconciled.');
    }
    const to = dto.outcome === 'PRINTED' ? PrintJobStatus.PRINTED : PrintJobStatus.PRINT_FAILED;
    const updated = await this.repo.transition({
      jobId,
      from: PrintJobStatus.PRINT_UNKNOWN,
      to,
      message: dto.message ?? 'Manually reconciled by shopkeeper',
      data: to === PrintJobStatus.PRINTED ? { printedAt: new Date() } : {},
    });
    await this.audit.log({
      shopId,
      action: 'PRINT_JOB_RECONCILED',
      entityType: 'print_job',
      entityId: jobId,
      metadata: { outcome: dto.outcome },
    });
    return { jobId: updated.id, status: updated.status };
  }

  async getStatusForCustomer(jobId: string, claims: StatusTokenClaims) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        items: { include: { document: true }, orderBy: { printOrder: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!job) throw new AppNotFoundException('Print job not found.');
    if (claims.printJobId !== jobId || claims.shopId !== job.shopId) {
      throw new ShopAccessDeniedException('Status token does not grant access to this job.');
    }
    return job;
  }
}
