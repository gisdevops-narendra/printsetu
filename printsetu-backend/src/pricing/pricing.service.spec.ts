import { Test } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidPrintOptionException } from '../common/exceptions/app.exceptions';

describe('PricingService (SRS §10 versioned pricing)', () => {
  let service: PricingService;
  let prisma: {
    pricing: {
      updateMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      pricing: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new-rate', ...data })),
        findFirst: jest.fn(),
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
      where: { shopId: 'shop-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', active: true },
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
      where: { shopId: 'shop-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', active: true },
    });
  });

  it('throws INVALID_PRINT_OPTION when no rate is configured for that combination', async () => {
    prisma.pricing.findFirst.mockResolvedValue(null);

    await expect(service.getActiveRateOrThrow('shop-1', 'A3', 'COLOR', 'DUPLEX')).rejects.toThrow(
      InvalidPrintOptionException,
    );
  });
});
