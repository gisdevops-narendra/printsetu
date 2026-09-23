import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor (SRS §18 bearer-token attachment)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceStub: { getAccessToken: jasmine.Spy; validAccessToken: jasmine.Spy; refreshAccessToken: jasmine.Spy };

  beforeEach(() => {
    authServiceStub = {
      getAccessToken: jasmine.createSpy('getAccessToken'),
      validAccessToken: jasmine.createSpy('validAccessToken'),
      refreshAccessToken: jasmine.createSpy('refreshAccessToken'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceStub },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches a Bearer token to requests targeting the API base URL', () => {
    authServiceStub.getAccessToken.and.returnValue('tok-abc');
    authServiceStub.validAccessToken.and.returnValue(of('tok-abc'));
    http.get(`${environment.apiBaseUrl}/admin/shops`).subscribe();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/admin/shops`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-abc');
    req.flush({});
  });

  it('does not attach a header when there is no stored token', () => {
    authServiceStub.getAccessToken.and.returnValue(null);
    http.get(`${environment.apiBaseUrl}/admin/shops`).subscribe();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/admin/shops`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('retries once with a fresh token when the API answers 401', () => {
    authServiceStub.getAccessToken.and.returnValue('tok-old');
    authServiceStub.validAccessToken.and.returnValue(of('tok-old'));
    authServiceStub.refreshAccessToken.and.returnValue(of('tok-new'));
    let body: unknown;
    http.get(`${environment.apiBaseUrl}/shop/profile`).subscribe((b) => (body = b));

    const first = httpMock.expectOne(`${environment.apiBaseUrl}/shop/profile`);
    expect(first.request.headers.get('Authorization')).toBe('Bearer tok-old');
    first.flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne(`${environment.apiBaseUrl}/shop/profile`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer tok-new');
    retry.flush({ ok: true });
    expect(body).toEqual({ ok: true });
  });

  it('never attaches a token to the /auth endpoints (refresh must not recurse)', () => {
    authServiceStub.getAccessToken.and.returnValue('tok-abc');
    http.post(`${environment.apiBaseUrl}/auth/refresh`, {}).subscribe();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(authServiceStub.validAccessToken).not.toHaveBeenCalled();
    req.flush({});
  });

  it('leaves requests to a different origin untouched (never leaks the token off-API)', () => {
    authServiceStub.getAccessToken.and.returnValue('tok-abc');
    http.get('https://some-other-service.example.com/data').subscribe();
    const req = httpMock.expectOne('https://some-other-service.example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
