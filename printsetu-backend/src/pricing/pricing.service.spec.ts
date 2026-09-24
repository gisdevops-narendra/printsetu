import { Test } from '@nestjs/testing';
import { PricingService, findOverlappingTier } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppNotFoundException,
  InvalidPrintOptionException,
} from '../common/exceptions/app.exceptions';

describe('PricingService (SRS §10 versioned pricing)', () => {
  let service: PricingService;
  let prisma: {
    pricing: {
      updateMany: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    pricingTier: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      pricing: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'new-rate', ...data })),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      pricingTier: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'new-tier', ...data })),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation((fn) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PricingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PricingService);
  });

  it('deactivates the previous active rate before creating the new one (never mutates history)', async () => {
    await service.setRate('shop-1', {
      paperSize: 'A4',
      colorMode: 'BW',
      sideMode: 'SIMPLEX',
      pricePerPage: 3,
    });

    expect(prisma.pricing.updateMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        active: true,
      },
      data: { active: false },
    });
    expect(prisma.pricing.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shopId: 'shop-1', pricePerPage: 3, active: true }),
    });
  });

  it('returns the active rate for a shop + option combination', async () => {
    const rate = { id: 'rate-1', pricePerPage: 2.5 };
    prisma.pricing.findFirst.mockResolvedValue(rate);

    const result = await service.getActiveRateOrThrow('shop-1', 'A4', 'BW', 'SIMPLEX');

    expect(result).toBe(rate);
    expect(prisma.pricing.findFirst).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        active: true,
      },
    });
  });

  it('throws INVALID_PRINT_OPTION when no rate is configured for that combination', async () => {
    prisma.pricing.findFirst.mockResolvedValue(null);

    await expect(service.getActiveRateOrThrow('shop-1', 'A3', 'COLOR', 'DUPLEX')).rejects.toThrow(
      InvalidPrintOptionException,
    );
  });

  it('deactivates a rate scoped to its own shop (tenant isolation) and retires its tiers', async () => {
    prisma.pricing.findFirst.mockResolvedValue({
      id: 'rate-1',
      paperSize: 'A4',
      colorMode: 'BW',
      sideMode: 'SIMPLEX',
    });

    await service.deactivate('shop-1', 'rate-1');

    expect(prisma.pricing.findFirst).toHaveBeenCalledWith({
      where: { id: 'rate-1', shopId: 'shop-1' },
    });
    expect(prisma.pricing.update).toHaveBeenCalledWith({
      where: { id: 'rate-1' },
      data: { active: false },
    });
    expect(prisma.pricingTier.updateMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-1',
        paperSize: 'A4',
        colorMode: 'BW',
        sideMode: 'SIMPLEX',
        active: true,
      },
      data: { active: false },
    });
  });

  it('throws NOT_FOUND when deactivating a rate that does not belong to the shop', async () => {
    prisma.pricing.findFirst.mockResolvedValue(null);

    await expect(service.deactivate('shop-1', 'someone-elses-rate')).rejects.toThrow(
      AppNotFoundException,
    );
  });

  describe('quantity tiers', () => {
    const combo = { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX' } as const;
    const tiers = [
      { id: 'tier-low', minPages: 1, maxPages: 5, pricePerPage: 2 },
      { id: 'tier-high', minPages: 11, maxPages: null, pricePerPage: 1 },
    ];

    beforeEach(() => {
      prisma.pricing.findFirst.mockResolvedValue({
        id: 'rate-1',
        pricePerPage: 3,
        effectiveFrom: new Date(),
      });
    });

    it.each([
      [1, 2, 'tier-low'],
      [5, 2, 'tier-low'],
      [11, 1, 'tier-high'],
      [500, 1, 'tier-high'],
      [8, 3, null], // gap between tiers -> fixed rate
    ])('%i pages is charged ₹%d/page (tier %s)', async (pages, expected, tierId) => {
      prisma.pricingTier.findMany.mockResolvedValue(tiers);

      const rate = await service.resolveRate('shop-1', combo, pages);

      expect(rate.pricePerPage).toBe(expected);
      expect(rate.tier?.id ?? null).toBe(tierId);
      expect(rate.hasTiers).toBe(true);
    });

    it('queries tiers by the combination only, even when handed a whole line item', async () => {
      await service.resolveRate('shop-1', { ...combo, documentId: 'doc-1', copies: 2 } as never, 5);

      expect(prisma.pricingTier.findMany).toHaveBeenCalledWith({
        where: { shopId: 'shop-1', ...combo, active: true },
        orderBy: { minPages: 'asc' },
      });
    });

    it('uses the fixed rate when the combination has no tiers', async () => {
      const rate = await service.resolveRate('shop-1', combo, 50);

      expect(rate).toEqual(
        expect.objectContaining({ pricePerPage: 3, hasTiers: false, tier: null }),
      );
    });

    it('adds a tier scoped to the shop and combination', async () => {
      await service.addTier('shop-1', { ...combo, minPages: 6, maxPages: null, pricePerPage: 1 });

      expect(prisma.pricingTier.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-1',
          ...combo,
          minPages: 6,
          maxPages: null,
          pricePerPage: 1,
          active: true,
        },
      });
    });

    it('refuses a tier for a combination with no fixed rate', async () => {
      prisma.pricing.findFirst.mockResolvedValue(null);

      await expect(
        service.addTier('shop-1', { ...combo, minPages: 1, maxPages: 5, pricePerPage: 2 }),
      ).rejects.toThrow(InvalidPrintOptionException);
      expect(prisma.pricingTier.create).not.toHaveBeenCalled();
    });

    it('refuses a tier whose range overlaps an existing one', async () => {
      prisma.pricingTier.findMany.mockResolvedValue(tiers);

      await expect(
        service.addTier('shop-1', { ...combo, minPages: 4, maxPages: 8, pricePerPage: 2 }),
      ).rejects.toThrow('This overlaps the 1–5 pages range.');
    });

    it('refuses a range whose "to" is below its "from"', async () => {
      await expect(
        service.addTier('shop-1', { ...combo, minPages: 10, maxPages: 5, pricePerPage: 2 }),
      ).rejects.toThrow(InvalidPrintOptionException);
    });

    it('edits by deactivating the old tier and creating a replacement (its own range is not a clash)', async () => {
      prisma.pricingTier.findFirst.mockResolvedValue({
        id: 'tier-low',
        shopId: 'shop-1',
        ...combo,
        minPages: 1,
        maxPages: 5,
      });
      prisma.pricingTier.findMany.mockResolvedValue(tiers);

      await service.updateTier('shop-1', 'tier-low', {
        minPages: 1,
        maxPages: 10,
        pricePerPage: 1.5,
      });

      expect(prisma.pricingTier.update).toHaveBeenCalledWith({
        where: { id: 'tier-low' },
        data: { active: false },
      });
      expect(prisma.pricingTier.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-1',
          ...combo,
          minPages: 1,
          maxPages: 10,
          pricePerPage: 1.5,
          active: true,
        },
      });
    });

    it('throws NOT_FOUND when editing or removing a tier of another shop', async () => {
      prisma.pricingTier.findFirst.mockResolvedValue(null);
      prisma.pricingTier.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateTier('shop-1', 'other', { minPages: 1, maxPages: 5, pricePerPage: 2 }),
      ).rejects.toThrow(AppNotFoundException);
      await expect(service.deactivateTier('shop-1', 'other')).rejects.toThrow(AppNotFoundException);
    });

    it('findOverlappingTier treats a null upper bound as open-ended', () => {
      expect(findOverlappingTier({ minPages: 100, maxPages: 200 }, tiers)?.id).toBe('tier-high');
      expect(findOverlappingTier({ minPages: 6, maxPages: 10 }, tiers)).toBeUndefined();
    });
  });
});
