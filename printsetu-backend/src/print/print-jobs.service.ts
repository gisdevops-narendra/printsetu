import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentStatus, Prisma, PrinterStatus, PrintJobStatus } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { PrintJobsRepository } from './print-jobs.repository';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { AgentConnectionRegistry } from '../agent-connection/agent-connection-registry.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PricingCombo, PricingService, comboKey } from '../pricing/pricing.service';
import { signToken } from '../common/utils/signed-token.util';
import { AppConfig } from '../config/configuration';
import { StatusTokenClaims } from '../common/types/request-context';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
  PrintAgentOfflineException,
  ShopAccessDeniedException,
} from '../common/exceptions/app.exceptions';
import {
  ConfirmPrintJobDto,
  AgentJobStatusDto,
  ReconcileJobDto,
  ReorderItemsDto,
  UpdateItemSettingsDto,
} from './dto/print.dto';
import { PRINT_DISPATCH_QUEUE } from './print-queue.constants';
import { makePdfPrintReady, printReadyKey } from './pdf-print-ready';

const JOB_STATUS_TOKEN_TTL_SECONDS = 48 * 60 * 60;

/** Mime type of a stored render, from its extension (falls back to the document's). */
function mimeFromKey(key: string, fallback: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'pdf') return 'application/pdf';
  return fallback;
}

/** How long a finished job stays in the shop's live queue, showing "Printed". */
const RECENTLY_PRINTED_MS = 10 * 60_000;

@Injectable()
export class PrintJobsService {
  private readonly logger = new Logger(PrintJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: PrintJobsRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly agentConnections: AgentConnectionRegistry,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly pricingService: PricingService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue(PRINT_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
    private readonly subscriptionAccess: SubscriptionAccessService,
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
      throw new ShopAccessDeniedException(
        "This link has expired. Please scan the shop's QR code again.",
      );
    }
    if (quote.consumedAt) {
      throw new InvalidPrintOptionException('This order was already sent.');
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      throw new InvalidPrintOptionException(
        'This order took too long to confirm. Please check your order again.',
      );
    }
    if (quote.items.length === 0) {
      throw new InvalidPrintOptionException('Quote has no documents.');
    }

    const shopId = quote.session.shopId;
    await this.subscriptionAccess.assertCustomerCanOrder(shopId);
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
          priced: quote.priced,
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
      await tx.printJobEvent.create({
        data: { printJobId: created.id, status: PrintJobStatus.CREATED },
      });

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

    // Shops that opted into auto-accept skip the shopkeeper's PRINT tap. If it
    // can't be sent (e.g. no printer registered yet) the order simply stays
    // PRINT_ELIGIBLE for manual handling; it must never fail the customer's confirm.
    let status = eligible.status;
    const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
    if (settings?.autoAcceptOrders) {
      try {
        status = (await this.triggerPrint(eligible.id, shopId)).status;
      } catch (err) {
        this.logger.warn(
          `Auto-accept could not print job ${eligible.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      jobId: eligible.id,
      tokenNumber: eligible.tokenNumber,
      status,
      statusToken,
      amount: eligible.amount.toFixed(2),
      priced: eligible.priced,
      currency: eligible.currency,
    };
  }

  /**
   * Unfinished jobs, plus jobs printed in the last few minutes so the shopkeeper
   * sees each one finish (Pending -> Printing -> Printed) before it leaves the queue.
   * Failed jobs stay too: the shop resolves them by pressing PRINT again.
   */
  async shopQueue(shopId: string) {
    const recentlyPrinted = new Date(Date.now() - RECENTLY_PRINTED_MS);
    return this.prisma.printJob.findMany({
      where: {
        shopId,
        OR: [
          {
            status: {
              in: [
                PrintJobStatus.PRINT_ELIGIBLE,
                PrintJobStatus.QUEUED,
                PrintJobStatus.PRINTING,
                PrintJobStatus.AGENT_OFFLINE,
                PrintJobStatus.PRINT_UNKNOWN,
                PrintJobStatus.PRINT_FAILED,
              ],
            },
          },
          {
            status: {
              in: [
                PrintJobStatus.PRINTED,
                PrintJobStatus.RETENTION_PENDING,
                PrintJobStatus.DELETED,
              ],
            },
            printedAt: { gte: recentlyPrinted },
          },
        ],
      },
      include: {
        items: { include: { document: true }, orderBy: { printOrder: 'asc' } },
        printer: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async shopHistory(shopId: string, page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.printJob.findMany({
        where: { shopId },
        include: {
          items: { include: { document: true }, orderBy: { printOrder: 'asc' } },
          printer: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.printJob.count({ where: { shopId } }),
    ]);
    return { items, total, page, pageSize: take };
  }

  /**
   * Bulk-deletes finished history rows on explicit user request. Scoped to
   * DELETED/CANCELLED only — never a status the Queue still acts on
   * (PRINT_ELIGIBLE/QUEUED/PRINTING/AGENT_OFFLINE/PRINT_UNKNOWN/PRINT_FAILED
   * all stay retryable/reconcilable) — so an in-flight or retryable job can
   * never be wiped out from under a shopkeeper or the print agent.
   *
   * Note: this permanently removes rows that
   * ReportsService.summary()/printHistory() count toward "printed jobs" and
   * revenue, so clearing history will lower those admin dashboard numbers.
   */
  async clearHistory(actorUserId: string | null, shopId?: string) {
    const CLEARABLE_STATUSES: PrintJobStatus[] = [PrintJobStatus.DELETED, PrintJobStatus.CANCELLED];

    const result = await this.prisma.$transaction(async (tx) => {
      const jobs = await tx.printJob.findMany({
        where: { status: { in: CLEARABLE_STATUSES }, ...(shopId ? { shopId } : {}) },
        select: { id: true },
      });
      const ids = jobs.map((job) => job.id);
      if (ids.length === 0) return { cleared: 0 };

      await tx.notification.updateMany({
        where: { printJobId: { in: ids } },
        data: { printJobId: null },
      });
      await tx.printJobEvent.deleteMany({ where: { printJobId: { in: ids } } });
      await tx.printJobItem.deleteMany({ where: { printJobId: { in: ids } } });
      await tx.printJob.deleteMany({ where: { id: { in: ids } } });

      return { cleared: ids.length };
    });

    await this.audit.log({
      actorUserId,
      shopId: shopId ?? null,
      action: 'PRINT_HISTORY_CLEARED',
      entityType: 'PrintJob',
      metadata: { clearedCount: result.cleared, scope: shopId ? 'shop' : 'all-shops' },
    });

    return result;
  }

  async getForShop(jobId: string, shopId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: {
        items: { include: { document: true }, orderBy: { printOrder: 'asc' } },
        printer: true,
      },
    });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');
    return job;
  }

  /**
   * Shared guard for the shop-side document editor (reorder/delete/settings/
   * edit) — these mutate PrintJobItem rows, not PrintJob.status, so they
   * don't go through PrintJobsRepository.transition. They're only safe
   * before the job has been handed to the print pipeline.
   */
  private async getEditableJobOrThrow(jobId: string, shopId: string) {
    const job = await this.prisma.printJob.findUnique({
      where: { id: jobId },
      include: { items: true },
    });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');
    if (job.status !== PrintJobStatus.PRINT_ELIGIBLE) {
      throw new InvalidPrintOptionException(
        "This order has already been sent to the printer and can't be changed.",
      );
    }
    return job;
  }

  /**
   * Quantity tiers are chosen by a combination's total pages across the whole
   * job, so a change to one item can move every other item sharing its
   * paper/color/side into a different tier. Reprices those items against the
   * shop's current rate. In a combination without tiers only `editedItemIds`
   * are repriced — the rest keep the price locked in by the quote.
   */
  private async repriceCombos(
    tx: Prisma.TransactionClient,
    jobId: string,
    shopId: string,
    combos: PricingCombo[],
    editedItemIds: string[] = [],
  ) {
    const items = await tx.printJobItem.findMany({ where: { printJobId: jobId } });
    const keys = new Set(combos.map(comboKey));
    for (const key of keys) {
      const group = items.filter((item) => comboKey(item) === key);
      if (group.length === 0) continue;
      const totalPages = group.reduce((sum, item) => sum + item.billablePages, 0);
      const rate = await this.pricingService.resolveRate(shopId, group[0], totalPages);
      const toReprice = rate.hasTiers
        ? group
        : group.filter((item) => editedItemIds.includes(item.id));
      for (const item of toReprice) {
        await tx.printJobItem.update({
          where: { id: item.id },
          data: { amount: rate.pricePerPage * item.billablePages },
        });
      }
    }
  }

  /**
   * Editor changes reprice only an order that was priced, and only while the
   * shop still has pricing on. Otherwise amounts are left as they are and no
   * rate is required for the new options.
   */
  private async shouldReprice(job: { priced: boolean }, shopId: string): Promise<boolean> {
    return job.priced && (await this.pricingService.isPricingEnabled(shopId));
  }

  private async recomputeJobAmount(tx: Prisma.TransactionClient, jobId: string) {
    const items = await tx.printJobItem.findMany({ where: { printJobId: jobId } });
    const amount = items.reduce((sum, item) => sum + Number(item.amount), 0);
    await tx.printJob.update({ where: { id: jobId }, data: { amount } });
    return amount;
  }

  /** Shop editor: drag/up-down reordering of documents within a still-pending job. */
  async reorderItems(jobId: string, shopId: string, dto: ReorderItemsDto) {
    const job = await this.getEditableJobOrThrow(jobId, shopId);
    const currentIds = new Set(job.items.map((item) => item.id));
    const requestedIds = new Set(dto.itemIds);
    if (
      dto.itemIds.length !== job.items.length ||
      currentIds.size !== requestedIds.size ||
      ![...currentIds].every((id) => requestedIds.has(id))
    ) {
      throw new InvalidPrintOptionException(
        'The list of files changed. Refresh the page and try again.',
      );
    }

    await this.prisma.$transaction(
      dto.itemIds.map((itemId, index) =>
        this.prisma.printJobItem.update({ where: { id: itemId }, data: { printOrder: index } }),
      ),
    );
    return this.getForShop(jobId, shopId);
  }

  /** Shop editor: remove one document from a multi-document order. Refuses to empty out the job entirely. */
  async deleteItem(jobId: string, shopId: string, itemId: string) {
    const job = await this.getEditableJobOrThrow(jobId, shopId);
    const item = job.items.find((i) => i.id === itemId);
    if (!item) throw new AppNotFoundException('Print job item not found.');
    if (job.items.length === 1) {
      throw new InvalidPrintOptionException(
        'Cannot remove the only file in this order — cancel the order instead.',
      );
    }

    const reprice = await this.shouldReprice(job, shopId);
    await this.prisma.$transaction(async (tx) => {
      await tx.printJobItem.delete({ where: { id: itemId } });
      await tx.document.update({
        where: { id: item.documentId },
        data: { status: DocumentStatus.PROCESSED },
      });
      if (reprice) await this.repriceCombos(tx, jobId, shopId, [item]);
      // Keep the total in step with the remaining items (still 0 for an unpriced order).
      await this.recomputeJobAmount(tx, jobId);
    });
    return this.getForShop(jobId, shopId);
  }

  /** Shop editor: per-document paper/color/side/copies change, repriced (with any quantity tier) against the shop's current active rate. */
  async updateItemSettings(
    jobId: string,
    shopId: string,
    itemId: string,
    dto: UpdateItemSettingsDto,
  ) {
    const job = await this.getEditableJobOrThrow(jobId, shopId);
    const item = job.items.find((i) => i.id === itemId);
    if (!item) throw new AppNotFoundException('Print job item not found.');

    const paperSize = dto.paperSize ?? item.paperSize;
    const colorMode = dto.colorMode ?? item.colorMode;
    const sideMode = dto.sideMode ?? item.sideMode;
    const copies = dto.copies ?? item.copies;

    const reprice = await this.shouldReprice(job, shopId);
    // Fail before writing anything if a priced order's new combination has no rate.
    if (reprice) {
      await this.pricingService.getActiveRateOrThrow(shopId, paperSize, colorMode, sideMode);
    }
    const billablePages = item.pageCount * copies;

    await this.prisma.$transaction(async (tx) => {
      await tx.printJobItem.update({
        where: { id: itemId },
        data: { paperSize, colorMode, sideMode, copies, billablePages },
      });
      if (!reprice) return;
      // Both the item's old and new combination may have changed tier.
      await this.repriceCombos(
        tx,
        jobId,
        shopId,
        [item, { paperSize, colorMode, sideMode }],
        [itemId],
      );
      await this.recomputeJobAmount(tx, jobId);
    });
    return this.getForShop(jobId, shopId);
  }

  /** SRS §17.2 example: shopkeeper's PRINT action. QUEUED here means "handed to the print pipeline", not necessarily delivered yet. */
  async triggerPrint(jobId: string, shopId: string) {
    await this.subscriptionAccess.assertShopCanPrint(shopId);
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');

    // A job carrying printerId from an earlier attempt might point at a
    // printer removed/unlinked since — don't silently reuse it.
    const previousAttemptPrinter = job.printerId
      ? await this.prisma.printer.findUnique({ where: { id: job.printerId } })
      : null;
    const printer =
      previousAttemptPrinter && previousAttemptPrinter.status !== PrinterStatus.REMOVED
        ? previousAttemptPrinter
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
      throw new InvalidPrintOptionException('This order was just updated. Refresh the page.');
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

    return {
      jobId: updated.id,
      status: updated.status,
      printerId: printer.id,
      message: 'Print job queued',
    };
  }

  private async resolveShopPrinter(shopId: string) {
    const settings = await this.prisma.printSettings.findUnique({ where: { shopId } });
    if (settings?.defaultPrinterId) {
      const printer = await this.prisma.printer.findUnique({
        where: { id: settings.defaultPrinterId },
      });
      if (printer && printer.status !== PrinterStatus.REMOVED) return printer;
    }
    return this.prisma.printer.findFirst({
      where: { shopId, status: { not: PrinterStatus.REMOVED } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Called by the BullMQ processor to actually push the job to a connected agent. */
  async dispatchToAgent(jobId: string) {
    const job = await this.prisma.printJob.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        items: { include: { document: true }, orderBy: { printOrder: 'asc' } },
        printer: true,
      },
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

    this.agentConnections.pushJob(job.printerId, await this.agentJobPayload(job));
  }

  /**
   * What the Print Agent receives for a job — shared by the WebSocket push
   * (dispatchToAgent) and the polling fallback (GET /agent/jobs/next), so a
   * job prints the same way however the agent is connected: the shop's
   * edited render when there is one, and a print-ready copy of PDFs.
   */
  async agentJobPayload(
    job: Prisma.PrintJobGetPayload<{
      include: { items: { include: { document: true } }; printer: true };
    }>,
  ) {
    const items = [...job.items].sort((a, b) => a.printOrder - b.printOrder);
    const documents = await Promise.all(
      items.map(async (item) => {
        // An edited render may be a different format than the upload (the
        // canvas editor can export PNG for a JPEG document), so describe the
        // file actually being sent.
        const mimeType = item.renderedS3Key
          ? mimeFromKey(item.renderedS3Key, item.document.mimeType)
          : item.document.mimeType;
        const sourceKey = item.renderedS3Key ?? item.document.s3Key;
        const printKey =
          mimeType === 'application/pdf'
            ? await this.pdfPrintReadyKey(sourceKey, printReadyKey(item.document, item.id))
            : sourceKey;
        return {
          documentId: item.documentId,
          originalName: item.document.originalName,
          mimeType,
          documentSignedUrl: await this.storage.getSignedDownloadUrl(printKey),
          options: {
            paperSize: item.paperSize,
            colorMode: item.colorMode,
            sideMode: item.sideMode,
            copies: item.copies,
          },
        };
      }),
    );

    return {
      jobId: job.id,
      documents,
      attemptId: `${job.id}:${job.attemptCount}`,
      printerName: job.printer?.osPrinterName ?? null,
    };
  }

  /**
   * Key of the PDF the agent should print: a print-ready copy (stored at
   * `targetKey`) when the file has on-screen content that would otherwise be
   * skipped by the printer — see makePdfPrintReady — else `sourceKey` itself.
   * Never blocks printing: on any failure the file is sent as stored.
   */
  private async pdfPrintReadyKey(sourceKey: string, targetKey: string): Promise<string> {
    try {
      const printReady = await makePdfPrintReady(await this.storage.getObject(sourceKey));
      if (!printReady) return sourceKey;
      await this.storage.putObject({
        key: targetKey,
        body: printReady,
        contentType: 'application/pdf',
      });
      return targetKey;
    } catch (error) {
      this.logger.warn(
        `Could not prepare ${sourceKey} for printing, sending it as stored: ${(error as Error).message}`,
      );
      return sourceKey;
    }
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

    let current = job.status;
    let updated = job;
    // The polling fallback (GET /agent/jobs/next) also hands out AGENT_OFFLINE jobs — that is how an
    // agent without a live connection gets work. An agent reporting progress on one is evidently back
    // online, so the job returns to QUEUED first; AGENT_OFFLINE -> PRINTING is not a legal step.
    if (current === PrintJobStatus.AGENT_OFFLINE && to !== PrintJobStatus.PRINT_FAILED) {
      updated = await this.repo.transition({
        jobId,
        from: PrintJobStatus.AGENT_OFFLINE,
        to: PrintJobStatus.QUEUED,
        agentAttemptId: dto.agentAttemptId,
        message: 'Printer App picked the order up.',
      });
      current = PrintJobStatus.QUEUED;
    }

    const failed = to === PrintJobStatus.PRINT_FAILED || to === PrintJobStatus.PRINT_UNKNOWN;
    const reason = failed ? agentFailureReason(dto) : undefined;
    if (failed) {
      this.logger.warn(
        `Printer App reported ${dto.status} for job ${jobId} (shop ${job.shopId}, printer ${printerId}, attempt ${dto.agentAttemptId}): ` +
          `[${dto.errorCode ?? 'no code'}] ${dto.message ?? '(no message)'} | ${dto.errorDetail ?? '(no details)'}`,
      );
    }

    // ACCEPTED/PRINTING both land on PRINTING; the second call is a no-op if already there.
    const from = current === to ? null : current;
    if (from) {
      updated = await this.repo.transition({
        jobId,
        from,
        to,
        agentAttemptId: dto.agentAttemptId,
        message: reason ?? dto.message,
        data:
          to === PrintJobStatus.PRINTED
            ? { printedAt: new Date(), failureReason: null }
            : reason
              ? { failureReason: reason }
              : {},
      });
    }

    if (to === PrintJobStatus.PRINTED) {
      await this.notifications.record(job.shopId, jobId, 'PRINT_COMPLETED');
      // Chained immediately; RetentionService deletes the documents on its
      // next sweep (no retention window).
      updated = await this.repo.transition({
        jobId,
        from: PrintJobStatus.PRINTED,
        to: PrintJobStatus.RETENTION_PENDING,
      });
    } else if (to === PrintJobStatus.PRINT_FAILED) {
      await this.notifications.record(job.shopId, jobId, 'PRINT_FAILED');
    }

    return { jobId: updated.id, status: updated.status };
  }

  /** SRS §13.3 "Print command accepted but result uncertain" — controlled, manual reconciliation only. Never auto-deletes. */
  async reconcile(jobId: string, shopId: string, dto: ReconcileJobDto) {
    const job = await this.prisma.printJob.findUnique({ where: { id: jobId } });
    if (!job || job.shopId !== shopId) throw new AppNotFoundException('Print job not found.');
    if (job.status !== PrintJobStatus.PRINT_UNKNOWN) {
      throw new InvalidPrintOptionException(
        "Only orders marked 'Check if printed' can be updated this way.",
      );
    }
    const to = dto.outcome === 'PRINTED' ? PrintJobStatus.PRINTED : PrintJobStatus.PRINT_FAILED;
    let updated = await this.repo.transition({
      jobId,
      from: PrintJobStatus.PRINT_UNKNOWN,
      to,
      message: dto.message ?? 'Manually reconciled by shopkeeper',
      data: to === PrintJobStatus.PRINTED ? { printedAt: new Date() } : {},
    });
    // Same follow-up as when the agent itself reports the outcome (reportAgentStatus): a printed
    // order goes on to retention so its documents get deleted; a failed one records why.
    if (to === PrintJobStatus.PRINTED) {
      await this.notifications.record(shopId, jobId, 'PRINT_COMPLETED');
      updated = await this.repo.transition({
        jobId,
        from: PrintJobStatus.PRINTED,
        to: PrintJobStatus.RETENTION_PENDING,
      });
    } else {
      await this.notifications.record(shopId, jobId, 'PRINT_FAILED');
      await this.prisma.printJob.update({
        where: { id: jobId },
        data: { failureReason: dto.message ?? 'Marked as not printed by the shop' },
      });
    }
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
      throw new ShopAccessDeniedException(
        "This link has expired. Please scan the shop's QR code again.",
      );
    }
    return job;
  }
}

/** Room for a full SumatraPDF/CUPS error plus the printer check, without letting one report bloat the row. */
const MAX_FAILURE_REASON_LENGTH = 4000;

/**
 * What gets stored as PrintJob.failureReason (and on the job's event): the
 * plain sentence the shopkeeper reads first, then — after a blank line — the
 * technical details for support. Print Orders shows only the first line.
 * Printer Apps older than the errorCode/errorDetail fields send just `message`.
 */
export function agentFailureReason(
  dto: Pick<AgentJobStatusDto, 'message' | 'errorCode' | 'errorDetail'>,
): string {
  const summary = dto.message?.trim() || 'The Printer App did not say why printing failed.';
  const technical = [dto.errorCode && `[${dto.errorCode}]`, dto.errorDetail?.trim()]
    .filter(Boolean)
    .join(' ');
  const reason = technical ? `${summary}\n\nTechnical details: ${technical}` : summary;
  return reason.length > MAX_FAILURE_REASON_LENGTH
    ? `${reason.slice(0, MAX_FAILURE_REASON_LENGTH - 1)}…`
    : reason;
}
