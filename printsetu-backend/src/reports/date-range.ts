import { BadRequestException } from '@nestjs/common';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

/** An inclusive range of calendar days in a time zone, plus its [start, end) instants. */
export interface ResolvedDateRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
  days: string[];
}

/** YYYY-MM-DD of `instant` as seen in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** How far `timeZone`'s wall clock is ahead of UTC at `ms`. */
function offsetMs(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour,
    +parts.minute,
    +parts.second,
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

/** The instant local midnight starts `date` in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  return new Date(utcMidnight - offsetMs(utcMidnight, timeZone));
}

function isRealDate(date: string): boolean {
  return DATE.test(date) && addDays(date, 0) === date;
}

/**
 * Admin dashboard date filter: `from`/`to` are inclusive local calendar days
 * (the shops' time zone). Omitted -> the current month to date.
 */
export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
  now = new Date(),
): ResolvedDateRange {
  const today = localDate(now, timeZone);
  const resolvedTo = to ?? today;
  const resolvedFrom = from ?? `${resolvedTo.slice(0, 8)}01`;
  if (!isRealDate(resolvedFrom) || !isRealDate(resolvedTo)) {
    throw new BadRequestException('Please pick valid dates.');
  }
  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('The start date must be on or before the end date.');
  }
  const days: string[] = [];
  for (let day = resolvedFrom; day <= resolvedTo; day = addDays(day, 1)) {
    days.push(day);
    if (days.length > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Pick a range of at most ${MAX_RANGE_DAYS} days.`);
    }
  }
  return {
    from: resolvedFrom,
    to: resolvedTo,
    start: startOfLocalDay(resolvedFrom, timeZone),
    end: startOfLocalDay(addDays(resolvedTo, 1), timeZone),
    days,
  };
}
