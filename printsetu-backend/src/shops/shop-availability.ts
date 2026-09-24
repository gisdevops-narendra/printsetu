/**
 * Whether a shop is taking new orders right now: its Online / Offline switch,
 * optionally driven by a daily schedule (the shop's opening hours).
 *
 *  - Schedule off: the manual switch (PrintSettings.acceptingOrders) decides.
 *  - Schedule on:  the opening hours decide, evaluated in the shop's time zone.
 *    Flipping the switch sets a temporary override (a lunch break, a printer
 *    fault, staying open late) that lasts until it is flipped back or until
 *    the next scheduled open/close, whichever comes first.
 *
 * Pure functions: the status is computed whenever it is read, so there is no
 * background job to keep in sync.
 */

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type OpeningHours = Record<DayKey, { open: boolean; from: string; to: string }>;

export type AvailabilitySource = 'MANUAL' | 'SCHEDULE' | 'OVERRIDE';

export interface ShopAvailability {
  online: boolean;
  source: AvailabilitySource;
  /** When the status will flip on its own (next scheduled open/close, or the end of an override). */
  nextChangeAt: Date | null;
}

export interface AvailabilitySettings {
  acceptingOrders: boolean;
  autoSchedule: boolean;
  scheduleOverride: boolean | null;
  scheduleOverrideUntil: Date | null;
}

const WEEKDAY_TO_KEY: Record<string, DayKey> = {
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
};

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Calendar date, weekday and minute-of-day of `instant` in `timeZone`. */
function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    dayKey: WEEKDAY_TO_KEY[get('weekday')],
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** The instant at which the wall clock in `timeZone` reads `minutes` on the given local calendar date. */
function localToInstant(year: number, month: number, day: number, minutes: number, timeZone: string): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // Offset of the zone at (approximately) that moment; a second pass settles DST edges.
  let instant = wallAsUtc;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(instant), timeZone);
    const seenAsUtc = Date.UTC(p.year, p.month - 1, p.day, Math.floor(p.minutes / 60), p.minutes % 60);
    instant += wallAsUtc - seenAsUtc;
  }
  return new Date(instant);
}

/** Open by the schedule right now, and when that next changes (null if the shop is never open). */
export function scheduledStatus(
  hours: OpeningHours,
  now: Date,
  timeZone: string,
): { open: boolean; nextChangeAt: Date | null } {
  const today = localParts(now, timeZone);
  const todayIndex = DAY_KEYS.indexOf(today.dayKey);
  for (let i = 0; i <= 7; i++) {
    const key = DAY_KEYS[(todayIndex + i) % 7];
    const day = hours[key];
    if (!day?.open) continue;
    const from = minutesOf(day.from);
    const to = minutesOf(day.to);
    // Calendar date i days ahead (noon UTC avoids any date-line wobble).
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i, 12));
    const at = (minutes: number) =>
      localToInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), minutes, timeZone);
    if (i === 0) {
      if (today.minutes < from) return { open: false, nextChangeAt: at(from) };
      if (today.minutes < to) return { open: true, nextChangeAt: at(to) };
      continue; // already closed for today
    }
    return { open: false, nextChangeAt: at(from) };
  }
  return { open: false, nextChangeAt: null };
}

/** True when the schedule has at least one open day to drive the switch with. */
/** Stored opening-hours JSON -> a full week (missing days closed, 09:00–18:00); null when never set. */
export function normalizeOpeningHours(raw: unknown): OpeningHours | null {
  if (!raw || typeof raw !== 'object') return null;
  const hours = raw as Partial<OpeningHours>;
  const out = {} as OpeningHours;
  for (const day of DAY_KEYS) {
    const d = hours[day];
    out[day] = { open: !!d?.open, from: d?.from ?? '09:00', to: d?.to ?? '18:00' };
  }
  return out;
}

export function hasOpenDay(hours: OpeningHours | null): hours is OpeningHours {
  return !!hours && DAY_KEYS.some((d) => hours[d]?.open);
}

export function overrideActive(settings: AvailabilitySettings, now: Date): boolean {
  return (
    settings.scheduleOverride !== null &&
    (settings.scheduleOverrideUntil === null || settings.scheduleOverrideUntil.getTime() > now.getTime())
  );
}

export function effectiveAvailability(
  settings: AvailabilitySettings,
  hours: OpeningHours | null,
  now: Date,
  timeZone: string,
): ShopAvailability {
  if (!settings.autoSchedule || !hasOpenDay(hours)) {
    return { online: settings.acceptingOrders, source: 'MANUAL', nextChangeAt: null };
  }
  if (overrideActive(settings, now)) {
    return { online: settings.scheduleOverride!, source: 'OVERRIDE', nextChangeAt: settings.scheduleOverrideUntil };
  }
  const scheduled = scheduledStatus(hours, now, timeZone);
  return { online: scheduled.open, source: 'SCHEDULE', nextChangeAt: scheduled.nextChangeAt };
}

/**
 * What flipping the switch to `online` should store while the schedule is on:
 * no override when that is what the schedule says anyway, otherwise an
 * override until the next scheduled change.
 */
export function overrideFor(
  online: boolean,
  hours: OpeningHours,
  now: Date,
  timeZone: string,
): { scheduleOverride: boolean | null; scheduleOverrideUntil: Date | null } {
  const scheduled = scheduledStatus(hours, now, timeZone);
  if (scheduled.open === online) return { scheduleOverride: null, scheduleOverrideUntil: null };
  return { scheduleOverride: online, scheduleOverrideUntil: scheduled.nextChangeAt };
}
