import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { SubscriptionStatusService } from '../services/subscription-status.service';

/**
 * Surfaces every failed API call as a p-toast, using the backend's { code, message } shape (SRS §17.3).
 *
 * Except sign-in: a wrong password is an expected, recoverable outcome, so the
 * login screen shows it inline next to the form instead of as a corner alert.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);
  const subscriptionStatus = inject(SubscriptionStatusService);
  const handledInline = req.url.includes('/auth/login');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !handledInline) {
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
