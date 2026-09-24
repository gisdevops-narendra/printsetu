import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type Lang = 'en' | 'hi' | 'gu';

/**
 * The language whose translations are loaded and showing. Updated by
 * LanguageService only after a language file has finished loading, so anything
 * that reads it (computed labels, t()) never sees half-loaded text.
 */
export const activeLang = signal<Lang>('en');

let translator: TranslateService | null = null;

/** Wired up once by LanguageService. */
export function setTranslator(service: TranslateService): void {
  translator = service;
}

/**
 * Translate a key from TypeScript (toasts, dialogs, label maps, computed text).
 * Templates use the `translate` pipe instead. Reads `activeLang`, so a
 * computed() or effect that calls it re-runs when the language changes.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  activeLang();
  if (!translator) return key;
  const value = translator.instant(key, params);
  return typeof value === 'string' ? value : key;
}

/**
 * Count phrase: `key.one` when count is 1, else `key.other`, with {{count}}
 * (and any extra params) filled in. E.g. tn('common.count.pages', 3) -> "3 pages".
 */
export function tn(key: string, count: number, params?: Record<string, unknown>): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...params });
}

/** BCP-47 tag for Intl / toLocale*String: en-IN, hi-IN or gu-IN. */
export function intlLocale(): string {
  return `${activeLang()}-IN`;
}
