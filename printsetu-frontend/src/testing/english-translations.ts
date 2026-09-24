import { EnvironmentProviders, Provider, inject, provideEnvironmentInitializer } from '@angular/core';
import { TranslateService, TranslationObject, provideTranslateService } from '@ngx-translate/core';
import en from '../../public/locales/en/translation.json';
import { setTranslator } from '../app/core/i18n/i18n';

/**
 * Test-only: the real English UI text, loaded synchronously, so specs can
 * assert what a user actually reads ("Printed", not "common.printed") and
 * templates using the translate pipe have a TranslateService.
 */
export function provideEnglishTranslations(): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
    provideEnvironmentInitializer(() => {
      const translate = inject(TranslateService);
      translate.setTranslation('en', en as unknown as TranslationObject);
      translate.use('en');
      setTranslator(translate);
    }),
  ];
}
