import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { errorInterceptor } from './error.interceptor';
import { provideEnglishTranslations } from '../../../testing/english-translations';

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
        provideEnglishTranslations(),
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
          summary: "Can't use this file",
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

  it('falls back to a plain summary and detail when the body has no code', (done) => {
    spyOn(messageService, 'add');

    http.get('/api/whatever').subscribe({
      error: () => {
        expect(messageService.add).toHaveBeenCalledWith(
          jasmine.objectContaining({
            severity: 'error',
            summary: 'Something went wrong',
            detail: 'Please try again in a moment.',
          }),
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

  it('leaves an unknown shop code to the customer page, which shows its own message', (done) => {
    spyOn(messageService, 'add');
    http.get('/api/public/shops/doesnotexist').subscribe({
      error: (err) => {
        expect(err.status).toBe(404);
        expect(messageService.add).not.toHaveBeenCalled();
        done();
      },
    });
    httpMock
      .expectOne('/api/public/shops/doesnotexist')
      .flush({ code: 'NOT_FOUND', message: 'This QR code is not active.' }, { status: 404, statusText: 'Not Found' });
  });

  it('explains a lost connection instead of showing the raw HTTP failure', (done) => {
    spyOn(messageService, 'add');
    http.get('/api/offline').subscribe({
      error: () => {
        expect(messageService.add).toHaveBeenCalledWith(
          jasmine.objectContaining({
            summary: 'No internet connection',
            detail: "Can't reach PrintSetu. Check your internet connection and try again.",
          }),
        );
        done();
      },
    });
    httpMock.expectOne('/api/offline').error(new ProgressEvent('error'), { status: 0 });
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
