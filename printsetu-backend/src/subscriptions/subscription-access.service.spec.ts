import { SubscriptionAccessService } from './subscription-access.service';

describe('SubscriptionAccessService.customerAvailability', () => {
  const build = (opts: { sub?: unknown; settings?: { acceptingOrders: boolean } | null }) => {
    const prisma = {
      shopSubscription: { findUnique: jest.fn().mockResolvedValue(opts.sub ?? null) },
      printSettings: { findUnique: jest.fn().mockResolvedValue(opts.settings ?? null) },
      printJob: { count: jest.fn().mockResolvedValue(0) },
      printer: { count: jest.fn().mockResolvedValue(0) },
    };
    return { service: new SubscriptionAccessService(prisma as never), prisma };
  };

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
