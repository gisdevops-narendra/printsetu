import { Injectable } from '@nestjs/common';
import { ColorMode, PaperSize, Prisma, SideMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';
import { CreatePricingTierDto, SetPricingDto, UpdatePricingTierDto } from './dto/pricing.dto';

const PAPER_NAMES: Record<PaperSize, string> = {
  A4: 'A4',
  A3: 'A3',
  LETTER: 'Letter',
  LEGAL: 'Legal',
};
const COLOR_NAMES: Record<ColorMode, string> = { BW: 'black & white', COLOR: 'color' };
const SIDE_NAMES: Record<SideMode, string> = { SIMPLEX: 'single-sided', DUPLEX: 'double-sided' };

export interface PricingCombo {
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
}

/** Key for grouping line items that share one paper/color/side combination. */
export function comboKey(combo: PricingCombo): string {
  return `${combo.paperSize}|${combo.colorMode}|${combo.sideMode}`;
}

type TierRange = { id?: string; minPages: number; maxPages: number | null };

/** First existing tier whose page range overlaps `candidate` (null maxPages = unbounded). */
export function findOverlappingTier<T extends TierRange>(
  candidate: TierRange,
  existing: T[],
): T | undefined {
  const candidateMax = candidate.maxPages ?? Infinity;
  return existing.find(
    (tier) =>
      tier.id !== candidate.id &&
      tier.minPages <= candidateMax &&
      candidate.minPages <= (tier.maxPages ?? Infinity),
  );
}

/** Rate an order line is charged at, and the rule it came from (snapshotted into the quote). */
export interface ResolvedRate {
  pricingId: string;
  effectiveFrom: Date;
  basePricePerPage: number;
  pricePerPage: number;
  /** Whether the combination has any active tiers at all (regardless of whether one matched). */
  hasTiers: boolean;
  tier: { id: string; minPages: number; maxPages: number | null; pricePerPage: number } | null;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  listActiveForShop(shopId: string) {
    return this.prisma.pricing.findMany({
      where: { shopId, active: true },
      orderBy: [{ paperSize: 'asc' }, { colorMode: 'asc' }, { sideMode: 'asc' }],
    });
  }

  /** Whether the shop has switched pricing on (off by default). */
  async isPricingEnabled(shopId: string): Promise<boolean> {
    const settings = await this.prisma.printSettings.findUnique({
      where: { shopId },
      select: { pricingEnabled: true },
    });
    return settings?.pricingEnabled ?? false;
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

  /**
   * "Delete" a rate: deactivate rather than physically remove the row.
   * Nothing references pricing.id by FK (orders snapshot the rate into
   * PrintQuote.pricingSnapshot as JSON — see that model's comment), so a
   * hard delete would be safe, but keeping the row preserves the same
   * audit trail setRate() already relies on for history. The combination's
   * quantity tiers are retired with it.
   */
  async deactivate(shopId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rate = await tx.pricing.findFirst({ where: { id, shopId } });
      if (!rate) {
        throw new AppNotFoundException('Pricing rule not found for this shop.');
      }
      await tx.pricing.update({ where: { id }, data: { active: false } });
      // Tiers only refine a fixed rate — without one the combination isn't offered at all.
      await tx.pricingTier.updateMany({
        where: {
          shopId,
          paperSize: rate.paperSize,
          colorMode: rate.colorMode,
          sideMode: rate.sideMode,
          active: true,
        },
        data: { active: false },
      });
      // With no rate left a priced shop would offer nothing, so pricing switches off.
      if ((await tx.pricing.count({ where: { shopId, active: true } })) === 0) {
        await tx.printSettings.updateMany({ where: { shopId }, data: { pricingEnabled: false } });
      }
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
        `This shop doesn't offer ${PAPER_NAMES[paperSize]} ${COLOR_NAMES[colorMode]} ${SIDE_NAMES[sideMode]} printing.`,
      );
    }
    return rate;
  }

  // ---- Quantity-based tiers (optional, per paper/color/side combination) ----

  listActiveTiersForShop(shopId: string) {
    return this.prisma.pricingTier.findMany({
      where: { shopId, active: true },
      orderBy: [
        { paperSize: 'asc' },
        { colorMode: 'asc' },
        { sideMode: 'asc' },
        { minPages: 'asc' },
      ],
    });
  }

  async addTier(shopId: string, dto: CreatePricingTierDto) {
    const combo = { paperSize: dto.paperSize, colorMode: dto.colorMode, sideMode: dto.sideMode };
    // A page count no tier covers falls back to the fixed rate, so one must exist.
    await this.getActiveRateOrThrow(shopId, combo.paperSize, combo.colorMode, combo.sideMode);
    return this.prisma.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, shopId, combo, {
        minPages: dto.minPages,
        maxPages: dto.maxPages ?? null,
      });
      return tx.pricingTier.create({
        data: {
          shopId,
          ...combo,
          minPages: dto.minPages,
          maxPages: dto.maxPages ?? null,
          pricePerPage: dto.pricePerPage,
          active: true,
        },
      });
    });
  }

  /** Same versioning as setRate(): the old tier row is deactivated, a new one replaces it. */
  async updateTier(shopId: string, id: string, dto: UpdatePricingTierDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pricingTier.findFirst({ where: { id, shopId, active: true } });
      if (!existing) throw new AppNotFoundException('Pricing tier not found for this shop.');
      const combo = {
        paperSize: existing.paperSize,
        colorMode: existing.colorMode,
        sideMode: existing.sideMode,
      };
      await this.assertNoOverlap(tx, shopId, combo, {
        id,
        minPages: dto.minPages,
        maxPages: dto.maxPages ?? null,
      });
      await tx.pricingTier.update({ where: { id }, data: { active: false } });
      return tx.pricingTier.create({
        data: {
          shopId,
          ...combo,
          minPages: dto.minPages,
          maxPages: dto.maxPages ?? null,
          pricePerPage: dto.pricePerPage,
          active: true,
        },
      });
    });
  }

  async deactivateTier(shopId: string, id: string): Promise<void> {
    const result = await this.prisma.pricingTier.updateMany({
      where: { id, shopId, active: true },
      data: { active: false },
    });
    if (result.count === 0) {
      throw new AppNotFoundException('Pricing tier not found for this shop.');
    }
  }

  /**
   * The per-page rate for `totalPages` billable pages of one combination
   * across an order. With active tiers, the tier whose range contains
   * `totalPages` prices EVERY page (not a progressive slab); no tiers, or a
   * count that falls in a gap between tiers, uses the fixed rate.
   */
  async resolveRate(
    shopId: string,
    combo: PricingCombo,
    totalPages: number,
  ): Promise<ResolvedRate> {
    const rate = await this.getActiveRateOrThrow(
      shopId,
      combo.paperSize,
      combo.colorMode,
      combo.sideMode,
    );
    const tiers = await this.prisma.pricingTier.findMany({
      where: {
        shopId,
        paperSize: combo.paperSize,
        colorMode: combo.colorMode,
        sideMode: combo.sideMode,
        active: true,
      },
      orderBy: { minPages: 'asc' },
    });
    const match = tiers.find(
      (tier) =>
        totalPages >= tier.minPages && (tier.maxPages === null || totalPages <= tier.maxPages),
    );
    const basePricePerPage = Number(rate.pricePerPage);
    return {
      pricingId: rate.id,
      effectiveFrom: rate.effectiveFrom,
      basePricePerPage,
      pricePerPage: match ? Number(match.pricePerPage) : basePricePerPage,
      hasTiers: tiers.length > 0,
      tier: match
        ? {
            id: match.id,
            minPages: match.minPages,
            maxPages: match.maxPages,
            pricePerPage: Number(match.pricePerPage),
          }
        : null,
    };
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    shopId: string,
    combo: PricingCombo,
    candidate: TierRange,
  ) {
    if (candidate.maxPages !== null && candidate.maxPages < candidate.minPages) {
      throw new InvalidPrintOptionException(
        '"To" pages must be greater than or equal to "From" pages.',
      );
    }
    const existing = await tx.pricingTier.findMany({ where: { shopId, ...combo, active: true } });
    const clash = findOverlappingTier(candidate, existing);
    if (clash) {
      const range =
        clash.maxPages === null ? `${clash.minPages}+` : `${clash.minPages}–${clash.maxPages}`;
      throw new InvalidPrintOptionException(`This overlaps the ${range} pages range.`);
    }
  }
}
