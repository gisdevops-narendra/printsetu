import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationEvent, Prisma, ShopSubscription, SubscriptionPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingNotifierService } from './billing-notifier.service';
import { BillingSettingsService } from './billing-settings.service';
import { InvoicesService, priceFor } from './invoices.service';
import { PaymentGatewayRegistry } from './payment-gateway';
import { SubscriptionsService } from './subscriptions.service';
import { BillingSettings, addCycle, addDays, daysToMs } from './subscription.constants';

type SubWithPlan = ShopSubscription & { plan: SubscriptionPlan };

export interface AutomationSummary {
  checked: number;
  changes: string[];
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const money = (n: number) => `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Moves subscriptions through their lifecycle on a schedule:
 *
 *   TRIAL / ACTIVE --renewal date passes--> PAYMENT_PENDING (grace period, full access)
 *   PAYMENT_PENDING --grace over--> PAST_DUE (read-only)
 *   PAST_DUE --suspend-after days--> SUSPENDED (locked)
 *
 * plus payment retries (gateway shops), scheduled plan changes, and the
 * reminder messages. Shops with an active manual override are left alone.
 * Everything here is done by "the system" (no actor) in the shop's history.
 */
@Injectable()
export class BillingAutomationService {
  private readonly logger = new Logger(BillingAutomationService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly subs: SubscriptionsService,
    private readonly invoices: InvoicesService,
    private readonly notifier: BillingNotifierService,
    private readonly settingsService: BillingSettingsService,
    private readonly gateways: PaymentGatewayRegistry,
  ) {}

  @Cron('*/15 * * * *')
  async scheduledRun(): Promise<void> {
    try {
      const { changes } = await this.runAll();
      if (changes.length) this.logger.log(`Billing checks made ${changes.length} change(s).`);
    } catch (err) {
      this.logger.error(`Billing checks failed: ${(err as Error).message}`);
    }
  }

  async runAll(now = new Date()): Promise<AutomationSummary> {
    if (this.running) return { checked: 0, changes: ['Billing checks are already running.'] };
    this.running = true;
    try {
      const settings = await this.settingsService.get();
      const rows = await this.prisma.shopSubscription.findMany({
        where: { status: { in: ['TRIAL', 'ACTIVE', 'PAYMENT_PENDING', 'PAST_DUE'] } },
        select: { shopId: true },
      });
      const changes: string[] = [];
      for (const { shopId } of rows) {
        try {
          changes.push(...(await this.process(shopId, settings, now)));
        } catch (err) {
          this.logger.error(`Billing check failed for shop ${shopId}: ${(err as Error).message}`);
        }
      }
      return { checked: rows.length, changes };
    } finally {
      this.running = false;
    }
  }

  // ---------------------------------------------------------------------

  private async process(shopId: string, settings: BillingSettings, now: Date): Promise<string[]> {
    const changes: string[] = [];
    let sub = await this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } });
    if (!sub) return changes;

    if (sub.automationPaused) {
      if (!sub.pausedUntil || sub.pausedUntil > now) return changes;
      await this.prisma.shopSubscription.update({ where: { shopId }, data: { automationPaused: false, pausedUntil: null } });
      await this.subs.record(shopId, null, { type: 'OVERRIDE_EXPIRED', reason: 'The manual override reached its end date.' });
      changes.push(`${shopId}: manual override ended`);
      sub = (await this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } }))!;
    }

    const reload = async () =>
      (await this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } }))!;

    if (sub.status === 'TRIAL') {
      if ((sub.trialEndsAt ?? sub.currentPeriodEnd) <= now) {
        changes.push(await this.endOfTerm(sub, settings, now, true));
      } else {
        await this.trialReminder(sub, now);
      }
      return changes;
    }

    if (sub.status === 'ACTIVE') {
      if (sub.currentPeriodEnd <= now) {
        changes.push(await this.endOfTerm(sub, settings, now, false));
        sub = await reload();
      } else {
        await this.renewalReminder(sub, settings, now);
        return changes;
      }
    }

    if (sub.status === 'PAYMENT_PENDING') {
      const retried = await this.retryPayment(sub, settings, now);
      if (retried) changes.push(retried);
      sub = await reload();
    }

    if (sub.status === 'PAYMENT_PENDING') {
      if (!sub.graceEndsAt || sub.graceEndsAt <= now) {
        changes.push(await this.toPastDue(sub, now));
        sub = await reload();
      } else {
        await this.graceReminder(sub, settings, now);
      }
    }

    if (sub.status === 'PAST_DUE') {
      const since = sub.pastDueSince ?? now;
      const suspendAt = addDays(since, settings.suspendAfterPastDueDays);
      if (suspendAt <= now) {
        await this.prisma.shopSubscription.update({ where: { shopId }, data: { status: 'SUSPENDED' } });
        await this.subs.record(shopId, null, {
          type: 'SUSPENDED',
          from: 'PAST_DUE',
          to: 'SUSPENDED',
          reason: `Payment was still missing ${settings.suspendAfterPastDueDays} days after it became overdue.`,
        });
        await this.notifier.notify(
          shopId,
          'SUBSCRIPTION_SUSPENDED',
          'Your shop has been suspended because the subscription payment is overdue. Customers cannot order until it is paid.',
          sub.notificationChannels,
        );
        changes.push(`${shopId}: suspended`);
      } else {
        await this.finalWarning(sub, suspendAt, now);
      }
    }
    return changes;
  }

  /** The trial or paid period has ended: cancel, expire or start the renewal. */
  private async endOfTerm(sub: SubWithPlan, settings: BillingSettings, now: Date, fromTrial: boolean): Promise<string> {
    const { shopId } = sub;
    if (sub.cancelAtPeriodEnd) {
      await this.prisma.shopSubscription.update({
        where: { shopId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelAtPeriodEnd: false, pendingPlanId: null, pendingCycle: null },
      });
      await this.subs.record(shopId, null, { type: 'CANCELLED', from: sub.status, to: 'CANCELLED', reason: sub.cancelReason ?? 'Cancelled at the end of the period.' });
      await this.notifier.notify(shopId, 'SUBSCRIPTION_CANCELLED', 'Your subscription has ended. New print requests are paused.', sub.notificationChannels);
      return `${shopId}: cancelled at period end`;
    }
    if (!sub.autoRenew) {
      await this.prisma.shopSubscription.update({ where: { shopId }, data: { status: 'EXPIRED' } });
      await this.subs.record(shopId, null, { type: 'EXPIRED', from: sub.status, to: 'EXPIRED', reason: 'Auto-renew is off and the period ended.' });
      await this.notifier.notify(shopId, 'SUBSCRIPTION_PAST_DUE', 'Your subscription has expired. New print requests are paused — please renew.', sub.notificationChannels);
      return `${shopId}: expired`;
    }

    // ---- renewal invoice (applying any scheduled plan change first)
    const pendingPlan = sub.pendingPlanId
      ? await this.prisma.subscriptionPlan.findUnique({ where: { id: sub.pendingPlanId } })
      : null;
    const plan = pendingPlan ?? sub.plan;
    const cycle = pendingPlan ? (sub.pendingCycle ?? sub.cycle) : sub.cycle;
    const start = fromTrial ? (sub.trialEndsAt ?? sub.currentPeriodEnd) : sub.currentPeriodEnd;
    const end = addCycle(start, cycle);
    const price = priceFor(plan, cycle);
    const planChange = pendingPlan
      ? { plan: { connect: { id: plan.id } }, cycle, pendingPlanId: null, pendingCycle: null }
      : {};
    if (pendingPlan) {
      await this.subs.record(shopId, null, {
        type: 'PLAN_CHANGED',
        from: `${sub.plan.name} (${sub.cycle.toLowerCase()})`,
        to: `${plan.name} (${cycle.toLowerCase()})`,
        reason: 'Scheduled plan change took effect at renewal.',
      });
    }

    if (price <= 0) {
      await this.prisma.shopSubscription.update({
        where: { shopId },
        data: { ...planChange, status: 'ACTIVE', trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end },
      });
      await this.subs.record(shopId, null, { type: 'RENEWED', to: `until ${fmtDate(end)}`, reason: 'Free plan renewed automatically.' });
      return `${shopId}: renewed (free plan)`;
    }

    const invoice = await this.invoices.create({
      shopId,
      plan,
      cycle,
      kind: 'RENEWAL',
      description: `${plan.name} plan renewal, ${fmtDate(start)} to ${fmtDate(end)}`,
      periodStart: start,
      periodEnd: end,
      amount: price,
      dueDate: now,
    });

    const gateway = this.gateways.get(sub.gateway);
    if (gateway) {
      const result = await this.safeCharge(gateway.charge.bind(gateway), invoice);
      if (result.ok) {
        await this.invoices.markPaid(invoice.id, { method: 'GATEWAY', reference: result.reference, at: now });
        await this.prisma.shopSubscription.update({
          where: { shopId },
          data: {
            ...planChange,
            status: 'ACTIVE',
            trialEndsAt: null,
            currentPeriodStart: start,
            currentPeriodEnd: end,
            remindersSent: [],
          },
        });
        await this.subs.record(shopId, null, {
          type: 'RENEWED',
          to: `until ${fmtDate(end)}`,
          metadata: { invoice: invoice.number, amount: price, gateway: sub.gateway },
        });
        await this.notifier.notify(shopId, 'SUBSCRIPTION_PAID', `Your ${plan.name} subscription was renewed (${money(price)}).`, sub.notificationChannels);
        return `${shopId}: renewed via ${sub.gateway}`;
      }
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          attemptCount: 1,
          lastFailure: result.error ?? 'The payment was declined.',
          nextRetryAt: settings.retryAttempts > 0 ? addDays(now, settings.retryIntervalDays) : null,
        },
      });
    }

    await this.prisma.shopSubscription.update({
      where: { shopId },
      data: {
        ...planChange,
        status: 'PAYMENT_PENDING',
        graceEndsAt: addDays(now, settings.graceDays),
        remindersSent: [],
      },
    });
    await this.subs.record(shopId, null, {
      type: 'PAYMENT_FAILED',
      from: sub.status,
      to: 'PAYMENT_PENDING',
      reason: gateway ? 'The automatic payment was declined.' : 'Payment was not received by the renewal date.',
      metadata: { invoice: invoice.number, amount: price },
    });
    await this.notifier.notify(
      shopId,
      'SUBSCRIPTION_PAYMENT_FAILED',
      `Your subscription payment of ${money(price)} failed — please update payment within ${settings.graceDays} ${settings.graceDays === 1 ? 'day' : 'days'} to keep your shop running.`,
      sub.notificationChannels,
    );
    return `${shopId}: payment pending (grace ${settings.graceDays}d)`;
  }

  /** Automatic re-attempts on the open invoice, gateway shops only. */
  private async retryPayment(sub: SubWithPlan, settings: BillingSettings, now: Date): Promise<string | null> {
    const gateway = this.gateways.get(sub.gateway);
    if (!gateway) return null;
    const invoice = await this.prisma.invoice.findFirst({
      where: { shopId: sub.shopId, status: 'OPEN', nextRetryAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
    });
    if (!invoice || invoice.attemptCount > settings.retryAttempts) return null;

    const result = await this.safeCharge(gateway.charge.bind(gateway), invoice);
    if (result.ok) {
      const paid = await this.invoices.markPaid(invoice.id, { method: 'GATEWAY', reference: result.reference, at: now });
      const lapsed = paid.periodEnd <= now;
      await this.prisma.shopSubscription.update({
        where: { shopId: sub.shopId },
        data: {
          status: 'ACTIVE',
          graceEndsAt: null,
          pastDueSince: null,
          currentPeriodStart: lapsed ? now : paid.periodStart,
          currentPeriodEnd: lapsed ? addCycle(now, paid.cycle) : paid.periodEnd,
          remindersSent: [],
        },
      });
      await this.subs.record(sub.shopId, null, {
        type: 'PAYMENT_RECEIVED',
        from: 'PAYMENT_PENDING',
        to: 'ACTIVE',
        reason: `Retry ${invoice.attemptCount} succeeded.`,
        metadata: { invoice: invoice.number },
      });
      await this.notifier.notify(sub.shopId, 'SUBSCRIPTION_REACTIVATED', `Payment received for invoice ${invoice.number}. Your subscription is active.`, sub.notificationChannels);
      return `${sub.shopId}: payment recovered on retry`;
    }

    const attempts = invoice.attemptCount + 1;
    const more = attempts <= settings.retryAttempts;
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        attemptCount: attempts,
        lastFailure: result.error ?? 'The payment was declined.',
        nextRetryAt: more ? addDays(now, settings.retryIntervalDays) : null,
      },
    });
    await this.subs.record(sub.shopId, null, {
      type: 'PAYMENT_RETRY_FAILED',
      reason: result.error ?? 'The payment was declined.',
      metadata: { invoice: invoice.number, attempt: attempts, willRetry: more },
    });
    return `${sub.shopId}: retry ${attempts - 1} failed`;
  }

  private async toPastDue(sub: SubWithPlan, now: Date): Promise<string> {
    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.updateMany({
        where: { shopId: sub.shopId, status: 'OPEN' },
        data: { status: 'FAILED', nextRetryAt: null },
      });
      await tx.shopSubscription.update({ where: { shopId: sub.shopId }, data: { status: 'PAST_DUE', pastDueSince: now } });
    });
    await this.subs.record(sub.shopId, null, {
      type: 'PAST_DUE',
      from: 'PAYMENT_PENDING',
      to: 'PAST_DUE',
      reason: 'The grace period ended without payment.',
    });
    await this.notifier.notify(
      sub.shopId,
      'SUBSCRIPTION_PAST_DUE',
      'Your subscription payment is overdue. You can view past orders, but new print requests are paused until payment is received.',
      sub.notificationChannels,
    );
    return `${sub.shopId}: past due`;
  }

  // ------------------------------------------------------------ reminders

  private sent(sub: ShopSubscription): string[] {
    return Array.isArray(sub.remindersSent) ? (sub.remindersSent as string[]) : [];
  }

  private async markSent(sub: ShopSubscription, key: string) {
    await this.prisma.shopSubscription.update({
      where: { shopId: sub.shopId },
      data: { remindersSent: [...this.sent(sub), key] as Prisma.InputJsonValue },
    });
  }

  private async remind(sub: ShopSubscription, key: string, event: NotificationEvent, message: string) {
    if (this.sent(sub).includes(key)) return;
    await this.markSent(sub, key);
    await this.notifier.notify(sub.shopId, event, message, sub.notificationChannels);
    await this.subs.record(sub.shopId, null, { type: 'REMINDER_SENT', to: event, metadata: { key } });
  }

  private async renewalReminder(sub: SubWithPlan, settings: BillingSettings, now: Date) {
    if (settings.renewalReminderDays <= 0) return;
    const until = sub.currentPeriodEnd.getTime() - now.getTime();
    if (until <= 0 || until > daysToMs(settings.renewalReminderDays)) return;
    const price = priceFor(sub.plan, sub.cycle);
    const message = sub.cancelAtPeriodEnd
      ? `Your subscription ends on ${fmtDate(sub.currentPeriodEnd)}.`
      : sub.autoRenew
        ? `Your ${sub.plan.name} subscription renews on ${fmtDate(sub.currentPeriodEnd)} (${money(price)}).`
        : `Your ${sub.plan.name} subscription expires on ${fmtDate(sub.currentPeriodEnd)}. Renew to keep taking orders.`;
    await this.remind(sub, `renewal:${sub.currentPeriodEnd.toISOString()}`, 'SUBSCRIPTION_RENEWAL_REMINDER', message);
  }

  private async trialReminder(sub: SubWithPlan, now: Date) {
    const end = sub.trialEndsAt ?? sub.currentPeriodEnd;
    const until = end.getTime() - now.getTime();
    if (until <= 0 || until > daysToMs(2)) return;
    await this.remind(sub, `trial:${end.toISOString()}`, 'SUBSCRIPTION_TRIAL_ENDING', `Your free trial ends on ${fmtDate(end)}.`);
  }

  private async graceReminder(sub: SubWithPlan, settings: BillingSettings, now: Date) {
    if (!sub.graceEndsAt) return;
    const daysLeft = Math.ceil((sub.graceEndsAt.getTime() - now.getTime()) / daysToMs(1));
    if (daysLeft < 1 || daysLeft > Math.ceil(settings.graceDays / 2)) return;
    await this.remind(
      sub,
      `grace:${sub.graceEndsAt.toISOString()}`,
      'SUBSCRIPTION_GRACE_REMINDER',
      `Reminder: your subscription payment is still pending. Please pay within ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to avoid restrictions.`,
    );
  }

  private async finalWarning(sub: SubWithPlan, suspendAt: Date, now: Date) {
    if (suspendAt.getTime() - now.getTime() > daysToMs(1)) return;
    await this.remind(
      sub,
      `final:${suspendAt.toISOString()}`,
      'SUBSCRIPTION_FINAL_WARNING',
      `Final warning: your shop will be suspended on ${fmtDate(suspendAt)} unless the overdue payment is received.`,
    );
  }

  private async safeCharge(
    charge: (invoice: never) => Promise<{ ok: boolean; reference?: string; error?: string }>,
    invoice: unknown,
  ) {
    try {
      return await charge(invoice as never);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}
