import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { DOCUMENT, registerLocaleData } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import localeHi from '@angular/common/locales/hi';
import localeGu from '@angular/common/locales/gu';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { PrimeNG } from 'primeng/config';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { Lang, activeLang, setTranslator } from './i18n';

export type { Lang } from './i18n';

registerLocaleData(localeHi);
registerLocaleData(localeGu);

export interface LanguageOption {
  code: Lang;
  /** The language's own name, so people can find theirs whatever the current language is. */
  nativeName: string;
  /** Short badge shown in the header picker. */
  short: string;
  /** Angular locale id for dates and numbers. */
  locale: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', nativeName: 'English', short: 'EN', locale: 'en-US' },
  { code: 'hi', nativeName: 'हिन्दी', short: 'हि', locale: 'hi' },
  { code: 'gu', nativeName: 'ગુજરાતી', short: 'ગુ', locale: 'gu' },
];

export const DEFAULT_LANG: Lang = 'en';
const STORAGE_KEY = 'printsetu.lang';

function isLang(value: unknown): value is Lang {
  return LANGUAGES.some((l) => l.code === value);
}

/**
 * The UI language: English, Hindi or Gujarati (English is the default and the
 * fallback for any missing translation). The choice is kept in localStorage so
 * the right language shows before sign-in, and in the signed-in user's profile
 * so it follows them to other devices.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly primeng = inject(PrimeNG);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  /** The chosen language (switches the moment it is picked; `activeLang` follows once its file loads). */
  readonly current = signal<Lang>(this.readStored());
  readonly option = computed(() => LANGUAGES.find((l) => l.code === this.current())!);
  /** Angular locale id for formatDate / formatNumber (follows the loaded language). */
  readonly locale = computed(() => LANGUAGES.find((l) => l.code === activeLang())!.locale);

  constructor() {
    setTranslator(this.translate);

    // After sign-in (or on start-up while signed in) the profile's language wins, so the
    // choice made on another device carries over.
    let signedInAs: string | null = null;
    effect(() => {
      const email = this.auth.user()?.email ?? null;
      untracked(() => {
        if (email && email !== signedInAs) this.loadFromProfile();
        signedInAs = email;
      });
    });
  }

  /**
   * Loads English (the fallback) and the saved language before the app first
   * renders, so no raw translation keys ever flash on screen. Run by
   * provideAppInitializer in app.config.ts.
   */
  async init(): Promise<void> {
    try {
      await firstValueFrom(this.translate.setFallbackLang(DEFAULT_LANG));
    } catch {
      // English file unreachable: keys show until it loads; nothing else to do
    }
    await this.apply(this.current());
  }

  /** Called by the language picker. */
  set(lang: Lang): void {
    if (!isLang(lang) || lang === this.current()) return;
    this.current.set(lang);
    void this.apply(lang);
    this.store(lang);
    if (this.auth.isAuthenticated()) {
      this.http
        .patch(`${environment.apiBaseUrl}/me/preferences`, { language: lang })
        .subscribe({ error: () => undefined });
    }
  }

  private loadFromProfile(): void {
    this.http.get<{ language?: string }>(`${environment.apiBaseUrl}/me/preferences`).subscribe({
      next: ({ language }) => {
        if (isLang(language) && language !== this.current()) {
          this.current.set(language);
          void this.apply(language);
          this.store(language);
        }
      },
      error: () => undefined,
    });
  }

  private async apply(lang: Lang): Promise<void> {
    this.document.documentElement.lang = lang;
    try {
      await firstValueFrom(this.translate.use(lang));
    } catch {
      // A language file that fails to load leaves English (the fallback) showing.
    }
    // Only a still-current choice takes effect (a quick second pick wins).
    if (this.current() !== lang) return;
    activeLang.set(lang);
    // PrimeNG's own words (calendar, Yes/No buttons, "No results found").
    const primeng = this.translate.instant('primeng');
    if (primeng && typeof primeng === 'object') this.primeng.setTranslation(primeng);
  }

  private readStored(): Lang {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return isLang(stored) ? stored : DEFAULT_LANG;
    } catch {
      return DEFAULT_LANG;
    }
  }

  private store(lang: Lang): void {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // private mode / blocked storage: the choice just won't survive a reload
    }
  }
}
