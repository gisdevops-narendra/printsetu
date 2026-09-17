import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { StepsModule } from 'primeng/steps';
import { FileUploadModule, FileUploadHandlerEvent } from 'primeng/fileupload';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { DividerModule } from 'primeng/divider';
import { MenuItem, MessageService } from 'primeng/api';
import { CustomerService } from '../../core/services/customer.service';
import { PriceSummaryCardComponent, PriceSummaryLine } from '../../shared/components/price-summary-card/price-summary-card.component';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { ColorMode, PaperSize, PrintJobStatus, QuoteResponse, SideMode, UploadResponse } from '../../core/models/models';

const STATUS_POLL_MS = 4000;
const DOC_STATUS_POLL_MS = 2000;

@Component({
  selector: 'app-order-flow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StepsModule,
    FileUploadModule,
    SelectModule,
    InputNumberModule,
    ButtonModule,
    ProgressSpinnerModule,
    MessageModule,
    DividerModule,
    PriceSummaryCardComponent,
    StatusTagComponent,
  ],
  template: `
    <div class="order-page">
      <div class="order-container">
        <div class="text-center mb-5">
          <h1 class="text-2xl font-bold m-0" style="color: var(--p-primary-600); letter-spacing: -0.01em">PrintSetu</h1>
          @if (shopName()) {
            <p class="text-color-secondary mt-1 mb-0">{{ shopName() }}</p>
          }
        </div>

        <div class="order-card">
          <p-steps [model]="stepItems" [activeIndex]="currentStep()" [readonly]="true" class="mb-5" />

          @if (resolvingShop()) {
            <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
          } @else if (shopError()) {
            <p-message severity="error" [text]="shopError()!" />
          } @else {
            <!-- Step 0: Upload -->
            @if (currentStep() === 0) {
              <div>
                <h3 class="mt-0 mb-1">Upload your document</h3>
                <p class="text-color-secondary text-sm mt-0">PDF, JPG or PNG, up to 25&nbsp;MB.</p>

                @if (analysisError()) {
                  <p-message severity="error" [text]="analysisError()!" styleClass="w-full mb-3" />
                }

                @if (!analyzing()) {
                  <div class="dropzone flex flex-column align-items-center gap-3 text-center">
                    <div class="dropzone__icon"><i class="pi pi-cloud-upload"></i></div>
                    <p-fileUpload
                      mode="basic"
                      chooseLabel="Choose File"
                      [customUpload]="true"
                      (uploadHandler)="onUpload($event)"
                      accept=".pdf,.jpg,.jpeg,.png"
                      [maxFileSize]="26214400"
                      [auto]="true"
                    />
                    <p class="text-xs text-color-secondary m-0">or drag and drop it here</p>
                  </div>
                }
                @if (uploading()) {
                  <div class="flex align-items-center gap-2 mt-3 text-color-secondary">
                    <p-progressSpinner strokeWidth="6" [style]="{ width: '24px', height: '24px' }" />
                    <span>Uploading document...</span>
                  </div>
                } @else if (analyzing()) {
                  <div class="flex align-items-center gap-2 mt-3 text-color-secondary">
                    <p-progressSpinner strokeWidth="6" [style]="{ width: '24px', height: '24px' }" />
                    <span>Analyzing document (counting pages, checking color)...</span>
                  </div>
                }
              </div>
            }

            <!-- Step 1: Options -->
            @if (currentStep() === 1 && upload(); as doc) {
              <div>
                <h3 class="mt-0 mb-1 flex align-items-center gap-2">
                  <i class="pi pi-file text-color-secondary"></i>
                  <span>{{ doc.originalName }}</span>
                </h3>
                <p class="text-color-secondary text-sm mt-0 mb-3">
                  {{ doc.pageCount ?? '?' }} page(s) detected
                  @if (doc.colorPages) { &middot; {{ doc.colorPages }} color page(s) }
                </p>

                <div class="grid">
                  <div class="col-12 sm:col-6 flex flex-column gap-2">
                    <label class="text-sm font-medium">Paper size</label>
                    <p-select [options]="paperSizes" [(ngModel)]="options.paperSize" (onChange)="recalculate()" />
                  </div>
                  <div class="col-12 sm:col-6 flex flex-column gap-2">
                    <label class="text-sm font-medium">Color mode</label>
                    <p-select [options]="colorModes" [(ngModel)]="options.colorMode" (onChange)="recalculate()" />
                  </div>
                  <div class="col-12 sm:col-6 flex flex-column gap-2">
                    <label class="text-sm font-medium">Sides</label>
                    <p-select [options]="sideModes" [(ngModel)]="options.sideMode" (onChange)="recalculate()" />
                  </div>
                  <div class="col-12 sm:col-6 flex flex-column gap-2">
                    <label class="text-sm font-medium">Copies</label>
                    <p-inputNumber [(ngModel)]="options.copies" [min]="1" [max]="999" (onInput)="recalculate()" />
                  </div>
                </div>

                <p-divider />
              </div>

              @if (quote(); as q) {
                <app-price-summary-card
                  [lines]="summaryLines(q)"
                  [amount]="q.amount"
                  [currency]="q.currency"
                />
                <div class="flex justify-content-end mt-4">
                  <p-button label="Continue to Confirm" icon="pi pi-arrow-right" iconPos="right" (onClick)="currentStep.set(2)" />
                </div>
              } @else if (quoting()) {
                <div class="flex justify-content-center p-4"><p-progressSpinner strokeWidth="4" /></div>
              }
            }

            <!-- Step 2: Confirm -->
            @if (currentStep() === 2 && quote(); as q) {
              <div class="mb-4">
                <h3 class="mt-0 mb-1">Review your order</h3>
                <p class="text-color-secondary text-sm mt-0">
                  No payment is collected online — pay the shop directly at the counter if required.
                </p>
                <p-divider />
              </div>
              <app-price-summary-card [lines]="summaryLines(q)" [amount]="q.amount" [currency]="q.currency" />
              <div class="flex justify-content-between mt-4">
                <p-button label="Back" severity="secondary" [text]="true" (onClick)="currentStep.set(1)" />
                <p-button label="Confirm Print Request" icon="pi pi-check" [loading]="confirming()" (onClick)="confirm()" />
              </div>
            }

            <!-- Step 3: Status -->
            @if (currentStep() === 3 && jobStatus(); as job) {
              <div class="text-center py-3">
                <div class="mb-3"><app-status-tag [status]="job.status" /></div>
                <h3 class="mt-0 mb-2">
                  @switch (job.status) {
                    @case ('PRINT_ELIGIBLE') { Your print request is confirmed. }
                    @case ('QUEUED') { The shop has queued your print job. }
                    @case ('PRINTING') { Printing in progress... }
                    @case ('PRINTED') { All done — please collect your printout. }
                    @case ('RETENTION_PENDING') { All done — please collect your printout. }
                    @case ('PRINT_FAILED') { Printing failed. Please check with the shop. }
                    @case ('AGENT_OFFLINE') { The shop's printer is currently offline. Your job is still queued. }
                    @default { Tracking your order... }
                  }
                </h3>
                <p class="text-color-secondary text-sm">Order reference: {{ jobId() }}</p>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .order-page {
        min-height: 100vh;
        background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 60%);
        padding: 2.5rem 1rem;
      }
      .order-container {
        max-width: 600px;
        margin: 0 auto;
      }
      .order-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
        padding: 2rem;
      }
      @media (max-width: 640px) {
        .order-card {
          padding: 1.25rem;
          border-radius: 12px;
        }
      }
      .dropzone {
        border: 1.5px dashed #cbd5e1;
        border-radius: 12px;
        padding: 2rem 1.5rem;
        background: #f8fafc;
      }
      .dropzone__icon {
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--p-primary-50);
        color: var(--p-primary-600);
        font-size: 1.4rem;
      }
    `,
  ],
})
export class OrderFlowComponent implements OnInit, OnDestroy {
  currentStep = signal(0);
  stepItems: MenuItem[] = [{ label: 'Upload' }, { label: 'Options' }, { label: 'Confirm' }, { label: 'Status' }];

  resolvingShop = signal(true);
  shopError = signal<string | null>(null);
  shopName = signal<string | null>(null);
  shopCode!: string;

  uploading = signal(false);
  upload = signal<UploadResponse | null>(null);
  docAccessToken = '';
  analyzing = signal(false);
  analysisError = signal<string | null>(null);
  private docPollHandle?: ReturnType<typeof setInterval>;

  options: { paperSize: PaperSize; colorMode: ColorMode; sideMode: SideMode; copies: number } = {
    paperSize: 'A4',
    colorMode: 'BW',
    sideMode: 'SIMPLEX',
    copies: 1,
  };
  paperSizes: PaperSize[] = ['A4', 'A3', 'LETTER', 'LEGAL'];
  colorModes: ColorMode[] = ['BW', 'COLOR'];
  sideModes: SideMode[] = ['SIMPLEX', 'DUPLEX'];

  quoting = signal(false);
  quote = signal<QuoteResponse | null>(null);

  confirming = signal(false);
  jobId = signal<string | null>(null);
  jobStatusToken = '';
  jobStatus = signal<{ status: PrintJobStatus } | null>(null);
  private pollHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly customerService: CustomerService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.shopCode = this.route.snapshot.paramMap.get('shopCode')!;
    this.customerService.resolveShop(this.shopCode).subscribe({
      next: (res) => {
        this.shopName.set(res.shopName);
        this.resolvingShop.set(false);
      },
      error: () => {
        this.shopError.set('This QR code is invalid or the shop is not currently accepting orders.');
        this.resolvingShop.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.docPollHandle) clearInterval(this.docPollHandle);
  }

  onUpload(event: FileUploadHandlerEvent): void {
    const file = event.files[0];
    if (!file) return;
    this.analysisError.set(null);
    this.uploading.set(true);
    this.customerService.upload(this.shopCode, file).subscribe({
      next: (res) => {
        this.upload.set(res);
        this.docAccessToken = res.docAccessToken;
        this.uploading.set(false);
        if (res.status === 'PROCESSED') {
          this.currentStep.set(1);
          this.recalculate();
        } else {
          // SRS §9: analysis (page-count/color detection) now runs off the
          // request path on a BullMQ worker — poll until it lands on
          // PROCESSED or ANALYSIS_FAILED before letting the customer pick options.
          this.startDocumentPolling();
        }
      },
      error: () => this.uploading.set(false),
    });
  }

  private startDocumentPolling(): void {
    this.analyzing.set(true);
    const doc = this.upload();
    if (!doc) return;

    const poll = () => {
      this.customerService.documentDetails(doc.documentId, this.docAccessToken).subscribe({
        next: (info) => {
          if (info.status === 'PROCESSED') {
            if (this.docPollHandle) clearInterval(this.docPollHandle);
            this.analyzing.set(false);
            this.upload.set({
              ...doc,
              pageCount: info.pageCount,
              colorPages: info.colorPages,
              colorDetectionConfidence: info.colorDetectionConfidence,
              status: info.status,
            });
            this.currentStep.set(1);
            this.recalculate();
          } else if (info.status === 'ANALYSIS_FAILED') {
            if (this.docPollHandle) clearInterval(this.docPollHandle);
            this.analyzing.set(false);
            this.analysisError.set(
              'We could not analyze this document automatically. Please try a different file or check with the shop.',
            );
          }
          // UPLOADED / PROCESSING: keep polling.
        },
        error: () => {
          if (this.docPollHandle) clearInterval(this.docPollHandle);
          this.analyzing.set(false);
          this.analysisError.set('Something went wrong while checking your document status. Please try again.');
        },
      });
    };
    poll();
    this.docPollHandle = setInterval(poll, DOC_STATUS_POLL_MS);
  }

  recalculate(): void {
    const doc = this.upload();
    if (!doc) return;
    this.quoting.set(true);
    this.customerService
      .quote({ documentId: doc.documentId, ...this.options }, this.docAccessToken)
      .subscribe({
        next: (q) => {
          this.quote.set(q);
          this.quoting.set(false);
        },
        error: () => this.quoting.set(false),
      });
  }

  summaryLines(q: QuoteResponse): PriceSummaryLine[] {
    return [
      { label: 'Paper size', value: this.options.paperSize },
      { label: 'Color mode', value: this.options.colorMode },
      { label: 'Sides', value: this.options.sideMode },
      { label: 'Pages × copies', value: `${q.pageCount} × ${this.options.copies} = ${q.billablePages}` },
    ];
  }

  confirm(): void {
    const q = this.quote();
    if (!q) return;
    this.confirming.set(true);
    this.customerService.confirm(q.quoteId, this.docAccessToken).subscribe({
      next: (res) => {
        this.confirming.set(false);
        this.jobId.set(res.jobId);
        this.jobStatusToken = res.statusToken;
        this.jobStatus.set({ status: res.status });
        this.currentStep.set(3);
        this.startPolling();
        this.messageService.add({ severity: 'success', summary: 'Print request confirmed' });
      },
      error: () => this.confirming.set(false),
    });
  }

  private startPolling(): void {
    const poll = () => {
      const id = this.jobId();
      if (!id) return;
      this.customerService.status(id, this.jobStatusToken).subscribe((job) => {
        this.jobStatus.set({ status: job.status });
        if (['PRINTED', 'RETENTION_PENDING', 'DELETED', 'PRINT_FAILED', 'CANCELLED'].includes(job.status)) {
          if (this.pollHandle) clearInterval(this.pollHandle);
        }
      });
    };
    poll();
    this.pollHandle = setInterval(poll, STATUS_POLL_MS);
  }
}
