import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { MessageService, ConfirmationService } from 'primeng/api';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { printsetuTheme } from './printsetu-theme';
import { LanguageService } from './core/i18n/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: printsetuTheme,
        options: { darkModeSelector: '.app-dark', cssLayer: false },
      },
      ripple: true,
    }),
    // UI text lives in public/locales/<lang>/translation.json; any key missing in
    // Hindi or Gujarati falls back to English. See core/i18n/language.service.ts.
    provideTranslateService({
      fallbackLang: 'en',
      loader: provideTranslateHttpLoader({
        prefix: '/locales/',
        suffix: '/translation.json',
        // Skip the auth / error-toast interceptors for these static files.
        useHttpBackend: true,
      }),
    }),
    provideAppInitializer(() => inject(LanguageService).init()),
    MessageService,
    ConfirmationService,
  ],
};
