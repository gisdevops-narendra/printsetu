import { Injectable } from '@nestjs/common';
import { ColorMode, PaperSize, SideMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidPrintOptionException } from '../common/exceptions/app.exceptions';
import { SetPricingDto } from './dto/pricing.dto';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveForShop(shopId: string) {
    return this.prisma.pricing.findMany({
      where: { shopId, active: true },
      orderBy: [{ paperSize: 'asc' }, { colorMode: 'asc' }, { sideMode: 'asc' }],
    });
  }

  listHistoryForShop(shopId: string) {
    return this.prisma.pricing.findMany({
      where: { shopId },
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /**
   * Versioned pricing (SRS §10): never mutate an existing rate in place.
   * The previous active rule is deactivated and a new one takes over from
   * "now" — historical print jobs keep referencing the rule snapshot they
   * captured in PrintQuote.pricingSnapshot, so this never changes past
   * orders' totals.
   */
  async setRate(shopId: string, dto: SetPricingDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.pricing.updateMany({
        where: {
          shopId,
          paperSize: dto.paperSize,
          colorMode: dto.colorMode,
          sideMode: dto.sideMode,
          active: true,
        },
        data: { active: false },
      });
      return tx.pricing.create({
        data: {
          shopId,
          paperSize: dto.paperSize,
          colorMode: dto.colorMode,
          sideMode: dto.sideMode,
          pricePerPage: dto.pricePerPage,
          active: true,
        },
      });
    });
  }

  async getActiveRateOrThrow(
    shopId: string,
    paperSize: PaperSize,
    colorMode: ColorMode,
    sideMode: SideMode,
  ) {
    const rate = await this.prisma.pricing.findFirst({
      where: { shopId, paperSize, colorMode, sideMode, active: true },
    });
    if (!rate) {
      throw new InvalidPrintOptionException(
        `No active pricing configured for ${paperSize}/${colorMode}/${sideMode} at this shop.`,
      );
    }
    return rate;
  }
}
