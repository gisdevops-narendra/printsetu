import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DecodedAccessToken, decodeJwt } from './jwt.util';
import { RoleName } from '../models/models';
import { t } from '../i18n/i18n';

export interface SessionUser {
  email: string;
  name: string;
  role: RoleName;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type LoginApiResponse = TokenPair | { requiresPasswordChange: true };

export interface RegisterShopRequest {
  shopName: string;
  ownerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  password: string;
  /** Optional map position and district (Business Map). */
  district?: string;
  latitude?: number;
  longitude?: number;
  /** The 6-digit code emailed by sendRegistrationOtp(). */
  otp: string;
}

/** Thrown by login() when the account still has a temporary password; caught by LoginComponent to switch to the change-password step. */
export class PasswordChangeRequiredError extends Error {
  constructor() {
    super(t('auth.this_account_has_a_temporary_password'));
  }
}

const ACCESS_TOKEN_KEY = 'printsetu.accessToken';
const REFRESH_TOKEN_KEY = 'printsetu.refreshToken';

/** Refresh this long before the access token actually expires. */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * Users stay signed in until they sign out themselves. Sign-in returns a
 * Keycloak *offline* refresh token (no idle/absolute session timeout), both
 * tokens are kept in localStorage so the session survives closing the tab,
 * and the short-lived access token is renewed silently before it expires
 * (see authInterceptor). Signing out revokes the refresh token in Keycloak.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<SessionUser | null>(this.restoreUser());
  readonly user = computed(() => this.userSignal());
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  private refreshInFlight: Observable<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    // Signing out in one tab signs out the others too.
    window.addEventListener('storage', (event) => {
      if (event.key === ACCESS_TOKEN_KEY && !event.newValue && this.userSignal()) this.endSession();
    });
  }

  private restoreUser(): SessionUser | null {
    this.migrateFromSessionStorage();
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const claims = decodeJwt(token);
    const expired = !claims || claims.exp * 1000 < Date.now();
    // An expired access token is fine while there is a refresh token to renew it with.
    if (!claims || (expired && !localStorage.getItem(REFRESH_TOKEN_KEY))) {
      this.clearTokens();
      return null;
    }
    return this.toSessionUser(claims);
  }

  /** Sessions started before tokens moved to localStorage carry over instead of signing the user out. */
  private migrateFromSessionStorage(): void {
    const access = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (access && !localStorage.getItem(ACCESS_TOKEN_KEY)) {
      localStorage.setItem(ACCESS_TOKEN_KEY, access);
      const refresh = sessionStorage.getItem(REFRESH_TOKEN_KEY);
      if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  private toSessionUser(claims: DecodedAccessToken): SessionUser | null {
    const role = claims.realm_access?.roles.find((r) => r === 'ADMIN' || r === 'SHOPKEEPER') as
      | RoleName
      | undefined;
    if (!role) return null;
    return { email: claims.email, name: claims.name || claims.preferred_username, role };
  }

  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /** The access token to send: the stored one, renewed first when it is about to expire. */
  validAccessToken(): Observable<string | null> {
    const token = this.getAccessToken();
    if (!token) return of(null);
    const claims = decodeJwt(token);
    if (claims && claims.exp * 1000 - Date.now() > EXPIRY_MARGIN_MS) return of(token);
    // Could not renew right now (e.g. offline): send the old one; a 401 retries the refresh.
    return this.refreshAccessToken().pipe(catchError(() => of(token)));
  }

  /**
   * Swaps the refresh token for a fresh access token; concurrent callers share
   * one request. Only a rejected refresh token (revoked, or the account was
   * disabled) ends the session; a network error leaves it intact.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return throwError(() => new Error(t('auth.no_refresh_token')));
    this.refreshInFlight = this.http
      .post<TokenPair>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken })
      .pipe(
        map((response) => {
          this.storeTokens(response);
          return response.accessToken;
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 400)) this.endSession();
          return throwError(() => error);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  async login(username: string, password: string): Promise<SessionUser> {
    const response = await firstValueFrom(
      this.http.post<LoginApiResponse>(`${environment.apiBaseUrl}/auth/login`, { username, password }),
    );
    if ('requiresPasswordChange' in response) throw new PasswordChangeRequiredError();
    return this.applyTokens(response);
  }

  /** Completes the forced first-login flow (see AuthController.changeTemporaryPassword) and signs the user straight in. */
  async changeTemporaryPassword(username: string, currentPassword: string, newPassword: string): Promise<SessionUser> {
    const response = await firstValueFrom(
      this.http.post<TokenPair>(`${environment.apiBaseUrl}/auth/change-temporary-password`, {
        username,
        currentPassword,
        newPassword,
      }),
    );
    return this.applyTokens(response);
  }

  /** Registration step 1 (and "Resend code"): emails a one-time code to the address being registered. */
  sendRegistrationOtp(email: string): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    return firstValueFrom(
      this.http.post<{ expiresInSeconds: number; resendAfterSeconds: number }>(
        `${environment.apiBaseUrl}/auth/register/send-otp`,
        { email },
      ),
    );
  }

  /** "Forgot password?" step 1 (and "Resend code"): emails a reset code if the address has an account. */
  sendPasswordResetCode(email: string): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    return firstValueFrom(
      this.http.post<{ expiresInSeconds: number; resendAfterSeconds: number }>(
        `${environment.apiBaseUrl}/auth/forgot-password/send-otp`,
        { email },
      ),
    );
  }

  /** "Forgot password?" step 2: sets the new password with the emailed code and signs the user in. */
  async resetPassword(email: string, otp: string, newPassword: string): Promise<SessionUser> {
    const response = await firstValueFrom(
      this.http.post<TokenPair>(`${environment.apiBaseUrl}/auth/forgot-password/reset`, { email, otp, newPassword }),
    );
    return this.applyTokens(response);
  }

  /** Registers a new shop and its owner's account once the emailed code checks out (see AuthController.register), and signs them straight in. */
  async registerShop(details: RegisterShopRequest): Promise<SessionUser> {
    const response = await firstValueFrom(
      this.http.post<TokenPair>(`${environment.apiBaseUrl}/auth/register`, details),
    );
    return this.applyTokens(response);
  }

  private storeTokens(response: TokenPair): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
  }

  private clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  private applyTokens(response: TokenPair): SessionUser {
    this.storeTokens(response);
    const claims = decodeJwt(response.accessToken);
    const user = claims ? this.toSessionUser(claims) : null;
    if (!user) throw new Error(t('auth.login_succeeded_but_no_printsetu_role'));
    this.userSignal.set(user);
    return user;
  }

  /** Signing out is the only way a session ends: the refresh token is revoked in Keycloak too. */
  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      this.http.post(`${environment.apiBaseUrl}/auth/logout`, { refreshToken }).subscribe({ error: () => undefined });
    }
    this.endSession();
  }

  private endSession(): void {
    this.clearTokens();
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }
}
