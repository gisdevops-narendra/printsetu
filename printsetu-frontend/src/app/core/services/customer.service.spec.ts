import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CustomerService } from './customer.service';

const BASE = environment.apiBaseUrl;

describe('CustomerService (SRS §5.2/§8 no-login customer flow)', () => {
  let service: CustomerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CustomerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('resolveShop() GETs the public shop-resolution endpoint', () => {
    service.resolveShop('demoShopQR001').subscribe();
    const req = httpMock.expectOne(`${BASE}/public/shops/demoShopQR001`);
    expect(req.request.method).toBe('GET');
    req.flush({ shopCode: 'demoShopQR001', shopName: 'Demo', city: 'Ahmedabad' });
  });

  it('upload() POSTs a multipart form with shopCode and file, no status-token header', () => {
    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' });
    service.upload('demoShopQR001', file).subscribe();

    const req = httpMock.expectOne(`${BASE}/documents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('shopCode')).toBe('demoShopQR001');
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({});
  });

  it('documentDetails() sends the status token via the x-status-token header', () => {
    service.documentDetails('doc-1', 'token-abc').subscribe();
    const req = httpMock.expectOne(`${BASE}/documents/doc-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-status-token')).toBe('token-abc');
    req.flush({});
  });

  it('quote() POSTs the quote request with the status token', () => {
    service
      .quote(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 2 },
        'token-abc',
      )
      .subscribe();
    const req = httpMock.expectOne(`${BASE}/print/quote`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('x-status-token')).toBe('token-abc');
    expect(req.request.body).toEqual({
      documentId: 'doc-1',
      paperSize: 'A4',
      colorMode: 'BW',
      sideMode: 'SIMPLEX',
      copies: 2,
    });
    req.flush({});
  });

  it('confirm() POSTs the quoteId with the status token', () => {
    service.confirm('quote-1', 'token-abc').subscribe();
    const req = httpMock.expectOne(`${BASE}/print-jobs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quoteId: 'quote-1' });
    expect(req.request.headers.get('x-status-token')).toBe('token-abc');
    req.flush({});
  });

  it('status() GETs the print job with the status token', () => {
    service.status('job-1', 'token-abc').subscribe();
    const req = httpMock.expectOne(`${BASE}/print-jobs/job-1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-status-token')).toBe('token-abc');
    req.flush({});
  });
});
