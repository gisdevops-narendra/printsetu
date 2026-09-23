import { SubscriptionAccessService } from './subscription-access.service';

describe('SubscriptionAccessService.customerAvailability', () => {
  const build = (opts: {
    sub?: unknown;
    settings?: Partial<{ acceptingOrders: boolean; autoSchedule: boolean; scheduleOverride: boolean | null; scheduleOverrideUntil: Date | null }> | null;
    openingHours?: unknown;
  }) => {
    const settings = opts.settings
      ? { autoSchedule: false, scheduleOverride: null, scheduleOverrideUntil: null, acceptingOrders: true, ...opts.settings }
      : null;
    const prisma = {
      shopSubscription: { findUnique: jest.fn().mockResolvedValue(opts.sub ?? null) },
      printSettings: { findUnique: jest.fn().mockResolvedValue(settings) },
      shop: { findUnique: jest.fn().mockResolvedValue({ openingHours: opts.openingHours ?? null }) },
      printJob: { count: jest.fn().mockResolvedValue(0) },
      printer: { count: jest.fn().mockResolvedValue(0) },
    };
    const config = { get: () => 'UTC' };
    return { service: new SubscriptionAccessService(prisma as never, config as never), prisma };
  };

  const everyDay = (from: string, to: string) =>
    Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: true, from, to }]));

  describe('with the daily schedule on', () => {
    afterEach(() => jest.useRealTimers());

    it('is available inside opening hours even if the manual switch was left off', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T10:00:00Z'));
      const { service } = build({ settings: { autoSchedule: true, acceptingOrders: false }, openingHours: everyDay('09:00', '18:00') });
      await expect(service.customerAvailability('shop-1')).resolves.toEqual({ available: true, message: null });
    });

    it('is closed outside opening hours, with a "closed right now" message', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T20:00:00Z'));
      const { service } = build({ settings: { autoSchedule: true }, openingHours: everyDay('09:00', '18:00') });
      const result = await service.customerAvailability('shop-1');
      expect(result.available).toBe(false);
      expect(result.message).toMatch(/closed right now/i);
    });

    it('honours a manual break (override) during opening hours', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-24T13:00:00Z'));
      const { service } = build({
        settings: { autoSchedule: true, scheduleOverride: false, scheduleOverrideUntil: new Date('2026-09-24T18:00:00Z') },
        openingHours: everyDay('09:00', '18:00'),
      });
      const result = await service.customerAvailability('shop-1');
      expect(result.available).toBe(false);
      expect(result.message).toMatch(/paused new orders/i);
    });
  });

  it('is available for a shop with no plan that is accepting orders', async () => {
    const { service } = build({ settings: { acceptingOrders: true } });
    await expect(service.customerAvailability('shop-1')).resolves.toEqual({ available: true, message: null });
  });

  it('is available when the shop has no settings row yet (older shops default to online)', async () => {
    const { service } = build({ settings: null });
    await expect(service.customerAvailability('shop-1')).resolves.toEqual({ available: true, message: null });
  });

  it("is unavailable when the shopkeeper has switched the shop offline, even with a healthy plan", async () => {
    const { service } = build({ settings: { acceptingOrders: false } });
    const result = await service.customerAvailability('shop-1');
    expect(result.available).toBe(false);
    expect(result.message).toMatch(/paused new orders/i);
  });

  it('rejects an order with ShopUnavailableException while offline', async () => {
    const { service } = build({ settings: { acceptingOrders: false } });
    await expect(service.assertCustomerCanOrder('shop-1')).rejects.toBeDefined();
  });

  it('reports the subscription reason (not the offline switch) when the plan is suspended', async () => {
    const { service, prisma } = build({
      sub: { status: 'SUSPENDED', graceEndsAt: null, trialEndsAt: null, currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, plan: {} },
      settings: { acceptingOrders: false },
    });
    const result = await service.customerAvailability('shop-1');
    expect(result.available).toBe(false);
    expect(result.message).toMatch(/temporarily unavailable/i);
    expect(prisma.printSettings.findUnique).not.toHaveBeenCalled();
  });
});
