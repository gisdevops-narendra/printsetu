import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

/**
 * Surfaces every failed API call as a p-toast, using the backend's { code, message } shape (SRS §17.3).
 *
 * Except sign-in: a wrong password is an expected, recoverable outcome, so the
 * login screen shows it inline next to the form instead of as a corner alert.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);
  const handledInline = req.url.includes('/auth/login');

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !handledInline) {
        const body = error.error as { code?: string; message?: string } | undefined;
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
