import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { SubscriptionStatusService } from '../services/subscription-status.service';
import { t } from '../i18n/i18n';

/**
 * Surfaces every failed API call as a p-toast, using the backend's { code, message } shape (SRS §17.3).
 *
 * Except:
 *  - the /auth endpoints (sign-in, registration, token refresh): the login
 *    screen shows those inline, and a refresh is handled by AuthService;
 *  - 401 Unauthenticated: an expired access token is renewed and the request
 *    retried by authInterceptor, and a truly ended session simply returns to
 *    the sign-in screen, so there is nothing for the user to act on.
 */
/** Plain-language toast titles for the backend's error codes (the codes themselves mean nothing to users). */
const ERROR_TITLES: Record<string, string> = {
  get BAD_REQUEST() { return t('errors.please_check_and_try_again'); },
  get INVALID_PRINT_OPTION() { return t('errors.cant_do_that'); },
  get NOT_FOUND() { return t('errors.not_found'); },
  get SHOP_ACCESS_DENIED() { return t('errors.you_dont_have_access_to_this'); },
  get FORBIDDEN() { return t('errors.you_dont_have_access_to_this'); },
  get CONFLICT() { return t('errors.please_refresh_the_page'); },
  get DOCUMENT_PROCESSING_CONFLICT() { return t('errors.please_refresh_the_page'); },
  get BILLING_CONFLICT() { return t('errors.cant_do_that'); },
  get JOB_ALREADY_PRINTING() { return t('errors.already_printing'); },
  get PRINT_AGENT_OFFLINE() { return t('errors.printer_offline'); },
  get FILE_TOO_LARGE() { return t('errors.file_too_large'); },
  get UNSUPPORTED_DOCUMENT() { return t('errors.cant_use_this_file'); },
  get EMAIL_ALREADY_REGISTERED() { return t('errors.email_already_registered'); },
  get WEAK_PASSWORD() { return t('errors.choose_a_stronger_password'); },
  get RATE_LIMITED() { return t('errors.too_many_tries'); },
  get PLAN_LIMIT_REACHED() { return t('errors.plan_limit_reached'); },
  get PLAN_FEATURE_UNAVAILABLE() { return t('errors.not_in_your_plan'); },
  get SUBSCRIPTION_RESTRICTED() { return t('errors.printing_paused'); },
  get SHOP_UNAVAILABLE() { return t('errors.shop_unavailable'); },
  get INTERNAL_ERROR() { return t('errors.something_went_wrong'); },
};

function errorTitle(code: string | undefined, status: number): string {
  if (status === 0) return t('errors.no_internet_connection');
  if (code && ERROR_TITLES[code]) return ERROR_TITLES[code];
  if (status >= 500) return t('errors.something_went_wrong');
  if (status === 404) return t('errors.not_found');
  if (status === 403) return t('errors.you_dont_have_access_to_this');
  if (status === 409) return t('errors.please_refresh_the_page');
  if (status === 429) return t('errors.too_many_tries');
  return t('errors.cant_do_that');
}

function errorDetail(message: string | undefined, code: string | undefined, status: number): string {
  if (status === 0) return t('errors.cant_reach_printsetu_check_your_internet');
  // Unexpected server faults carry no message worth showing.
  if (!message || code === 'INTERNAL_ERROR') return t('errors.please_try_again_in_a_moment');
  return message;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);
  const subscriptionStatus = inject(SubscriptionStatusService);
  const handledInline = req.url.includes('/auth/');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !handledInline && error.status !== 401) {
        const body = error.error as { code?: string; message?: string } | undefined;
        // The shop was suspended while the portal was open: refresh the status, which locks the portal
        // and moves the shop to Billing, instead of showing an error toast for every blocked request.
        if (body?.code === 'SUBSCRIPTION_SUSPENDED') {
          subscriptionStatus.refresh().subscribe();
          return throwError(() => error);
        }
        messageService.add({
          severity: 'error',
          summary: errorTitle(body?.code, error.status),
          detail: errorDetail(typeof body?.message === 'string' ? body.message : undefined, body?.code, error.status),
          life: 6000,
        });
      }
      return throwError(() => error);
    }),
  );
};
