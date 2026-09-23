export type SubscriptionState =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAYMENT_PENDING'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'EXPIRED';
/** A shop that has never been given a plan. */
export type SubscriptionStateOrNone = SubscriptionState | 'NONE';

export type BillingCycle = 'DAILY' | 'MONTHLY' | 'YEARLY';
export type InvoiceStatus = 'OPEN' | 'PAID' | 'FAILED' | 'VOID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'GATEWAY' | 'OTHER';
export type BillingChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
export type AccessLevel = 'FULL' | 'READ_ONLY' | 'SUSPENDED';

/** Prices arrive from the API as decimal strings. */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  dailyPrice: string;
  monthlyPrice: string;
  yearlyPrice: string;
  currency: string;
  trialDays: number;
  maxPrintsPerMonth: number | null;
  maxTokensPerDay: number | null;
  maxPrinters: number | null;
  prioritySupport: boolean;
  analyticsAccess: boolean;
  highlights: string[];
  isActive: boolean;
  sortOrder: number;
  shopCount?: number;
}

export interface PlanInput {
  name: string;
  description?: string;
  dailyPrice: number;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  maxPrintsPerMonth: number | null;
  maxTokensPerDay: number | null;
  maxPrinters: number | null;
  prioritySupport: boolean;
  analyticsAccess: boolean;
  highlights: string[];
  isActive: boolean;
}

export interface ShopAccessInfo {
  state: SubscriptionStateOrNone;
  level: AccessLevel;
  acceptsOrders: boolean;
  graceEndsAt: string | null;
  daysLeft: number | null;
  banner: { severity: 'info' | 'warn' | 'error'; message: string } | null;
}

export interface PlanUsage {
  printsThisMonth: number;
  tokensToday: number;
  printers: number;
}

export interface ShopSubscriptionRecord {
  id: string;
  shopId: string;
  planId: string;
  plan: SubscriptionPlan;
  cycle: BillingCycle;
  status: SubscriptionState;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  pastDueSince: string | null;
  autoRenew: boolean;
  gateway: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  pendingPlanId: string | null;
  pendingCycle: BillingCycle | null;
  automationPaused: boolean;
  pausedUntil: string | null;
  notificationChannels: BillingChannel[] | null;
}

export interface RefundRecord {
  id: string;
  amount: string;
  reason: string;
  createdAt: string;
}

export interface InvoiceRecord {
  id: string;
  number: string;
  shopId: string;
  planName: string;
  cycle: BillingCycle;
  kind: 'INITIAL' | 'RENEWAL' | 'UPGRADE';
  description: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  lastFailure: string | null;
  refundedAmount: string;
  createdAt: string;
  refunds?: RefundRecord[];
  shop?: { id: string; name: string; shopCode: string };
}

export interface SubscriptionEventRecord {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface BillingSettings {
  graceDays: number;
  suspendAfterPastDueDays: number;
  retryAttempts: number;
  retryIntervalDays: number;
  renewalReminderDays: number;
  defaultChannels: BillingChannel[];
  upgradeTiming: 'IMMEDIATE_PRORATED' | 'NEXT_CYCLE';
  downgradeTiming: 'END_OF_CYCLE' | 'IMMEDIATE';
}

export interface SubscriptionListRow {
  shopId: string;
  shopName: string;
  shopCode: string;
  city: string;
  shopStatus: 'ACTIVE' | 'INACTIVE';
  status: SubscriptionStateOrNone;
  plan: { id: string; name: string } | null;
  cycle: BillingCycle | null;
  price: number | null;
  startDate: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  autoRenew: boolean | null;
  cancelAtPeriodEnd: boolean;
  automationPaused: boolean;
}

export interface SubscriptionDetail {
  shop: { id: string; name: string; shopCode: string; city: string; email: string; mobile: string; ownerName: string };
  subscription: ShopSubscriptionRecord | null;
  pendingPlan: SubscriptionPlan | null;
  access: ShopAccessInfo;
  usage: PlanUsage;
  invoices: InvoiceRecord[];
  events: SubscriptionEventRecord[];
  channels: BillingChannel[];
  settings: BillingSettings;
}

export interface RevenueDashboard {
  currency: string;
  totalShops: number;
  activeSubscriptions: { total: number; daily: number; monthly: number; yearly: number };
  byStatus: Record<string, number>;
  mrr: number;
  arr: number;
  collectedThisMonth: number;
  outstanding: { amount: number; invoices: number };
  upcomingRenewals: { shopId: string; shopName: string; plan: string; cycle: BillingCycle; amount: number; date: string; isTrial: boolean; autoRenew: boolean }[];
  churn: { thisMonth: number; cancelled: number; expired: number; lostMrr: number };
  failedPayments: {
    last30Days: number;
    shopsAffected: number;
    recovered: number;
    recoveryRate: number | null;
    currentlyPastDue: number;
    currentlyPending: number;
  };
  perPlan: { planId: string; name: string; shops: number; mrr: number }[];
  series: { month: string; collected: number }[];
}

/** What the shop owner sees on their Billing page. */
export interface ShopBillingOverview {
  access: ShopAccessInfo;
  subscription: {
    status: SubscriptionState;
    cycle: BillingCycle;
    startDate: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    autoRenew: boolean;
    cancelAtPeriodEnd: boolean;
    gateway: string;
  } | null;
  plan: SubscriptionPlan | null;
  pendingPlan: { id: string; name: string } | null;
  usage: PlanUsage;
  amountDue: { invoiceId: string; number: string; amount: string; currency: string; dueDate: string } | null;
  channels: BillingChannel[];
  graceDays: number;
}
