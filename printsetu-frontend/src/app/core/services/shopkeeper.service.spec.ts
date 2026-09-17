import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ShopkeeperService } from './shopkeeper.service';

const BASE = environment.apiBaseUrl;

describe('ShopkeeperService (SRS §7 shopkeeper module)', () => {
  let service: ShopkeeperService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShopkeeperService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('profile() GETs the shop profile', () => {
    service.profile().subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/profile`);
    expect(req.request.method).toBe('GET');
    req.flush({ shop: {} });
  });

  it('queue() GETs the pending print-job queue', () => {
    service.queue().subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/print-jobs`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('print() POSTs to trigger printing for a job (SRS §17.2)', () => {
    service.print('job-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/print-jobs/job-1/print`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ jobId: 'job-1', status: 'QUEUED', printerId: 'p1', message: 'Print job queued' });
  });

  it('reconcile() POSTs the outcome for a PRINT_UNKNOWN job', () => {
    service.reconcile('job-1', 'PRINTED', 'Confirmed with customer').subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/print-jobs/job-1/reconcile`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ outcome: 'PRINTED', message: 'Confirmed with customer' });
    req.flush({ jobId: 'job-1', status: 'PRINTED' });
  });

  it('previewUrl() GETs the signed preview URL for a document', () => {
    service.previewUrl('doc-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/documents/doc-1/preview-url`);
    expect(req.request.method).toBe('GET');
    req.flush({ url: 'https://signed', expiresInSeconds: 120 });
  });

  it('notifications() GETs the in-app notification feed with pagination params (SRS §20)', () => {
    service.notifications(2, 20).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${BASE}/shop/notifications`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [], total: 0, page: 2, pageSize: 20 });
  });

  it('listPricing() GETs the shop\'s own active pricing (SRS §10)', () => {
    service.listPricing().subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/pricing`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listPricingHistory() GETs the shop\'s own pricing history', () => {
    service.listPricingHistory().subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/pricing/history`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('setPricing() POSTs a new rate for the shop\'s own pricing', () => {
    const dto = { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', pricePerPage: 2 };
    service.setPricing(dto).subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/pricing`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({});
  });

  it('deletePricing() DELETEs the rate by id', () => {
    service.deletePricing('rate-1').subscribe();
    const req = httpMock.expectOne(`${BASE}/shop/pricing/rate-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
