import { Test } from '@nestjs/testing';
import { SystemSettingsService } from './system-settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SystemSettingsService (SRS §6 "System settings" / §16 system_settings)', () => {
  let service: SystemSettingsService;
  let prisma: {
    systemSetting: { findMany: jest.Mock; findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ where, update, create }) =>
          Promise.resolve({
            key: where.key,
            valueJson: update.valueJson ?? create.valueJson,
            updatedAt: new Date(),
          }),
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [SystemSettingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(SystemSettingsService);
  });

  it('list() returns all rows ordered by key', async () => {
    await service.list();
    expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
  });

  it('get() returns null when no row exists for the key', async () => {
    await expect(service.get('MISSING_KEY')).resolves.toBeNull();
  });

  it('get() returns the stored JSON value when present', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'K', valueJson: { a: 1 } });
    await expect(service.get('K')).resolves.toEqual({ a: 1 });
  });

  it('getOrDefault() falls back when nothing is stored yet', async () => {
    await expect(service.getOrDefault('DEFAULT_RETENTION_MINUTES', 30)).resolves.toBe(30);
  });

  it('getOrDefault() prefers the stored admin override over the fallback', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({
      key: 'DEFAULT_RETENTION_MINUTES',
      valueJson: 90,
    });
    await expect(service.getOrDefault('DEFAULT_RETENTION_MINUTES', 30)).resolves.toBe(90);
  });

  it('getOrDefault() treats a stored 0 as a real override, not "unset" (nullish-coalescing, not ||)', async () => {
    prisma.systemSetting.findUnique.mockResolvedValue({ key: 'K', valueJson: 0 });
    await expect(service.getOrDefault('K', 30)).resolves.toBe(0);
  });

  it('set() upserts the key with the new value', async () => {
    const result = await service.set('DEFAULT_RETENTION_MINUTES', 45);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'DEFAULT_RETENTION_MINUTES' },
      update: { valueJson: 45 },
      create: { key: 'DEFAULT_RETENTION_MINUTES', valueJson: 45 },
    });
    expect(result.valueJson).toBe(45);
  });
});
