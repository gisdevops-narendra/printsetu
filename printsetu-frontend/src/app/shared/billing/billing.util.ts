import { BillingCycle, InvoiceStatus, SubscriptionPlan, SubscriptionStateOrNone } from '../../core/models/billing.models';

export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

export const STATE_META: Record<SubscriptionStateOrNone, { label: string; tone: Tone; hint: string }> = {
  ACTIVE: { label: 'Active', tone: 'ok', hint: 'Paid, full access.' },
  TRIAL: { label: 'Trial', tone: 'info', hint: 'Free trial, full access.' },
  PAYMENT_PENDING: { label: 'Payment pending', tone: 'warn', hint: 'Renewal date passed. Grace period running, full access.' },
  PAST_DUE: { label: 'Past due', tone: 'bad', hint: 'Grace period over. Old orders only, no new print requests.' },
  SUSPENDED: { label: 'Suspended', tone: 'bad', hint: 'Locked. Customers see "temporarily unavailable".' },
  CANCELLED: { label: 'Cancelled', tone: 'muted', hint: 'Cancelled by the shop or an admin.' },
  EXPIRED: { label: 'Expired', tone: 'muted', hint: 'Ended without renewal.' },
  NONE: { label: 'No plan', tone: 'muted', hint: 'No subscription yet. Full access.' },
};

export const INVOICE_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Unpaid', tone: 'warn' },
  PAID: { label: 'Paid', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
  VOID: { label: 'Void', tone: 'muted' },
  PARTIALLY_REFUNDED: { label: 'Part refunded', tone: 'info' },
  REFUNDED: { label: 'Refunded', tone: 'muted' },
};

/** Readable labels for the per-shop history feed. */
export const EVENT_META: Record<string, { label: string; icon: string; tone: Tone }> = {
  SUBSCRIPTION_CREATED: { label: 'Plan assigned', icon: 'pi-plus-circle', tone: 'ok' },
  TRIAL_STARTED: { label: 'Trial started', icon: 'pi-gift', tone: 'info' },
  PLAN_CHANGED: { label: 'Plan changed', icon: 'pi-arrows-h', tone: 'info' },
  PLAN_CHANGE_SCHEDULED: { label: 'Plan change scheduled', icon: 'pi-calendar-plus', tone: 'info' },
  PLAN_CHANGE_CANCELLED: { label: 'Scheduled change dropped', icon: 'pi-calendar-times', tone: 'muted' },
  EXTENDED: { label: 'Subscription extended', icon: 'pi-clock', tone: 'info' },
  GRACE_EXTENDED: { label: 'Grace period extended', icon: 'pi-hourglass', tone: 'warn' },
  CANCELLED: { label: 'Cancelled', icon: 'pi-ban', tone: 'bad' },
  CANCEL_SCHEDULED: { label: 'Cancellation scheduled', icon: 'pi-ban', tone: 'warn' },
  CANCEL_UNDONE: { label: 'Cancellation withdrawn', icon: 'pi-replay', tone: 'ok' },
  MARKED_PAID: { label: 'Marked as paid', icon: 'pi-check-circle', tone: 'ok' },
  PAYMENT_RECEIVED: { label: 'Payment received', icon: 'pi-check-circle', tone: 'ok' },
  PAYMENT_FAILED: { label: 'Payment not received', icon: 'pi-exclamation-triangle', tone: 'warn' },
  PAYMENT_RETRY_FAILED: { label: 'Payment retry failed', icon: 'pi-exclamation-triangle', tone: 'warn' },
  PAST_DUE: { label: 'Became past due', icon: 'pi-exclamation-circle', tone: 'bad' },
  SUSPENDED: { label: 'Suspended', icon: 'pi-lock', tone: 'bad' },
  EXPIRED: { label: 'Expired', icon: 'pi-history', tone: 'muted' },
  RENEWED: { label: 'Renewed', icon: 'pi-refresh', tone: 'ok' },
  REFUND: { label: 'Refund issued', icon: 'pi-undo', tone: 'info' },
  FORCE_SUSPENDED: { label: 'Force-suspended', icon: 'pi-lock', tone: 'bad' },
  FORCE_REACTIVATED: { label: 'Force-reactivated', icon: 'pi-lock-open', tone: 'ok' },
  OVERRIDE_RELEASED: { label: 'Override released', icon: 'pi-unlock', tone: 'info' },
  OVERRIDE_EXPIRED: { label: 'Override ended', icon: 'pi-unlock', tone: 'info' },
  PREFERENCES_CHANGED: { label: 'Preferences changed', icon: 'pi-sliders-h', tone: 'muted' },
  REMINDER_SENT: { label: 'Reminder sent', icon: 'pi-bell', tone: 'muted' },
};

export const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const CHANNEL_META = [
  { value: 'IN_APP', label: 'In-app', icon: 'pi-bell', locked: true },
  { value: 'EMAIL', label: 'Email', icon: 'pi-envelope', locked: false },
  { value: 'SMS', label: 'SMS', icon: 'pi-mobile', locked: false },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: 'pi-whatsapp', locked: false },
] as const;

export function money(value: string | number | null | undefined, currency = 'INR'): string {
  const n = Number(value ?? 0);
  const whole = Number.isInteger(n);
  const text = n.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return (currency === 'INR' ? '₹' : currency + ' ') + text;
}

/** "Unlimited" for null, otherwise the number with thousands separators. */
export function limit(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unlimited' : value.toLocaleString('en-IN');
}

/** Billing cycles in the order they are offered. */
export const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

/** "Daily" / "Monthly" / "Yearly". */
export function cycleLabel(cycle: BillingCycle): string {
  return cycle === 'DAILY' ? 'Daily' : cycle === 'YEARLY' ? 'Yearly' : 'Monthly';
}

/** "day" / "month" / "year", as in "₹20 / day". */
export function cycleUnit(cycle: BillingCycle): string {
  return cycle === 'DAILY' ? 'day' : cycle === 'YEARLY' ? 'year' : 'month';
}

/** The plan's price for one billing cycle. */
export function cyclePrice(plan: Pick<SubscriptionPlan, 'dailyPrice' | 'monthlyPrice' | 'yearlyPrice'>, cycle: BillingCycle): string {
  return cycle === 'DAILY' ? plan.dailyPrice : cycle === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
}

/** What the plan costs per month on this cycle (a daily plan counts as 30 days). */
export function monthlyEquivalent(plan: Pick<SubscriptionPlan, 'dailyPrice' | 'monthlyPrice' | 'yearlyPrice'>, cycle: BillingCycle): number {
  return cycle === 'DAILY' ? Number(plan.dailyPrice) * 30 : cycle === 'YEARLY' ? Number(plan.yearlyPrice) / 12 : Number(plan.monthlyPrice);
}

/** Yearly saving as a friendly phrase, e.g. "2 months free" or "Save 17%". */
export function yearlySaving(plan: Pick<SubscriptionPlan, 'monthlyPrice' | 'yearlyPrice'>): string | null {
  const m = Number(plan.monthlyPrice);
  const y = Number(plan.yearlyPrice);
  if (m <= 0 || y >= m * 12) return null;
  const monthsFree = (m * 12 - y) / m;
  if (Math.abs(monthsFree - Math.round(monthsFree)) < 0.1 && Math.round(monthsFree) >= 1) {
    const n = Math.round(monthsFree);
    return `${n} ${n === 1 ? 'month' : 'months'} free`;
  }
  return `Save ${Math.round((1 - y / (m * 12)) * 100)}%`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Opens the PDF in a new tab so it can be printed straight away. */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const win = window.open(url, '_blank');
  if (!win) downloadBlob(blob, 'invoice.pdf');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
