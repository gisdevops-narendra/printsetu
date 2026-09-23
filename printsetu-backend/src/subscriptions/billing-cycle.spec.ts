import { addCycle, cycleAdjective, cycleUnit } from './subscription.constants';
import { monthlyEquivalent, priceFor } from './invoices.service';
import { PlansService } from './plans.service';
import { BillingConflictException } from './subscription.exceptions';
import { UpsertPlanDto } from './dto/subscription.dto';

describe('Day-wise (DAILY) billing cycle', () => {
  const plan = { dailyPrice: '20.00', monthlyPrice: '499.00', yearlyPrice: '4990.00' } as any;

  it('addCycle() moves a daily period forward by exactly one day', () => {
    const start = new Date('2026-01-31T10:00:00Z');
    expect(addCycle(start, 'DAILY').toISOString()).toBe('2026-02-01T10:00:00.000Z');
    expect(addCycle(start, 'MONTHLY').toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('priceFor() charges the daily price on the daily cycle', () => {
    expect(priceFor(plan, 'DAILY')).toBe(20);
    expect(priceFor(plan, 'MONTHLY')).toBe(499);
    expect(priceFor(plan, 'YEARLY')).toBe(4990);
  });

  it('monthlyEquivalent() counts a daily plan as 30 days', () => {
    expect(monthlyEquivalent(plan, 'DAILY')).toBe(600);
    expect(monthlyEquivalent(plan, 'YEARLY')).toBeCloseTo(415.83, 2);
  });

  it('labels the cycle for invoices and messages', () => {
    expect(cycleUnit('DAILY')).toBe('day');
    expect(cycleAdjective('DAILY')).toBe('daily');
    expect(cycleAdjective('YEARLY')).toBe('yearly');
  });

  describe('plan validation', () => {
    const prisma = { subscriptionPlan: { create: jest.fn().mockImplementation(({ data }) => data) } };
    const service = new PlansService(prisma as any);
    const dto = (over: Partial<UpsertPlanDto>): UpsertPlanDto => ({
      name: 'Basic',
      dailyPrice: 20,
      monthlyPrice: 499,
      yearlyPrice: 4990,
      ...over,
    });

    it('stores the daily price with the plan', async () => {
      const created = await service.create(dto({}));
      expect(created).toEqual(expect.objectContaining({ dailyPrice: 20, monthlyPrice: 499 }));
    });

    it('rejects a monthly price above 30 days of the daily price', async () => {
      await expect(service.create(dto({ dailyPrice: 10 }))).rejects.toThrow(BillingConflictException);
    });
  });
});
