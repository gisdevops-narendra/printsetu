import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ColorMode,
  Prisma,
  PrinterStatus,
  PrintJobStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { effectiveAvailability, normalizeOpeningHours } from '../shops/shop-availability';
import { resolveDateRange } from './date-range';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';

export type JobBucket = 'pending' | 'printing' | 'printed' | 'failed' | 'cancelled';

/** Dashboard job-status groups; printed-and-since-cleaned-up jobs still count as printed. */
export const JOB_BUCKET: Record<PrintJobStatus, JobBucket> = {
  CREATED: 'pending',
  PRINT_ELIGIBLE: 'pending',
  QUEUED: 'pending',
  AGENT_OFFLINE: 'pending',
  PRINTING: 'printing',
  PRINTED: 'printed',
  RETENTION_PENDING: 'printed',
  DELETED: 'printed',
  PRINT_FAILED: 'failed',
  PRINT_UNKNOWN: 'failed',
  CANCELLED: 'cancelled',
};

/** Revenue and pages only count jobs that actually printed (same rule as the summary tiles). */
export const PRINTED_STATUSES = (Object.keys(JOB_BUCKET) as PrintJobStatus[]).filter(
  (s) => JOB_BUCKET[s] === 'printed',
);

const EXPIRING_SOON_MS = 7 * 86_400_000;

type StatusCounts = Record<JobBucket, number>;
const emptyCounts = (): StatusCounts => ({
  pending: 0,
  printing: 0,
  printed: 0,
  failed: 0,
  cancelled: 0,
});
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ShopDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Admin dashboard, shop by shop. Job, revenue, page and trend figures cover
   * jobs CREATED in [from, to] (inclusive local days); online status and
   * subscriptions are as of right now. With `shopId`, every figure covers
   * that one shop; `shopOptions` always lists every shop for the picker.
   */
  async shopSummary(from?: string, to?: string, shopId?: string, now = new Date()) {
    const timeZone = this.config.get('shopTimeZone', { infer: true });
    const range = resolveDateRange(from, to, timeZone, now);
    const inRange = { gte: range.start, lt: range.end };
    const shopFilter = shopId ? Prisma.sql`AND j.shop_id = ${shopId}` : Prisma.empty;
    const dailyShopFilter = shopId ? Prisma.sql`AND shop_id = ${shopId}` : Prisma.empty;

    const [shops, jobGroups, pageRows, dailyRows, allShops] = await Promise.all([
      this.prisma.shop.findMany({
        where: shopId ? { id: shopId } : {},
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          shopCode: true,
          city: true,
          status: true,
          openingHours: true,
          printSettings: {
            select: {
              acceptingOrders: true,
              autoSchedule: true,
              scheduleOverride: true,
              scheduleOverrideUntil: true,
            },
          },
          printers: { where: { status: { not: PrinterStatus.REMOVED } }, select: { status: true } },
          subscription: {
            select: {
              status: true,
              cycle: true,
              currentPeriodEnd: true,
              plan: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.printJob.groupBy({
        by: ['shopId', 'status'],
        where: { createdAt: inRange, ...(shopId ? { shopId } : {}) },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ shopId: string; colorMode: ColorMode; pages: number }[]>`
        SELECT j.shop_id AS "shopId", i."colorMode" AS "colorMode", SUM(i.billable_pages)::int AS pages
        FROM print_job_items i
        JOIN print_jobs j ON j.id = i.print_job_id
        WHERE j.created_at >= ${range.start} AND j.created_at < ${range.end}
          AND j.status::text IN (${Prisma.join(PRINTED_STATUSES)})
          ${shopFilter}
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ day: string; jobs: number; revenue: number }[]>`
        SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS jobs,
               COALESCE(SUM(amount) FILTER (WHERE status::text IN (${Prisma.join(PRINTED_STATUSES)})), 0)::float AS revenue
        FROM print_jobs
        WHERE created_at >= ${range.start} AND created_at < ${range.end}
          ${dailyShopFilter}
        GROUP BY 1`,
      shopId
        ? this.prisma.shop.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, city: true },
          })
        : null,
    ]);
    if (shopId && shops.length === 0) throw new AppNotFoundException('Shop not found.');

    const perShop = new Map(
      shops.map((s) => [
        s.id,
        { jobs: 0, revenue: 0, pagesBw: 0, pagesColor: 0, statusCounts: emptyCounts() },
      ]),
    );
    for (const group of jobGroups) {
      const stats = perShop.get(group.shopId);
      if (!stats) continue;
      stats.jobs += group._count._all;
      stats.statusCounts[JOB_BUCKET[group.status]] += group._count._all;
      if (JOB_BUCKET[group.status] === 'printed') stats.revenue += Number(group._sum.amount ?? 0);
    }
    for (const row of pageRows) {
      const stats = perShop.get(row.shopId);
      if (!stats) continue;
      if (row.colorMode === ColorMode.COLOR) stats.pagesColor += row.pages;
      else stats.pagesBw += row.pages;
    }

    const shopRows = shops.map((shop) => {
      const stats = perShop.get(shop.id)!;
      const settings = shop.printSettings;
      const availability = effectiveAvailability(
        {
          acceptingOrders: settings?.acceptingOrders ?? true,
          autoSchedule: settings?.autoSchedule ?? false,
          scheduleOverride: settings?.scheduleOverride ?? null,
          scheduleOverrideUntil: settings?.scheduleOverrideUntil ?? null,
        },
        normalizeOpeningHours(shop.openingHours),
        now,
        timeZone,
      );
      const sub = shop.subscription;
      const msLeft = sub ? sub.currentPeriodEnd.getTime() - now.getTime() : null;
      return {
        shopId: shop.id,
        name: shop.name,
        shopCode: shop.shopCode,
        city: shop.city,
        shopStatus: shop.status,
        // Taking orders right now: an active shop whose Online/Offline switch (or schedule) says online.
        online: shop.status === 'ACTIVE' && availability.online,
        agentStatus: shop.printers.some((p) => p.status === PrinterStatus.ONLINE)
          ? 'ONLINE'
          : shop.printers.length > 0
            ? 'OFFLINE'
            : 'NONE',
        jobs: stats.jobs,
        revenue: round2(stats.revenue),
        pagesBw: stats.pagesBw,
        pagesColor: stats.pagesColor,
        statusCounts: stats.statusCounts,
        subscription: sub
          ? {
              plan: sub.plan.name,
              status: sub.status,
              cycle: sub.cycle,
              currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
              expiringSoon:
                (sub.status === SubscriptionStatus.ACTIVE ||
                  sub.status === SubscriptionStatus.TRIAL) &&
                msLeft! >= 0 &&
                msLeft! <= EXPIRING_SOON_MS,
            }
          : null,
      };
    });

    const dailyByDay = new Map(dailyRows.map((r) => [r.day, r]));
    const totals = shopRows.reduce(
      (acc, s) => {
        acc.jobs += s.jobs;
        acc.revenue += s.revenue;
        acc.pagesBw += s.pagesBw;
        acc.pagesColor += s.pagesColor;
        for (const key of Object.keys(acc.statusCounts) as JobBucket[])
          acc.statusCounts[key] += s.statusCounts[key];
        return acc;
      },
      { jobs: 0, revenue: 0, pagesBw: 0, pagesColor: 0, statusCounts: emptyCounts() },
    );

    return {
      range: { from: range.from, to: range.to, timeZone },
      shopId: shopId ?? null,
      shopOptions: (allShops ?? shops).map((s) => ({ shopId: s.id, name: s.name, city: s.city })),
      totals: { ...totals, revenue: round2(totals.revenue) },
      daily: range.days.map((day) => ({
        date: day,
        jobs: dailyByDay.get(day)?.jobs ?? 0,
        revenue: round2(dailyByDay.get(day)?.revenue ?? 0),
      })),
      shops: shopRows,
    };
  }
}
