import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { SubscriptionStatusService } from '../services/subscription-status.service';

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
  BAD_REQUEST: 'Please check and try again',
  INVALID_PRINT_OPTION: "Can't do that",
  NOT_FOUND: 'Not found',
  SHOP_ACCESS_DENIED: "You don't have access to this",
  FORBIDDEN: "You don't have access to this",
  CONFLICT: 'Please refresh the page',
  DOCUMENT_PROCESSING_CONFLICT: 'Please refresh the page',
  BILLING_CONFLICT: "Can't do that",
  JOB_ALREADY_PRINTING: 'Already printing',
  PRINT_AGENT_OFFLINE: 'Printer offline',
  FILE_TOO_LARGE: 'File too large',
  UNSUPPORTED_DOCUMENT: "Can't use this file",
  EMAIL_ALREADY_REGISTERED: 'Email already registered',
  WEAK_PASSWORD: 'Choose a stronger password',
  RATE_LIMITED: 'Too many tries',
  PLAN_LIMIT_REACHED: 'Plan limit reached',
  PLAN_FEATURE_UNAVAILABLE: 'Not in your plan',
  SUBSCRIPTION_RESTRICTED: 'Printing paused',
  SHOP_UNAVAILABLE: 'Shop unavailable',
  INTERNAL_ERROR: 'Something went wrong',
};

function errorTitle(code: string | undefined, status: number): string {
  if (status === 0) return 'No internet connection';
  if (code && ERROR_TITLES[code]) return ERROR_TITLES[code];
  if (status >= 500) return 'Something went wrong';
  if (status === 404) return 'Not found';
  if (status === 403) return "You don't have access to this";
  if (status === 409) return 'Please refresh the page';
  if (status === 429) return 'Too many tries';
  return "Can't do that";
}

function errorDetail(message: string | undefined, code: string | undefined, status: number): string {
  if (status === 0) return "Can't reach PrintSetu. Check your internet connection and try again.";
  // Unexpected server faults carry no message worth showing.
  if (!message || code === 'INTERNAL_ERROR') return 'Please try again in a moment.';
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
