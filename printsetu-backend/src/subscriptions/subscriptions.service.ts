import { Injectable } from '@nestjs/common';
import {
  BillingCycle,
  NotificationEvent,
  Prisma,
  ShopSubscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';
import { BillingSettingsService } from './billing-settings.service';
import { BillingNotifierService } from './billing-notifier.service';
import { InvoicesService, monthlyEquivalent, priceFor } from './invoices.service';
import { SubscriptionAccessService } from './subscription-access.service';
import { BillingConflictException } from './subscription.exceptions';
import { addCycle, addDays, cycleAdjective, cycleUnit, daysToMs, round2 } from './subscription.constants';
import {
  AssignPlanDto,
  CancelDto,
  ChangePlanDto,
  ExtendDto,
  ForceOverrideDto,
  MarkPaidDto,
  RefundDto,
  SubscriptionPreferencesDto,
} from './dto/subscription.dto';

/** The admin (or shop owner) behind a manual action; null means the system itself. */
export interface Actor {
  id: string;
  name: string;
}

export interface EventInput {
  type: string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

type SubWithPlan = ShopSubscription & { plan: SubscriptionPlan };
type Db = PrismaService | Prisma.TransactionClient;

export interface SubscriptionListFilters {
  search?: string;
  planId?: string;
  status?: string;
  expiringSoon?: boolean;
  page?: number;
  pageSize?: number;
}


const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: BillingNotifierService,
    private readonly settings: BillingSettingsService,
    private readonly invoices: InvoicesService,
    private readonly access: SubscriptionAccessService,
  ) {}

  // ------------------------------------------------------------ helpers

  /** Writes to the per-shop history and, for manual actions, to the global audit log. */
  async record(shopId: string, actor: Actor | null, e: EventInput, db: Db = this.prisma): Promise<void> {
    await db.subscriptionEvent.create({
      data: {
        shopId,
        type: e.type,
        fromValue: e.from ?? null,
        toValue: e.to ?? null,
        reason: e.reason ?? null,
        actorUserId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        metadata: (e.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
    if (actor) {
      await this.audit.log({
        actorUserId: actor.id,
        shopId,
        action: `SUBSCRIPTION_${e.type}`,
        entityType: 'subscription',
        entityId: shopId,
        metadata: { from: e.from, to: e.to, reason: e.reason, ...e.metadata },
      });
    }
  }

  private async load(shopId: string): Promise<SubWithPlan> {
    const sub = await this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } });
    if (!sub) throw new AppNotFoundException('This shop has no subscription yet. Assign a plan first.');
    return sub;
  }

  private async activePlan(planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppNotFoundException('Plan not found.');
    if (!plan.isActive) throw new BillingConflictException(`The ${plan.name} plan is retired and cannot be assigned.`);
    return plan;
  }

  private clearRenewalReminders(sub: ShopSubscription): Prisma.InputJsonValue {
    const list = Array.isArray(sub.remindersSent) ? (sub.remindersSent as string[]) : [];
    return list.filter((k) => !k.startsWith('renewal:') && !k.startsWith('trial:'));
  }

  // -------------------------------------------------------------- assign

  async assign(shopId: string, dto: AssignPlanDto, actor: Actor) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    if (await this.prisma.shopSubscription.findUnique({ where: { shopId } })) {
      throw new BillingConflictException('This shop already has a subscription. Use "change plan" instead.');
    }
    const plan = await this.activePlan(dto.planId);
    const settings = await this.settings.get();
    const now = new Date();
    const price = priceFor(plan, dto.cycle);
    const trial = !!dto.startTrial && plan.trialDays > 0;

    const sub = await this.prisma.$transaction(async (tx) => {
      let status: SubscriptionStatus = 'ACTIVE';
      let periodEnd = addCycle(now, dto.cycle);
      let trialEndsAt: Date | null = null;
      let graceEndsAt: Date | null = null;

      if (trial) {
        status = 'TRIAL';
        trialEndsAt = addDays(now, plan.trialDays);
        periodEnd = trialEndsAt;
      } else if (price > 0) {
        const invoice = await this.invoices.create(
          {
            shopId,
            plan,
            cycle: dto.cycle,
            kind: 'INITIAL',
            description: `${plan.name} plan, first ${cycleUnit(dto.cycle)}`,
            periodStart: now,
            periodEnd,
            amount: price,
            dueDate: now,
          },
          tx,
        );
        if (dto.markPaid) {
          await this.invoices.markPaid(invoice.id, { method: dto.paymentMethod ?? 'CASH', reference: dto.paymentReference }, tx);
        } else {
          status = 'PAYMENT_PENDING';
          graceEndsAt = addDays(now, settings.graceDays);
        }
      }

      const created = await tx.shopSubscription.create({
        data: {
          shopId,
          planId: plan.id,
          cycle: dto.cycle,
          status,
          startDate: now,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt,
          graceEndsAt,
          autoRenew: dto.autoRenew ?? true,
        },
        include: { plan: true },
      });
      await this.record(
        shopId,
        actor,
        {
          type: trial ? 'TRIAL_STARTED' : 'SUBSCRIPTION_CREATED',
          to: `${plan.name} (${dto.cycle.toLowerCase()})`,
          reason: dto.reason,
          metadata: { status, price },
        },
        tx,
      );
      return created;
    });
    return sub;
  }

  // --------------------------------------------------------- change plan

  async changePlan(shopId: string, dto: ChangePlanDto, actor: Actor) {
    const sub = await this.load(shopId);
    const next = await this.activePlan(dto.planId);
    const cycle = dto.cycle ?? sub.cycle;
    if (next.id === sub.planId && cycle === sub.cycle) {
      throw new BillingConflictException('The shop is already on this plan and billing cycle.');
    }
    if (sub.status !== 'TRIAL' && sub.status !== 'ACTIVE') {
      throw new BillingConflictException(
        'A plan can only be changed on a trial or active subscription. Settle the outstanding payment or reactivate the shop first.',
      );
    }

    const settings = await this.settings.get();
    const diff = monthlyEquivalent(next, cycle) - monthlyEquivalent(sub.plan, sub.cycle);
    const upgrade = diff > 0.005;
    const downgrade = diff < -0.005;

    let applyNow =
      dto.applyNow ??
      (upgrade ? settings.upgradeTiming === 'IMMEDIATE_PRORATED' : downgrade ? settings.downgradeTiming === 'IMMEDIATE' : true);
    // A cheaper plan on a different billing cycle can only start cleanly at a renewal.
    if (!upgrade && cycle !== sub.cycle && sub.status === 'ACTIVE') applyNow = false;

    const label = `${sub.plan.name} (${sub.cycle.toLowerCase()}) → ${next.name} (${cycle.toLowerCase()})`;

    if (!applyNow && sub.status === 'ACTIVE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.shopSubscription.update({
          where: { shopId },
          data: { pendingPlanId: next.id, pendingCycle: cycle },
        });
        await this.record(
          shopId,
          actor,
          {
            type: 'PLAN_CHANGE_SCHEDULED',
            from: `${sub.plan.name} (${sub.cycle.toLowerCase()})`,
            to: `${next.name} (${cycle.toLowerCase()})`,
            reason: dto.reason,
            metadata: { effectiveOn: sub.currentPeriodEnd },
          },
          tx,
        );
      });
      return { applied: false, effectiveOn: sub.currentPeriodEnd, invoice: null, subscription: await this.load(shopId) };
    }

    const now = new Date();
    let invoice = null;
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ShopSubscriptionUpdateInput = {
        plan: { connect: { id: next.id } },
        cycle,
        pendingPlanId: null,
        pendingCycle: null,
      };
      if (sub.status === 'ACTIVE' && upgrade) {
        const total = sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
        const remaining = Math.max(sub.currentPeriodEnd.getTime() - now.getTime(), 0);
        const fraction = total > 0 ? remaining / total : 0;
        const credit = priceFor(sub.plan, sub.cycle) * fraction;
        const sameCycle = cycle === sub.cycle;
        const amount = sameCycle
          ? Math.max(priceFor(next, cycle) * fraction - credit, 0)
          : Math.max(priceFor(next, cycle) - credit, 0);
        const periodEnd = sameCycle ? sub.currentPeriodEnd : addCycle(now, cycle);
        if (!sameCycle) {
          data.currentPeriodStart = now;
          data.currentPeriodEnd = periodEnd;
        }
        if (amount > 0.005) {
          const days = Math.ceil(remaining / daysToMs(1));
          invoice = await this.invoices.create(
            {
              shopId,
              plan: next,
              cycle,
              kind: 'UPGRADE',
              description: sameCycle
                ? `Prorated upgrade from ${sub.plan.name} to ${next.name} (${days} ${days === 1 ? 'day' : 'days'} remaining)`
                : `Upgrade from ${sub.plan.name} to ${next.name}, new ${cycleAdjective(cycle)} cycle, less ${round2(credit).toFixed(2)} unused credit`,
              periodStart: sameCycle ? now : now,
              periodEnd,
              amount,
              dueDate: now,
            },
            tx,
          );
        }
      }
      await tx.shopSubscription.update({ where: { shopId }, data });
      await this.record(
        shopId,
        actor,
        {
          type: 'PLAN_CHANGED',
          from: `${sub.plan.name} (${sub.cycle.toLowerCase()})`,
          to: `${next.name} (${cycle.toLowerCase()})`,
          reason: dto.reason,
          metadata: { direction: upgrade ? 'upgrade' : downgrade ? 'downgrade' : 'switch', change: label },
        },
        tx,
      );
    });
    return { applied: true, effectiveOn: now, invoice, subscription: await this.load(shopId) };
  }

  /** Drops a scheduled plan change. */
  async cancelScheduledChange(shopId: string, actor: Actor, reason: string) {
    const sub = await this.load(shopId);
    if (!sub.pendingPlanId) throw new BillingConflictException('There is no scheduled plan change.');
    await this.prisma.shopSubscription.update({ where: { shopId }, data: { pendingPlanId: null, pendingCycle: null } });
    await this.record(shopId, actor, { type: 'PLAN_CHANGE_CANCELLED', reason });
    return this.load(shopId);
  }

  // ------------------------------------------------------------- extend

  async extend(shopId: string, dto: ExtendDto, actor: Actor) {
    const sub = await this.load(shopId);
    if (!['TRIAL', 'ACTIVE', 'EXPIRED'].includes(sub.status)) {
      throw new BillingConflictException(
        'Only a trial, active or expired subscription can be extended. For unpaid renewals use "extend grace period" or "mark paid".',
      );
    }
    const base = sub.status === 'EXPIRED' && sub.currentPeriodEnd < new Date() ? new Date() : sub.currentPeriodEnd;
    const end = addDays(base, dto.days);
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSubscription.update({
        where: { shopId },
        data: {
          currentPeriodEnd: end,
          trialEndsAt: sub.status === 'TRIAL' ? end : undefined,
          status: sub.status === 'EXPIRED' ? 'ACTIVE' : undefined,
          remindersSent: this.clearRenewalReminders(sub),
        },
      });
      await this.record(
        shopId,
        actor,
        {
          type: 'EXTENDED',
          from: fmtDate(sub.currentPeriodEnd),
          to: fmtDate(end),
          reason: dto.reason,
          metadata: { days: dto.days },
        },
        tx,
      );
    });
    return this.load(shopId);
  }

  async extendGrace(shopId: string, dto: ExtendDto, actor: Actor) {
    const sub = await this.load(shopId);
    if (sub.status !== 'PAYMENT_PENDING' && sub.status !== 'PAST_DUE') {
      throw new BillingConflictException('A grace period can only be extended while a payment is pending or overdue.');
    }
    const now = new Date();
    const base = sub.graceEndsAt && sub.graceEndsAt > now ? sub.graceEndsAt : now;
    const end = addDays(base, dto.days);
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSubscription.update({
        where: { shopId },
        data: { status: 'PAYMENT_PENDING', graceEndsAt: end, pastDueSince: null },
      });
      await this.record(
        shopId,
        actor,
        {
          type: 'GRACE_EXTENDED',
          from: sub.graceEndsAt ? fmtDate(sub.graceEndsAt) : null,
          to: fmtDate(end),
          reason: dto.reason,
          metadata: { days: dto.days, previousStatus: sub.status },
        },
        tx,
      );
    });
    return this.load(shopId);
  }

  // -------------------------------------------------------------- cancel

  async cancel(shopId: string, dto: CancelDto, actor: Actor) {
    const sub = await this.load(shopId);
    if (sub.status === 'CANCELLED') throw new BillingConflictException('This subscription is already cancelled.');
    const now = new Date();
    const atPeriodEnd = dto.mode === 'PERIOD_END' && (sub.status === 'ACTIVE' || sub.status === 'TRIAL');

    await this.prisma.$transaction(async (tx) => {
      if (atPeriodEnd) {
        await tx.shopSubscription.update({
          where: { shopId },
          data: { cancelAtPeriodEnd: true, cancelReason: dto.reason, pendingPlanId: null, pendingCycle: null },
        });
      } else {
        await tx.invoice.updateMany({
          where: { shopId, status: { in: ['OPEN', 'FAILED'] } },
          data: { status: 'VOID', nextRetryAt: null },
        });
        await tx.shopSubscription.update({
          where: { shopId },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelReason: dto.reason,
            cancelAtPeriodEnd: false,
            graceEndsAt: null,
            pastDueSince: null,
            pendingPlanId: null,
            pendingCycle: null,
          },
        });
      }
      await this.record(
        shopId,
        actor,
        {
          type: atPeriodEnd ? 'CANCEL_SCHEDULED' : 'CANCELLED',
          from: sub.status,
          to: atPeriodEnd ? `ends ${fmtDate(sub.currentPeriodEnd)}` : 'CANCELLED',
          reason: dto.reason,
        },
        tx,
      );
    });
    await this.notifier.notify(
      shopId,
      'SUBSCRIPTION_CANCELLED',
      atPeriodEnd
        ? `Your subscription will end on ${fmtDate(sub.currentPeriodEnd)} and will not renew.`
        : 'Your subscription has been cancelled. New print requests are paused.',
      sub.notificationChannels,
    );
    return this.load(shopId);
  }

  /** Undo a "cancel at period end". */
  async resume(shopId: string, actor: Actor, reason: string) {
    const sub = await this.load(shopId);
    if (!sub.cancelAtPeriodEnd) throw new BillingConflictException('This subscription is not scheduled to end.');
    await this.prisma.shopSubscription.update({
      where: { shopId },
      data: { cancelAtPeriodEnd: false, cancelReason: null },
    });
    await this.record(shopId, actor, { type: 'CANCEL_UNDONE', reason });
    return this.load(shopId);
  }

  // ------------------------------------------------------------ mark paid

  async markPaid(shopId: string, dto: MarkPaidDto, actor: Actor) {
    const sub = await this.load(shopId);
    const invoice = dto.invoiceId
      ? await this.invoices.findOrThrow(dto.invoiceId, shopId)
      : await this.invoices.oldestUnpaid(shopId);
    if (!invoice) throw new BillingConflictException('There is no unpaid invoice for this shop.');

    const now = new Date();
    const wasRestricted = ['PAST_DUE', 'SUSPENDED', 'EXPIRED', 'PAYMENT_PENDING'].includes(sub.status);
    let heldByOverride = false;

    await this.prisma.$transaction(async (tx) => {
      const paid = await this.invoices.markPaid(
        invoice.id,
        { method: dto.method, reference: dto.reference, at: now },
        tx,
      );
      if (paid.kind !== 'UPGRADE' && sub.status !== 'CANCELLED') {
        const lapsed = paid.periodEnd <= now;
        const start = lapsed ? now : paid.periodStart;
        const end = lapsed ? addCycle(now, paid.cycle) : paid.periodEnd;
        heldByOverride = sub.automationPaused && sub.status === 'SUSPENDED';
        await tx.shopSubscription.update({
          where: { shopId },
          data: {
            currentPeriodStart: start,
            currentPeriodEnd: end,
            trialEndsAt: null,
            graceEndsAt: null,
            pastDueSince: null,
            // A force-suspend by an admin stays until an admin releases it.
            status: heldByOverride ? undefined : 'ACTIVE',
            remindersSent: this.clearRenewalReminders(sub),
          },
        });
      }
      await this.record(
        shopId,
        actor,
        {
          type: 'MARKED_PAID',
          from: sub.status,
          to: heldByOverride ? sub.status : sub.status === 'CANCELLED' ? sub.status : 'ACTIVE',
          reason: dto.reason,
          metadata: { invoice: invoice.number, amount: Number(invoice.amount), method: dto.method, reference: dto.reference ?? null },
        },
        tx,
      );
    });

    await this.notifier.notify(
      shopId,
      wasRestricted && !heldByOverride ? 'SUBSCRIPTION_REACTIVATED' : 'SUBSCRIPTION_PAID',
      wasRestricted && !heldByOverride
        ? `Payment received for invoice ${invoice.number}. Your subscription is active again.`
        : `Payment received for invoice ${invoice.number}. Thank you!`,
      sub.notificationChannels,
    );
    return { subscription: await this.load(shopId), heldByOverride };
  }

  // ------------------------------------------------------------- refunds

  async refund(shopId: string, invoiceId: string, dto: RefundDto, actor: Actor) {
    await this.invoices.findOrThrow(invoiceId, shopId);
    const { refund, invoice } = await this.invoices.refund(invoiceId, dto.amount, dto.reason, actor.id);
    await this.record(shopId, actor, {
      type: 'REFUND',
      reason: dto.reason,
      metadata: {
        invoice: invoice.number,
        amount: Number(refund.amount),
        status: invoice.status,
      },
    });
    return invoice;
  }

  // -------------------------------------------------------- force override

  async forceSuspend(shopId: string, dto: ForceOverrideDto, actor: Actor) {
    const sub = await this.load(shopId);
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSubscription.update({
        where: { shopId },
        data: {
          status: 'SUSPENDED',
          automationPaused: true,
          pausedUntil: dto.days ? addDays(new Date(), dto.days) : null,
        },
      });
      await this.record(
        shopId,
        actor,
        { type: 'FORCE_SUSPENDED', from: sub.status, to: 'SUSPENDED', reason: dto.reason, metadata: { days: dto.days ?? null } },
        tx,
      );
    });
    await this.notifier.notify(
      shopId,
      'SUBSCRIPTION_SUSPENDED',
      'Your shop has been suspended by an administrator. Please contact support.',
      sub.notificationChannels,
    );
    return this.load(shopId);
  }

  async forceReactivate(shopId: string, dto: ForceOverrideDto, actor: Actor) {
    const sub = await this.load(shopId);
    const now = new Date();
    const lapsed = sub.currentPeriodEnd <= now;
    await this.prisma.$transaction(async (tx) => {
      await tx.shopSubscription.update({
        where: { shopId },
        data: {
          status: 'ACTIVE',
          graceEndsAt: null,
          pastDueSince: null,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          cancelReason: null,
          currentPeriodStart: lapsed ? now : undefined,
          currentPeriodEnd: lapsed ? addCycle(now, sub.cycle) : undefined,
          automationPaused: true,
          pausedUntil: dto.days ? addDays(now, dto.days) : null,
          remindersSent: this.clearRenewalReminders(sub),
        },
      });
      await this.record(
        shopId,
        actor,
        { type: 'FORCE_REACTIVATED', from: sub.status, to: 'ACTIVE', reason: dto.reason, metadata: { days: dto.days ?? null } },
        tx,
      );
    });
    await this.notifier.notify(
      shopId,
      'SUBSCRIPTION_REACTIVATED',
      'Your shop has been reactivated by an administrator.',
      sub.notificationChannels,
    );
    return this.load(shopId);
  }

  /** Hands the shop back to the automatic billing rules. */
  async releaseOverride(shopId: string, actor: Actor, reason: string) {
    const sub = await this.load(shopId);
    if (!sub.automationPaused) throw new BillingConflictException('No manual override is active for this shop.');
    await this.prisma.shopSubscription.update({ where: { shopId }, data: { automationPaused: false, pausedUntil: null } });
    await this.record(shopId, actor, { type: 'OVERRIDE_RELEASED', reason });
    return this.load(shopId);
  }

  // ---------------------------------------------------------- preferences

  async setPreferences(shopId: string, dto: SubscriptionPreferencesDto, actor: Actor) {
    const sub = await this.load(shopId);
    const data: Prisma.ShopSubscriptionUpdateInput = {};
    const changes: string[] = [];
    if (dto.autoRenew !== undefined && dto.autoRenew !== sub.autoRenew) {
      data.autoRenew = dto.autoRenew;
      changes.push(`auto-renew ${dto.autoRenew ? 'on' : 'off'}`);
    }
    if (dto.channels !== undefined) {
      data.notificationChannels = dto.channels === null ? Prisma.DbNull : (dto.channels as Prisma.InputJsonValue);
      changes.push(dto.channels === null ? 'notification channels reset to default' : `notification channels: ${dto.channels.join(', ')}`);
    }
    if (changes.length) {
      await this.prisma.shopSubscription.update({ where: { shopId }, data });
      await this.record(shopId, actor, { type: 'PREFERENCES_CHANGED', to: changes.join('; ') });
    }
    return this.load(shopId);
  }

  // --------------------------------------------------------------- reads

  async getDetail(shopId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    const sub = await this.prisma.shopSubscription.findUnique({
      where: { shopId },
      include: { plan: true },
    });
    const pendingPlan = sub?.pendingPlanId
      ? await this.prisma.subscriptionPlan.findUnique({ where: { id: sub.pendingPlanId } })
      : null;
    const [invoices, events, usage, settings] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { refunds: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.subscriptionEvent.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.access.usage(shopId),
      this.settings.get(),
    ]);
    return {
      shop: { id: shop.id, name: shop.name, shopCode: shop.shopCode, city: shop.city, email: shop.email, mobile: shop.mobile, ownerName: shop.ownerName },
      subscription: sub,
      pendingPlan,
      access: this.access.describe(sub),
      usage,
      invoices,
      events,
      channels: await this.notifier.channelsFor(sub?.notificationChannels),
      settings,
    };
  }

  async listShops(f: SubscriptionListFilters) {
    const take = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
    const skip = (Math.max(f.page ?? 1, 1) - 1) * take;
    const search = f.search?.trim();
    const subWhere: Prisma.ShopSubscriptionWhereInput = {};
    if (f.planId) subWhere.planId = f.planId;
    if (f.status && f.status !== 'NONE') subWhere.status = f.status as SubscriptionStatus;
    if (f.expiringSoon) {
      subWhere.status = { in: ['TRIAL', 'ACTIVE'] };
      subWhere.currentPeriodEnd = { gte: new Date(), lte: addDays(new Date(), 7) };
    }
    const filtersSub = Object.keys(subWhere).length > 0;
    const where: Prisma.ShopWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { shopCode: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(f.status === 'NONE' ? { subscription: { is: null } } : filtersSub ? { subscription: { is: subWhere } } : {}),
    };
    const [shops, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        orderBy: { name: 'asc' },
        take,
        skip,
        include: { subscription: { include: { plan: true } } },
      }),
      this.prisma.shop.count({ where }),
    ]);
    return {
      total,
      page: Math.max(f.page ?? 1, 1),
      pageSize: take,
      items: shops.map((s) => ({
        shopId: s.id,
        shopName: s.name,
        shopCode: s.shopCode,
        city: s.city,
        shopStatus: s.status,
        status: s.subscription?.status ?? 'NONE',
        plan: s.subscription ? { id: s.subscription.plan.id, name: s.subscription.plan.name } : null,
        cycle: s.subscription?.cycle ?? null,
        price: s.subscription ? priceFor(s.subscription.plan, s.subscription.cycle) : null,
        startDate: s.subscription?.startDate ?? null,
        currentPeriodEnd: s.subscription?.currentPeriodEnd ?? null,
        trialEndsAt: s.subscription?.trialEndsAt ?? null,
        graceEndsAt: s.subscription?.graceEndsAt ?? null,
        autoRenew: s.subscription?.autoRenew ?? null,
        cancelAtPeriodEnd: s.subscription?.cancelAtPeriodEnd ?? false,
        automationPaused: s.subscription?.automationPaused ?? false,
      })),
    };
  }

  async listEvents(shopId: string, page = 1, pageSize = 50) {
    const take = Math.min(Math.max(pageSize, 1), 200);
    const [items, total] = await Promise.all([
      this.prisma.subscriptionEvent.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take,
        skip: (Math.max(page, 1) - 1) * take,
      }),
      this.prisma.subscriptionEvent.count({ where: { shopId } }),
    ]);
    return { items, total };
  }
}
