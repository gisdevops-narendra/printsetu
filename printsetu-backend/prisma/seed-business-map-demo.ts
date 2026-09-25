/**
 * Business Map demo data (local only, NOT for production).
 *
 * ADDS one demo shop + shopkeeper user in each of Gujarat's 33 districts,
 * with a year of print jobs, subscriptions and a handful of sales leads, so
 * the admin Business Map has something to show. Nothing existing is changed
 * or deleted.
 *
 * Every demo row is labelled so it can be told apart and removed later:
 *   shops.shop_code   starts with "DEMOMAP-"
 *   users.email       ends with   "@demo-map.printsetu.local"
 *   leads.notes       starts with "[DEMO-MAP]"
 *
 * Run from printsetu-backend:
 *   npx ts-node prisma/seed-business-map-demo.ts           # add the demo data
 *   npx ts-node prisma/seed-business-map-demo.ts --remove  # remove ONLY the demo data
 */
import {
  ColorMode,
  DocumentStatus,
  LeadStatus,
  PaperSize,
  PrintJobStatus,
  PrismaClient,
  RoleName,
  ShopStatus,
  SideMode,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const CODE_PREFIX = 'DEMOMAP-';
const EMAIL_DOMAIN = 'demo-map.printsetu.local';
const LEAD_TAG = '[DEMO-MAP]';
const NOW = new Date();
const DAY_MS = 86_400_000;

// Fixed-seed PRNG so re-running produces the same data (mulberry32).
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(20260925);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const digits = (n: number) => Array.from({ length: n }, () => randInt(0, 9)).join('');
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);
const addHours = (d: Date, hours: number) => new Date(d.getTime() + hours * 3_600_000);
/** Moves a point up to ~`km` kilometres in a random direction. */
const jitter = (deg: number, km: number) => deg + (rand() - 0.5) * 2 * (km / 111);

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// ------------------------------------------------------------ districts ----
type Tier = 'busy' | 'medium' | 'quiet';
/**
 * What makes a shop stand out on the map:
 *  offline      - shopkeeper switched "Online" off (orange marker)
 *  deactivated  - shop deactivated by admin (grey marker)
 *  inactive     - no orders for the last ~5 weeks
 *  printer      - lots of failed prints (printer-problem flag)
 *  expiring     - subscription ends within 7 days
 *  expired      - subscription lapsed / past due
 *  trial        - on a trial
 *  noPricing    - pricing switched off (revenue not tracked)
 */
type Flag = 'offline' | 'deactivated' | 'inactive' | 'printer' | 'expiring' | 'expired' | 'trial' | 'noPricing';

interface DistrictDef {
  district: string;
  city: string; // district headquarters
  lat: number;
  lng: number;
  tier: Tier;
  shopName: string;
  owner: string;
  monthsAgo: number; // when the shop registered (drives the growth replay)
  flags?: Flag[];
}

const DISTRICTS: DistrictDef[] = [
  { district: 'Ahmedabad', city: 'Ahmedabad', lat: 23.0225, lng: 72.5714, tier: 'busy', shopName: 'Navrangpura Print Hub', owner: 'Kiran Patel', monthsAgo: 13 },
  { district: 'Amreli', city: 'Amreli', lat: 21.6032, lng: 71.2221, tier: 'quiet', shopName: 'Amreli Xerox Point', owner: 'Mahesh Kathiriya', monthsAgo: 6, flags: ['inactive'] },
  { district: 'Anand', city: 'Anand', lat: 22.5645, lng: 72.9289, tier: 'medium', shopName: 'Vidyanagar Copy Centre', owner: 'Hardik Amin', monthsAgo: 11 },
  { district: 'Aravalli', city: 'Modasa', lat: 23.4626, lng: 73.2986, tier: 'quiet', shopName: 'Modasa Print & Copy', owner: 'Rakesh Parmar', monthsAgo: 4, flags: ['trial'] },
  { district: 'Banaskantha', city: 'Palanpur', lat: 24.1725, lng: 72.438, tier: 'medium', shopName: 'Palanpur Digital Print', owner: 'Jayesh Chaudhary', monthsAgo: 8, flags: ['expiring'] },
  { district: 'Bharuch', city: 'Bharuch', lat: 21.7051, lng: 72.9959, tier: 'medium', shopName: 'Narmada Xerox Bharuch', owner: 'Imran Shaikh', monthsAgo: 10 },
  { district: 'Bhavnagar', city: 'Bhavnagar', lat: 21.7645, lng: 72.1519, tier: 'busy', shopName: 'Bhavnagar Quick Prints', owner: 'Nilesh Trivedi', monthsAgo: 12 },
  { district: 'Botad', city: 'Botad', lat: 22.1693, lng: 71.6668, tier: 'quiet', shopName: 'Botad Copy Shop', owner: 'Ramesh Khachar', monthsAgo: 3, flags: ['noPricing'] },
  { district: 'Chhota Udaipur', city: 'Chhota Udaipur', lat: 22.3048, lng: 74.012, tier: 'quiet', shopName: 'Chhota Udaipur Print Seva', owner: 'Suresh Rathwa', monthsAgo: 2, flags: ['trial', 'offline'] },
  { district: 'Dahod', city: 'Dahod', lat: 22.835, lng: 74.255, tier: 'quiet', shopName: 'Dahod Xerox Centre', owner: 'Anil Bhabhor', monthsAgo: 5, flags: ['expired'] },
  { district: 'Dang', city: 'Ahwa', lat: 20.758, lng: 73.687, tier: 'quiet', shopName: 'Ahwa Print Point', owner: 'Ganesh Gavit', monthsAgo: 1, flags: ['trial'] },
  { district: 'Devbhumi Dwarka', city: 'Khambhalia', lat: 22.202, lng: 69.655, tier: 'quiet', shopName: 'Dwarka Copy Corner', owner: 'Hemant Gadhvi', monthsAgo: 7, flags: ['deactivated'] },
  { district: 'Gandhinagar', city: 'Gandhinagar', lat: 23.2156, lng: 72.6369, tier: 'busy', shopName: 'Sector 21 Print Studio', owner: 'Vishal Desai', monthsAgo: 12 },
  { district: 'Gir Somnath', city: 'Veraval', lat: 20.907, lng: 70.367, tier: 'medium', shopName: 'Somnath Print Shop', owner: 'Naresh Vaghela', monthsAgo: 9, flags: ['printer'] },
  { district: 'Jamnagar', city: 'Jamnagar', lat: 22.4707, lng: 70.0577, tier: 'busy', shopName: 'Jamnagar Print House', owner: 'Deepak Nakum', monthsAgo: 11 },
  { district: 'Junagadh', city: 'Junagadh', lat: 21.5222, lng: 70.4579, tier: 'medium', shopName: 'Girnar Xerox Junagadh', owner: 'Paresh Chovatiya', monthsAgo: 10, flags: ['offline'] },
  { district: 'Kheda', city: 'Nadiad', lat: 22.6916, lng: 72.8634, tier: 'medium', shopName: 'Nadiad Print Centre', owner: 'Chirag Patel', monthsAgo: 9 },
  { district: 'Kutch', city: 'Bhuj', lat: 23.242, lng: 69.6669, tier: 'medium', shopName: 'Bhuj Digital Xerox', owner: 'Kishor Thakkar', monthsAgo: 8, flags: ['expiring'] },
  { district: 'Mahisagar', city: 'Lunawada', lat: 23.128, lng: 73.61, tier: 'quiet', shopName: 'Lunawada Copy Point', owner: 'Dilip Pagi', monthsAgo: 4, flags: ['inactive', 'noPricing'] },
  { district: 'Mehsana', city: 'Mehsana', lat: 23.588, lng: 72.3693, tier: 'medium', shopName: 'Mehsana Print Mart', owner: 'Bhavesh Patel', monthsAgo: 11 },
  { district: 'Morbi', city: 'Morbi', lat: 22.8173, lng: 70.8377, tier: 'medium', shopName: 'Morbi Ceramic City Prints', owner: 'Sanjay Aghara', monthsAgo: 7, flags: ['printer'] },
  { district: 'Narmada', city: 'Rajpipla', lat: 21.87, lng: 73.503, tier: 'quiet', shopName: 'Rajpipla Xerox', owner: 'Mukesh Vasava', monthsAgo: 5 },
  { district: 'Navsari', city: 'Navsari', lat: 20.9467, lng: 72.952, tier: 'medium', shopName: 'Navsari Print Zone', owner: 'Tushar Naik', monthsAgo: 9, flags: ['expired'] },
  { district: 'Panchmahal', city: 'Godhra', lat: 22.7788, lng: 73.6143, tier: 'medium', shopName: 'Godhra Copy Centre', owner: 'Farhan Ghanchi', monthsAgo: 6, flags: ['offline'] },
  { district: 'Patan', city: 'Patan', lat: 23.8493, lng: 72.1266, tier: 'medium', shopName: 'Rani ki Vav Prints', owner: 'Hasmukh Prajapati', monthsAgo: 8 },
  { district: 'Porbandar', city: 'Porbandar', lat: 21.6417, lng: 69.6293, tier: 'quiet', shopName: 'Porbandar Print Point', owner: 'Rajesh Modhwadia', monthsAgo: 6, flags: ['expiring', 'noPricing'] },
  { district: 'Rajkot', city: 'Rajkot', lat: 22.3039, lng: 70.8022, tier: 'busy', shopName: 'Rajkot Digital Prints', owner: 'Hitesh Gajera', monthsAgo: 13 },
  { district: 'Sabarkantha', city: 'Himmatnagar', lat: 23.598, lng: 72.966, tier: 'quiet', shopName: 'Himmatnagar Xerox Hub', owner: 'Ketan Solanki', monthsAgo: 5, flags: ['printer'] },
  { district: 'Surat', city: 'Surat', lat: 21.1702, lng: 72.8311, tier: 'busy', shopName: 'Varachha Print Hub', owner: 'Ashok Bhagat', monthsAgo: 13 },
  { district: 'Surendranagar', city: 'Surendranagar', lat: 22.7271, lng: 71.6486, tier: 'medium', shopName: 'Wadhwan Copy Centre', owner: 'Pravin Zala', monthsAgo: 7, flags: ['deactivated'] },
  { district: 'Tapi', city: 'Vyara', lat: 21.11, lng: 73.395, tier: 'quiet', shopName: 'Vyara Print Seva', owner: 'Manoj Chaudhari', monthsAgo: 3, flags: ['offline'] },
  { district: 'Vadodara', city: 'Vadodara', lat: 22.3072, lng: 73.1812, tier: 'busy', shopName: 'Alkapuri Print Studio', owner: 'Nirav Shah', monthsAgo: 12 },
  { district: 'Valsad', city: 'Valsad', lat: 20.5992, lng: 72.9342, tier: 'medium', shopName: 'Valsad Quick Xerox', owner: 'Jignesh Tandel', monthsAgo: 10 },
];

/** Leads (prospective shops) the sales team is working on, near these cities. */
const LEADS: { city: string; name: string; contact: string; status: LeadStatus; note: string }[] = [
  { city: 'Ahmedabad', name: 'Maninagar Xerox', contact: 'Paresh Soni', status: 'DEMO_GIVEN', note: 'Liked the QR ordering, wants to try it for a week.' },
  { city: 'Ahmedabad', name: 'Bopal Print Point', contact: 'Ritesh Mehta', status: 'CONTACTED', note: 'Call back after Diwali.' },
  { city: 'Ahmedabad', name: 'Law Garden Copy', contact: 'Sneha Joshi', status: 'NOT_INTERESTED', note: 'Happy with the current setup.' },
  { city: 'Surat', name: 'Adajan Digital Print', contact: 'Kunal Patel', status: 'DEMO_GIVEN', note: 'Asked for Gujarati UI walkthrough.' },
  { city: 'Surat', name: 'Athwa Copy Centre', contact: 'Nikhil Desai', status: 'CONTACTED', note: 'Owner busy, meet again next week.' },
  { city: 'Surat', name: 'Katargam Xerox', contact: 'Vijay Rana', status: 'CONTACTED', note: 'Interested in the Basic plan.' },
  { city: 'Vadodara', name: 'Sayajigunj Prints', contact: 'Amit Pandya', status: 'DEMO_GIVEN', note: 'Near MSU campus, lots of students.' },
  { city: 'Vadodara', name: 'Manjalpur Copy Shop', contact: 'Harsh Vyas', status: 'NOT_INTERESTED', note: 'No printer PC at the counter.' },
  { city: 'Rajkot', name: 'Kalawad Road Xerox', contact: 'Jay Kalariya', status: 'CONTACTED', note: 'Wants pricing details on WhatsApp.' },
  { city: 'Rajkot', name: 'Yagnik Road Print', contact: 'Mitesh Dobariya', status: 'DEMO_GIVEN', note: 'Demo went well, waiting for partner approval.' },
  { city: 'Gandhinagar', name: 'Infocity Print Kiosk', contact: 'Rohan Dave', status: 'CONTACTED', note: 'Near GIFT City offices.' },
  { city: 'Bhavnagar', name: 'Waghawadi Copy', contact: 'Yogesh Bhatt', status: 'CONTACTED', note: 'Visit again with a brochure.' },
  { city: 'Jamnagar', name: 'Patel Colony Prints', contact: 'Dhaval Kanani', status: 'NOT_INTERESTED', note: 'Too few customers for now.' },
  { city: 'Junagadh', name: 'Zanzarda Road Xerox', contact: 'Bhargav Vaja', status: 'DEMO_GIVEN', note: 'Wants to start next month.' },
  { city: 'Anand', name: 'VV Nagar Stationery & Print', contact: 'Parth Amin', status: 'CONTACTED', note: 'College area, good potential.' },
  { city: 'Mehsana', name: 'Modhera Road Copy', contact: 'Alpesh Chaudhary', status: 'CONTACTED', note: 'Shared app link.' },
  { city: 'Bhuj', name: 'Hospital Road Xerox', contact: 'Salim Node', status: 'DEMO_GIVEN', note: 'Asked about offline mode.' },
  { city: 'Navsari', name: 'Lunsikui Print Shop', contact: 'Chetan Patel', status: 'CONTACTED', note: 'Call on Saturday.' },
  { city: 'Morbi', name: 'Ravapar Road Copy', contact: 'Hiren Bhalodiya', status: 'NOT_INTERESTED', note: 'Uses another service.' },
  { city: 'Valsad', name: 'Tithal Road Prints', contact: 'Kaushik Tandel', status: 'CONTACTED', note: 'Needs a second visit.' },
  { city: 'Patan', name: 'HNGU Campus Xerox', contact: 'Vipul Prajapati', status: 'DEMO_GIVEN', note: 'University shop, exam season rush.' },
  { city: 'Himmatnagar', name: 'Motipura Copy', contact: 'Dharmesh Patel', status: 'CONTACTED', note: 'Left a pamphlet.' },
];

// ---------------------------------------------------------------- jobs ----
const RATES: { paperSize: PaperSize; colorMode: ColorMode; sideMode: SideMode; price: number; weight: number }[] = [
  { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', price: 2, weight: 50 },
  { paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX', price: 1.5, weight: 15 },
  { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'SIMPLEX', price: 8, weight: 18 },
  { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'DUPLEX', price: 7, weight: 7 },
  { paperSize: 'A3', colorMode: 'BW', sideMode: 'SIMPLEX', price: 4, weight: 5 },
  { paperSize: 'LEGAL', colorMode: 'BW', sideMode: 'SIMPLEX', price: 3, weight: 5 },
];
function weightedRate() {
  let r = rand() * RATES.reduce((s, x) => s + x.weight, 0);
  for (const rate of RATES) if ((r -= rate.weight) <= 0) return rate;
  return RATES[0];
}
const FILE_NAMES = ['Resume', 'Aadhar_Card', 'Invoice', 'Assignment', 'Project_Report', 'Mark_Sheet', 'Application_Form', 'Notes', 'Ticket', 'Certificate'];
/** Orders per month once the shop is established. */
const TIER_RANGE: Record<Tier, [number, number]> = { busy: [70, 140], medium: [20, 50], quiet: [4, 15] };

interface JobPlan {
  shopId: string;
  createdAt: Date;
  status: PrintJobStatus;
  rate: (typeof RATES)[number];
  copies: number;
  pageCount: number;
  priced: boolean;
}

function buildJobs(shopId: string, def: DistrictDef, registeredAt: Date, priced: boolean): JobPlan[] {
  const flags = def.flags ?? [];
  const [lo, hi] = TIER_RANGE[def.tier];
  const failShare = flags.includes('printer') ? 0.3 : 0.04;
  // Inactive shops stopped ordering ~5 weeks ago; deactivated ones ~2 months ago.
  const stopAt = flags.includes('inactive')
    ? addDays(NOW, -randInt(35, 50))
    : flags.includes('deactivated')
      ? addDays(NOW, -randInt(55, 70))
      : NOW;
  const jobs: JobPlan[] = [];
  const days = Math.floor((stopAt.getTime() - registeredAt.getTime()) / DAY_MS);
  for (let d = 0; d < days; d++) {
    const day = addDays(registeredAt, d);
    const ramp = Math.min(1, 0.3 + d / 120); // new shops ramp up over ~4 months
    const perDay = (randInt(lo, hi) / 30) * ramp * (day.getUTCDay() === 0 ? 0.3 : 1);
    const count = Math.floor(perDay) + (chance(perDay % 1) ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const createdAt = new Date(day);
      // 9:00-20:00 IST, i.e. 03:30-14:30 UTC
      createdAt.setUTCHours(3, 30 + randInt(0, 660), randInt(0, 59), 0);
      if (createdAt > NOW) continue;
      const recent = NOW.getTime() - createdAt.getTime() < 2 * DAY_MS;
      let status: PrintJobStatus;
      if (recent && chance(0.2)) status = pick([PrintJobStatus.QUEUED, PrintJobStatus.PRINT_ELIGIBLE, PrintJobStatus.PRINTING]);
      else if (chance(failShare)) status = pick([PrintJobStatus.PRINT_FAILED, PrintJobStatus.PRINT_FAILED, PrintJobStatus.PRINT_UNKNOWN]);
      else if (chance(0.03)) status = PrintJobStatus.CANCELLED;
      else status = PrintJobStatus.PRINTED;
      jobs.push({
        shopId,
        createdAt,
        status,
        rate: weightedRate(),
        copies: chance(0.75) ? 1 : randInt(2, 10),
        pageCount: chance(0.55) ? randInt(1, 5) : randInt(6, 30),
        priced,
      });
    }
  }
  return jobs;
}

// ---------------------------------------------------------------- main ----
async function remove() {
  const shops = await prisma.shop.findMany({ where: { shopCode: { startsWith: CODE_PREFIX } }, select: { id: true } });
  const ids = shops.map((s) => s.id);
  console.log(`Removing demo data for ${ids.length} demo shops...`);
  await prisma.$transaction(async (tx) => {
    const jobs = { printJob: { shopId: { in: ids } } };
    await tx.printJobEvent.deleteMany({ where: jobs });
    await tx.notification.deleteMany({ where: { shopId: { in: ids } } });
    await tx.printJobItem.deleteMany({ where: jobs });
    await tx.printJob.deleteMany({ where: { shopId: { in: ids } } });
    await tx.document.deleteMany({ where: { shopId: { in: ids } } });
    await tx.printSession.deleteMany({ where: { shopId: { in: ids } } });
    await tx.shopSubscription.deleteMany({ where: { shopId: { in: ids } } });
    await tx.pricing.deleteMany({ where: { shopId: { in: ids } } });
    await tx.printSettings.deleteMany({ where: { shopId: { in: ids } } });
    await tx.user.deleteMany({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
    const leads = await tx.lead.deleteMany({ where: { notes: { startsWith: LEAD_TAG } } });
    await tx.shop.deleteMany({ where: { id: { in: ids } } });
    console.log(`Removed ${ids.length} shops and ${leads.count} leads.`);
  }, { timeout: 120_000 });
}

async function main() {
  if (process.argv.includes('--remove')) return remove();

  const existing = await prisma.shop.count({ where: { shopCode: { startsWith: CODE_PREFIX } } });
  if (existing) {
    console.log(`Demo data already present (${existing} shops). Run with --remove first to recreate it.`);
    return;
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.SHOPKEEPER } });
  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { monthlyPrice: 'asc' } });
  if (!plans.length) throw new Error('No subscription plans found — seed plans first.');

  const allJobs: JobPlan[] = [];
  console.log(`Creating ${DISTRICTS.length} demo shops (one per Gujarat district)...`);
  for (let i = 0; i < DISTRICTS.length; i++) {
    const def = DISTRICTS[i];
    const flags = def.flags ?? [];
    const code = `${CODE_PREFIX}${String(i + 1).padStart(2, '0')}`;
    const slug = def.district.toLowerCase().replace(/[^a-z]+/g, '');
    const registeredAt = addDays(NOW, -(def.monthsAgo * 30 + randInt(0, 20)));
    const priced = !flags.includes('noPricing');

    const shop = await prisma.shop.create({
      data: {
        shopCode: code,
        name: def.shopName,
        ownerName: def.owner,
        mobile: `9${randInt(1, 8)}${digits(8)}`,
        email: `shop.${slug}@${EMAIL_DOMAIN}`,
        address: `${randInt(1, 199)}, ${pick(['Station Road', 'Main Bazaar', 'Gandhi Chowk', 'College Road', 'Bus Stand Road', 'Market Yard'])}, ${def.city}`,
        city: def.city,
        district: def.district,
        latitude: jitter(def.lat, 1.5),
        longitude: jitter(def.lng, 1.5),
        status: flags.includes('deactivated') ? ShopStatus.INACTIVE : ShopStatus.ACTIVE,
        description: `Demo shop for the Business Map — ${def.city}, ${def.district} district.`,
        createdAt: registeredAt,
      },
    });

    await prisma.user.create({
      data: {
        shopId: shop.id,
        roleId: role.id,
        name: def.owner,
        email: `${slug}@${EMAIL_DOMAIN}`,
        mobile: `9${randInt(1, 8)}${digits(8)}`,
        status: flags.includes('deactivated') ? UserStatus.DISABLED : UserStatus.ACTIVE,
        lastLoginAt: flags.includes('deactivated') || flags.includes('inactive')
          ? addDays(NOW, -randInt(30, 60))
          : addHours(NOW, -randInt(1, 72)),
        createdAt: registeredAt,
      },
    });

    await prisma.printSettings.create({
      data: {
        shopId: shop.id,
        pricingEnabled: priced,
        acceptingOrders: !flags.includes('offline'),
      },
    });

    await prisma.pricing.createMany({
      data: RATES.map((r) => ({
        shopId: shop.id,
        paperSize: r.paperSize,
        colorMode: r.colorMode,
        sideMode: r.sideMode,
        pricePerPage: r.price,
        effectiveFrom: registeredAt,
        active: true,
      })),
    });

    // Subscription: current monthly period, with the end date set by the flags.
    const plan = def.tier === 'busy' ? plans[plans.length - 1] : def.tier === 'medium' ? plans[Math.floor(plans.length / 2)] : plans[0];
    let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;
    let periodEnd = addDays(NOW, randInt(10, 28));
    if (flags.includes('trial')) {
      status = SubscriptionStatus.TRIAL;
      periodEnd = addDays(NOW, randInt(8, 25));
    }
    if (flags.includes('expiring')) periodEnd = addDays(NOW, randInt(2, 6));
    if (flags.includes('expired')) {
      status = SubscriptionStatus.PAST_DUE;
      periodEnd = addDays(NOW, -randInt(3, 12));
    }
    if (flags.includes('deactivated')) {
      status = SubscriptionStatus.SUSPENDED;
      periodEnd = addDays(NOW, -randInt(40, 60));
    }
    const periodStart = addDays(periodEnd, -30);
    await prisma.shopSubscription.create({
      data: {
        shopId: shop.id,
        planId: plan.id,
        status,
        cycle: 'MONTHLY',
        startDate: registeredAt,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: status === SubscriptionStatus.TRIAL ? periodEnd : null,
        pastDueSince: status === SubscriptionStatus.PAST_DUE ? periodEnd : null,
        gateway: 'MANUAL',
      },
    });

    const jobs = buildJobs(shop.id, def, registeredAt, priced);
    allJobs.push(...jobs);
    console.log(`  ${code}  ${def.district.padEnd(16)} ${def.shopName.padEnd(28)} ${String(jobs.length).padStart(5)} jobs  ${flags.join(', ')}`);
  }

  console.log(`Creating ${allJobs.length} print jobs...`);
  const rows = allJobs.map((j) => {
    const billable = j.rate.sideMode === 'DUPLEX' ? Math.ceil(j.pageCount / 2) : j.pageCount;
    const amount = j.priced ? Math.round(j.rate.price * billable * j.copies * 100) / 100 : 0;
    const printed = j.status === PrintJobStatus.PRINTED;
    const documentId = randomUUID();
    const name = `${pick(FILE_NAMES)}_${randInt(1, 999)}.pdf`;
    return {
      sessionId: randomUUID(),
      documentId,
      jobId: randomUUID(),
      name,
      billable,
      amount,
      printedAt: printed ? addHours(j.createdAt, 0.05 + rand()) : null,
      ...j,
    };
  });
  await chunked(rows, 1000, (b) => prisma.printSession.createMany({ data: b.map((r) => ({ id: r.sessionId, shopId: r.shopId, createdAt: r.createdAt })) }));
  await chunked(rows, 1000, (b) =>
    prisma.document.createMany({
      data: b.map((r) => ({
        id: r.documentId,
        shopId: r.shopId,
        sessionId: r.sessionId,
        originalName: r.name,
        s3Key: `demo-map/${r.shopId}/${r.documentId}/${r.name}`,
        mimeType: 'application/pdf',
        sizeBytes: randInt(30_000, 4_000_000),
        pageCount: r.pageCount,
        colorPages: r.rate.colorMode === 'COLOR' ? r.pageCount : 0,
        colorDetectionConfidence: 'HIGH',
        status: DocumentStatus.DELETED,
        uploadedAt: r.createdAt,
        deletedAt: r.printedAt ? addHours(r.printedAt, 0.5) : null,
      })),
    }),
  );
  await chunked(rows, 1000, (b) =>
    prisma.printJob.createMany({
      data: b.map((r) => ({
        id: r.jobId,
        shopId: r.shopId,
        amount: r.amount,
        priced: r.priced,
        status: r.status,
        attemptCount: r.printedAt || r.status === PrintJobStatus.PRINT_FAILED ? 1 : 0,
        idempotencyKey: randomUUID(),
        queuedAt: addHours(r.createdAt, 0.02),
        printedAt: r.printedAt,
        failureReason: r.status === PrintJobStatus.PRINT_FAILED ? pick(['Paper jam', 'Out of paper', 'Printer offline', 'Toner low']) : null,
        statusToken: randomUUID(),
        createdAt: r.createdAt,
        updatedAt: r.printedAt ?? r.createdAt,
      })),
    }),
  );
  await chunked(rows, 1000, (b) =>
    prisma.printJobItem.createMany({
      data: b.map((r) => ({
        printJobId: r.jobId,
        documentId: r.documentId,
        paperSize: r.rate.paperSize,
        colorMode: r.rate.colorMode,
        sideMode: r.rate.sideMode,
        copies: r.copies,
        pageCount: r.pageCount,
        billablePages: r.billable,
        amount: r.amount,
        printOrder: 0,
      })),
    }),
  );

  console.log(`Creating ${LEADS.length} sales leads...`);
  const byCity = new Map(DISTRICTS.map((d) => [d.city, d]));
  await prisma.lead.createMany({
    data: LEADS.map((l) => {
      const d = byCity.get(l.city)!;
      return {
        name: l.name,
        contactName: l.contact,
        mobile: `9${randInt(1, 8)}${digits(8)}`,
        address: `${l.city}, Gujarat`,
        city: l.city,
        district: d.district,
        latitude: jitter(d.lat, 4),
        longitude: jitter(d.lng, 4),
        notes: `${LEAD_TAG} ${l.note}`,
        status: l.status,
        createdAt: addDays(NOW, -randInt(1, 90)),
      };
    }),
  });

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
