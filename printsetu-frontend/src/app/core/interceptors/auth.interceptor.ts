import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

/**
 * Attaches the Keycloak-issued access token to admin/shopkeeper API calls only,
 * renewing it silently when it is about to expire, and retrying once with a
 * fresh token if the API still answers 401, so a signed-in user is never
 * bounced out just because the short-lived access token ran out.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl) || req.url.startsWith(`${environment.apiBaseUrl}/auth/`)) {
    return next(req);
  }
  const auth = inject(AuthService);
  if (!auth.getAccessToken()) return next(req);

  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return auth.validAccessToken().pipe(
    switchMap((token) =>
      next(withToken(token)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
          return auth.refreshAccessToken().pipe(switchMap((fresh) => next(withToken(fresh))));
        }),
      ),
    ),
  );
};
