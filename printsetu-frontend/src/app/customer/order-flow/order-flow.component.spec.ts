import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  discardPeriodicTasks,
} from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { FileUpload } from 'primeng/fileupload';
import { OrderFlowComponent } from './order-flow.component';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentInfo, UploadResponse } from '../../core/models/models';

describe('OrderFlowComponent (SRS §5/§8/§9 customer QR -> upload -> options -> confirm -> status; multi-document + reload-resilience extension)', () => {
  let fixture: ComponentFixture<OrderFlowComponent>;
  let component: OrderFlowComponent;
  let customerService: jasmine.SpyObj<CustomerService>;
  const fuStub = { clear: () => undefined } as unknown as FileUpload;

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

  function fileEvent(...files: File[]): any {
    return { files: files.length ? files : [new File(['x'], 'resume.pdf', { type: 'application/pdf' })] };
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
    customerService.resolveShop.and.returnValue(
      of({ shopCode: 'demoShopQR001', shopName: 'PrintSetu Demo Shop', city: 'Ahmedabad' }),
    );

    await TestBed.configureTestingModule({
      imports: [OrderFlowComponent],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        MessageService,
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
    // Defensive cleanup: several tests start setInterval-based polling and
    // don't reach a terminal status, so make sure no interval survives to
    // fire against a later test's (differently configured) spies.
    component.ngOnDestroy();
    localStorage.clear();
  });

  it('resolves the shop on init and renders step 0', () => {
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

  describe('multi-document upload -> async analysis polling (SRS §9 pipeline, extended to N documents)', () => {
    beforeEach(() => {
      fixture.detectChanges(); // resolves shop
    });

    it('uploads a file, storing the session and adding it to the upload list without jumping to Options', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(of([{ ...uploadResponse, id: 'doc-1' } as unknown as DocumentInfo]));

      component.onFilesSelected(fileEvent(), fuStub);
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.sessionId()).toBe('session-1');
      expect(component.uploads().length).toBe(1);
      expect(component.uploads()[0].status).toBe('UPLOADED');
      expect(component.currentStep()).toBe(0); // still on Upload, not Options
      expect(component.canContinueToOptions()).toBe(false);

      discardPeriodicTasks(); // still UPLOADED -> analysis polling is running
    }));

    it('uploads a second file reusing the session id from the first', fakeAsync(() => {
      customerService.upload.and.returnValues(
        of(uploadResponse),
        of({ ...uploadResponse, documentId: 'doc-2', originalName: 'photo.jpg', mimeType: 'image/jpeg' }),
      );
      customerService.sessionDocuments.and.returnValue(of([{ ...uploadResponse, id: 'doc-1' } as unknown as DocumentInfo]));

      const files = [
        new File(['x'], 'resume.pdf', { type: 'application/pdf' }),
        new File(['y'], 'photo.jpg', { type: 'image/jpeg' }),
      ];
      component.onFilesSelected(fileEvent(...files), fuStub);
      tick();

      expect(customerService.upload).toHaveBeenCalledWith('demoShopQR001', files[1], 'session-1');
      expect(component.uploads().length).toBe(2);
      // A photo defaults to COLOR, unlike a PDF which defaults to BW.
      expect(component.uploads()[1].options.colorMode).toBe('COLOR');

      discardPeriodicTasks(); // still UPLOADED -> analysis polling is running
    }));

    it('merges polled session-document status until every document is processed', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(
        of([
          {
            id: 'doc-1',
            originalName: 'resume.pdf',
            mimeType: 'application/pdf',
            status: 'PROCESSED',
            pageCount: 3,
            colorPages: 1,
            colorDetectionConfidence: 'HIGH',
          } as unknown as DocumentInfo,
        ]),
      );

      component.onFilesSelected(fileEvent(), fuStub);
      tick();
      expect(component.canContinueToOptions()).toBe(false); // upload response itself is still UPLOADED

      tick(2000); // DOC_STATUS_POLL_MS — first poll picks up the processed result
      expect(component.uploads()[0].status).toBe('PROCESSED');
      expect(component.canContinueToOptions()).toBe(true);

      discardPeriodicTasks();
    }));

    it('marks a document ANALYSIS_FAILED inline without blocking the others', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.sessionDocuments.and.returnValue(
        of([{ id: 'doc-1', originalName: 'resume.pdf', mimeType: 'application/pdf', status: 'ANALYSIS_FAILED' } as unknown as DocumentInfo]),
      );

      component.onFilesSelected(fileEvent(), fuStub);
      tick();
      tick(2000);

      expect(component.uploads()[0].status).toBe('ANALYSIS_FAILED');
      expect(component.canContinueToOptions()).toBe(false);

      discardPeriodicTasks();
    }));

    it('records a per-file error and continues without throwing when one upload fails', fakeAsync(() => {
      customerService.upload.and.returnValue(throwError(() => new Error('upload failed')));

      component.onFilesSelected(fileEvent(), fuStub);
      tick();

      expect(component.uploading()).toBe(false);
      expect(component.uploadError()).toContain('resume.pdf');
      expect(component.uploads().length).toBe(0);
    }));

    it('ignores an upload event with no file selected', fakeAsync(() => {
      component.onFilesSelected({ files: [] } as any, fuStub);
      tick();
      expect(customerService.upload).not.toHaveBeenCalled();
    }));
  });

  describe('per-document options -> quote -> confirm -> status polling', () => {
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
      customerService.quote.and.returnValue(
        of({ quoteId: 'q1', items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }], amount: '4.00', currency: 'INR', expiresAt: '' }),
      );
      component.recalculate();
      expect(customerService.quote).toHaveBeenCalledWith(
        [{ documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 }],
        'session-token',
      );
      expect(component.quote()?.amount).toBe('4.00');
      expect(component.quoting()).toBe(false);
    });

    it('confirm() moves to the status step, stores the token number and starts polling the job', fakeAsync(() => {
      component.quote.set({ quoteId: 'q1', items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }], amount: '4.00', currency: 'INR', expiresAt: '' });
      customerService.confirm.and.returnValue(
        of({ jobId: 'job-1', tokenNumber: 42, status: 'PRINT_ELIGIBLE', statusToken: 'job-token', amount: '4.00', currency: 'INR' }),
      );
      customerService.status.and.returnValue(of({ status: 'PRINT_ELIGIBLE' } as any));

      component.confirm();

      expect(component.currentStep()).toBe(3);
      expect(component.jobId()).toBe('job-1');
      expect(component.tokenNumber()).toBe(42);
      expect(component.jobStatus()?.status).toBe('PRINT_ELIGIBLE');
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toContain('job-1');

      discardPeriodicTasks();
    }));

    it('stops polling and clears persisted state once the job reaches a terminal status', fakeAsync(() => {
      component.quote.set({ quoteId: 'q1', items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }], amount: '4.00', currency: 'INR', expiresAt: '' });
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

    it('confirm() resets the confirming flag on failure without advancing the step', () => {
      component.quote.set({ quoteId: 'q1', items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }], amount: '4.00', currency: 'INR', expiresAt: '' });
      customerService.confirm.and.returnValue(throwError(() => new Error('quote expired')));

      component.confirm();

      expect(component.confirming()).toBe(false);
      expect(component.currentStep()).toBe(0);
    });

    it('confirm() is a no-op when there is no quote yet', () => {
      component.confirm();
      expect(customerService.confirm).not.toHaveBeenCalled();
    });
  });

  describe('reload-resilience (SRS extension: reload must not lose a pending upload or print job)', () => {
    it('restores an in-progress upload session (no job yet) and jumps to Options once documents are processed', () => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token' }),
      );
      customerService.sessionDocuments.and.returnValue(
        of([
          {
            id: 'doc-1',
            originalName: 'resume.pdf',
            mimeType: 'application/pdf',
            status: 'PROCESSED',
            pageCount: 2,
            colorPages: 0,
          } as unknown as DocumentInfo,
        ]),
      );
      customerService.quote.and.returnValue(
        of({ quoteId: 'q1', items: [{ documentId: 'doc-1', pageCount: 2, billablePages: 2, amount: '4.00' }], amount: '4.00', currency: 'INR', expiresAt: '' }),
      );

      fixture.detectChanges();

      expect(customerService.sessionDocuments).toHaveBeenCalledWith('session-1', 'session-token');
      expect(component.sessionId()).toBe('session-1');
      expect(component.uploads().length).toBe(1);
      expect(component.currentStep()).toBe(1);
    });

    it('restores a still-pending print job straight to the status step', fakeAsync(() => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({
          sessionId: 'session-1',
          sessionToken: 'session-token',
          jobId: 'job-1',
          jobStatusToken: 'job-token',
          tokenNumber: 42,
        }),
      );
      customerService.status.and.returnValue(of({ status: 'QUEUED' } as any));

      fixture.detectChanges();

      expect(customerService.status).toHaveBeenCalledWith('job-1', 'job-token');
      expect(component.currentStep()).toBe(3);
      expect(component.tokenNumber()).toBe(42);
      expect(component.jobStatus()?.status).toBe('QUEUED');

      discardPeriodicTasks();
    }));

    it('clears persisted state and starts fresh when the restored job already reached a terminal status', () => {
      localStorage.setItem(
        'printsetu.order.demoShopQR001',
        JSON.stringify({ sessionId: 'session-1', sessionToken: 'session-token', jobId: 'job-1', jobStatusToken: 'job-token' }),
      );
      customerService.status.and.returnValue(of({ status: 'PRINTED' } as any));

      fixture.detectChanges();

      expect(component.currentStep()).toBe(0);
      expect(localStorage.getItem('printsetu.order.demoShopQR001')).toBeNull();
    });
  });

  it('ngOnDestroy() clears any running poll intervals', fakeAsync(() => {
    fixture.detectChanges();
    customerService.upload.and.returnValue(of(uploadResponse));
    customerService.sessionDocuments.and.returnValue(
      of([{ id: 'doc-1', originalName: 'resume.pdf', mimeType: 'application/pdf', status: 'PROCESSING' } as unknown as DocumentInfo]),
    );

    component.onFilesSelected(fileEvent(), fuStub);
    tick();

    fixture.destroy();
    tick(10_000); // if the interval weren't cleared, this would keep firing (and fakeAsync would fail on pending timers)
  }));
});
