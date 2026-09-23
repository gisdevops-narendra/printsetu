import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor (SRS §17.3 { code, message } -> toast)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let messageService: MessageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        MessageService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    messageService = TestBed.inject(MessageService);
  });

  afterEach(() => httpMock.verify());

  it('surfaces a backend { code, message } error body as a toast and rethrows', (done) => {
    spyOn(messageService, 'add');

    http.get('/api/print/quote').subscribe({
      error: (err) => {
        expect(messageService.add).toHaveBeenCalledWith({
          severity: 'error',
          summary: 'UNSUPPORTED_DOCUMENT',
          detail: 'File cannot be processed safely.',
          life: 6000,
        });
        expect(err.status).toBe(422);
        done();
      },
    });

    httpMock
      .expectOne('/api/print/quote')
      .flush(
        { code: 'UNSUPPORTED_DOCUMENT', message: 'File cannot be processed safely.' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
  });

  it('falls back to a generic "Error <status>" summary when the body has no code', (done) => {
    spyOn(messageService, 'add');

    http.get('/api/whatever').subscribe({
      error: () => {
        expect(messageService.add).toHaveBeenCalledWith(
          jasmine.objectContaining({ severity: 'error', summary: 'Error 500' }),
        );
        done();
      },
    });

    httpMock
      .expectOne('/api/whatever')
      .flush('server exploded', { status: 500, statusText: 'Server Error' });
  });

  it('does not show an "Unauthenticated" toast for a 401 (the session is renewed or ended quietly)', (done) => {
    spyOn(messageService, 'add');
    http.get('/api/shop/profile').subscribe({
      error: (err) => {
        expect(err.status).toBe(401);
        expect(messageService.add).not.toHaveBeenCalled();
        done();
      },
    });
    httpMock
      .expectOne('/api/shop/profile')
      .flush({ code: 'UNAUTHENTICATED', message: 'Missing or invalid authentication.' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('does not touch a successful response', (done) => {
    spyOn(messageService, 'add');
    http.get('/api/ok').subscribe(() => {
      expect(messageService.add).not.toHaveBeenCalled();
      done();
    });
    httpMock.expectOne('/api/ok').flush({ ok: true });
  });
});
