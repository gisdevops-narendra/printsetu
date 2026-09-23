import { BillingCycle, SubscriptionStatus } from '@prisma/client';

export const BILLING_SETTINGS_KEY = 'BILLING_SETTINGS';

export type BillingChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
export const BILLING_CHANNELS: BillingChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP'];

export type UpgradeTiming = 'IMMEDIATE_PRORATED' | 'NEXT_CYCLE';
export type DowngradeTiming = 'END_OF_CYCLE' | 'IMMEDIATE';

/** Platform-wide billing rules, editable by an admin at runtime. */
export interface BillingSettings {
  /** Days a shop keeps full access after a renewal payment is missed. */
  graceDays: number;
  /** Days in Past Due (read-only) before the shop is suspended. */
  suspendAfterPastDueDays: number;
  /** Automatic payment retries (gateway shops only) before the shop is marked Past Due. */
  retryAttempts: number;
  retryIntervalDays: number;
  /** Send a "renewal coming up" reminder this many days before the renewal date. */
  renewalReminderDays: number;
  defaultChannels: BillingChannel[];
  /** Upgrade: charge the prorated difference now, or start the new plan at the next renewal. */
  upgradeTiming: UpgradeTiming;
  /** Downgrade: wait for the end of the paid cycle, or switch right away. */
  downgradeTiming: DowngradeTiming;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  graceDays: 5,
  suspendAfterPastDueDays: 7,
  retryAttempts: 3,
  retryIntervalDays: 1,
  renewalReminderDays: 3,
  defaultChannels: ['IN_APP', 'EMAIL'],
  upgradeTiming: 'IMMEDIATE_PRORATED',
  downgradeTiming: 'END_OF_CYCLE',
};

/**
 * What a shop may do in each subscription state.
 *  FULL       everything, including accepting new print requests
 *  READ_ONLY  can look at old orders, cannot accept new ones
 *  SUSPENDED  portal locked apart from the billing section
 */
export type AccessLevel = 'FULL' | 'READ_ONLY' | 'SUSPENDED';

export const ACCESS_BY_STATUS: Record<SubscriptionStatus, AccessLevel> = {
  TRIAL: 'FULL',
  ACTIVE: 'FULL',
  PAYMENT_PENDING: 'FULL',
  PAST_DUE: 'READ_ONLY',
  EXPIRED: 'READ_ONLY',
  CANCELLED: 'READ_ONLY',
  SUSPENDED: 'SUSPENDED',
};

const DAY_MS = 86_400_000;
export const daysToMs = (days: number) => days * DAY_MS;
export const addDays = (date: Date, days: number) => new Date(date.getTime() + daysToMs(days));

/** Days in a billing month, for comparing a daily price with monthly/yearly ones. */
export const DAYS_PER_MONTH = 30;

/** "day" / "month" / "year", for invoice descriptions and messages. */
export const cycleUnit = (cycle: BillingCycle) =>
  cycle === 'DAILY' ? 'day' : cycle === 'YEARLY' ? 'year' : 'month';

/** "daily" / "monthly" / "yearly". */
export const cycleAdjective = (cycle: BillingCycle) =>
  cycle === 'DAILY' ? 'daily' : cycle === 'YEARLY' ? 'yearly' : 'monthly';

/** Adds one billing cycle: a day, or whole months clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addCycle(date: Date, cycle: BillingCycle): Date {
  if (cycle === 'DAILY') return addDays(date, 1);
  const months = cycle === 'YEARLY' ? 12 : 1;
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
