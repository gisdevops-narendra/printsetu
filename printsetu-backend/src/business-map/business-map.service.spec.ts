import { BusinessMapService, subscriptionAlert } from './business-map.service';

const NOW = new Date('2026-09-25T06:30:00Z');
const DAY = 86_400_000;

function shop(over: Record<string, unknown> = {}) {
  return {
    id: 'shop-a',
    name: 'A Prints',
    shopCode: 'SHOP-A',
    ownerName: 'Asha',
    mobile: '9000000001',
    address: 'Main Road',
    city: 'Surat',
    district: 'Surat',
    latitude: 21.17,
    longitude: 72.83,
    status: 'ACTIVE',
    createdAt: new Date('2026-07-10T05:00:00Z'),
    openingHours: null,
    printSettings: {
      acceptingOrders: true,
      autoSchedule: false,
      scheduleOverride: null,
      scheduleOverrideUntil: null,
      pricingEnabled: true,
    },
    subscription: null,
    ...over,
  };
}

describe('BusinessMapService', () => {
  let prisma: any;
  let service: BusinessMapService;

  beforeEach(() => {
    prisma = {
      shop: {
        findMany: jest.fn().mockResolvedValue([
          shop(),
          shop({
            id: 'shop-b',
            name: 'B Copy',
            city: 'surat ',
            district: null,
            latitude: 21.19,
            longitude: 72.85,
            createdAt: new Date('2026-09-02T05:00:00Z'),
            printSettings: {
              ...shop().printSettings,
              acceptingOrders: false,
              pricingEnabled: false,
            },
            subscription: {
              status: 'ACTIVE',
              currentPeriodEnd: new Date(NOW.getTime() + 3 * DAY),
              plan: { name: 'Monthly' },
            },
          }),
          shop({
            id: 'shop-c',
            name: 'C Xerox',
            status: 'INACTIVE',
            latitude: null,
            longitude: null,
            city: 'Rajkot',
          }),
        ]),
      },
      printJob: {
        groupBy: jest.fn(({ by }: { by: string[] }) =>
          by.length === 2
            ? Promise.resolve([
                { shopId: 'shop-a', status: 'PRINTED', _count: { _all: 6 }, _sum: { amount: 120 } },
                {
                  shopId: 'shop-a',
                  status: 'PRINT_FAILED',
                  _count: { _all: 1 },
                  _sum: { amount: 0 },
                },
                { shopId: 'shop-a', status: 'CANCELLED', _count: { _all: 5 }, _sum: { amount: 0 } },
                { shopId: 'shop-b', status: 'PRINTED', _count: { _all: 1 }, _sum: { amount: 0 } },
                {
                  shopId: 'shop-b',
                  status: 'PRINT_FAILED',
                  _count: { _all: 3 },
                  _sum: { amount: 0 },
                },
              ])
            : Promise.resolve([
                { shopId: 'shop-a', _max: { createdAt: new Date(NOW.getTime() - DAY) } },
                { shopId: 'shop-b', _max: { createdAt: new Date(NOW.getTime() - 10 * DAY) } },
              ]),
        ),
      },
      user: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { shopId: 'shop-b', _max: { lastLoginAt: new Date(NOW.getTime() - 2 * DAY) } },
          ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { shopId: 'shop-a', pages: 40 },
        { shopId: 'shop-b', pages: 3 },
      ]),
    };
    service = new BusinessMapService(prisma, { get: jest.fn(() => 'Asia/Kolkata') } as any);
  });

  it('returns placed shops as GeoJSON with status, figures and health flags worked out', async () => {
    const result = await service.shops({ from: '2026-09-01', to: '2026-09-25' }, NOW);

    expect(result.type).toBe('FeatureCollection');
    expect(result.features.map((f) => f.id)).toEqual(['shop-a', 'shop-b']);
    const [a, b] = result.features.map((f) => f.properties);
    expect(result.features[0].geometry.coordinates).toEqual([72.83, 21.17]);
    // Cancelled orders don't count; revenue and pages only from printed orders.
    expect(a).toMatchObject({
      markerStatus: 'ONLINE',
      jobs: 7,
      printed: 6,
      failed: 1,
      pages: 40,
      revenue: 120,
    });
    expect(a.printerProblem).toBe(false);
    expect(a.inactive).toBe(false);
    // Offline switch, pricing off (no revenue), 3 of 4 failed, last order 10 days ago, plan ends in 3 days.
    expect(b).toMatchObject({
      markerStatus: 'OFFLINE',
      jobs: 4,
      revenue: null,
      printerProblem: true,
      inactive: true,
    });
    expect(b.subscription).toMatchObject({ plan: 'Monthly', alert: 'EXPIRING' });
    expect(b.lastActiveAt).toBe(new Date(NOW.getTime() - 2 * DAY).toISOString());
    expect(result.meta.unplaced).toEqual([
      { id: 'shop-c', name: 'C Xerox', city: 'Rajkot', markerStatus: 'DEACTIVATED' },
    ]);
    expect(result.meta.counts).toMatchObject({
      online: 1,
      offline: 1,
      inactive: 1,
      expiring: 1,
      printerProblems: 1,
    });
  });

  it('sizes bubbles on the server, using print jobs for shops without pricing', async () => {
    const result = await service.shops({ from: '2026-09-01', to: '2026-09-25' }, NOW);
    const [a, b] = result.features.map((f) => f.properties);

    expect(a.size).toEqual({ jobs: 1, revenue: 1 });
    expect(b.size.jobs).toBeCloseTo(Math.sqrt(4 / 7), 3);
    expect(b.size.revenue).toBe(b.size.jobs);
    expect(a.heat).toBe(1);
    expect(b.heat).toBeCloseTo(4 / 7, 3);
  });

  it('uses the chosen "no orders in N days" window', async () => {
    const result = await service.shops(
      { from: '2026-09-01', to: '2026-09-25', inactiveDays: 30 },
      NOW,
    );
    expect(result.features.map((f) => f.properties.inactive)).toEqual([false, false]);
    expect(result.meta.thresholds.inactiveDays).toBe(30);
  });

  it('counts growth month by month from the first registration', async () => {
    const { meta } = await service.shops({ from: '2026-09-01', to: '2026-09-25' }, NOW);
    expect(meta.growth).toEqual([
      { month: '2026-07', newShops: 2, totalShops: 2, placedShops: 1 },
      { month: '2026-08', newShops: 0, totalShops: 2, placedShops: 1 },
      { month: '2026-09', newShops: 1, totalShops: 3, placedShops: 2 },
    ]);
  });

  it('adds up areas by city (ignoring case and spaces), centred on their placed shops', async () => {
    const result = await service.areas(
      { from: '2026-09-01', to: '2026-09-25', groupBy: 'city' },
      NOW,
    );

    const surat = result.meta.areas.find((a) => a.key === 'city:surat')!;
    expect(surat).toMatchObject({
      shops: 2,
      activeShops: 2,
      jobs: 11,
      pages: 43,
      revenue: 120,
      placed: true,
    });
    const surateFeature = result.features.find((f) => f.id === 'city:surat')!;
    expect(surateFeature.geometry.coordinates).toEqual([72.84, 21.18]);
    expect(result.meta.areas.find((a) => a.key === 'city:rajkot')).toMatchObject({
      placed: false,
      activeShops: 0,
    });
  });

  it('groups by district, keeping shops without one together', async () => {
    const result = await service.areas(
      { from: '2026-09-01', to: '2026-09-25', groupBy: 'district' },
      NOW,
    );
    expect(result.meta.areas.map((a) => [a.name, a.shops])).toEqual([
      ['Surat', 2],
      ['', 1],
    ]);
  });
});

describe('subscriptionAlert', () => {
  it.each([
    ['ACTIVE', 3, 'EXPIRING'],
    ['TRIAL', 7, 'EXPIRING'],
    ['ACTIVE', 8, null],
    ['ACTIVE', -1, 'EXPIRED'],
    ['EXPIRED', 30, 'EXPIRED'],
    ['SUSPENDED', 30, 'EXPIRED'],
    ['PAST_DUE', 30, 'EXPIRED'],
    ['PAYMENT_PENDING', 3, null],
  ])('%s ending in %i days -> %s', (status, days, expected) => {
    expect(subscriptionAlert(status as any, new Date(NOW.getTime() + days * DAY), NOW)).toBe(
      expected,
    );
  });
});
