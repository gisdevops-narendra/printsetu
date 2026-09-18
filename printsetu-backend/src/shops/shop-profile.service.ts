import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrintJobStatus } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../storage/storage.interface';
import { AuditService } from '../audit/audit.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';
import { UpdateShopProfileDto, UpdateShopSettingsDto } from './dto/shop-profile.dto';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof DAYS)[number];
export type OpeningHours = Record<Day, { open: boolean; from: string; to: string }>;

export interface NotificationPrefs {
  newOrderSound: boolean;
  desktopAlerts: boolean;
  failureAlerts: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { newOrderSound: true, desktopAlerts: false, failureAlerts: true };

const COMPLETED: PrintJobStatus[] = [PrintJobStatus.PRINTED, PrintJobStatus.RETENTION_PENDING, PrintJobStatus.DELETED];
const PENDING: PrintJobStatus[] = [
  PrintJobStatus.PRINT_ELIGIBLE,
  PrintJobStatus.QUEUED,
  PrintJobStatus.PRINTING,
  PrintJobStatus.AGENT_OFFLINE,
  PrintJobStatus.PRINT_UNKNOWN,
];

const IMAGE_URL_TTL_SECONDS = 3600;
const IMAGE_LIMITS = {
  logo: { width: 512, height: 512, label: 'Logo' },
  banner: { width: 1600, height: 480, label: 'Banner' },
} as const;
export type ImageKind = keyof typeof IMAGE_LIMITS;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Local calendar day key (server TZ, see the TZ env var) — used to bucket jobs by day. */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * The shop owner's own view of their shop: public profile (description,
 * hours, contact, logo/cover), performance numbers, and their settings.
 * Identity fields (name, code, owner, status) deliberately stay admin-managed.
 */
@Injectable()
export class ShopProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- profile

  async getProfile(shopId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, include: { printSettings: true } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    const settings = shop.printSettings;
    const { logoKey, bannerKey, openingHours, printSettings: _ps, ...rest } = shop;
    return {
      shop: {
        ...rest,
        openingHours: this.normalizeHours(openingHours),
        logoUrl: logoKey ? await this.storage.getSignedDownloadUrl(logoKey, IMAGE_URL_TTL_SECONDS) : null,
        bannerUrl: bannerKey ? await this.storage.getSignedDownloadUrl(bannerKey, IMAGE_URL_TTL_SECONDS) : null,
      },
      settings: {
        autoAcceptOrders: settings?.autoAcceptOrders ?? false,
        defaultPrinterId: settings?.defaultPrinterId ?? null,
        notificationPrefs: this.normalizePrefs(settings?.notificationPrefs),
        // Admin-managed, shown for information only.
        retentionMinutes: settings?.retentionMinutes ?? 30,
        documentPreviewEnabled: settings?.documentPreviewEnabled ?? false,
        maxFileSizeBytes: settings?.maxFileSizeBytes ?? 26_214_400,
      },
    };
  }

  async updateProfile(shopId: string, actorUserId: string, dto: UpdateShopProfileDto) {
    const data: Prisma.ShopUpdateInput = {};
    if (dto.description !== undefined) {
      const text = dto.description.trim();
      if (text.length > 600) throw new InvalidPrintOptionException('The description is limited to 600 characters.');
      data.description = text || null;
    }
    if (dto.mobile !== undefined) {
      const mobile = dto.mobile.trim();
      if (!/^[0-9+\-\s()]{7,20}$/.test(mobile)) {
        throw new InvalidPrintOptionException('Enter a valid contact number (7-20 digits, + - ( ) allowed).');
      }
      data.mobile = mobile;
    }
    if (dto.address !== undefined) {
      const address = dto.address.trim();
      if (address.length < 3 || address.length > 200) {
        throw new InvalidPrintOptionException('The address must be between 3 and 200 characters.');
      }
      data.address = address;
    }
    if (dto.city !== undefined) {
      const city = dto.city.trim();
      if (city.length < 2 || city.length > 80) throw new InvalidPrintOptionException('Enter a valid city.');
      data.city = city;
    }
    if (dto.openingHours !== undefined) {
      data.openingHours = this.validateHours(dto.openingHours) as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.shop.update({ where: { id: shopId }, data });
      await this.audit.log({
        actorUserId,
        shopId,
        action: 'SHOP_PROFILE_UPDATED',
        entityType: 'Shop',
        entityId: shopId,
        metadata: { fields: Object.keys(data) },
      });
    }
    return this.getProfile(shopId);
  }

  // ----------------------------------------------------------------- images

  async uploadImage(shopId: string, actorUserId: string, kind: ImageKind, file: Express.Multer.File | undefined) {
    const spec = IMAGE_LIMITS[kind];
    if (!file) throw new InvalidPrintOptionException(`No ${spec.label.toLowerCase()} image was uploaded.`);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new InvalidPrintOptionException('Use a JPG, PNG or WebP image.');
    }

    let processed: Buffer;
    try {
      // Re-encoded server-side: strips metadata, applies EXIF rotation, and
      // guarantees a sane size regardless of what the phone uploaded.
      processed = await sharp(file.buffer)
        .rotate()
        .resize(spec.width, spec.height, { fit: 'cover', position: 'attention' })
        .webp({ quality: 86 })
        .toBuffer();
    } catch {
      throw new InvalidPrintOptionException('That file could not be read as an image.');
    }

    const key = `shops/${shopId}/${kind}-${Date.now()}.webp`;
    await this.storage.putObject({ key, body: processed, contentType: 'image/webp' });

    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    const previous = kind === 'logo' ? shop.logoKey : shop.bannerKey;
    await this.prisma.shop.update({
      where: { id: shopId },
      data: kind === 'logo' ? { logoKey: key } : { bannerKey: key },
    });
    if (previous) await this.storage.deleteObject(previous).catch(() => undefined);

    await this.audit.log({ actorUserId, shopId, action: `SHOP_${kind.toUpperCase()}_UPDATED`, entityType: 'Shop', entityId: shopId });
    return this.getProfile(shopId);
  }

  async removeImage(shopId: string, actorUserId: string, kind: ImageKind) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new AppNotFoundException('Shop not found.');
    const previous = kind === 'logo' ? shop.logoKey : shop.bannerKey;
    if (previous) {
      await this.prisma.shop.update({ where: { id: shopId }, data: kind === 'logo' ? { logoKey: null } : { bannerKey: null } });
      await this.storage.deleteObject(previous).catch(() => undefined);
      await this.audit.log({ actorUserId, shopId, action: `SHOP_${kind.toUpperCase()}_REMOVED`, entityType: 'Shop', entityId: shopId });
    }
    return this.getProfile(shopId);
  }

  // --------------------------------------------------------------- settings

  async updateSettings(shopId: string, actorUserId: string, dto: UpdateShopSettingsDto) {
    const data: Prisma.PrintSettingsUpdateInput = {};
    if (dto.autoAcceptOrders !== undefined) data.autoAcceptOrders = dto.autoAcceptOrders;
    if (dto.notificationPrefs) {
      const current = await this.prisma.printSettings.findUnique({ where: { shopId } });
      data.notificationPrefs = { ...this.normalizePrefs(current?.notificationPrefs), ...dto.notificationPrefs } as unknown as Prisma.InputJsonValue;
    }
    if (dto.defaultPrinterId !== undefined) {
      const printer = await this.prisma.printer.findUnique({ where: { id: dto.defaultPrinterId } });
      if (!printer || printer.shopId !== shopId) throw new AppNotFoundException('Printer not found for this shop.');
      data.defaultPrinterId = dto.defaultPrinterId;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.printSettings.upsert({
        where: { shopId },
        update: data,
        create: {
          shopId,
          autoAcceptOrders: dto.autoAcceptOrders ?? false,
          defaultPrinterId: dto.defaultPrinterId,
          notificationPrefs: (data.notificationPrefs as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      await this.audit.log({
        actorUserId,
        shopId,
        action: 'SHOP_SETTINGS_UPDATED',
        entityType: 'PrintSettings',
        entityId: shopId,
        metadata: { fields: Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined) },
      });
    }
    return this.getProfile(shopId);
  }

  // ------------------------------------------------------------------ stats

  /** Totals, earnings for today / this week / this month, and a 30-day daily series. */
  async stats(shopId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const seriesStart = new Date(todayStart);
    seriesStart.setDate(seriesStart.getDate() - 29);
    const since = new Date(Math.min(monthStart.getTime(), seriesStart.getTime(), weekStart.getTime()));

    const [byStatus, allTime, pages, recent] = await Promise.all([
      this.prisma.printJob.groupBy({ by: ['status'], where: { shopId }, _count: { _all: true } }),
      this.prisma.printJob.aggregate({ where: { shopId, status: { in: COMPLETED } }, _sum: { amount: true } }),
      this.prisma.printJobItem.aggregate({
        where: { printJob: { shopId, status: { in: COMPLETED } } },
        _sum: { billablePages: true },
      }),
      this.prisma.printJob.findMany({
        where: { shopId, status: { in: COMPLETED }, OR: [{ printedAt: { gte: since } }, { printedAt: null, updatedAt: { gte: since } }] },
        select: { amount: true, printedAt: true, updatedAt: true },
      }),
    ]);

    const count = (statuses: PrintJobStatus[]) =>
      byStatus.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

    const series = new Map<string, { earnings: number; jobs: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(seriesStart);
      d.setDate(seriesStart.getDate() + i);
      series.set(dayKey(d), { earnings: 0, jobs: 0 });
    }
    const bucket = (from: Date) => ({ earnings: 0, jobs: 0, from });
    const today = bucket(todayStart);
    const week = bucket(weekStart);
    const month = bucket(monthStart);
    for (const job of recent) {
      const when = job.printedAt ?? job.updatedAt;
      const amount = Number(job.amount);
      const day = series.get(dayKey(when));
      if (day) {
        day.earnings += amount;
        day.jobs += 1;
      }
      for (const b of [today, week, month]) {
        if (when >= b.from) {
          b.earnings += amount;
          b.jobs += 1;
        }
      }
    }
    const money = (n: number) => n.toFixed(2);

    return {
      currency: 'INR',
      totals: {
        completed: count(COMPLETED),
        pending: count(PENDING),
        failed: count([PrintJobStatus.PRINT_FAILED]),
        cancelled: count([PrintJobStatus.CANCELLED]),
        all: byStatus.reduce((sum, r) => sum + r._count._all, 0),
        pagesPrinted: pages._sum.billablePages ?? 0,
        earnings: (allTime._sum.amount ?? 0).toString(),
      },
      earnings: { today: money(today.earnings), week: money(week.earnings), month: money(month.earnings) },
      jobs: { today: today.jobs, week: week.jobs, month: month.jobs },
      series: [...series.entries()].map(([date, v]) => ({ date, earnings: Number(v.earnings.toFixed(2)), jobs: v.jobs })),
    };
  }

  // ---------------------------------------------------------------- helpers

  private normalizePrefs(raw: unknown): NotificationPrefs {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationPrefs>;
    return {
      newOrderSound: r.newOrderSound ?? DEFAULT_NOTIFICATION_PREFS.newOrderSound,
      desktopAlerts: r.desktopAlerts ?? DEFAULT_NOTIFICATION_PREFS.desktopAlerts,
      failureAlerts: r.failureAlerts ?? DEFAULT_NOTIFICATION_PREFS.failureAlerts,
    };
  }

  /** Always returns all seven days; a shop that never set hours gets `null` so the UI can show "not set". */
  private normalizeHours(raw: unknown): OpeningHours | null {
    if (!raw || typeof raw !== 'object') return null;
    const hours = raw as Partial<OpeningHours>;
    const out = {} as OpeningHours;
    for (const day of DAYS) {
      const d = hours[day];
      out[day] = { open: !!d?.open, from: d?.from ?? '09:00', to: d?.to ?? '18:00' };
    }
    return out;
  }

  private validateHours(input: unknown): OpeningHours {
    if (!input || typeof input !== 'object') throw new InvalidPrintOptionException('Opening hours are invalid.');
    const src = input as Record<string, { open?: unknown; from?: unknown; to?: unknown }>;
    const out = {} as OpeningHours;
    for (const day of DAYS) {
      const d = src[day];
      if (!d || typeof d !== 'object') throw new InvalidPrintOptionException('Opening hours must cover every day of the week.');
      const open = d.open === true;
      const from = typeof d.from === 'string' ? d.from : '09:00';
      const to = typeof d.to === 'string' ? d.to : '18:00';
      if (!TIME.test(from) || !TIME.test(to)) throw new InvalidPrintOptionException('Use 24-hour times such as 09:30.');
      if (open && from >= to) throw new InvalidPrintOptionException('Closing time must be after opening time.');
      out[day] = { open, from, to };
    }
    return out;
  }
}
