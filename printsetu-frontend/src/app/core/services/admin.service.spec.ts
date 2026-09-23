import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminService } from './admin.service';

const BASE = environment.apiBaseUrl;

describe('AdminService (thin HTTP wrapper over SRS §17 admin endpoints)', () => {
  let service: AdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listShops() GETs with page/pageSize query params', () => {
    service.listShops(2, 25).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/admin/shops`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('25');
    req.flush({ items: [], total: 0 });
  });

  it('setShopStatus() PATCHes the status endpoint', () => {
    service.setShopStatus('shop-1', 'INACTIVE').subscribe();
    const req = httpMock.expectOne(`${BASE}/admin/shops/shop-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'INACTIVE' });
    req.flush({});
  });

  it('listUsers() omits the shopId param when not given, includes it when given', () => {
    service.listUsers().subscribe();
    const reqAll = httpMock.expectOne((r) => r.url === `${BASE}/admin/users`);
    expect(reqAll.request.params.has('shopId')).toBe(false);
    reqAll.flush([]);

    service.listUsers('shop-1').subscribe();
    const reqScoped = httpMock.expectOne((r) => r.url === `${BASE}/admin/users`);
    expect(reqScoped.request.params.get('shopId')).toBe('shop-1');
    reqScoped.flush([]);
  });

  it('getQr() GETs the QR code for a shop', () => {
    service.getQr('shop-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/admin/qr/shop-1`);
    expect(req.request.method).toBe('GET');
    req.flush({ dataUrl: '', url: '', code: 'abc' });
  });

  it('regenerateQr() POSTs to the regenerate endpoint', () => {
    service.regenerateQr('shop-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/admin/qr/shop-1/regenerate`);
    expect(req.request.method).toBe('POST');
    req.flush({ dataUrl: '', url: '', code: 'def' });
  });

  it('summary() GETs the dashboard summary', () => {
    service.summary().subscribe();
    const req = httpMock.expectOne(`${BASE}/admin/reports/summary`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('printHistory() includes shopId only when provided', () => {
    service.printHistory().subscribe();
    const reqAll = httpMock.expectOne((r) => r.url === `${BASE}/admin/print-history`);
    expect(reqAll.request.params.has('shopId')).toBe(false);
    reqAll.flush({ items: [], total: 0 });

    service.printHistory('shop-1').subscribe();
    const reqScoped = httpMock.expectOne((r) => r.url === `${BASE}/admin/print-history`);
    expect(reqScoped.request.params.get('shopId')).toBe('shop-1');
    reqScoped.flush({ items: [], total: 0 });
  });

  it('auditLogs() GETs with pagination params', () => {
    service.auditLogs(undefined, 3, 10).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/admin/audit-logs`);
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [], total: 0 });
  });
});
