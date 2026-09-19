/**
 * Staging/test data generator (NOT for production).
 *
 * Wipes every shop-scoped table and rebuilds 12 shops across 4 cities with a
 * full year (12 monthly cycles) of realistic, varied subscription billing
 * history and print-job activity, so the admin dashboards / revenue
 * analytics / subscription screens have something real to look at instead
 * of empty or uniform demo rows.
 *
 * Keeps: roles, subscription plans, system settings, and the single admin
 * user (id 11111111-1111-1111-1111-111111111111).
 *
 * Run from printsetu-backend: npx ts-node prisma/seed-test-data.ts
 */
import { PrismaClient, PaperSize, ColorMode, SideMode, PrintJobStatus, ShopStatus, RoleName, UserStatus, DocumentStatus } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_NAME = 'PrintSetu Admin';
const NOW = new Date();

// ---------------------------------------------------------------- RNG ----
// Fixed-seed PRNG so re-running produces the same data (mulberry32).
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260919);
const rand = () => rng();
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function weightedPick<T extends { weight: number }>(arr: readonly T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0);
  let r = rand() * total;
  for (const item of arr) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
}
function digits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += randInt(0, 9);
  return s;
}

/** Adds whole (possibly negative) months, clamping the day like the app's own addCycle(). */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}
function ym(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

// ------------------------------------------------------------ pricing ----
// Same 8 rate combinations the demo seed uses, so quotes stay sane if anyone
// opens a fake shop's customer flow.
const RATES: { paperSize: PaperSize; colorMode: ColorMode; sideMode: SideMode; price: number; weight: number }[] = [
  { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', price: 2.0, weight: 45 },
  { paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX', price: 1.5, weight: 15 },
  { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'SIMPLEX', price: 8.0, weight: 15 },
  { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'DUPLEX', price: 7.0, weight: 8 },
  { paperSize: 'A3', colorMode: 'BW', sideMode: 'SIMPLEX', price: 4.0, weight: 6 },
  { paperSize: 'A3', colorMode: 'COLOR', sideMode: 'SIMPLEX', price: 14.0, weight: 4 },
  { paperSize: 'LEGAL', colorMode: 'BW', sideMode: 'SIMPLEX', price: 3.0, weight: 4 },
  { paperSize: 'LETTER', colorMode: 'BW', sideMode: 'SIMPLEX', price: 2.0, weight: 3 },
];

const PAYMENT_METHODS = [
  { value: 'CASH' as const, weight: 35 },
  { value: 'UPI' as const, weight: 40 },
  { value: 'BANK_TRANSFER' as const, weight: 15 },
  { value: 'CARD' as const, weight: 5 },
  { value: 'OTHER' as const, weight: 5 },
];
function paymentRef(method: string): string | undefined {
  if (method === 'UPI') return `UPI${digits(12)}`;
  if (method === 'BANK_TRANSFER') return `NEFT${digits(10)}`;
  if (method === 'CARD') return `CARD-${digits(6)}`;
  if (method === 'CASH') return chance(0.5) ? `Receipt #${digits(4)}` : undefined;
  return undefined;
}
function paidReason(method: string): string {
  return pick([
    method === 'UPI' ? 'UPI payment received, screenshot shared by the shop owner.' : null,
    method === 'CASH' ? 'Paid in cash at the counter.' : null,
    method === 'BANK_TRANSFER' ? 'Bank transfer received, matched against the invoice.' : null,
    method === 'CARD' ? 'Paid by card during the admin visit.' : null,
    'Shop owner called to confirm payment; verified and recorded.',
    'Collected during the monthly rounds.',
  ].filter((x): x is string => !!x));
}

// --------------------------------------------------------------- shops ----
type Scenario = 'clean' | 'pastDue' | 'graceRecovered' | 'upgrade' | 'suspendedReactivated';
type Tier = 'busy' | 'medium' | 'quiet';

interface ShopDef {
  city: string;
  name: string;
  owner: string;
  tier: Tier;
  scenario: Scenario;
  plan: string; // starting plan name
  upgradeTo?: string;
}

const SHOPS: ShopDef[] = [
  { city: 'Ahmedabad', name: 'Ahmedabad Quick Print', owner: 'Kiran Patel', tier: 'busy', scenario: 'clean', plan: 'Standard' },
  { city: 'Ahmedabad', name: 'Sarthak Xerox & Print', owner: 'Sarthak Shah', tier: 'medium', scenario: 'pastDue', plan: 'Basic' },
  { city: 'Ahmedabad', name: 'Riverside Print Point', owner: 'Devendra Joshi', tier: 'medium', scenario: 'clean', plan: 'Standard' },
  { city: 'Veraval', name: 'Veraval Copy Center', owner: 'Bharat Solanki', tier: 'quiet', scenario: 'graceRecovered', plan: 'Basic' },
  { city: 'Veraval', name: 'Somnath Print Shop', owner: 'Naresh Vaghela', tier: 'quiet', scenario: 'clean', plan: 'Basic' },
  { city: 'Rajkot', name: 'Rajkot Digital Prints', owner: 'Hitesh Gajera', tier: 'busy', scenario: 'clean', plan: 'Premium' },
  { city: 'Rajkot', name: 'Saurashtra Xerox', owner: 'Piyush Ramani', tier: 'medium', scenario: 'upgrade', plan: 'Basic', upgradeTo: 'Premium' },
  { city: 'Rajkot', name: 'City Print Rajkot', owner: 'Jignesh Kaneria', tier: 'medium', scenario: 'clean', plan: 'Standard' },
  { city: 'Surat', name: 'Surat Textile Prints', owner: 'Ashok Bhagat', tier: 'busy', scenario: 'clean', plan: 'Premium' },
  { city: 'Surat', name: 'Diamond City Xerox', owner: 'Mehul Savla', tier: 'medium', scenario: 'suspendedReactivated', plan: 'Standard' },
  { city: 'Surat', name: 'Varachha Print Hub', owner: 'Rajesh Patel', tier: 'medium', scenario: 'clean', plan: 'Basic' },
  { city: 'Surat', name: 'Surat Express Copy', owner: 'Vipul Desai', tier: 'quiet', scenario: 'clean', plan: 'Standard' },
];

const FILE_KINDS = [
  { ext: 'pdf', mime: 'application/pdf', weight: 65 },
  { ext: 'jpg', mime: 'image/jpeg', weight: 18 },
  { ext: 'png', mime: 'image/png', weight: 10 },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', weight: 7 },
];
const FILE_NAMES = [
  'Resume', 'Aadhar_Card', 'Invoice', 'Assignment', 'Project_Report', 'Mark_Sheet', 'Application_Form',
  'Photo', 'Notes', 'Ticket', 'Affidavit', 'Bank_Statement', 'Rental_Agreement', 'Question_Paper',
  'Certificate', 'Presentation', 'Chapter_3', 'Bonafide_Letter', 'Passport_Form', 'Exam_Admit_Card',
];

// ------------------------------------------------------------- wipe -------
async function wipe(): Promise<void> {
  console.log('Wiping existing shop-scoped data...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      refunds, print_job_events, print_job_items, notifications, print_jobs,
      print_quote_items, print_quotes, documents, print_sessions,
      subscription_events, invoices, shop_subscriptions, printers, qr_codes,
      pricing, print_settings, audit_logs
    RESTART IDENTITY CASCADE
  `);
  await prisma.user.deleteMany({ where: { shopId: { not: null } } });
  await prisma.shop.deleteMany({});
}

// ------------------------------------------------------- shop creation ----
async function createShop(def: ShopDef, index: number): Promise<{ id: string; createdAt: Date }> {
  const slug = slugify(def.name).slice(0, 24);
  const createdAt = addDays(addMonths(NOW, -12), randInt(0, 5)); // shop registered ~a year ago
  const shop = await prisma.shop.create({
    data: {
      shopCode: `${slug}-${String(index + 1).padStart(2, '0')}`,
      name: def.name,
      ownerName: def.owner,
      mobile: `9${randInt(1, 8)}${digits(8)}`,
      email: `info@${slug.toLowerCase().replace(/-/g, '')}.printsetu-test.local`,
      address: `${randInt(1, 199)}, ${pick(['Ring Road', 'Station Road', 'Main Bazaar', 'Gandhi Chowk', 'SG Highway', 'MG Road', 'Kalawad Road'])}, ${def.city}`,
      city: def.city,
      status: ShopStatus.ACTIVE,
      description: `${def.name} — quick, reliable printing and photocopying in ${def.city}.`,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.user.create({
    data: {
      shopId: shop.id,
      roleId: (await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SHOPKEEPER } })).id,
      name: def.owner,
      email: `${slug.toLowerCase().replace(/-/g, '.')}@printsetu-test.local`,
      mobile: `9${randInt(1, 8)}${digits(8)}`,
      keycloakUserId: null,
      status: UserStatus.ACTIVE,
      createdAt,
      updatedAt: createdAt,
    },
  });

  await prisma.printSettings.create({
    data: { shopId: shop.id, retentionMinutes: 30, maxFileSizeBytes: 26_214_400, updatedAt: createdAt },
  });

  await prisma.pricing.createMany({
    data: RATES.map((r) => ({
      shopId: shop.id,
      paperSize: r.paperSize,
      colorMode: r.colorMode,
      sideMode: r.sideMode,
      pricePerPage: r.price,
      effectiveFrom: createdAt,
      active: true,
      createdAt,
    })),
  });

  return { id: shop.id, createdAt };
}

// ---------------------------------------------------- subscription build --
interface Period {
  k: number;
  start: Date;
  end: Date;
  planId: string;
  planName: string;
  price: number;
}
interface InvoicePlan {
  shopId: string;
  planId: string;
  planName: string;
  kind: 'INITIAL' | 'RENEWAL' | 'UPGRADE';
  description: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  dueDate: Date;
  status: 'OPEN' | 'PAID' | 'FAILED';
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  attemptCount: number;
  lastFailure: string | null;
  createdAtForNumber: Date;
}
interface EventRow {
  shopId: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  actorUserId: string | null;
  actorName: string | null;
  metadata: unknown;
  createdAt: Date;
}

interface ShopResult {
  invoices: InvoicePlan[];
  events: EventRow[];
  finalStatus: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  planId: string;
  gracePastAt: Date | null;
  pastDueSince: Date | null;
  /** Windows (inclusive) where the shop could not take new orders — no print-job volume there. */
  blockedWindows: { from: Date; to: Date }[];
}

function buildSubscription(shopId: string, def: ShopDef, plans: Record<string, { id: string; monthlyPrice: number }>): ShopResult {
  const invoices: InvoicePlan[] = [];
  const events: EventRow[] = [];
  const blockedWindows: { from: Date; to: Date }[] = [];

  const plan = plans[def.plan];
  const stagger = randInt(0, 24);
  const start0 = addDays(addMonths(NOW, -11), -stagger);

  const renewalOnTime = (period: Period, hoursLater: number) => {
    const method = weightedPick(PAYMENT_METHODS).value;
    const paidAt = addHours(period.start, hoursLater);
    invoices.push({
      shopId,
      planId: period.planId,
      planName: period.planName,
      kind: period.k === 0 ? 'INITIAL' : 'RENEWAL',
      description: period.k === 0 ? `${period.planName} plan, first month` : `${period.planName} plan renewal, ${period.start.toDateString()} to ${period.end.toDateString()}`,
      periodStart: period.start,
      periodEnd: period.end,
      amount: period.price,
      dueDate: period.start,
      status: 'PAID',
      paidAt,
      paymentMethod: method,
      paymentReference: paymentRef(method) ?? null,
      attemptCount: 0,
      lastFailure: null,
      createdAtForNumber: period.start,
    });
    if (period.k === 0) {
      events.push({
        shopId, type: 'SUBSCRIPTION_CREATED', fromValue: null, toValue: `${period.planName} (monthly)`,
        reason: 'Shop registered and onboarded; first payment collected on the spot.', actorUserId: ADMIN_ID, actorName: ADMIN_NAME,
        metadata: { status: 'ACTIVE', price: period.price }, createdAt: period.start,
      });
    } else {
      events.push({
        shopId, type: 'PAYMENT_FAILED', fromValue: 'ACTIVE', toValue: 'PAYMENT_PENDING',
        reason: 'Payment was not received by the renewal date.', actorUserId: null, actorName: null,
        metadata: { invoice: null, amount: period.price }, createdAt: period.start,
      });
      events.push({
        shopId, type: 'MARKED_PAID', fromValue: 'PAYMENT_PENDING', toValue: 'ACTIVE',
        reason: paidReason(method), actorUserId: ADMIN_ID, actorName: ADMIN_NAME,
        metadata: { amount: period.price, method }, createdAt: paidAt,
      });
    }
  };

  // Build the 12 monthly periods (k = 0..11) for the *base* plan first.
  const periods: Period[] = [];
  for (let k = 0; k < 12; k++) {
    const s = addMonths(start0, k);
    const e = addMonths(start0, k + 1);
    periods.push({ k, start: s, end: e, planId: plan.id, planName: def.plan, price: plan.monthlyPrice });
  }

  if (def.scenario === 'clean') {
    for (const p of periods) renewalOnTime(p, randInt(1, 96));
    const last = periods[periods.length - 1];
    return {
      invoices, events, finalStatus: 'ACTIVE', currentPeriodStart: last.start, currentPeriodEnd: last.end,
      planId: plan.id, gracePastAt: null, pastDueSince: null, blockedWindows,
    };
  }

  if (def.scenario === 'upgrade') {
    const switchAt = 6; // periods 0..5 on the starting plan, 6..11 on the upgraded plan
    const upgraded = plans[def.upgradeTo!];
    for (const p of periods) {
      if (p.k < switchAt) {
        renewalOnTime(p, randInt(1, 96));
      } else {
        const pp: Period = { ...p, planId: upgraded.id, planName: def.upgradeTo!, price: upgraded.monthlyPrice };
        if (p.k === switchAt) {
          events.push({
            shopId, type: 'PLAN_CHANGED', fromValue: `${def.plan} (monthly)`, toValue: `${def.upgradeTo} (monthly)`,
            reason: 'Shop owner asked to move to a higher plan for more prints and priority support.', actorUserId: ADMIN_ID, actorName: ADMIN_NAME,
            metadata: { direction: 'upgrade', change: `${def.plan} (monthly) → ${def.upgradeTo} (monthly)` }, createdAt: pp.start,
          });
        }
        renewalOnTime(pp, randInt(1, 96));
      }
    }
    const last = periods[periods.length - 1];
    return {
      invoices, events, finalStatus: 'ACTIVE', currentPeriodStart: last.start, currentPeriodEnd: last.end,
      planId: upgraded.id, gracePastAt: null, pastDueSince: null, blockedWindows,
    };
  }

  if (def.scenario === 'graceRecovered') {
    const troubleAt = 10;
    for (const p of periods) {
      if (p.k !== troubleAt) {
        renewalOnTime(p, randInt(1, 96));
        continue;
      }
      // Fails on the due date, recovers a couple of days into the 5-day grace window.
      const method = weightedPick(PAYMENT_METHODS).value;
      const paidAt = addDays(p.start, randInt(2, 4));
      invoices.push({
        shopId, planId: p.planId, planName: p.planName, kind: 'RENEWAL',
        description: `${p.planName} plan renewal, ${p.start.toDateString()} to ${p.end.toDateString()}`,
        periodStart: p.start, periodEnd: p.end, amount: p.price, dueDate: p.start,
        status: 'PAID', paidAt, paymentMethod: method, paymentReference: paymentRef(method) ?? null,
        attemptCount: 0, lastFailure: null, createdAtForNumber: p.start,
      });
      events.push({
        shopId, type: 'PAYMENT_FAILED', fromValue: 'ACTIVE', toValue: 'PAYMENT_PENDING',
        reason: 'Payment was not received by the renewal date.', actorUserId: null, actorName: null,
        metadata: { amount: p.price }, createdAt: p.start,
      });
      events.push({
        shopId, type: 'MARKED_PAID', fromValue: 'PAYMENT_PENDING', toValue: 'ACTIVE',
        reason: `${paidReason(method)} Recovered inside the grace period.`, actorUserId: ADMIN_ID, actorName: ADMIN_NAME,
        metadata: { amount: p.price, method }, createdAt: paidAt,
      });
    }
    const last = periods[periods.length - 1];
    return {
      invoices, events, finalStatus: 'ACTIVE', currentPeriodStart: last.start, currentPeriodEnd: last.end,
      planId: plan.id, gracePastAt: null, pastDueSince: null, blockedWindows,
    };
  }

  if (def.scenario === 'pastDue') {
    const troubleAt = 11; // most recent cycle
    for (const p of periods) {
      if (p.k !== troubleAt) {
        renewalOnTime(p, randInt(1, 96));
        continue;
      }
      invoices.push({
        shopId, planId: p.planId, planName: p.planName, kind: 'RENEWAL',
        description: `${p.planName} plan renewal, ${p.start.toDateString()} to ${p.end.toDateString()}`,
        periodStart: p.start, periodEnd: p.end, amount: p.price, dueDate: p.start,
        status: 'FAILED', paidAt: null, paymentMethod: null, paymentReference: null,
        attemptCount: 0, lastFailure: null, createdAtForNumber: p.start,
      });
      events.push({
        shopId, type: 'PAYMENT_FAILED', fromValue: 'ACTIVE', toValue: 'PAYMENT_PENDING',
        reason: 'Payment was not received by the renewal date.', actorUserId: null, actorName: null,
        metadata: { amount: p.price }, createdAt: p.start,
      });
      const graceEnd = addDays(p.start, 5);
      events.push({
        shopId, type: 'PAST_DUE', fromValue: 'PAYMENT_PENDING', toValue: 'PAST_DUE',
        reason: 'The grace period ended without payment.', actorUserId: null, actorName: null,
        metadata: {}, createdAt: graceEnd,
      });
      blockedWindows.push({ from: graceEnd, to: NOW });
      return {
        invoices, events, finalStatus: 'PAST_DUE', currentPeriodStart: p.start, currentPeriodEnd: p.end,
        planId: p.planId, gracePastAt: graceEnd, pastDueSince: graceEnd, blockedWindows,
      };
    }
  }

  if (def.scenario === 'suspendedReactivated') {
    const troubleAt = 8;
    for (const p of periods) {
      if (p.k < troubleAt) {
        renewalOnTime(p, randInt(1, 96));
        continue;
      }
      if (p.k === troubleAt) {
        invoices.push({
          shopId, planId: p.planId, planName: p.planName, kind: 'RENEWAL',
          description: `${p.planName} plan renewal, ${p.start.toDateString()} to ${p.end.toDateString()}`,
          periodStart: p.start, periodEnd: p.end, amount: p.price, dueDate: p.start,
          status: 'FAILED', paidAt: null, paymentMethod: null, paymentReference: null,
          attemptCount: 0, lastFailure: null, createdAtForNumber: p.start,
        });
        events.push({
          shopId, type: 'PAYMENT_FAILED', fromValue: 'ACTIVE', toValue: 'PAYMENT_PENDING',
          reason: 'Payment was not received by the renewal date.', actorUserId: null, actorName: null,
          metadata: { amount: p.price }, createdAt: p.start,
        });
        const graceEnd = addDays(p.start, 5);
        events.push({
          shopId, type: 'PAST_DUE', fromValue: 'PAYMENT_PENDING', toValue: 'PAST_DUE',
          reason: 'The grace period ended without payment.', actorUserId: null, actorName: null,
          metadata: {}, createdAt: graceEnd,
        });
        const suspendAt = addDays(graceEnd, 7);
        events.push({
          shopId, type: 'SUSPENDED', fromValue: 'PAST_DUE', toValue: 'SUSPENDED',
          reason: 'Payment was still missing 7 days after it became overdue.', actorUserId: null, actorName: null,
          metadata: {}, createdAt: suspendAt,
        });
        const paidAt = addDays(suspendAt, randInt(6, 12));
        const method = weightedPick(PAYMENT_METHODS).value;
        invoices[invoices.length - 1].status = 'PAID';
        invoices[invoices.length - 1].paidAt = paidAt;
        invoices[invoices.length - 1].paymentMethod = method;
        invoices[invoices.length - 1].paymentReference = paymentRef(method) ?? null;
        events.push({
          shopId, type: 'MARKED_PAID', fromValue: 'SUSPENDED', toValue: 'ACTIVE',
          reason: `${paidReason(method)} Shop owner came in to clear the balance; reactivated on the spot.`, actorUserId: ADMIN_ID, actorName: ADMIN_NAME,
          metadata: { amount: p.price, method }, createdAt: paidAt,
        });
        blockedWindows.push({ from: graceEnd, to: paidAt });

        // Reactivation resets the cycle to start from the payment date (lapsed renewal).
        let cursor = paidAt;
        const remaining = 12 - troubleAt - 1;
        for (let j = 0; j < remaining; j++) {
          const s = cursor;
          const e = addMonths(cursor, 1);
          const pp: Period = { k: troubleAt + 1 + j, start: s, end: e, planId: p.planId, planName: p.planName, price: p.price };
          renewalOnTime(pp, randInt(1, 96));
          cursor = e;
        }
        const finalEnd = cursor;
        const finalStart = addMonths(cursor, -1);
        return {
          invoices, events, finalStatus: 'ACTIVE', currentPeriodStart: finalStart, currentPeriodEnd: finalEnd,
          planId: p.planId, gracePastAt: null, pastDueSince: null, blockedWindows,
        };
      }
    }
  }

  throw new Error(`Unhandled scenario ${def.scenario}`);
}

// -------------------------------------------------------- print jobs ------
const TIER_RANGE: Record<Tier, [number, number]> = { busy: [55, 130], medium: [18, 50], quiet: [5, 20] };

function isBlocked(date: Date, windows: { from: Date; to: Date }[]): boolean {
  return windows.some((w) => date >= w.from && date <= w.to);
}

interface JobPlan {
  shopId: string;
  createdAt: Date;
  status: PrintJobStatus;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies: number;
  pageCount: number;
  amount: number;
}

function buildPrintJobs(shopId: string, def: ShopDef, registeredAt: Date, blockedWindows: { from: Date; to: Date }[]): JobPlan[] {
  const jobs: JobPlan[] = [];
  const [lo, hi] = TIER_RANGE[def.tier];
  let monthCursor = new Date(Math.max(registeredAt.getTime(), addDays(addMonths(NOW, -12), 0).getTime()));
  let monthIndex = 0;
  while (monthCursor < NOW) {
    const monthStart = monthCursor;
    const monthEnd = new Date(Math.min(addMonths(monthCursor, 1).getTime(), NOW.getTime()));
    const growth = 1 + monthIndex * 0.015;
    const jitter = 0.65 + rand() * 0.7;
    const blockedHere = isBlocked(addDays(monthStart, 15), blockedWindows);
    const count = blockedHere ? randInt(0, 2) : Math.max(0, Math.round(randInt(lo, hi) * growth * jitter));

    for (let i = 0; i < count; i++) {
      let createdAt = new Date(monthStart.getTime() + rand() * (monthEnd.getTime() - monthStart.getTime()));
      if (isBlocked(createdAt, blockedWindows)) continue;
      const hour = Math.min(22, Math.max(8, Math.round(8 + rand() * rand() * 14)));
      createdAt.setUTCHours(hour, randInt(0, 59), randInt(0, 59), 0);

      const rate = weightedPick(RATES);
      const copies = chance(0.7) ? 1 : chance(0.5) ? randInt(2, 3) : randInt(4, 20);
      const pageCount = chance(0.5) ? randInt(1, 5) : chance(0.75) ? randInt(6, 15) : randInt(16, 40);
      const billable = rate.sideMode === 'DUPLEX' ? Math.ceil(pageCount / 2) : pageCount;
      const amount = Math.round(rate.price * billable * copies * 100) / 100;

      const isRecent = createdAt.getTime() > addHours(NOW, -48).getTime();
      let status: PrintJobStatus;
      if (isRecent && chance(0.15)) {
        status = pick([PrintJobStatus.QUEUED, PrintJobStatus.PRINTING, PrintJobStatus.PRINT_ELIGIBLE, PrintJobStatus.AGENT_OFFLINE]);
      } else {
        const r = rand();
        status = r < 0.88 ? PrintJobStatus.PRINTED : r < 0.93 ? PrintJobStatus.PRINT_FAILED : r < 0.98 ? PrintJobStatus.RETENTION_PENDING : PrintJobStatus.CANCELLED;
      }

      jobs.push({ shopId, createdAt, status, paperSize: rate.paperSize, colorMode: rate.colorMode, sideMode: rate.sideMode, copies, pageCount, amount });
    }
    monthCursor = addMonths(monthCursor, 1);
    monthIndex++;
  }
  return jobs;
}

// ------------------------------------------------------------------ main --
async function main(): Promise<void> {
  await wipe();

  const planRows = await prisma.subscriptionPlan.findMany({ where: { name: { in: ['Basic', 'Standard', 'Premium'] } } });
  const plans: Record<string, { id: string; monthlyPrice: number }> = {};
  for (const p of planRows) plans[p.name] = { id: p.id, monthlyPrice: Number(p.monthlyPrice) };
  for (const name of ['Basic', 'Standard', 'Premium']) {
    if (!plans[name]) throw new Error(`Subscription plan "${name}" not found — seed it first (npm run prisma:seed).`);
  }

  const allInvoicePlans: InvoicePlan[] = [];
  const allEvents: EventRow[] = [];
  const allJobs: JobPlan[] = [];
  const subUpdates: { shopId: string; planId: string; status: string; start: Date; end: Date; graceEndsAt: Date | null; pastDueSince: Date | null }[] = [];

  console.log(`Creating ${SHOPS.length} shops...`);
  for (let i = 0; i < SHOPS.length; i++) {
    const def = SHOPS[i];
    const shop = await createShop(def, i);
    const result = buildSubscription(shop.id, def, plans);
    allInvoicePlans.push(...result.invoices);
    allEvents.push(...result.events);
    subUpdates.push({
      shopId: shop.id, planId: result.planId, status: result.finalStatus,
      start: result.currentPeriodStart, end: result.currentPeriodEnd,
      graceEndsAt: result.gracePastAt, pastDueSince: result.pastDueSince,
    });
    allJobs.push(...buildPrintJobs(shop.id, def, shop.createdAt, result.blockedWindows));
    console.log(`  ${def.city.padEnd(10)} ${def.name} — ${def.scenario}, ${result.finalStatus}`);
  }

  console.log(`Creating ${subUpdates.length} subscriptions...`);
  for (const s of subUpdates) {
    await prisma.shopSubscription.create({
      data: {
        shopId: s.shopId, planId: s.planId, status: s.status as never, cycle: 'MONTHLY',
        startDate: s.start, currentPeriodStart: s.start, currentPeriodEnd: s.end,
        graceEndsAt: s.graceEndsAt, pastDueSince: s.pastDueSince, autoRenew: true, gateway: 'MANUAL',
      },
    });
  }

  console.log(`Numbering and creating ${allInvoicePlans.length} invoices...`);
  const seqRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT nextval('invoice_number_seq') AS n FROM generate_series(1, ${allInvoicePlans.length})`,
  );
  const invoiceRows = allInvoicePlans.map((inv, i) => ({
    number: `INV-${ym(inv.createdAtForNumber)}-${String(seqRows[i].n).padStart(6, '0')}`,
    shopId: inv.shopId,
    planId: inv.planId,
    planName: inv.planName,
    cycle: 'MONTHLY' as const,
    kind: inv.kind,
    description: inv.description,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    amount: inv.amount,
    currency: 'INR',
    status: inv.status,
    dueDate: inv.dueDate,
    paidAt: inv.paidAt,
    paymentMethod: inv.paymentMethod as never,
    paymentReference: inv.paymentReference,
    attemptCount: inv.attemptCount,
    lastFailure: inv.lastFailure,
    refundedAmount: 0,
    createdAt: inv.createdAtForNumber,
  }));
  await chunked(invoiceRows, 500, (batch) => prisma.invoice.createMany({ data: batch }));

  console.log(`Creating ${allEvents.length} subscription events...`);
  await chunked(
    allEvents.map((e) => ({
      shopId: e.shopId, type: e.type, fromValue: e.fromValue, toValue: e.toValue, reason: e.reason,
      actorUserId: e.actorUserId, actorName: e.actorName, metadata: e.metadata as never, createdAt: e.createdAt,
    })),
    500,
    (batch) => prisma.subscriptionEvent.createMany({ data: batch }),
  );

  console.log(`Creating ${allJobs.length} print sessions / documents / jobs...`);
  const sessionRows = allJobs.map((j) => ({ id: crypto.randomUUID(), shopId: j.shopId, createdAt: j.createdAt }));
  await chunked(sessionRows, 1000, (batch) => prisma.printSession.createMany({ data: batch }));

  const docRows = allJobs.map((j, i) => {
    const kind = weightedPick(FILE_KINDS);
    const base = pick(FILE_NAMES);
    const documentId = crypto.randomUUID();
    const originalName = `${base}_${randInt(1, 999)}.${kind.ext}`;
    return {
      id: documentId,
      shopId: j.shopId,
      sessionId: sessionRows[i].id,
      originalName,
      s3Key: `${j.shopId}/${documentId}/${originalName}`,
      mimeType: kind.mime,
      sizeBytes: randInt(20_000, kind.ext === 'pdf' ? 6_000_000 : 3_000_000),
      pageCount: j.pageCount,
      colorPages: j.colorMode === 'COLOR' ? j.pageCount : 0,
      colorDetectionConfidence: 'HIGH',
      status: DocumentStatus.PRINT_ELIGIBLE,
      uploadedAt: j.createdAt,
    };
  });
  await chunked(docRows, 1000, (batch) => prisma.document.createMany({ data: batch }));

  const jobRows = allJobs.map((j, i) => {
    const terminal = ([PrintJobStatus.PRINTED, PrintJobStatus.RETENTION_PENDING, PrintJobStatus.DELETED] as PrintJobStatus[]).includes(j.status);
    const printedAt = terminal ? addHours(j.createdAt, randFraction()) : null;
    return {
      id: crypto.randomUUID(),
      shopId: j.shopId,
      quoteId: null,
      amount: j.amount,
      currency: 'INR',
      status: j.status,
      attemptCount: terminal ? 1 : 0,
      idempotencyKey: crypto.randomUUID(),
      queuedAt: j.status === PrintJobStatus.CREATED ? null : addHours(j.createdAt, 0.02),
      printedAt,
      failureReason: j.status === PrintJobStatus.PRINT_FAILED ? pick(['Printer offline', 'Paper jam', 'Out of paper', 'Agent disconnected']) : null,
      statusToken: crypto.randomUUID(),
      createdAt: j.createdAt,
      updatedAt: printedAt ?? j.createdAt,
      sessionId: sessionRows[i].id,
      documentId: docRows[i].id,
      paperSize: j.paperSize,
      colorMode: j.colorMode,
      sideMode: j.sideMode,
      copies: j.copies,
      pageCount: j.pageCount,
    };
  });

  await chunked(jobRows, 500, (batch) =>
    prisma.printJob.createMany({
      data: batch.map((r) => ({
        id: r.id, shopId: r.shopId, quoteId: r.quoteId, amount: r.amount, currency: r.currency, status: r.status,
        attemptCount: r.attemptCount, idempotencyKey: r.idempotencyKey, queuedAt: r.queuedAt, printedAt: r.printedAt,
        failureReason: r.failureReason, statusToken: r.statusToken, createdAt: r.createdAt, updatedAt: r.updatedAt,
      })),
    }),
  );

  await chunked(jobRows, 1000, (batch) =>
    prisma.printJobItem.createMany({
      data: batch.map((r) => {
        const billable = r.sideMode === 'DUPLEX' ? Math.ceil(r.pageCount / 2) : r.pageCount;
        return {
          printJobId: r.id, documentId: r.documentId, paperSize: r.paperSize, colorMode: r.colorMode, sideMode: r.sideMode,
          copies: r.copies, pageCount: r.pageCount, billablePages: billable, amount: r.amount, printOrder: 0,
        };
      }),
    }),
  );

  console.log('Done.');
  console.log(`Shops: ${SHOPS.length}, invoices: ${invoiceRows.length}, events: ${allEvents.length}, print jobs: ${jobRows.length}`);
}

function randFraction(): number {
  // A few minutes to a couple of hours between "created" and "printed".
  return 0.03 + rand() * 1.8;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
