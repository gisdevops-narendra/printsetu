import { t, intlLocale } from '../../../core/i18n/i18n';
/** One row in a header notification dropdown (bell). */
export interface HeaderAlert {
  id: string;
  icon: string;
  tone: 'ok' | 'info' | 'warn' | 'bad' | 'muted';
  title: string;
  detail?: string;
  /** ISO timestamp; drives the "5m ago" label and the unread count. */
  at: string;
  link?: string;
}

/** A link in the profile dropdown. */
export interface HeaderMenuItem {
  label: string;
  icon: string;
  route: string;
}

/** "just now", "5m ago", "3h ago", "2d ago", or a short date once it's older than a week. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t('shared.just_now');
  if (min < 60) return t('shared.m_ago', { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('shared.h_ago', { hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('shared.d_ago', { day });
  return new Date(iso).toLocaleDateString(intlLocale(), { day: '2-digit', month: 'short' });
}

const SEEN_PREFIX = 'printsetu.alertsSeenAt.';

/** When the user last opened a bell (per bell), as epoch ms; 0 if never / storage unavailable. */
export function readSeenAt(scope: string): number {
  try {
    return Number(localStorage.getItem(SEEN_PREFIX + scope)) || 0;
  } catch {
    return 0;
  }
}

export function writeSeenAt(scope: string, at: number): void {
  try {
    localStorage.setItem(SEEN_PREFIX + scope, String(at));
  } catch {
    // ignore: unread badges will simply reappear after a reload
  }
}
