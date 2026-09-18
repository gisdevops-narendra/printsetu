import { BillingAutomationService } from './billing-automation.service';
import { PaymentGatewayRegistry } from './payment-gateway';
import { DEFAULT_BILLING_SETTINGS } from './subscription.constants';

const DAY = 86_400_000;

/**
 * Exercises the retry / grace / past-due path of the renewal automation with a
 * fake payment gateway (no real provider is connected), against a tiny
 * in-memory stand-in for the two tables involved.
 */
describe('BillingAutomationService — automatic payment retries', () => {
  const settings = { ...DEFAULT_BILLING_SETTINGS, graceDays: 5, retryAttempts: 2, retryIntervalDays: 1, renewalReminderDays: 0 };
  const plan = { id: 'plan-1', name: 'Standard', currency: 'INR', monthlyPrice: 599, yearlyPrice: 5990 };
  const now = new Date('2026-10-01T10:00:00Z');

  let sub: any;
  let invoice: any;
  let events: string[];
  let charge: jest.Mock;
  let service: BillingAutomationService;

  beforeEach(() => {
    events = [];
    sub = {
      shopId: 'shop-1',
      planId: plan.id,
      plan,
      cycle: 'MONTHLY',
      status: 'ACTIVE',
      currentPeriodStart: new Date(now.getTime() - 30 * DAY),
      currentPeriodEnd: new Date(now.getTime() - 1000),
      trialEndsAt: null,
      graceEndsAt: null,
      pastDueSince: null,
      autoRenew: true,
      gateway: 'FAKEPAY',
      cancelAtPeriodEnd: false,
      pendingPlanId: null,
      pendingCycle: null,
      automationPaused: false,
      pausedUntil: null,
      notificationChannels: null,
      remindersSent: [],
    };
    invoice = null;
    charge = jest.fn();

    const prisma: any = {
      shopSubscription: {
        findMany: jest.fn(async () => [{ shopId: 'shop-1' }]),
        findUnique: jest.fn(async () => ({ ...sub })),
        update: jest.fn(async ({ data }: any) => {
          const { plan: _plan, ...rest } = data;
          Object.assign(sub, rest);
          return sub;
        }),
      },
      invoice: {
        findFirst: jest.fn(async ({ where }: any) => (invoice && invoice.status === 'OPEN' && invoice.nextRetryAt && invoice.nextRetryAt <= where.nextRetryAt.lte ? invoice : null)),
        update: jest.fn(async ({ data }: any) => Object.assign(invoice, data)),
        updateMany: jest.fn(async ({ data }: any) => {
          if (invoice && invoice.status === 'OPEN') Object.assign(invoice, data);
          return { count: 1 };
        }),
      },
      subscriptionPlan: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const invoices: any = {
      create: jest.fn(async (input: any) => {
        invoice = { id: 'inv-1', number: 'INV-1', status: 'OPEN', attemptCount: 0, nextRetryAt: null, periodStart: input.periodStart, periodEnd: input.periodEnd, cycle: input.cycle, amount: input.amount };
        return invoice;
      }),
      markPaid: jest.fn(async () => Object.assign(invoice, { status: 'PAID' })),
    };
    const subs: any = { record: jest.fn(async (_shop: string, _actor: unknown, e: any) => events.push(e.type)) };
    const notifier: any = { notify: jest.fn() };
    const gateways = new PaymentGatewayRegistry();
    gateways.register({ name: 'FAKEPAY', charge });
    service = new BillingAutomationService(prisma, subs, invoices, notifier, { get: async () => settings } as any, gateways);
  });

  it('a declined renewal opens a grace period and schedules a retry', async () => {
    charge.mockResolvedValue({ ok: false, error: 'Card declined' });

    await service.runAll(now);

    expect(sub.status).toBe('PAYMENT_PENDING');
    expect(sub.graceEndsAt.getTime()).toBe(now.getTime() + 5 * DAY);
    expect(invoice.attemptCount).toBe(1);
    expect(invoice.lastFailure).toBe('Card declined');
    expect(invoice.nextRetryAt.getTime()).toBe(now.getTime() + DAY);
    expect(events).toContain('PAYMENT_FAILED');
  });

  it('retries after the interval and reactivates the shop when a retry succeeds', async () => {
    charge.mockResolvedValueOnce({ ok: false, error: 'Card declined' }).mockResolvedValueOnce({ ok: true, reference: 'pay_123' });
    await service.runAll(now);

    await service.runAll(new Date(now.getTime() + DAY + 1000));

    expect(charge).toHaveBeenCalledTimes(2);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.graceEndsAt).toBeNull();
    expect(events).toContain('PAYMENT_RECEIVED');
  });

  it('does not retry before the interval has passed', async () => {
    charge.mockResolvedValue({ ok: false });
    await service.runAll(now);

    await service.runAll(new Date(now.getTime() + 3600_000));

    expect(charge).toHaveBeenCalledTimes(1);
  });

  it('stops after the configured number of retries, then goes Past Due when grace ends', async () => {
    charge.mockResolvedValue({ ok: false, error: 'Card declined' });
    await service.runAll(now); // attempt 1
    await service.runAll(new Date(now.getTime() + 1 * DAY + 1000)); // retry 1
    await service.runAll(new Date(now.getTime() + 2 * DAY + 2000)); // retry 2
    await service.runAll(new Date(now.getTime() + 3 * DAY + 3000)); // no more retries

    expect(charge).toHaveBeenCalledTimes(3);
    expect(invoice.nextRetryAt).toBeNull();
    expect(sub.status).toBe('PAYMENT_PENDING');

    await service.runAll(new Date(now.getTime() + 6 * DAY));

    expect(sub.status).toBe('PAST_DUE');
    expect(invoice.status).toBe('FAILED');
  });

  it('leaves a shop with a manual override alone', async () => {
    sub.automationPaused = true;
    sub.pausedUntil = null;

    await service.runAll(now);

    expect(sub.status).toBe('ACTIVE');
    expect(charge).not.toHaveBeenCalled();
  });
});
