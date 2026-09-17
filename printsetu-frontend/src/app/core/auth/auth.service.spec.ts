import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

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
    sessionStorage.clear();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('starts unauthenticated when sessionStorage is empty', () => {
    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('restores the session from a valid, unexpired token already in sessionStorage', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'shopkeeper.demo@printsetu.local',
      preferred_username: 'shopkeeper.demo',
      name: 'PrintSetu Shopkeeper',
      realm_access: { roles: ['SHOPKEEPER'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toEqual({
      email: 'shopkeeper.demo@printsetu.local',
      name: 'PrintSetu Shopkeeper',
      role: 'SHOPKEEPER',
    });
  });

  it('discards an expired token and clears storage on construction', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'x@y.com',
      preferred_username: 'x',
      realm_access: { roles: ['ADMIN'] },
      exp: Math.floor(Date.now() / 1000) - 60, // already expired
    });
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, 'refresh');

    const service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });

  it('treats a token with no ADMIN/SHOPKEEPER realm role as unauthenticated', () => {
    const token = makeJwt({
      sub: 'u1',
      email: 'x@y.com',
      preferred_username: 'x',
      realm_access: { roles: ['SOME_OTHER_ROLE'] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);

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
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe(accessToken);
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-token');
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

  it('logout() clears storage, resets the signal, and navigates to /login', () => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'whatever');
    sessionStorage.setItem(REFRESH_TOKEN_KEY, 'whatever');
    const service = TestBed.inject(AuthService);

    service.logout();

    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('getAccessToken() returns whatever is currently in sessionStorage', () => {
    const service = TestBed.inject(AuthService);
    expect(service.getAccessToken()).toBeNull();
    sessionStorage.setItem(ACCESS_TOKEN_KEY, 'tok-123');
    expect(service.getAccessToken()).toBe('tok-123');
  });
});
