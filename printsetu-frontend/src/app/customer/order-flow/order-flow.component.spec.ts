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
import { OrderFlowComponent } from './order-flow.component';
import { CustomerService } from '../../core/services/customer.service';
import { DocumentInfo, UploadResponse } from '../../core/models/models';

describe('OrderFlowComponent (SRS §5/§8/§9 customer QR -> upload -> options -> confirm -> status)', () => {
  let fixture: ComponentFixture<OrderFlowComponent>;
  let component: OrderFlowComponent;
  let customerService: jasmine.SpyObj<CustomerService>;

  const uploadResponse: UploadResponse = {
    documentId: 'doc-1',
    docAccessToken: 'doc-token',
    originalName: 'resume.pdf',
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    pageCount: null,
    colorPages: null,
    colorDetectionConfidence: null,
    status: 'UPLOADED',
  };

  function fileEvent(): any {
    return { files: [new File(['x'], 'resume.pdf', { type: 'application/pdf' })] };
  }

  beforeEach(async () => {
    customerService = jasmine.createSpyObj<CustomerService>('CustomerService', [
      'resolveShop',
      'upload',
      'documentDetails',
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

  describe('upload -> async analysis polling (SRS §9 Upload/Processing pipeline)', () => {
    beforeEach(() => {
      fixture.detectChanges(); // resolves shop
    });

    it('starts polling immediately after an UPLOADED response, without jumping to step 1', () => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.documentDetails.and.returnValue(
        of({ ...uploadResponse, id: 'doc-1', status: 'PROCESSING' } as unknown as DocumentInfo),
      );

      component.onUpload(fileEvent());

      expect(component.uploading()).toBe(false);
      expect(component.analyzing()).toBe(true);
      expect(component.currentStep()).toBe(0); // still on Upload, not Options
      expect(customerService.documentDetails).toHaveBeenCalledWith('doc-1', 'doc-token');
    });

    it('advances to Options once polling reports PROCESSED, carrying the analysis result', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.documentDetails.and.returnValues(
        of({ status: 'PROCESSING' } as unknown as DocumentInfo),
        of({
          status: 'PROCESSED',
          pageCount: 3,
          colorPages: 1,
          colorDetectionConfidence: 'HIGH',
        } as unknown as DocumentInfo),
      );
      customerService.quote.and.returnValue(
        of({
          quoteId: 'q1',
          documentId: 'doc-1',
          pageCount: 3,
          billablePages: 3,
          amount: '6.00',
          currency: 'INR',
          expiresAt: '',
        }),
      );

      component.onUpload(fileEvent());
      expect(component.analyzing()).toBe(true);

      tick(2000); // second poll tick (DOC_STATUS_POLL_MS)
      expect(component.analyzing()).toBe(false);
      expect(component.currentStep()).toBe(1);
      expect(component.upload()?.pageCount).toBe(3);
      expect(component.upload()?.colorPages).toBe(1);
      expect(component.quote()?.quoteId).toBe('q1'); // recalculate() was triggered automatically

      discardPeriodicTasks();
    }));

    it('surfaces an error and stops polling when analysis permanently fails', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.documentDetails.and.returnValue(
        of({ status: 'ANALYSIS_FAILED' } as unknown as DocumentInfo),
      );

      component.onUpload(fileEvent());
      tick(0);

      expect(component.analyzing()).toBe(false);
      expect(component.analysisError()).toContain('could not analyze');
      expect(component.currentStep()).toBe(0);

      discardPeriodicTasks();
    }));

    it('stops polling and shows an error if the status check itself fails', fakeAsync(() => {
      customerService.upload.and.returnValue(of(uploadResponse));
      customerService.documentDetails.and.returnValue(throwError(() => new Error('network error')));

      component.onUpload(fileEvent());
      tick(0);

      expect(component.analyzing()).toBe(false);
      expect(component.analysisError()).toContain('Something went wrong');

      discardPeriodicTasks();
    }));

    it('does nothing when the upload itself fails', () => {
      customerService.upload.and.returnValue(throwError(() => new Error('upload failed')));
      component.onUpload(fileEvent());
      expect(component.uploading()).toBe(false);
      expect(component.analyzing()).toBe(false);
      expect(component.currentStep()).toBe(0);
    });

    it('ignores an upload event with no file selected', () => {
      component.onUpload({ files: [] } as any);
      expect(customerService.upload).not.toHaveBeenCalled();
    });
  });

  describe('quote -> confirm -> status polling', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.upload.set(uploadResponse);
      (component as any).docAccessToken = 'doc-token';
    });

    it('recalculate() fetches a quote for the current options', () => {
      customerService.quote.and.returnValue(
        of({
          quoteId: 'q1',
          documentId: 'doc-1',
          pageCount: 2,
          billablePages: 2,
          amount: '4.00',
          currency: 'INR',
          expiresAt: '',
        }),
      );
      component.recalculate();
      expect(customerService.quote).toHaveBeenCalledWith(
        { documentId: 'doc-1', paperSize: 'A4', colorMode: 'BW', sideMode: 'SIMPLEX', copies: 1 },
        'doc-token',
      );
      expect(component.quote()?.amount).toBe('4.00');
      expect(component.quoting()).toBe(false);
    });

    it('confirm() moves to the status step and starts polling the job', fakeAsync(() => {
      component.quote.set({
        quoteId: 'q1',
        documentId: 'doc-1',
        pageCount: 2,
        billablePages: 2,
        amount: '4.00',
        currency: 'INR',
        expiresAt: '',
      });
      customerService.confirm.and.returnValue(
        of({
          jobId: 'job-1',
          status: 'PRINT_ELIGIBLE',
          statusToken: 'job-token',
          amount: '4.00',
          currency: 'INR',
        }),
      );
      customerService.status.and.returnValue(of({ status: 'PRINT_ELIGIBLE' } as any));

      component.confirm();

      expect(component.currentStep()).toBe(3);
      expect(component.jobId()).toBe('job-1');
      expect(component.jobStatus()?.status).toBe('PRINT_ELIGIBLE');

      discardPeriodicTasks();
    }));

    it('stops polling once the job reaches a terminal status', fakeAsync(() => {
      component.quote.set({
        quoteId: 'q1',
        documentId: 'doc-1',
        pageCount: 2,
        billablePages: 2,
        amount: '4.00',
        currency: 'INR',
        expiresAt: '',
      });
      customerService.confirm.and.returnValue(
        of({
          jobId: 'job-1',
          status: 'PRINT_ELIGIBLE',
          statusToken: 'job-token',
          amount: '4.00',
          currency: 'INR',
        }),
      );

      let call = 0;
      const statuses = ['PRINT_ELIGIBLE', 'QUEUED', 'PRINTED'];
      customerService.status.and.callFake(() =>
        of({ status: statuses[Math.min(call++, statuses.length - 1)] } as any),
      );

      component.confirm();
      expect(component.jobStatus()?.status).toBe('PRINT_ELIGIBLE');

      tick(4000);
      expect(component.jobStatus()?.status).toBe('QUEUED');

      tick(4000);
      expect(component.jobStatus()?.status).toBe('PRINTED');

      // one more tick interval-worth of time: if polling had NOT stopped,
      // call count would keep climbing past the terminal statuses array.
      const callsAtTerminal = customerService.status.calls.count();
      tick(4000);
      expect(customerService.status.calls.count()).toBe(callsAtTerminal);
    }));

    it('confirm() resets the confirming flag on failure without advancing the step', () => {
      component.quote.set({
        quoteId: 'q1',
        documentId: 'doc-1',
        pageCount: 2,
        billablePages: 2,
        amount: '4.00',
        currency: 'INR',
        expiresAt: '',
      });
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

  it('ngOnDestroy() clears any running poll intervals', fakeAsync(() => {
    fixture.detectChanges();
    customerService.upload.and.returnValue(of(uploadResponse));
    customerService.documentDetails.and.returnValue(
      of({ status: 'PROCESSING' } as unknown as DocumentInfo),
    );

    component.onUpload(fileEvent());
    expect(component.analyzing()).toBe(true);

    fixture.destroy();
    tick(10_000); // if the interval weren't cleared, this would keep firing (and fakeAsync would fail on pending timers)
  }));
});
