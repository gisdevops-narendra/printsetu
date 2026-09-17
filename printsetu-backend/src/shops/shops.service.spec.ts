import { Test } from '@nestjs/testing';
import { ShopsService } from './shops.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppNotFoundException } from '../common/exceptions/app.exceptions';

describe('ShopsService.getSettings/updateSettings (SRS §6/§9 per-shop retention & upload-size settings)', () => {
  let service: ShopsService;
  let prisma: {
    shop: { findUnique: jest.Mock };
    printSettings: { upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      shop: { findUnique: jest.fn().mockResolvedValue({ id: 'shop-1' }) },
      printSettings: {
        upsert: jest.fn().mockImplementation(({ where, update, create }) =>
          Promise.resolve({
            id: 'settings-1',
            shopId: where.shopId,
            retentionMinutes: 30,
            maxFileSizeBytes: 26214400,
            ...update,
            ...create,
          }),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ShopsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ShopsService);
  });

  it('getSettings() 404s when the shop does not exist', async () => {
    prisma.shop.findUnique.mockResolvedValue(null);
    await expect(service.getSettings('missing')).rejects.toThrow(AppNotFoundException);
    expect(prisma.printSettings.upsert).not.toHaveBeenCalled();
  });

  it('getSettings() returns (or lazily creates) the settings row for an existing shop', async () => {
    const result = await service.getSettings('shop-1');
    expect(prisma.printSettings.upsert).toHaveBeenCalledWith({
      where: { shopId: 'shop-1' },
      update: {},
      create: { shopId: 'shop-1' },
    });
    expect(result.shopId).toBe('shop-1');
  });

  it('updateSettings() 404s when the shop does not exist', async () => {
    prisma.shop.findUnique.mockResolvedValue(null);
    await expect(service.updateSettings('missing', { retentionMinutes: 45 })).rejects.toThrow(
      AppNotFoundException,
    );
    expect(prisma.printSettings.upsert).not.toHaveBeenCalled();
  });

  it('updateSettings() upserts only the fields provided', async () => {
    const result = await service.updateSettings('shop-1', { retentionMinutes: 45 });
    expect(prisma.printSettings.upsert).toHaveBeenCalledWith({
      where: { shopId: 'shop-1' },
      update: { retentionMinutes: 45 },
      create: { shopId: 'shop-1', retentionMinutes: 45 },
    });
    expect(result.retentionMinutes).toBe(45);
  });

  it('updateSettings() can set retentionMinutes and maxFileSizeBytes together', async () => {
    await service.updateSettings('shop-1', { retentionMinutes: 20, maxFileSizeBytes: 52428800 });
    expect(prisma.printSettings.upsert).toHaveBeenCalledWith({
      where: { shopId: 'shop-1' },
      update: { retentionMinutes: 20, maxFileSizeBytes: 52428800 },
      create: { shopId: 'shop-1', retentionMinutes: 20, maxFileSizeBytes: 52428800 },
    });
  });
});
