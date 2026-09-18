import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingSettingsService } from './billing-settings.service';
import { BILLING_CHANNELS, BillingChannel } from './subscription.constants';

/**
 * Sends billing messages to a shop over its configured channels (the shop's
 * own choice, else the platform default).
 *
 * In-app messages are delivered for real (they show in the shop portal's
 * notification feed and billing page). EMAIL / SMS / WHATSAPP are recorded
 * as PENDING with the destination address, ready for a provider to pick up:
 * no provider is connected yet, so nothing is actually sent on those.
 */
@Injectable()
export class BillingNotifierService {
  private readonly logger = new Logger(BillingNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BillingSettingsService,
  ) {}

  async channelsFor(shopChannels: unknown): Promise<BillingChannel[]> {
    const chosen = Array.isArray(shopChannels)
      ? (shopChannels.filter((c) => BILLING_CHANNELS.includes(c as BillingChannel)) as BillingChannel[])
      : null;
    const channels = chosen?.length ? chosen : (await this.settings.get()).defaultChannels;
    return Array.from(new Set<BillingChannel>(['IN_APP', ...channels]));
  }

  async notify(shopId: string, event: NotificationEvent, message: string, shopChannels?: unknown): Promise<void> {
    try {
      const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
      if (!shop) return;
      const channels = await this.channelsFor(shopChannels);
      await this.prisma.notification.createMany({
        data: channels.map((channel) => ({
          shopId,
          eventType: event,
          message,
          channel: channel as NotificationChannel,
          destination: channel === 'EMAIL' ? shop.email : channel === 'IN_APP' ? null : shop.mobile,
          status: channel === 'IN_APP' ? ('SENT' as const) : ('PENDING' as const),
        })),
      });
    } catch (err) {
      // A notification problem must never block a billing state change.
      this.logger.warn(`Could not notify shop ${shopId} (${event}): ${(err as Error).message}`);
    }
  }
}
