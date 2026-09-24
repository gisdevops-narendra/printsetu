import { DayKey, OpeningHours } from '../../core/models/models';
import { t, intlLocale } from '../../core/i18n/i18n';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_LABELS: Record<DayKey, string> = {
  get mon() { return t('profile.monday'); },
  get tue() { return t('profile.tuesday'); },
  get wed() { return t('profile.wednesday'); },
  get thu() { return t('profile.thursday'); },
  get fri() { return t('profile.friday'); },
  get sat() { return t('profile.saturday'); },
  get sun() { return t('profile.sunday'); },
};

export const DEFAULT_HOURS: OpeningHours = {
  mon: { open: true, from: '09:00', to: '18:00' },
  tue: { open: true, from: '09:00', to: '18:00' },
  wed: { open: true, from: '09:00', to: '18:00' },
  thu: { open: true, from: '09:00', to: '18:00' },
  fri: { open: true, from: '09:00', to: '18:00' },
  sat: { open: true, from: '09:00', to: '18:00' },
  sun: { open: false, from: '09:00', to: '18:00' },
};

/** JS getDay(): 0 = Sunday ... 6 = Saturday. */
export function dayKeyOf(date: Date): DayKey {
  return DAY_KEYS[(date.getDay() + 6) % 7];
}

/** "18:30" -> "6:30 PM" */
export function format12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export interface OpenStatus {
  state: 'open' | 'closed' | 'unknown';
  label: string;
}

/** Whether the shop is open right now, with a human line such as "Open · closes 8:00 PM". */
export function openStatus(hours: OpeningHours | null, now: Date = new Date()): OpenStatus {
  if (!hours) return { state: 'unknown', get label() { return t('profile.hours_not_set'); } };
  const today = hours[dayKeyOf(now)];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  if (today.open && minutes >= toMinutes(today.from) && minutes < toMinutes(today.to)) {
    return { state: 'open', get label() { return t('profile.open_closes', { to: format12h(today.to) }); } };
  }
  if (today.open && minutes < toMinutes(today.from)) {
    return { state: 'closed', get label() { return t('profile.closed_opens', { from: format12h(today.from) }); } };
  }
  // Closed for the rest of today: find the next open day.
  for (let i = 1; i <= 7; i++) {
    const next = new Date(now);
    next.setDate(now.getDate() + i);
    const key = dayKeyOf(next);
    if (hours[key].open) {
      const when = i === 1 ? 'tomorrow' : DAY_LABELS[key].slice(0, 3);
      return { state: 'closed', get label() { return t('profile.closed_opens_2', { when, from: format12h(hours[key].from) }); } };
    }
  }
  return { state: 'closed', get label() { return t('common.closed'); } };
}

/** Initials for the logo placeholder: "Rohit Med Print" -> "RM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'P';
}

/** Compact currency: 1250 -> "₹1,250", 12.5 -> "₹12.50". */
export function rupees(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + n.toLocaleString(intlLocale(), { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}
