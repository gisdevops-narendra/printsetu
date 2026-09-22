import { Injectable } from '@nestjs/common';
import { Prisma, PrinterStatus, ShopSubscription, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PlanLimitReachedException,
  ShopUnavailableException,
  SubscriptionRestrictedException,
} from './subscription.exceptions';
import { ACCESS_BY_STATUS, AccessLevel, daysToMs } from './subscription.constants';

export interface ShopAccess {
  /** The stored subscription state, or NONE for a shop that has never had a plan. */
  state: SubscriptionStatus | 'NONE';
  level: AccessLevel;
  /** May customers place new orders with this shop? */
  acceptsOrders: boolean;
  graceEndsAt: Date | null;
  /** Whole days left in the grace period / trial, when one is running. */
  daysLeft: number | null;
  /** What to show the shop owner at the top of the portal. */
  banner: { severity: 'info' | 'warn' | 'error'; message: string } | null;
}

export interface PlanUsage {
  printsThisMonth: number;
  tokensToday: number;
  printers: number;
}

type SubWithPlan = ShopSubscription & { plan: SubscriptionPlan };

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
};
const ceilDays = (ms: number) => Math.max(0, Math.ceil(ms / daysToMs(1)));

/**
 * Decides what a shop may do given its subscription, and enforces plan
 * limits. A shop that has never been given a subscription keeps full access
 * (so shops that pre-date billing are not locked out by the rollout).
 */
@Injectable()
export class SubscriptionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private load(shopId: string): Promise<SubWithPlan | null> {
    return this.prisma.shopSubscription.findUnique({ where: { shopId }, include: { plan: true } });
  }

  async getAccess(shopId: string): Promise<ShopAccess> {
    return this.describe(await this.load(shopId));
  }

  describe(sub: SubWithPlan | null): ShopAccess {
    if (!sub) {
      return { state: 'NONE', level: 'FULL', acceptsOrders: true, graceEndsAt: null, daysLeft: null, banner: null };
    }
    const level = ACCESS_BY_STATUS[sub.status];
    const now = Date.now();
    const base = {
      state: sub.status,
      level,
      acceptsOrders: level === 'FULL',
      graceEndsAt: sub.graceEndsAt,
      daysLeft: null as number | null,
      banner: null as ShopAccess['banner'],
    };

    switch (sub.status) {
      case 'PAYMENT_PENDING': {
        const daysLeft = sub.graceEndsAt ? ceilDays(sub.graceEndsAt.getTime() - now) : 0;
        return {
          ...base,
          daysLeft,
          banner: {
            severity: 'warn',
            message: `Your subscription payment failed — please update payment within ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`,
          },
        };
      }
      case 'PAST_DUE':
        return {
          ...base,
          banner: {
            severity: 'error',
            message: 'Your subscription payment is overdue. You can view past orders, but new print requests are paused until payment is received.',
          },
        };
      case 'EXPIRED':
        return {
          ...base,
          banner: { severity: 'error', message: 'Your subscription has expired. New print requests are paused — please renew to continue.' },
        };
      case 'CANCELLED':
        return {
          ...base,
          banner: { severity: 'error', message: 'Your subscription is cancelled. New print requests are paused.' },
        };
      case 'SUSPENDED':
        return {
          ...base,
          banner: { severity: 'error', message: 'Your shop is suspended. Customers cannot order until the account is reinstated.' },
        };
      case 'TRIAL': {
        const daysLeft = sub.trialEndsAt ? ceilDays(sub.trialEndsAt.getTime() - now) : null;
        return {
          ...base,
          daysLeft,
          banner:
            daysLeft !== null && daysLeft <= 3
              ? { severity: 'info', message: `Your free trial ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.` }
              : null,
        };
      }
      default:
        if (sub.cancelAtPeriodEnd) {
          return {
            ...base,
            banner: {
              severity: 'info',
              message: `Your subscription is set to end on ${sub.currentPeriodEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
            },
          };
        }
        return base;
    }
  }

  // ---------------------------------------------------------- customers

  /** Customer-facing check, used when a QR code is scanned and when an order is placed. */
  async customerAvailability(shopId: string): Promise<{ available: boolean; message: string | null }> {
    const sub = await this.load(shopId);
    const access = this.describe(sub);
    if (!access.acceptsOrders) {
      return { available: false, message: 'This shop is temporarily unavailable. Please try again later.' };
    }
    // The shopkeeper's own Online / Offline switch (a lunch break, a printer fault, ...).
    const settings = await this.prisma.printSettings.findUnique({ where: { shopId }, select: { acceptingOrders: true } });
    if (settings && !settings.acceptingOrders) {
      return { available: false, message: 'This shop has paused new orders for now. Please try again in a little while.' };
    }
    if (sub) {
      const limit = await this.limitReached(shopId, sub.plan);
      if (limit) return { available: false, message: limit.customerMessage };
    }
    return { available: true, message: null };
  }

  async assertCustomerCanOrder(shopId: string): Promise<void> {
    const { available, message } = await this.customerAvailability(shopId);
    if (!available) throw new ShopUnavailableException(message ?? undefined);
  }

  // ------------------------------------------------------------- shop side

  /** New prints may only be started while the subscription allows full access. */
  async assertShopCanPrint(shopId: string): Promise<void> {
    const access = await this.getAccess(shopId);
    if (access.level !== 'FULL') {
      throw new SubscriptionRestrictedException(
        'New print requests are paused because your subscription needs attention. Open Billing to resolve it.',
      );
    }
  }

  async assertFeature(shopId: string, feature: 'analyticsAccess'): Promise<void> {
    const sub = await this.load(shopId);
    if (sub && !sub.plan[feature]) {
      throw new SubscriptionRestrictedException(
        `Sales analytics is not included in your ${sub.plan.name} plan.`,
        'PLAN_FEATURE_UNAVAILABLE',
      );
    }
  }

  async assertPrinterQuota(shopId: string): Promise<void> {
    const sub = await this.load(shopId);
    if (!sub || sub.plan.maxPrinters === null) return;
    const count = await this.prisma.printer.count({ where: { shopId, status: { not: PrinterStatus.REMOVED } } });
    if (count >= sub.plan.maxPrinters) {
      throw new PlanLimitReachedException(
        `Your ${sub.plan.name} plan allows ${sub.plan.maxPrinters} print agent ${sub.plan.maxPrinters === 1 ? 'device' : 'devices'}. Ask your administrator to upgrade the plan to add more.`,
      );
    }
  }

  // ---------------------------------------------------------------- usage

  async usage(shopId: string): Promise<PlanUsage> {
    const notCancelled: Prisma.PrintJobWhereInput = { shopId, status: { not: 'CANCELLED' } };
    const [printsThisMonth, tokensToday, printers] = await Promise.all([
      this.prisma.printJob.count({ where: { ...notCancelled, createdAt: { gte: startOfMonth() } } }),
      this.prisma.printJob.count({ where: { ...notCancelled, createdAt: { gte: startOfToday() } } }),
      this.prisma.printer.count({ where: { shopId, status: { not: PrinterStatus.REMOVED } } }),
    ]);
    return { printsThisMonth, tokensToday, printers };
  }

  private async limitReached(shopId: string, plan: SubscriptionPlan): Promise<{ customerMessage: string } | null> {
    if (plan.maxTokensPerDay === null && plan.maxPrintsPerMonth === null) return null;
    const usage = await this.usage(shopId);
    if (plan.maxTokensPerDay !== null && usage.tokensToday >= plan.maxTokensPerDay) {
      return { customerMessage: 'This shop has reached its order limit for today. Please try again tomorrow.' };
    }
    if (plan.maxPrintsPerMonth !== null && usage.printsThisMonth >= plan.maxPrintsPerMonth) {
      return { customerMessage: 'This shop is not taking new orders right now. Please try again later.' };
    }
    return null;
  }
}
