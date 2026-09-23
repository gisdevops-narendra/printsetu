import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, round2 } from './subscription.constants';
import { monthlyEquivalent, priceFor } from './invoices.service';

const startOfMonth = (monthsBack = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - monthsBack);
  return d;
};

/**
 * Revenue dashboard figures.
 *  - MRR counts shops that are paying: Active plus Payment pending (still in
 *    service and expected to pay). Trials are not revenue yet. Yearly plans
 *    contribute one twelfth of their yearly price; daily plans 30 days' worth.
 *  - ARR = MRR x 12.
 *  - Churn = subscriptions cancelled or expired this calendar month.
 *  - Recovery rate = of the shops whose payment failed in the last 30 days,
 *    the share that have since paid or been reactivated.
 */
@Injectable()
export class RevenueService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const now = new Date();
    const monthStart = startOfMonth();
    const thirtyAgo = addDays(now, -30);

    const [subs, upcoming, churnEvents, failedEvents, recoveryEvents, paidThisMonth, outstanding, paid6m] = await Promise.all([
      this.prisma.shopSubscription.findMany({ include: { plan: true, shop: { select: { name: true } } } }),
      this.prisma.shopSubscription.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] }, currentPeriodEnd: { gte: now, lte: addDays(now, 7) } },
        orderBy: { currentPeriodEnd: 'asc' },
        take: 10,
        include: { plan: true, shop: { select: { id: true, name: true } } },
      }),
      this.prisma.subscriptionEvent.findMany({
        where: { type: { in: ['CANCELLED', 'EXPIRED'] }, createdAt: { gte: monthStart } },
        select: { shopId: true, type: true },
      }),
      this.prisma.subscriptionEvent.findMany({
        where: { type: 'PAYMENT_FAILED', createdAt: { gte: thirtyAgo } },
        orderBy: { createdAt: 'asc' },
        select: { shopId: true, createdAt: true },
      }),
      this.prisma.subscriptionEvent.findMany({
        where: { type: { in: ['MARKED_PAID', 'PAYMENT_RECEIVED', 'FORCE_REACTIVATED'] }, createdAt: { gte: thirtyAgo } },
        select: { shopId: true, createdAt: true },
      }),
      this.prisma.invoice.aggregate({
        where: { paidAt: { gte: monthStart } },
        _sum: { amount: true, refundedAmount: true },
      }),
      this.prisma.invoice.aggregate({ where: { status: { in: ['OPEN', 'FAILED'] } }, _sum: { amount: true }, _count: true }),
      this.prisma.invoice.findMany({
        where: { paidAt: { gte: startOfMonth(5) } },
        select: { paidAt: true, amount: true, refundedAmount: true },
      }),
    ]);

    const monthly = (s: (typeof subs)[number]) => monthlyEquivalent(s.plan, s.cycle);

    const byStatus: Record<string, number> = {};
    for (const s of subs) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

    const paying = subs.filter((s) => s.status === 'ACTIVE' || s.status === 'PAYMENT_PENDING');
    const active = subs.filter((s) => s.status === 'ACTIVE');
    const mrr = round2(paying.reduce((sum, s) => sum + monthly(s), 0));

    const perPlan = new Map<string, { planId: string; name: string; shops: number; mrr: number }>();
    for (const s of paying) {
      const row = perPlan.get(s.planId) ?? { planId: s.planId, name: s.plan.name, shops: 0, mrr: 0 };
      row.shops += 1;
      row.mrr = round2(row.mrr + monthly(s));
      perPlan.set(s.planId, row);
    }

    const churnedShops = new Set(churnEvents.map((e) => e.shopId));
    const churnedMrr = round2(
      subs.filter((s) => churnedShops.has(s.shopId)).reduce((sum, s) => sum + monthly(s), 0),
    );

    const firstFailure = new Map<string, Date>();
    for (const e of failedEvents) if (!firstFailure.has(e.shopId)) firstFailure.set(e.shopId, e.createdAt);
    const recovered = [...firstFailure].filter(([shopId, at]) => recoveryEvents.some((r) => r.shopId === shopId && r.createdAt >= at)).length;

    const series: { month: string; collected: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const from = startOfMonth(i);
      const to = i === 0 ? addDays(now, 1) : startOfMonth(i - 1);
      const collected = paid6m
        .filter((p) => p.paidAt && p.paidAt >= from && p.paidAt < to)
        .reduce((sum, p) => sum + Number(p.amount) - Number(p.refundedAmount), 0);
      series.push({ month: from.toISOString().slice(0, 7), collected: round2(collected) });
    }

    return {
      currency: 'INR',
      totalShops: await this.prisma.shop.count(),
      activeSubscriptions: {
        total: active.length,
        daily: active.filter((s) => s.cycle === 'DAILY').length,
        monthly: active.filter((s) => s.cycle === 'MONTHLY').length,
        yearly: active.filter((s) => s.cycle === 'YEARLY').length,
      },
      byStatus,
      mrr,
      arr: round2(mrr * 12),
      collectedThisMonth: round2(Number(paidThisMonth._sum.amount ?? 0) - Number(paidThisMonth._sum.refundedAmount ?? 0)),
      outstanding: { amount: round2(Number(outstanding._sum.amount ?? 0)), invoices: outstanding._count },
      upcomingRenewals: upcoming.map((s) => ({
        shopId: s.shop.id,
        shopName: s.shop.name,
        plan: s.plan.name,
        cycle: s.cycle,
        amount: priceFor(s.plan, s.cycle),
        date: s.currentPeriodEnd,
        isTrial: s.status === 'TRIAL',
        autoRenew: s.autoRenew,
      })),
      churn: {
        thisMonth: churnedShops.size,
        cancelled: new Set(churnEvents.filter((e) => e.type === 'CANCELLED').map((e) => e.shopId)).size,
        expired: new Set(churnEvents.filter((e) => e.type === 'EXPIRED').map((e) => e.shopId)).size,
        lostMrr: churnedMrr,
      },
      failedPayments: {
        last30Days: failedEvents.length,
        shopsAffected: firstFailure.size,
        recovered,
        recoveryRate: firstFailure.size ? Math.round((recovered / firstFailure.size) * 100) : null,
        currentlyPastDue: byStatus['PAST_DUE'] ?? 0,
        currentlyPending: byStatus['PAYMENT_PENDING'] ?? 0,
      },
      perPlan: [...perPlan.values()].sort((a, b) => b.mrr - a.mrr),
      series,
    };
  }
}
