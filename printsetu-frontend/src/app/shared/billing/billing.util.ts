import { BillingCycle, InvoiceStatus, SubscriptionPlan, SubscriptionStateOrNone } from '../../core/models/billing.models';
import { t, intlLocale, tn } from '../../core/i18n/i18n';

export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

export const STATE_META: Record<SubscriptionStateOrNone, { label: string; tone: Tone; hint: string }> = {
  ACTIVE: { get label() { return t('common.active'); }, tone: 'ok', get hint() { return t('billingShared.paid_full_access'); } },
  TRIAL: { get label() { return t('common.trial'); }, tone: 'info', get hint() { return t('billingShared.free_trial_full_access'); } },
  PAYMENT_PENDING: { get label() { return t('billingShared.payment_pending'); }, tone: 'warn', get hint() { return t('billingShared.renewal_date_passed_full_access_for'); } },
  PAST_DUE: { get label() { return t('billingShared.payment_overdue'); }, tone: 'bad', get hint() { return t('billingShared.extra_days_to_pay_are_over'); } },
  SUSPENDED: { get label() { return t('common.suspended'); }, tone: 'bad', get hint() { return t('billingShared.locked_customers_see_temporarily_unavailable'); } },
  CANCELLED: { get label() { return t('common.cancelled'); }, tone: 'muted', get hint() { return t('billingShared.cancelled_by_the_shop_or_an'); } },
  EXPIRED: { get label() { return t('common.expired'); }, tone: 'muted', get hint() { return t('billingShared.ended_without_renewal'); } },
  NONE: { get label() { return t('billingShared.no_plan'); }, tone: 'muted', get hint() { return t('billingShared.no_subscription_yet_full_access'); } },
};

export const INVOICE_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  OPEN: { get label() { return t('billingShared.unpaid'); }, tone: 'warn' },
  PAID: { get label() { return t('billingShared.paid_2'); }, tone: 'ok' },
  FAILED: { get label() { return t('common.failed'); }, tone: 'bad' },
  VOID: { get label() { return t('common.cancelled'); }, tone: 'muted' },
  PARTIALLY_REFUNDED: { get label() { return t('billingShared.part_refunded'); }, tone: 'info' },
  REFUNDED: { get label() { return t('billingShared.refunded_2'); }, tone: 'muted' },
};

/** Readable labels for the per-shop history feed. */
export const EVENT_META: Record<string, { label: string; icon: string; tone: Tone }> = {
  SUBSCRIPTION_CREATED: { get label() { return t('billingShared.plan_assigned'); }, icon: 'pi-plus-circle', tone: 'ok' },
  TRIAL_STARTED: { get label() { return t('billingShared.trial_started'); }, icon: 'pi-gift', tone: 'info' },
  PLAN_CHANGED: { get label() { return t('billingShared.plan_changed'); }, icon: 'pi-arrows-h', tone: 'info' },
  PLAN_CHANGE_SCHEDULED: { get label() { return t('billingShared.plan_change_scheduled'); }, icon: 'pi-calendar-plus', tone: 'info' },
  PLAN_CHANGE_CANCELLED: { get label() { return t('billingShared.scheduled_change_dropped'); }, icon: 'pi-calendar-times', tone: 'muted' },
  EXTENDED: { get label() { return t('billingShared.subscription_extended'); }, icon: 'pi-clock', tone: 'info' },
  GRACE_EXTENDED: { get label() { return t('billingShared.extra_days_to_pay_given'); }, icon: 'pi-hourglass', tone: 'warn' },
  CANCELLED: { get label() { return t('common.cancelled'); }, icon: 'pi-ban', tone: 'bad' },
  CANCEL_SCHEDULED: { get label() { return t('billingShared.cancellation_scheduled'); }, icon: 'pi-ban', tone: 'warn' },
  CANCEL_UNDONE: { get label() { return t('billingShared.cancellation_withdrawn'); }, icon: 'pi-replay', tone: 'ok' },
  MARKED_PAID: { get label() { return t('billingShared.marked_as_paid'); }, icon: 'pi-check-circle', tone: 'ok' },
  PAYMENT_RECEIVED: { get label() { return t('billingShared.payment_received'); }, icon: 'pi-check-circle', tone: 'ok' },
  PAYMENT_FAILED: { get label() { return t('billingShared.payment_not_received'); }, icon: 'pi-exclamation-triangle', tone: 'warn' },
  PAYMENT_RETRY_FAILED: { get label() { return t('billingShared.payment_retry_failed'); }, icon: 'pi-exclamation-triangle', tone: 'warn' },
  PAST_DUE: { get label() { return t('billingShared.payment_became_overdue'); }, icon: 'pi-exclamation-circle', tone: 'bad' },
  SUSPENDED: { get label() { return t('common.suspended'); }, icon: 'pi-lock', tone: 'bad' },
  EXPIRED: { get label() { return t('common.expired'); }, icon: 'pi-history', tone: 'muted' },
  RENEWED: { get label() { return t('billingShared.renewed'); }, icon: 'pi-refresh', tone: 'ok' },
  REFUND: { get label() { return t('billingShared.refund_issued'); }, icon: 'pi-undo', tone: 'info' },
  FORCE_SUSPENDED: { get label() { return t('billingShared.shop_paused_by_admin'); }, icon: 'pi-lock', tone: 'bad' },
  FORCE_REACTIVATED: { get label() { return t('billingShared.shop_turned_back_on_by_admin'); }, icon: 'pi-lock-open', tone: 'ok' },
  OVERRIDE_RELEASED: { get label() { return t('billingShared.back_to_automatic_rules'); }, icon: 'pi-unlock', tone: 'info' },
  OVERRIDE_EXPIRED: { get label() { return t('billingShared.manual_control_ended'); }, icon: 'pi-unlock', tone: 'info' },
  PREFERENCES_CHANGED: { get label() { return t('billingShared.preferences_changed'); }, icon: 'pi-sliders-h', tone: 'muted' },
  REMINDER_SENT: { get label() { return t('billingShared.reminder_sent'); }, icon: 'pi-bell', tone: 'muted' },
};

export const PAYMENT_METHODS = [
  { value: 'CASH', get label() { return t('billingShared.cash'); } },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', get label() { return t('billingShared.bank_transfer'); } },
  { value: 'CARD', get label() { return t('billingShared.card'); } },
  { value: 'OTHER', get label() { return t('billingShared.other'); } },
] as const;

export const CHANNEL_META = [
  { value: 'IN_APP', get label() { return t('billingShared.in_app'); }, icon: 'pi-bell', locked: true },
  { value: 'EMAIL', get label() { return t('common.email'); }, icon: 'pi-envelope', locked: false },
  { value: 'SMS', label: 'SMS', icon: 'pi-mobile', locked: false },
  { value: 'WHATSAPP', get label() { return t('billingShared.whatsapp'); }, icon: 'pi-whatsapp', locked: false },
] as const;

export function money(value: string | number | null | undefined, currency = 'INR'): string {
  const n = Number(value ?? 0);
  const whole = Number.isInteger(n);
  const text = n.toLocaleString(intlLocale(), { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return (currency === 'INR' ? '₹' : currency + ' ') + text;
}

/** "Unlimited" for null, otherwise the number with thousands separators. */
export function limit(value: number | null | undefined): string {
  return value === null || value === undefined ? t('billingShared.unlimited') : value.toLocaleString(intlLocale());
}

/** Billing cycles in the order they are offered. */
export const BILLING_CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'DAILY', get label() { return t('common.daily'); } },
  { value: 'MONTHLY', get label() { return t('common.monthly'); } },
  { value: 'YEARLY', get label() { return t('common.yearly'); } },
];

/** "Daily" / "Monthly" / "Yearly". */
export function cycleLabel(cycle: BillingCycle): string {
  return cycle === 'DAILY' ? t('common.daily') : cycle === 'YEARLY' ? t('common.yearly') : t('common.monthly');
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
    return tn('billingShared.months_free', n);
  }
  return t('billingShared.save', { m: Math.round((1 - y / (m * 12)) * 100) });
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
