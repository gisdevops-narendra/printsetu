import { t, intlLocale } from '../../core/i18n/i18n';
/**
 * Small browser helpers shared by several screens.
 */

/**
 * Copies text to the clipboard.
 *
 * `navigator.clipboard` only exists in a secure context (https or localhost).
 * PrintSetu is often opened over plain http on a LAN address, where it is
 * undefined, so fall back to the legacy select-and-copy trick.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

/** "just now", "3 min ago", "2 h ago", "Sep 18" — for last-seen style labels. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return t('shared.just_now');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('shared.min_ago', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('shared.h_ago_2', { hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('shared.d_ago_2', { days });
  return new Date(iso).toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });
}

/** Triggers a browser download of a data/blob URL. */
export function downloadUrl(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
