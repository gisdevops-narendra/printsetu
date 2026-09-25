import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { provideEnglishTranslations } from '../../../testing/english-translations';

const ACCESS_TOKEN_KEY = 'printsetu.accessToken';
const REFRESH_TOKEN_KEY = 'printsetu.refreshToken';

// UTF-8-safe base64url encode, matching the scheme jwt.util.ts's decodeJwt() expects.
function base64url(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(payload: object): string {
  return `${base64url({ alg: 'RS256' })}.${base64url(payload)}.sig`;
}

describe('AuthService (SRS §18 token storage/session)', () => {
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        provideEnglishTranslations(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts unauthenticated when storage is empty', () => {
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('restores the session from a valid, unexpired token already in localStorage', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'shopkeeper.demo@printsetu.local',
      preferred_username: 'shopkeeper.demo',
      name: 'PrintSetu Shopkeeper',
      realm_access: { roles: ['SHOPKEEPER'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    localStorage.setItem(ACCESS_TOKEN_KEY, token);

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual({
      email: 'shopkeeper.demo@printsetu.local',
      name: 'PrintSetu Shopkeeper',
      role: 'SHOPKEEPER',
    });
  });

  const expiredToken = () =>
    makeJwt({
      sub: 'u1',
      email: 'x@y.com',
      preferred_username: 'x',
      realm_access: { roles: ['ADMIN'] },
      exp: Math.floor(Date.now() / 1000) - 60, // already expired
    });

  it('keeps the user signed in with an expired access token while a refresh token exists', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
  });

  it('discards an expired token that has no refresh token to renew it', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('carries over a session stored by an older build in sessionStorage', () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
  });

  it('validAccessToken() renews an expiring token before use, sharing one refresh between callers', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');
    const service = TestBed.inject(AuthService);
    const fresh = makeJwt({ sub: 'u1', email: 'x@y.com', preferred_username: 'x', realm_access: { roles: ['ADMIN'] }, exp: Math.floor(Date.now() / 1000) + 900 });

    const first = firstValueFrom(service.validAccessToken());
    const second = firstValueFrom(service.validAccessToken());
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
    expect(req.request.body).toEqual({ refreshToken: 'refresh' });
    req.flush({ accessToken: fresh, refreshToken: 'refresh-2' });

    expect(await first).toBe(fresh);
    expect(await second).toBe(fresh);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-2');
  });

  it('ends the session only when the refresh token itself is rejected', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    localStorage.setItem(REFRESH_TOKEN_KEY, 'revoked');
    const service = TestBed.inject(AuthService);

    const attempt = firstValueFrom(service.refreshAccessToken());
    httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`).flush({}, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(attempt).toBeRejected();
    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('keeps the session when a refresh fails for a network reason', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');
    const service = TestBed.inject(AuthService);

    const attempt = firstValueFrom(service.refreshAccessToken());
    httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`).error(new ProgressEvent('offline'), { status: 0 });

    await expectAsync(attempt).toBeRejected();
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh');
  });

  it('treats a token with no ADMIN/SHOPKEEPER realm role as unauthenticated', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'x@y.com',
      preferred_username: 'x',
      realm_access: { roles: ['SOME_OTHER_ROLE'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    localStorage.setItem(ACCESS_TOKEN_KEY, token);

    const service = TestBed.inject(AuthService);
    expect(service.user()).toBeNull();
  });

  it('login() POSTs credentials, stores tokens, and updates the session signal', async () => {
    const service = TestBed.inject(AuthService);
    const accessToken = makeJwt({
      sub: 'u1',
      email: 'admin.demo@printsetu.local',
      preferred_username: 'admin.demo',
      name: 'PrintSetu Admin',
      realm_access: { roles: ['ADMIN'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const loginPromise = service.login('admin.demo@printsetu.local', 'Admin@12345');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'admin.demo@printsetu.local',
      password: 'Admin@12345',
    });
    req.flush({ accessToken, refreshToken: 'refresh-token' });

    const user = await loginPromise;
    expect(user.role).toBe('ADMIN');
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(accessToken);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-token');
  });

  it('registerShop() POSTs the registration and signs the new shopkeeper in', async () => {
    const service = TestBed.inject(AuthService);
    const accessToken = makeJwt({
      sub: 'u2',
      email: 'owner@shop.com',
      preferred_username: 'owner@shop.com',
      name: 'Shop Owner',
      realm_access: { roles: ['SHOPKEEPER'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const details = {
      shopName: 'Sai Xerox',
      ownerName: 'Shop Owner',
      mobile: '9000000000',
      email: 'owner@shop.com',
      address: 'Main Road',
      city: 'Surat',
      password: 'StrongPass123',
      otp: '123456',
    };

    const registerPromise = service.registerShop(details);

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(details);
    req.flush({ accessToken, refreshToken: 'refresh-token', shopId: 'shop-1' });

    const user = await registerPromise;
    expect(user.role).toBe('SHOPKEEPER');
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(accessToken);
  });

  it('sendRegistrationOtp() asks the server to email a code to the address', async () => {
    const service = TestBed.inject(AuthService);

    const sendPromise = service.sendRegistrationOtp('owner@shop.com');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/register/send-otp`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'owner@shop.com' });
    req.flush({ expiresInSeconds: 600, resendAfterSeconds: 60 });

    expect(await sendPromise).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
  });

  it('sendPasswordResetCode() asks the server to email a reset code', async () => {
    const service = TestBed.inject(AuthService);

    const sendPromise = service.sendPasswordResetCode('owner@shop.com');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/forgot-password/send-otp`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'owner@shop.com' });
    req.flush({ expiresInSeconds: 600, resendAfterSeconds: 60 });

    expect(await sendPromise).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
  });

  it('resetPassword() sends the code + new password and signs the user in', async () => {
    const service = TestBed.inject(AuthService);
    const accessToken = makeJwt({
      sub: 'u2',
      email: 'owner@shop.com',
      preferred_username: 'owner@shop.com',
      name: 'Shop Owner',
      realm_access: { roles: ['SHOPKEEPER'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const resetPromise = service.resetPassword('owner@shop.com', '123456', 'NewStrong123');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/forgot-password/reset`);
    expect(req.request.body).toEqual({ email: 'owner@shop.com', otp: '123456', newPassword: 'NewStrong123' });
    req.flush({ accessToken, refreshToken: 'refresh-token' });

    const user = await resetPromise;
    expect(user.role).toBe('SHOPKEEPER');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('login() rejects when the returned token carries no recognized role', async () => {
    const service = TestBed.inject(AuthService);
    const accessToken = makeJwt({
      sub: 'u1',
      email: 'x@y.com',
      preferred_username: 'x',
      realm_access: { roles: [] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const loginPromise = service.login('x@y.com', 'pw');
    httpMock
      .expectOne(`${environment.apiBaseUrl}/auth/login`)
      .flush({ accessToken, refreshToken: 'r' });

    await expectAsync(loginPromise).toBeRejectedWithError(/no PrintSetu role/);
  });

  it('logout() revokes the refresh token, clears storage, resets the signal, and navigates to /login', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, expiredToken());
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-to-revoke');
    const service = TestBed.inject(AuthService);

    service.logout();
    const revoke = httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`);
    expect(revoke.request.body).toEqual({ refreshToken: 'refresh-to-revoke' });
    revoke.flush(null, { status: 204, statusText: 'No Content' });

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('getAccessToken() returns whatever is currently in localStorage', () => {
    const service = TestBed.inject(AuthService);
    expect(service.getAccessToken()).toBeNull();
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok-123');
    expect(service.getAccessToken()).toBe('tok-123');
  });
});
