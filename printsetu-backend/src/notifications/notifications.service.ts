import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SRS §20: in-app status is the Phase 1 baseline; EMAIL/SMS/WHATSAPP exist
 * only as schema/enum values so those channels can be switched on later
 * with no migration. `record` always writes an IN_APP row today.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(shopId: string, printJobId: string | null, eventType: NotificationEvent) {
    return this.prisma.notification.create({
      data: {
        shopId,
        printJobId: printJobId ?? undefined,
        eventType,
        channel: NotificationChannel.IN_APP,
        status: 'SENT',
      },
    });
  }

  /** SRS §20: shopkeeper-facing in-app notification feed (surfaced via GET /shop/notifications). */
  async listForShop(shopId: string, page = 1, pageSize = 50) {
    const take = Math.min(pageSize, 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { shopId, channel: NotificationChannel.IN_APP },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where: { shopId, channel: NotificationChannel.IN_APP } }),
    ]);
    return { items, total, page, pageSize: take };
  }

  /** Shopkeeper "clear all" for their own in-app feed — permanent, no undo. */
  async clearForShop(shopId: string) {
    const { count } = await this.prisma.notification.deleteMany({ where: { shopId } });
    return { cleared: count };
  }
}
