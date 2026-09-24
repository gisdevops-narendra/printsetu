import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  discardPeriodicTasks,
} from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { providePrimeNG } from 'primeng/config';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { OrderFlowComponent } from './order-flow.component';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentInfo, QuoteResponse, UploadResponse } from '../../core/models/models';

describe('OrderFlowComponent (customer QR -> upload & options -> review -> done/status; multi-document + reload-resilience)', () => {
  let fixture: ComponentFixture<OrderFlowComponent>;
  let component: OrderFlowComponent;
  let customerService: jasmine.SpyObj<CustomerService>;

  const uploadResponse: UploadResponse = {
    documentId: 'doc-1',
    sessionId: 'session-1',
    sessionToken: 'session-token',
    originalName: 'resume.pdf',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    pageCount: null,
    colorPages: null,
    colorDetectionConfidence: null,
    status: 'UPLOADED',
  };

  const quote = (overrides: Partial<QuoteResponse> = {}): QuoteResponse => ({
    quoteId: 'q1',
    items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }],
    amount: '4.00',
    priced: true,
    currency: 'INR',
    expiresAt: '',
    ...overrides,
  });

  const processedDoc = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'doc-1',
      originalName: 'resume.pdf',
      mimeType: 'application/pdf',
      status: 'PROCESSED',
      pageCount: 2,
      colorPages: 0,
      ...overrides,
    }) as unknown as DocumentInfo;

  /** What a file <input> change event looks like to onFilesChosen. */
  function chooseFiles(...files: File[]): void {
    const input = { files: files.length ? files : [new File(['x'], 'resume.pdf', { type: 'application/pdf' })], value: 'C:\\fakepath\\x' };
    component.onFilesChosen({ target: input } as unknown as Event);
  }

  function resolveShopWith(extra: Record<string, unknown> = {}): void {
    customerService.resolveShop.and.returnValue(
      of({ shopCode: 'demoShopQR001', shopName: 'PrintSetu Demo Shop', city: 'Ahmedabad', available: true, unavailableMessage: null, ...extra }),
    );
  }

  beforeEach(async () => {
    localStorage.clear();
    customerService = jasmine.createSpyObj<CustomerService>('CustomerService', [
      'resolveShop',
      'upload',
      'documentDetails',
      'sessionDocuments',
      'quote',
      'confirm',
      'status',
    ]);
    resolveShopWith();

    await TestBed.configureTestingModule({
      imports: [OrderFlowComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideRouter([]),
        provideTranslateService(),
        providePrimeNG(),
        MessageService,
        ConfirmationService,
        { provide: CustomerService, useValue: customerService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'demoShopQR001' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrderFlowComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    // Several tests start interval polling that never reaches a final status.
    component.ngOnDestroy();
    localStorage.clear();
  });

  it('resolves the shop on init and shows the upload step', () => {
    fixture.detectChanges();
    expect(component.shopName()).toBe('PrintSetu Demo Shop');
    expect(component.resolvingShop()).toBe(false);
    expect(component.currentStep()).toBe(0);
  });

  it('shows a friendly error when the QR code does not resolve', () => {
    customerService.resolveShop.and.returnValue(throwError(() => new Error('not found')));
    fixture.detectChanges();
    expect(component.shopError()).toContain('invalid');
    expect(component.resolvingShop()).toBe(false);
  });

  it('shows the shop as unavailable and does not restore anything when it is not taking orders', () => {
    resolveShopWith({ available: false, unavailableMessage: 'This shop is temporarily unavailable.' });
    localStorage.setItem('printsetu.order.demoShopQR001', JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token' }));
    fixture.detectChanges();
    expect(component.shopUnavailable()).toBeTruthy();
    expect(customerService.sessionDocuments).not.toHaveBeenCalled();
  });

  describe('multi-document upload -> analysis polling -> pricing', () => {
    beforeEach(() => fixture.detectChanges());

    it('uploads a file, storing the session and adding it to the list without leaving the upload step', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(of([{ ...processedDoc(), status: 'UPLOADED' } as DocumentInfo]));

      chooseFiles();
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.sessionId()).toBe('session-1');
      expect(component.uploads().length).toBe(1);
      expect(component.uploads()[0].status).toBe('UPLOADED');
      expect(component.currentStep()).toBe(0);
      expect(component.canContinue()).toBe(false);
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toContain('session-1');

      discardPeriodicTasks();
    }));

    it('uploads a second file reusing the session id from the first, with the same defaults (A4, B&W, double-sided)', fakeAsync(() => {
      customerService.upload.and.returnValues(
        of(uploadResponse),
        of({ ...uploadResponse, documentId: 'doc-2', originalName: 'photo.jpg', mimeType: 'image/jpeg' }),
      );
      customerService.sessionDocuments.and.returnValue(of([]));

      const files = [
        new File(['x'], 'resume.pdf', { type: 'application/pdf' }),
        new File(['y'], 'photo.jpg', { type: 'image/jpeg' }),
      ];
      chooseFiles(...files);
      tick();

      expect(customerService.upload).toHaveBeenCalledWith('demoShopQR001', files[0], undefined);
      expect(customerService.upload).toHaveBeenCalledWith('demoShopQR001', files[1], 'session-1');
      expect(component.uploads().length).toBe(2);
      expect(component.uploads()[1].options).toEqual({ paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX', copies: 1 });

      discardPeriodicTasks();
    }));

    it('rejects files other than PDF, JPG or PNG without uploading them', fakeAsync(() => {
      chooseFiles(new File(['x'], 'notes.docx'));
      tick();
      expect(customerService.upload).not.toHaveBeenCalled();
      expect(component.uploadError()).toBeTruthy();
    }));

    it('merges polled document status and prices the files once analysed', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(of([processedDoc({ pageCount: 3 })]));
      customerService.quote.and.returnValue(of(quote()));

      chooseFiles();
      tick();
      expect(component.canContinue()).toBe(false); // upload response itself is still UPLOADED

      tick(2000); // first document-status poll
      expect(component.uploads()[0].status).toBe('PROCESSED');
      expect(customerService.quote).toHaveBeenCalledWith(
        [{ documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX', copies: 1 }],
        'session-token',
      );
      expect(component.canContinue()).toBe(true);

      discardPeriodicTasks();
    }));

    it('marks a document ANALYSIS_FAILED inline and does not allow continuing with it', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(of([processedDoc({ status: 'ANALYSIS_FAILED' })]));

      chooseFiles();
      tick();
      tick(2000);

      expect(component.uploads()[0].status).toBe('ANALYSIS_FAILED');
      expect(component.canContinue()).toBe(false);

      discardPeriodicTasks();
    }));

    it('records a per-file error and continues when one upload fails', fakeAsync(() => {
      customerService.upload.and.returnValue(throwError(() => new Error('upload failed')));

      chooseFiles();
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.uploadError()).toBeTruthy();
      expect(component.uploads().length).toBe(0);
    }));

    it('ignores a change event with no file selected', fakeAsync(() => {
      component.onFilesChosen({ target: { files: [], value: '' } } as unknown as Event);
      tick();
      expect(customerService.upload).not.toHaveBeenCalled();
    }));
  });

  it('defaults to single-sided when the shop only prices single-sided for A4 B&W', fakeAsync(() => {
    resolveShopWith({ pricingEnabled: true, pricedOptions: [{ paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX' }] });
    fixture.detectChanges();
    customerService.upload.and.returnValue(of(uploadResponse));
    customerService.sessionDocuments.and.returnValue(of([]));

    chooseFiles();
    tick();

    expect(component.uploads()[0].options.sideMode).toBe('SIMPLEX');
    discardPeriodicTasks();
  }));

  it('switches sides when the chosen colour is only offered on the other side', fakeAsync(() => {
    resolveShopWith({
      pricingEnabled: true,
      pricedOptions: [
        { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX' },
        { paperSize: 'A4', colorMode: 'BW', sideMode: 'DUPLEX' },
        { paperSize: 'A4', colorMode: 'COLOR', sideMode: 'SIMPLEX' },
      ],
    });
    fixture.detectChanges();
    customerService.upload.and.returnValue(of(uploadResponse));
    customerService.sessionDocuments.and.returnValue(of([]));
    customerService.quote.and.returnValue(of(quote()));
    chooseFiles();
    tick();
    const doc = component.uploads()[0];
    expect(doc.options.sideMode).toBe('DUPLEX');

    component.setOption(doc, 'colorMode', 'COLOR');
    expect(doc.options.sideMode).toBe('SIMPLEX');

    component.setOption(doc, 'colorMode', 'BW');
    expect(doc.options.sideMode).toBe('SIMPLEX'); // still offered, so the customer's side choice stays
    tick(250);
    discardPeriodicTasks();
  }));

  describe('options -> quote -> review -> confirm -> status polling', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.uploads.set([
        {
          documentId: 'doc-1',
          originalName: 'resume.pdf',
          mimeType: 'application/pdf',
          pageCount: 2,
          colorPages: 0,
          status: 'PROCESSED',
          options: { paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        },
      ]);
      component.sessionId.set('session-1');
      (component as any).sessionToken = 'session-token';
    });

    it('recalculate() builds one quote item per processed document', () => {
      customerService.quote.and.returnValue(of(quote()));
      component.recalculate();
      expect(customerService.quote).toHaveBeenCalledWith(
        [{ documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 }],
        'session-token',
      );
      expect(component.quote()?.amount).toBe('4.00');
      expect(component.quoting()).toBe(false);
      expect(component.showPrices()).toBe(true);
    });

    it('hides prices when the shop has pricing off', () => {
      customerService.quote.and.returnValue(of(quote({ priced: false, amount: '0.00' })));
      component.recalculate();
      expect(component.showPrices()).toBe(false);
    });

    it('changing an option re-prices once the taps settle', fakeAsync(() => {
      customerService.quote.and.returnValue(of(quote()));
      const doc = component.uploads()[0];
      component.setOption(doc, 'colorMode', 'COLOR');
      component.stepCopies(doc, 1);
      expect(component.quoting()).toBe(true);
      tick(250);
      expect(customerService.quote).toHaveBeenCalledTimes(1);
      expect(customerService.quote.calls.mostRecent().args[0][0]).toEqual(
        jasmine.objectContaining({ colorMode: 'COLOR', copies: 2 }),
      );
    }));

    it('drops the old quote when re-pricing fails, so the customer cannot confirm options they no longer see', fakeAsync(() => {
      customerService.quote.and.returnValue(of(quote()));
      component.recalculate();
      expect(component.canContinue()).toBe(true);

      customerService.quote.and.returnValue(throwError(() => new Error('not offered')));
      component.setOption(component.uploads()[0], 'paperSize', 'A3');
      tick(250);

      expect(component.quote()).toBeNull();
      expect(component.quoting()).toBe(false);
      expect(component.canContinue()).toBe(false);
      component.goToReview();
      expect(component.currentStep()).toBe(0);
    }));

    it('keeps copies between 1 and 999', () => {
      const doc = component.uploads()[0];
      component.stepCopies(doc, -1);
      expect(doc.options.copies).toBe(1);
      const input = { value: '5000' } as HTMLInputElement;
      component.setCopies(doc, input);
      expect(doc.options.copies).toBe(999);
      expect(input.value).toBe('999');
    });

    it('only moves to review once a quote is in, and back again', () => {
      component.goToReview();
      expect(component.currentStep()).toBe(0);
      customerService.quote.and.returnValue(of(quote()));
      component.recalculate();
      component.goToReview();
      expect(component.currentStep()).toBe(1);
      expect(component.reviewLines().length).toBe(1);
      component.goBack();
      expect(component.currentStep()).toBe(0);
    });

    it('confirm() moves to the done step, stores the order number and starts polling', fakeAsync(() => {
      component.quote.set(quote());
      customerService.confirm.and.returnValue(
        of({ jobId: 'job-1', tokenNumber: 42, status: 'PRINT_ELIGIBLE', statusToken: 'job-token', amount: '4.00', currency: 'INR' }),
      );
      customerService.status.and.returnValue(of({ status: 'PRINT_ELIGIBLE' } as any));

      component.confirm();

      expect(component.currentStep()).toBe(2);
      expect(component.jobId()).toBe('job-1');
      expect(component.tokenNumber()).toBe(42);
      expect(component.jobStatus()?.status).toBe('PRINT_ELIGIBLE');
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toContain('job-1');

      discardPeriodicTasks();
    }));

    it('stops polling and clears saved state once the order is printed', fakeAsync(() => {
      component.quote.set(quote());
      customerService.confirm.and.returnValue(
        of({ jobId: 'job-1', tokenNumber: 42, status: 'PRINT_ELIGIBLE', statusToken: 'job-token', amount: '4.00', currency: 'INR' }),
      );
      let call = 0;
      const statuses = ['PRINT_ELIGIBLE', 'QUEUED', 'PRINTED'];
      customerService.status.and.callFake(() => of({ status: statuses[Math.min(call++, statuses.length - 1)] } as any));

      component.confirm();
      expect(component.jobStatus()?.status).toBe('PRINT_ELIGIBLE');
      tick(4000);
      expect(component.jobStatus()?.status).toBe('QUEUED');
      tick(4000);
      expect(component.jobStatus()?.status).toBe('PRINTED');
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();

      const callsAtTerminal = customerService.status.calls.count();
      tick(4000);
      expect(customerService.status.calls.count()).toBe(callsAtTerminal);
    }));

    it('keeps following a failed order, so a reprint by the shop shows up as printed', fakeAsync(() => {
      component.quote.set(quote());
      customerService.confirm.and.returnValue(
        of({ jobId: 'job-1', tokenNumber: 42, status: 'PRINT_ELIGIBLE', statusToken: 'job-token', amount: '4.00', currency: 'INR' }),
      );
      let call = 0;
      const statuses = ['PRINT_FAILED', 'QUEUED', 'PRINTED'];
      customerService.status.and.callFake(() => of({ status: statuses[Math.min(call++, statuses.length - 1)] } as any));

      component.confirm();
      expect(component.jobStatus()?.status).toBe('PRINT_FAILED');
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toContain('job-1');
      tick(8000);
      expect(component.jobStatus()?.status).toBe('PRINTED');
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();
    }));

    it('confirm() resets the confirming flag on failure without advancing', () => {
      component.quote.set(quote());
      customerService.confirm.and.returnValue(throwError(() => new Error('quote expired')));
      component.confirm();
      expect(component.confirming()).toBe(false);
      expect(component.currentStep()).toBe(0);
    });

    it('confirm() does nothing when there is no quote yet', () => {
      component.confirm();
      expect(customerService.confirm).not.toHaveBeenCalled();
    });
  });

  describe('reload-resilience', () => {
    it('restores an in-progress upload session and prices the processed files', () => {
      localStorage.setItem('printsetu.order.demoShopQR001', JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token' }));
      customerService.sessionDocuments.and.returnValue(of([processedDoc()]));
      customerService.quote.and.returnValue(of(quote()));

      fixture.detectChanges();

      expect(customerService.sessionDocuments).toHaveBeenCalledWith('session-1', 'session-token');
      expect(component.sessionId()).toBe('session-1');
      expect(component.uploads().length).toBe(1);
      expect(component.currentStep()).toBe(0);
      expect(component.canContinue()).toBe(true);
    });

    it('forgets a saved session whose documents are gone', () => {
      localStorage.setItem('printsetu.order.demoShopQR001', JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token' }));
      customerService.sessionDocuments.and.returnValue(of([]));
      fixture.detectChanges();
      expect(component.sessionId()).toBeNull();
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();
    });

    it('restores a still-pending order straight to the done step', fakeAsync(() => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token', jobId: 'job-1', jobStatusToken: 'job-token', tokenNumber: 42 }),
      );
      customerService.status.and.returnValue(of({ status: 'QUEUED' } as any));

      fixture.detectChanges();

      expect(customerService.status).toHaveBeenCalledWith('job-1', 'job-token');
      expect(component.currentStep()).toBe(2);
      expect(component.tokenNumber()).toBe(42);
      expect(component.jobStatus()?.status).toBe('QUEUED');

      discardPeriodicTasks();
    }));

    it('clears saved state and starts fresh when the restored order is already printed', () => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token', jobId: 'job-1', jobStatusToken: 'job-token' }),
      );
      customerService.status.and.returnValue(of({ status: 'PRINTED' } as any));

      fixture.detectChanges();

      expect(component.currentStep()).toBe(0);
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();
    });

    it('startNewOrder() lets a customer drop a restored order and upload something else', fakeAsync(() => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token', jobId: 'job-1', jobStatusToken: 'job-token', tokenNumber: 42 }),
      );
      customerService.status.and.returnValue(of({ status: 'QUEUED' } as any));
      fixture.detectChanges();
      expect(component.currentStep()).toBe(2);

      component.startNewOrder();

      expect(component.currentStep()).toBe(0);
      expect(component.sessionId()).toBeNull();
      expect(component.jobId()).toBeNull();
      expect(component.tokenNumber()).toBeNull();
      expect(component.uploads()).toEqual([]);
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();

      discardPeriodicTasks();
    }));
  });

  it('ngOnDestroy() clears any running poll intervals', fakeAsync(() => {
    fixture.detectChanges();
    customerService.upload.and.returnValue(of(uploadResponse));
    customerService.sessionDocuments.and.returnValue(of([processedDoc({ status: 'PROCESSING' })]));

    chooseFiles();
    tick();

    fixture.destroy();
    tick(10_000); // an interval left running would fail fakeAsync with pending timers
  }));
});
