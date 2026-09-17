import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DecodedAccessToken, decodeJwt } from './jwt.util';
import { RoleName } from '../models/models';

export interface SessionUser {
  email: string;
  name: string;
  role: RoleName;
}

const ACCESS_TOKEN_KEY = 'printsetu.accessToken';
const REFRESH_TOKEN_KEY = 'printsetu.refreshToken';

/**
 * SRS §18: "Keycloak-issued OAuth2/OIDC tokens ... secure token storage
 * and short access-token lifetime." Tokens live in sessionStorage (not
 * localStorage) so they never persist past the browser tab/session, and
 * the backend enforces the actual expiry — this service just carries the
 * token to each request via AuthInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly userSignal = signal<SessionUser | null>(this.restoreUser());
  readonly user = computed(() => this.userSignal());
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  private restoreUser(): SessionUser | null {
    const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const claims = decodeJwt(token);
    if (!claims || claims.exp * 1000 < Date.now()) {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
      return null;
    }
    return this.toSessionUser(claims);
  }

  private toSessionUser(claims: DecodedAccessToken): SessionUser | null {
    const role = claims.realm_access?.roles.find((r) => r === 'ADMIN' || r === 'SHOPKEEPER') as
      | RoleName
      | undefined;
    if (!role) return null;
    return { email: claims.email, name: claims.name || claims.preferred_username, role };
  }

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  async login(username: string, password: string): Promise<SessionUser> {
    const response = await firstValueFrom(
      this.http.post<{ accessToken: string; refreshToken: string }>(`${environment.apiBaseUrl}/auth/login`, {
        username,
        password,
      }),
    );
    sessionStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    const claims = decodeJwt(response.accessToken);
    const user = claims ? this.toSessionUser(claims) : null;
    if (!user) throw new Error('Login succeeded but no PrintSetu role was found on this account.');
    this.userSignal.set(user);
    return user;
  }

  logout(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }
}
