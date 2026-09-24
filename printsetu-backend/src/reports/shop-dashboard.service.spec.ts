import { ShopDashboardService } from './shop-dashboard.service';

describe('ShopDashboardService (admin dashboard, shop by shop)', () => {
  const NOW = new Date('2026-09-24T06:30:00Z'); // 12:00 IST
  let service: ShopDashboardService;
  let prisma: {
    shop: { findMany: jest.Mock };
    printJob: { groupBy: jest.Mock };
    $queryRaw: jest.Mock;
  };

  const shop = (overrides: Record<string, unknown> = {}) => ({
    id: 'shop-a',
    name: 'Alpha Prints',
    shopCode: 'SHOP-A',
    city: 'Pune',
    status: 'ACTIVE',
    openingHours: null,
    printSettings: {
      acceptingOrders: true,
      autoSchedule: false,
      scheduleOverride: null,
      scheduleOverrideUntil: null,
    },
    printers: [{ status: 'ONLINE' }],
    subscription: {
      status: 'ACTIVE',
      cycle: 'MONTHLY',
      currentPeriodEnd: new Date('2026-09-27T00:00:00Z'),
      plan: { name: 'Standard' },
    },
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      shop: {
        findMany: jest.fn().mockResolvedValue([
          shop(),
          shop({
            id: 'shop-b',
            name: 'Beta Copy',
            printSettings: {
              acceptingOrders: false,
              autoSchedule: false,
              scheduleOverride: null,
              scheduleOverrideUntil: null,
            },
            printers: [{ status: 'OFFLINE' }],
            subscription: {
              status: 'ACTIVE',
              cycle: 'YEARLY',
              currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
              plan: { name: 'Basic' },
            },
          }),
          shop({
            id: 'shop-c',
            name: 'Gamma',
            status: 'SUSPENDED',
            printers: [],
            subscription: null,
          }),
        ]),
      },
      printJob: {
        groupBy: jest.fn().mockResolvedValue([
          { shopId: 'shop-a', status: 'PRINTED', _count: { _all: 3 }, _sum: { amount: 30 } },
          { shopId: 'shop-a', status: 'DELETED', _count: { _all: 1 }, _sum: { amount: 12.5 } },
          { shopId: 'shop-a', status: 'PRINT_ELIGIBLE', _count: { _all: 2 }, _sum: { amount: 99 } },
          { shopId: 'shop-a', status: 'PRINT_FAILED', _count: { _all: 1 }, _sum: { amount: 5 } },
          { shopId: 'shop-b', status: 'PRINTING', _count: { _all: 1 }, _sum: { amount: 8 } },
        ]),
      },
      $queryRaw: jest
        .fn()
        // pages per shop + color mode (printed jobs only)
        .mockResolvedValueOnce([
          { shopId: 'shop-a', colorMode: 'BW', pages: 40 },
          { shopId: 'shop-a', colorMode: 'COLOR', pages: 6 },
        ])
        // per-day jobs + revenue
        .mockResolvedValueOnce([{ day: '2026-09-02', jobs: 4, revenue: 42.5 }]),
    };
    const config = { get: jest.fn().mockReturnValue('Asia/Kolkata') };
    service = new ShopDashboardService(prisma as any, config as any);
  });

  it('counts jobs per shop, grouping statuses into pending / printing / printed / failed', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);
    const a = result.shops.find((s) => s.shopId === 'shop-a')!;

    expect(a.jobs).toBe(7);
    expect(a.statusCounts).toEqual({
      pending: 2,
      printing: 0,
      printed: 4,
      failed: 1,
      cancelled: 0,
    });
    expect(result.totals.statusCounts).toEqual({
      pending: 2,
      printing: 1,
      printed: 4,
      failed: 1,
      cancelled: 0,
    });
  });

  it('only counts revenue from printed jobs', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);

    expect(result.shops.find((s) => s.shopId === 'shop-a')!.revenue).toBe(42.5);
    expect(result.shops.find((s) => s.shopId === 'shop-b')!.revenue).toBe(0);
    expect(result.totals.revenue).toBe(42.5);
  });

  it('splits printed pages into B/W and color', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);
    const a = result.shops.find((s) => s.shopId === 'shop-a')!;

    expect([a.pagesBw, a.pagesColor]).toEqual([40, 6]);
    expect([result.totals.pagesBw, result.totals.pagesColor]).toEqual([40, 6]);
  });

  it('fills every day of the range, including days with no jobs', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);

    expect(result.daily).toEqual([
      { date: '2026-09-01', jobs: 0, revenue: 0 },
      { date: '2026-09-02', jobs: 4, revenue: 42.5 },
      { date: '2026-09-03', jobs: 0, revenue: 0 },
    ]);
  });

  it('filters jobs by the local-day window', async () => {
    await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);

    expect(prisma.printJob.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-08-31T18:30:00Z'),
            lt: new Date('2026-09-03T18:30:00Z'),
          },
        },
      }),
    );
  });

  it('reports online status from the shop switch, and print agent status separately', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);
    const byId = Object.fromEntries(result.shops.map((s) => [s.shopId, s]));

    expect([byId['shop-a'].online, byId['shop-a'].agentStatus]).toEqual([true, 'ONLINE']);
    expect([byId['shop-b'].online, byId['shop-b'].agentStatus]).toEqual([false, 'OFFLINE']);
    // Suspended shops are never online, whatever the switch says.
    expect([byId['shop-c'].online, byId['shop-c'].agentStatus]).toEqual([false, 'NONE']);
  });

  it('flags ACTIVE/TRIAL subscriptions ending within 7 days as expiring soon', async () => {
    const result = await service.shopSummary('2026-09-01', '2026-09-03', undefined, NOW);
    const byId = Object.fromEntries(result.shops.map((s) => [s.shopId, s]));

    expect(byId['shop-a'].subscription).toEqual(
      expect.objectContaining({
        plan: 'Standard',
        expiringSoon: true,
        currentPeriodEnd: '2026-09-27T00:00:00.000Z',
      }),
    );
    expect(byId['shop-b'].subscription!.expiringSoon).toBe(false);
    expect(byId['shop-c'].subscription).toBeNull();
  });

  describe('one shop', () => {
    it('narrows every query to the shop and still lists every shop for the picker', async () => {
      prisma.shop.findMany
        .mockReset()
        .mockResolvedValueOnce([shop()])
        .mockResolvedValueOnce([
          { id: 'shop-a', name: 'Alpha Prints', city: 'Pune' },
          { id: 'shop-b', name: 'Beta Copy', city: 'Pune' },
        ]);
      prisma.printJob.groupBy.mockResolvedValue([
        { shopId: 'shop-a', status: 'PRINTED', _count: { _all: 3 }, _sum: { amount: 30 } },
      ]);

      const result = await service.shopSummary('2026-09-01', '2026-09-03', 'shop-a', NOW);

      expect(prisma.shop.findMany.mock.calls[0][0].where).toEqual({ id: 'shop-a' });
      expect(prisma.printJob.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ shopId: 'shop-a' }) }),
      );
      // Both raw queries carry the shop id as a bound parameter.
      for (const call of prisma.$queryRaw.mock.calls) {
        expect(
          call.slice(1).flatMap((v: unknown) => (v as { values?: unknown[] })?.values ?? [v]),
        ).toContain('shop-a');
      }
      expect(result.shopId).toBe('shop-a');
      expect(result.shops.map((s) => s.shopId)).toEqual(['shop-a']);
      expect(result.shopOptions.map((s) => s.shopId)).toEqual(['shop-a', 'shop-b']);
      expect(result.totals.jobs).toBe(3);
    });

    it('404s for an unknown shop', async () => {
      prisma.shop.findMany.mockReset().mockResolvedValue([]);

      await expect(service.shopSummary('2026-09-01', '2026-09-03', 'nope', NOW)).rejects.toThrow(
        'Shop not found.',
      );
    });
  });
});
