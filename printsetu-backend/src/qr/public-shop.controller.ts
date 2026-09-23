import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { QrService } from './qr.service';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public/shops')
export class PublicShopController {
  constructor(
    private readonly qrService: QrService,
    private readonly subscriptionAccess: SubscriptionAccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':publicCode')
  async resolve(@Param('publicCode') publicCode: string) {
    const { shopId, shopName, city } = await this.qrService.resolvePublicCode(publicCode);
    // A shop that is suspended, overdue or over its plan limit is still resolved (so the customer
    // sees a clear "temporarily unavailable" page) but is flagged as not taking orders.
    const { available, message } = await this.subscriptionAccess.customerAvailability(shopId);
    // Which paper / colour / sides combinations this shop has a price for (not the prices),
    // so the order page can default to options the shop actually offers.
    const pricedOptions = await this.prisma.pricing.findMany({
      where: { shopId, active: true },
      select: { paperSize: true, colorMode: true, sideMode: true },
      distinct: ['paperSize', 'colorMode', 'sideMode'],
    });
    return { shopCode: publicCode, shopName, city, available, unavailableMessage: message, pricedOptions };
  }
}
