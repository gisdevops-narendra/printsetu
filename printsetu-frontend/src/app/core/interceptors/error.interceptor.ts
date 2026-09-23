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
          summary: body?.code || `Error ${error.status}`,
          detail: body?.message || error.message || 'Something went wrong.',
          life: 6000,
        });
      }
      return throwError(() => error);
    }),
  );
};
