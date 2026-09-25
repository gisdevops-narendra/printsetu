import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrintJobStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { effectiveAvailability, normalizeOpeningHours } from '../shops/shop-availability';
import { localDate, resolveDateRange, ResolvedDateRange } from '../reports/date-range';
import { JOB_BUCKET, PRINTED_STATUSES } from '../reports/shop-dashboard.service';

/** Marker colour on the map: green / orange / grey. */
export type MarkerStatus = 'ONLINE' | 'OFFLINE' | 'DEACTIVATED';
export type SubscriptionAlert = 'EXPIRING' | 'EXPIRED' | null;
export type AreaGrouping = 'city' | 'district';

/** A shop is flagged for printer problems at this many failed prints in the period... */
export const FAILED_PRINTS_MIN = 3;
/** ...when they are also at least this share of its orders. */
export const FAILED_PRINTS_SHARE = 0.2;
export const EXPIRING_DAYS = 7;
export const INACTIVE_DAY_CHOICES = [7, 30] as const;

const DAY_MS = 86_400_000;
const EXPIRED_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CANCELLED,
  SubscriptionStatus.PAST_DUE,
];
const round2 = (n: number) => Math.round(n * 100) / 100;

interface ShopStats {
  jobs: number;
  printed: number;
  failed: number;
  pages: number;
  revenue: number;
}

interface MapShop {
  id: string;
  name: string;
  shopCode: string;
  ownerName: string;
  mobile: string;
  address: string;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: Date;
  markerStatus: MarkerStatus;
  pricingEnabled: boolean;
  subscription: {
    plan: string;
    status: SubscriptionStatus;
    endsAt: string;
    alert: SubscriptionAlert;
  } | null;
  stats: ShopStats;
  lastOrderAt: Date | null;
  lastSignInAt: Date | null;
}

/**
 * Admin Business Map. Everything is worked out here, not in the browser:
 * per-shop figures for the chosen date range (orders created in the range;
 * revenue and pages only from orders that printed, like the dashboard),
 * the marker colour, health flags, bubble sizes and heat weights.
 */
@Injectable()
export class BusinessMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('shopTimeZone', { infer: true });
  }

  /** Shops as a GeoJSON FeatureCollection (placed shops only), with summary figures in `meta`. */
  async shops(query: { from?: string; to?: string; inactiveDays?: number }, now = new Date()) {
    const range = resolveDateRange(query.from, query.to, this.timeZone, now);
    const inactiveDays = INACTIVE_DAY_CHOICES.includes(query.inactiveDays as 7 | 30)
      ? query.inactiveDays!
      : 7;
    const shops = await this.loadShops(range, now);
    const inactiveSince = new Date(now.getTime() - inactiveDays * DAY_MS);

    const maxJobs = Math.max(0, ...shops.map((s) => s.stats.jobs));
    const maxRevenue = Math.max(
      0,
      ...shops.filter((s) => s.pricingEnabled).map((s) => s.stats.revenue),
    );
    const scale = (value: number, max: number) =>
      max > 0 ? Math.round(Math.sqrt(value / max) * 1000) / 1000 : 0;

    const placed = shops.filter((s) => s.latitude !== null && s.longitude !== null);
    const features = placed.map((shop) => {
      const { stats } = shop;
      const inactive =
        shop.markerStatus !== 'DEACTIVATED' &&
        (!shop.lastOrderAt || shop.lastOrderAt < inactiveSince);
      const printerProblem =
        stats.failed >= FAILED_PRINTS_MIN &&
        stats.jobs > 0 &&
        stats.failed / stats.jobs >= FAILED_PRINTS_SHARE;
      const lastActiveAt = latest(shop.lastOrderAt, shop.lastSignInAt);
      return {
        type: 'Feature' as const,
        id: shop.id,
        geometry: { type: 'Point' as const, coordinates: [shop.longitude!, shop.latitude!] },
        properties: {
          id: shop.id,
          name: shop.name,
          shopCode: shop.shopCode,
          ownerName: shop.ownerName,
          mobile: shop.mobile,
          address: shop.address,
          city: shop.city,
          district: shop.district,
          markerStatus: shop.markerStatus,
          pricingEnabled: shop.pricingEnabled,
          subscription: shop.subscription,
          jobs: stats.jobs,
          printed: stats.printed,
          failed: stats.failed,
          pages: stats.pages,
          // null when the shop doesn't charge through PrintSetu (pricing off).
          revenue: shop.pricingEnabled ? round2(stats.revenue) : null,
          inactive,
          printerProblem,
          lastOrderAt: shop.lastOrderAt?.toISOString() ?? null,
          lastActiveAt: lastActiveAt?.toISOString() ?? null,
          registeredAt: shop.createdAt.toISOString(),
          registeredMonth: localDate(shop.createdAt, this.timeZone).slice(0, 7),
          // 0..1 marker sizes (square-root scaled so area follows the value). In revenue
          // mode a shop without pricing is sized by its print jobs instead.
          size: {
            jobs: scale(stats.jobs, maxJobs),
            revenue: shop.pricingEnabled
              ? scale(stats.revenue, maxRevenue)
              : scale(stats.jobs, maxJobs),
          },
          heat: maxJobs > 0 ? Math.round((stats.jobs / maxJobs) * 1000) / 1000 : 0,
        },
      };
    });

    const count = (pred: (f: (typeof features)[number]['properties']) => boolean) =>
      features.filter((f) => pred(f.properties)).length;
    return {
      type: 'FeatureCollection' as const,
      features,
      meta: {
        range: { from: range.from, to: range.to },
        thresholds: {
          inactiveDays,
          failedPrintsMin: FAILED_PRINTS_MIN,
          failedPrintsShare: FAILED_PRINTS_SHARE,
          expiringDays: EXPIRING_DAYS,
        },
        totals: {
          shops: shops.length,
          placed: placed.length,
          jobs: sum(shops, (s) => s.stats.jobs),
          pages: sum(shops, (s) => s.stats.pages),
          revenue: round2(sum(shops, (s) => s.stats.revenue)),
        },
        counts: {
          online: count((p) => p.markerStatus === 'ONLINE'),
          offline: count((p) => p.markerStatus === 'OFFLINE'),
          deactivated: count((p) => p.markerStatus === 'DEACTIVATED'),
          inactive: count((p) => p.inactive),
          expiring: count((p) => p.subscription?.alert === 'EXPIRING'),
          expired: count((p) => p.subscription?.alert === 'EXPIRED'),
          printerProblems: count((p) => p.printerProblem),
        },
        max: { jobs: maxJobs, revenue: round2(maxRevenue) },
        // Shops that haven't set a map location yet (listed, but not on the map).
        unplaced: shops
          .filter((s) => s.latitude === null || s.longitude === null)
          .map((s) => ({ id: s.id, name: s.name, city: s.city, markerStatus: s.markerStatus })),
        growth: this.growth(shops, now),
      },
    };
  }

  /**
   * Totals per city or district for the range, as GeoJSON points at the
   * middle of the area's placed shops. Areas with no placed shop are in `meta.unplaced`.
   */
  async areas(query: { from?: string; to?: string; groupBy?: string }, now = new Date()) {
    const groupBy: AreaGrouping = query.groupBy === 'district' ? 'district' : 'city';
    const range = resolveDateRange(query.from, query.to, this.timeZone, now);
    const shops = await this.loadShops(range, now);

    const groups = new Map<string, { name: string; city: string | null; shops: MapShop[] }>();
    for (const shop of shops) {
      const raw = groupBy === 'city' ? shop.city : shop.district;
      const name = raw?.trim() || '';
      const key = name.toLowerCase();
      const group = groups.get(key) ?? {
        name,
        city: groupBy === 'district' ? null : name,
        shops: [],
      };
      group.shops.push(shop);
      groups.set(key, group);
    }

    const areas = [...groups.entries()].map(([key, group]) => {
      const placed = group.shops.filter((s) => s.latitude !== null && s.longitude !== null);
      return {
        key: `${groupBy}:${key}`,
        // '' = shops that haven't filled in this field (shown as "Not set").
        name: group.name,
        groupBy,
        shops: group.shops.length,
        activeShops: group.shops.filter((s) => s.markerStatus !== 'DEACTIVATED').length,
        jobs: sum(group.shops, (s) => s.stats.jobs),
        pages: sum(group.shops, (s) => s.stats.pages),
        revenue: round2(sum(group.shops, (s) => s.stats.revenue)),
        center: placed.length
          ? ([avg(placed, (s) => s.longitude!), avg(placed, (s) => s.latitude!)] as [
              number,
              number,
            ])
          : null,
      };
    });
    areas.sort((a, b) => b.jobs - a.jobs || b.shops - a.shops || a.name.localeCompare(b.name));

    return {
      type: 'FeatureCollection' as const,
      features: areas
        .filter((a) => a.center)
        .map(({ center, ...properties }) => ({
          type: 'Feature' as const,
          id: properties.key,
          geometry: { type: 'Point' as const, coordinates: center! },
          properties,
        })),
      meta: {
        range: { from: range.from, to: range.to },
        groupBy,
        areas: areas.map(({ center: _center, ...a }) => ({ ...a, placed: !!_center })),
      },
    };
  }

  /** New and total shops per month, from the first registration to now (for the growth replay). */
  private growth(shops: MapShop[], now: Date) {
    const months = shops.map((s) => localDate(s.createdAt, this.timeZone).slice(0, 7));
    if (!months.length) return [];
    const first = months.reduce((a, b) => (a < b ? a : b));
    const last = localDate(now, this.timeZone).slice(0, 7);
    const newByMonth = new Map<string, { all: number; placed: number }>();
    shops.forEach((s, i) => {
      const entry = newByMonth.get(months[i]) ?? { all: 0, placed: 0 };
      entry.all++;
      if (s.latitude !== null && s.longitude !== null) entry.placed++;
      newByMonth.set(months[i], entry);
    });
    const series: { month: string; newShops: number; totalShops: number; placedShops: number }[] =
      [];
    let total = 0;
    let placed = 0;
    for (let month = first; month <= last; month = nextMonth(month)) {
      const added = newByMonth.get(month) ?? { all: 0, placed: 0 };
      total += added.all;
      placed += added.placed;
      series.push({ month, newShops: added.all, totalShops: total, placedShops: placed });
    }
    return series;
  }

  private async loadShops(range: ResolvedDateRange, now: Date): Promise<MapShop[]> {
    const inRange = { gte: range.start, lt: range.end };
    const [shops, jobGroups, pageRows, lastOrders, lastSignIns] = await Promise.all([
      this.prisma.shop.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          shopCode: true,
          ownerName: true,
          mobile: true,
          address: true,
          city: true,
          district: true,
          latitude: true,
          longitude: true,
          status: true,
          createdAt: true,
          openingHours: true,
          printSettings: {
            select: {
              acceptingOrders: true,
              autoSchedule: true,
              scheduleOverride: true,
              scheduleOverrideUntil: true,
              pricingEnabled: true,
            },
          },
          subscription: {
            select: { status: true, currentPeriodEnd: true, plan: { select: { name: true } } },
          },
        },
      }),
      this.prisma.printJob.groupBy({
        by: ['shopId', 'status'],
        where: { createdAt: inRange },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ shopId: string; pages: number }[]>`
        SELECT j.shop_id AS "shopId", SUM(i.billable_pages)::int AS pages
        FROM print_job_items i
        JOIN print_jobs j ON j.id = i.print_job_id
        WHERE j.created_at >= ${range.start} AND j.created_at < ${range.end}
          AND j.status::text IN (${Prisma.join(PRINTED_STATUSES)})
        GROUP BY 1`,
      this.prisma.printJob.groupBy({ by: ['shopId'], _max: { createdAt: true } }),
      this.prisma.user.groupBy({
        by: ['shopId'],
        where: { shopId: { not: null } },
        _max: { lastLoginAt: true },
      }),
    ]);

    const stats = new Map<string, ShopStats>();
    const statsFor = (shopId: string) => {
      let entry = stats.get(shopId);
      if (!entry)
        stats.set(shopId, (entry = { jobs: 0, printed: 0, failed: 0, pages: 0, revenue: 0 }));
      return entry;
    };
    for (const group of jobGroups) {
      const entry = statsFor(group.shopId);
      const bucket = JOB_BUCKET[group.status as PrintJobStatus];
      if (bucket === 'cancelled') continue;
      entry.jobs += group._count._all;
      if (bucket === 'printed') {
        entry.printed += group._count._all;
        entry.revenue += Number(group._sum.amount ?? 0);
      }
      if (bucket === 'failed') entry.failed += group._count._all;
    }
    for (const row of pageRows) statsFor(row.shopId).pages += row.pages;
    const lastOrderBy = new Map(lastOrders.map((r) => [r.shopId, r._max.createdAt]));
    const lastSignInBy = new Map(lastSignIns.map((r) => [r.shopId, r._max.lastLoginAt]));

    return shops.map((shop) => {
      const settings = shop.printSettings;
      const online = effectiveAvailability(
        {
          acceptingOrders: settings?.acceptingOrders ?? true,
          autoSchedule: settings?.autoSchedule ?? false,
          scheduleOverride: settings?.scheduleOverride ?? null,
          scheduleOverrideUntil: settings?.scheduleOverrideUntil ?? null,
        },
        normalizeOpeningHours(shop.openingHours),
        now,
        this.timeZone,
      ).online;
      const sub = shop.subscription;
      return {
        id: shop.id,
        name: shop.name,
        shopCode: shop.shopCode,
        ownerName: shop.ownerName,
        mobile: shop.mobile,
        address: shop.address,
        city: shop.city,
        district: shop.district,
        latitude: shop.latitude,
        longitude: shop.longitude,
        createdAt: shop.createdAt,
        markerStatus: shop.status !== 'ACTIVE' ? 'DEACTIVATED' : online ? 'ONLINE' : 'OFFLINE',
        pricingEnabled: settings?.pricingEnabled ?? false,
        subscription: sub
          ? {
              plan: sub.plan.name,
              status: sub.status,
              endsAt: sub.currentPeriodEnd.toISOString(),
              alert: subscriptionAlert(sub.status, sub.currentPeriodEnd, now),
            }
          : null,
        stats: stats.get(shop.id) ?? { jobs: 0, printed: 0, failed: 0, pages: 0, revenue: 0 },
        lastOrderAt: lastOrderBy.get(shop.id) ?? null,
        lastSignInAt: lastSignInBy.get(shop.id) ?? null,
      };
    });
  }
}

/** Expired: the plan ended, lapsed or was stopped. Expiring: active (or trial) and ending within EXPIRING_DAYS. */
export function subscriptionAlert(
  status: SubscriptionStatus,
  endsAt: Date,
  now: Date,
): SubscriptionAlert {
  if (EXPIRED_STATUSES.includes(status)) return 'EXPIRED';
  const msLeft = endsAt.getTime() - now.getTime();
  const running = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIAL;
  if (running && msLeft < 0) return 'EXPIRED';
  if (running && msLeft <= EXPIRING_DAYS * DAY_MS) return 'EXPIRING';
  return null;
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function avg<T>(items: T[], pick: (item: T) => number): number {
  return Math.round((sum(items, pick) / items.length) * 1e5) / 1e5;
}

function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
