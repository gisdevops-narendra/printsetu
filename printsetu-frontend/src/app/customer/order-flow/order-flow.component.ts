import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FileUpload, FileUploadModule, FileUploadHandlerEvent } from 'primeng/fileupload';
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
import {
  ColorMode,
  DocumentInfo,
  DocumentStatus,
  PaperSize,
  PrintJobStatus,
  QuoteItemRequest,
  QuoteResponse,
  SideMode,
} from '../../core/models/models';

const STATUS_POLL_MS = 4000;
const DOC_STATUS_POLL_MS = 2000;
const TERMINAL_JOB_STATUSES: PrintJobStatus[] = ['PRINTED', 'RETENTION_PENDING', 'DELETED', 'PRINT_FAILED', 'CANCELLED'];

interface DocOptions {
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies: number;
}

interface UploadEntry {
  documentId: string;
  originalName: string;
  mimeType: string;
  pageCount: number | null;
  colorPages: number | null;
  status: DocumentStatus;
  options: DocOptions;
}

/**
 * Persisted client-side so a page reload (SRS extension: "system shall
 * retain the uploaded document and session data ... upload shall not be
 * lost due to the page reload") can recover a still-pending print
 * request instead of losing it. Scoped per shopCode in case the same
 * phone/browser scans more than one shop's QR code.
 */
interface PersistedOrderSession {
  sessionId: string;
  sessionToken: string;
  jobId?: string;
  jobStatusToken?: string;
  tokenNumber?: number;
}

@Component({
  selector: 'app-order-flow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
          <div class="stepper" aria-hidden="true">
            @for (item of stepItems; track item.label; let i = $index) {
              <div class="stepper__item" [class.is-active]="i === currentStep()" [class.is-done]="i < currentStep()">
                <span class="stepper__dot">
                  @if (i < currentStep()) { <i class="pi pi-check"></i> } @else { {{ i + 1 }} }
                </span>
              </div>
              @if (i < stepItems.length - 1) {
                <span class="stepper__line" [class.is-done]="i < currentStep()"></span>
              }
            }
          </div>
          <p class="stepper__label">Step {{ currentStep() + 1 }} of {{ stepItems.length }} &middot; {{ stepItems[currentStep()].label }}</p>

          @if (!resolvingShop() && !shopError() && (sessionId() || jobId())) {
            <div class="text-center mb-3">
              <button type="button" class="reset-link" (click)="startNewOrder()">
                @if (jobId()) { Print something else / start over } @else { Not what you meant to upload? Start over }
              </button>
            </div>
          }

          @if (resolvingShop()) {
            <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
          } @else if (shopError()) {
            <p-message severity="error" [text]="shopError()!" />
          } @else {
            <!-- Step 0: Upload -->
            @if (currentStep() === 0) {
              <div>
                <h3 class="mt-0 mb-1">Upload your documents</h3>
                <p class="text-color-secondary text-sm mt-0">PDF, JPG or PNG, up to 25&nbsp;MB each &mdash; add as many as you need.</p>

                @if (uploadError()) {
                  <p-message severity="error" [text]="uploadError()!" styleClass="w-full mb-3" />
                }

                @if (uploads().length > 0) {
                  <div class="upload-list mb-3">
                    @for (u of uploads(); track u.documentId) {
                      <div class="upload-row">
                        <i class="pi upload-row__icon" [class.pi-file]="u.status !== 'ANALYSIS_FAILED'" [class.pi-exclamation-triangle]="u.status === 'ANALYSIS_FAILED'"></i>
                        <span class="upload-row__name">{{ u.originalName }}</span>
                        @if (u.status === 'PROCESSED') {
                          <span class="upload-row__meta">{{ u.pageCount }} pg</span>
                        } @else if (u.status === 'ANALYSIS_FAILED') {
                          <span class="upload-row__meta upload-row__meta--error">failed</span>
                        } @else {
                          <p-progressSpinner strokeWidth="8" [style]="{ width: '16px', height: '16px' }" />
                        }
                      </div>
                    }
                  </div>
                }

                <div class="dropzone flex flex-column align-items-center gap-3 text-center">
                  <div class="dropzone__icon"><i class="pi pi-cloud-upload"></i></div>
                  <p-fileUpload
                    #fu
                    mode="basic"
                    [chooseLabel]="uploads().length ? 'Add More Files' : 'Choose Files'"
                    [customUpload]="true"
                    [multiple]="true"
                    (uploadHandler)="onFilesSelected($event, fu)"
                    accept=".pdf,.jpg,.jpeg,.png"
                    [maxFileSize]="26214400"
                    [auto]="true"
                  />
                  <p class="text-xs text-color-secondary m-0">or drag and drop them here</p>
                </div>

                @if (uploading()) {
                  <div class="flex align-items-center gap-2 mt-3 text-color-secondary">
                    <p-progressSpinner strokeWidth="6" [style]="{ width: '24px', height: '24px' }" />
                    <span>Uploading...</span>
                  </div>
                }

                @if (canContinueToOptions()) {
                  <div class="flex justify-content-end mt-4">
                    <p-button label="Continue to Options" icon="pi pi-arrow-right" iconPos="right" (onClick)="goToOptions()" />
                  </div>
                }
              </div>
            }

            <!-- Step 1: Options (per document — SRS extension: multi-document requests) -->
            @if (currentStep() === 1) {
              <div>
                <button type="button" class="back-link mb-2" (click)="currentStep.set(0)">
                  <i class="pi pi-arrow-left"></i> Add more files
                </button>
                <h3 class="mt-0 mb-1">Set print options</h3>
                <p class="text-color-secondary text-sm mt-0 mb-3">Each document can have its own paper size, color, sides and copies.</p>

                @for (doc of processedUploads(); track doc.documentId) {
                  <div class="doc-options-card mb-3">
                    <div class="flex align-items-center gap-2 mb-2 doc-name-row">
                      <i class="pi pi-file text-color-secondary"></i>
                      <span class="doc-name font-medium">{{ doc.originalName }}</span>
                      <span class="text-color-secondary text-xs ml-auto white-space-nowrap">{{ doc.pageCount }} pg</span>
                    </div>
                    <div class="grid">
                      <div class="col-6 sm:col-3 flex flex-column gap-2">
                        <label class="text-xs font-medium">Paper</label>
                        <p-select [options]="paperSizes" [(ngModel)]="doc.options.paperSize" (onChange)="recalculate()" />
                      </div>
                      <div class="col-6 sm:col-3 flex flex-column gap-2">
                        <label class="text-xs font-medium">Color</label>
                        <p-select [options]="colorModes" [(ngModel)]="doc.options.colorMode" (onChange)="recalculate()" />
                      </div>
                      <div class="col-6 sm:col-3 flex flex-column gap-2">
                        <label class="text-xs font-medium">Sides</label>
                        <p-select [options]="sideModes" [(ngModel)]="doc.options.sideMode" (onChange)="recalculate()" />
                      </div>
                      <div class="col-6 sm:col-3 flex flex-column gap-2">
                        <label class="text-xs font-medium">Copies</label>
                        <p-inputNumber [(ngModel)]="doc.options.copies" [min]="1" [max]="999" (onInput)="recalculate()" />
                      </div>
                    </div>
                  </div>
                }

                <p-divider />

                @if (quote(); as q) {
                  <app-price-summary-card [lines]="summaryLines(q)" [amount]="q.amount" [currency]="q.currency" />
                  <div class="flex justify-content-end mt-4">
                    <p-button label="Continue to Confirm" icon="pi pi-arrow-right" iconPos="right" (onClick)="currentStep.set(2)" />
                  </div>
                } @else if (quoting()) {
                  <div class="flex justify-content-center p-4"><p-progressSpinner strokeWidth="4" /></div>
                }
              </div>
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
              <div class="confirm-actions mt-4">
                <p-button label="Back" severity="secondary" [text]="true" (onClick)="currentStep.set(1)" />
                <p-button label="Confirm Print Request" icon="pi pi-check" [loading]="confirming()" (onClick)="confirm()" />
              </div>
            }

            <!-- Step 3: Status -->
            @if (currentStep() === 3 && jobStatus(); as job) {
              <div class="text-center py-3">
                <div class="token-badge">
                  <span class="token-badge__label">Your token number</span>
                  <span class="token-badge__value">#{{ tokenNumber() }}</span>
                </div>
                <p class="text-color-secondary text-xs mt-2 mb-4">
                  Quote this token number for anything to do with this order — it's how the shop and PrintSetu trace it.
                </p>
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
        /* mobile browsers size 100vh against the viewport *with* the
           address bar shown, so it falls short once the bar collapses,
           exposing a gap below — 100dvh tracks the real visible area
           and is only applied where supported (it overrides the vh
           fallback above it, never the other way round). */
        min-height: 100vh;
        min-height: 100dvh;
        background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 60%);
        padding: 2.5rem 1rem;
      }
      .order-container {
        /* Grows a little on big screens so the flow isn't a thin strip. */
        max-width: clamp(600px, 46vw, 760px);
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
        .order-page {
          padding: 1.25rem 0.75rem;
        }
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
      @media (max-width: 400px) {
        .dropzone {
          padding: 1.5rem 1rem;
        }
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

      .upload-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .upload-row {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.625rem 0.875rem;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #f8fafc;
      }
      .upload-row__icon {
        color: #94a3b8;
        flex-shrink: 0;
      }
      .upload-row__name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.875rem;
      }
      .upload-row__meta {
        flex-shrink: 0;
        font-size: 0.75rem;
        color: #64748b;
      }
      .upload-row__meta--error {
        color: #dc2626;
        font-weight: 600;
      }

      .doc-options-card {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1rem;
        background: #f8fafc;
      }

      .token-badge {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 0.125rem;
        padding: 0.875rem 2rem;
        border-radius: 14px;
        background: var(--p-primary-50);
        border: 1px solid var(--p-primary-100);
      }
      .token-badge__label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--p-primary-600);
      }
      .token-badge__value {
        font-size: 2.5rem;
        font-weight: 800;
        line-height: 1.1;
        color: var(--p-primary-700, var(--p-primary-600));
        letter-spacing: -0.02em;
      }

      /* ---------- Compact step indicator ----------
         PrimeNG's p-steps lays every step's full text label out in one row,
         which either overlaps or forces horizontal scroll below ~380px.
         This shows small numbered dots + a connecting line (always fits
         four steps on any phone width) and the *current* step's label as
         a single centered line underneath instead. */
      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 0.625rem;
      }
      .stepper__item {
        display: flex;
        flex-shrink: 0;
      }
      .stepper__dot {
        width: 1.75rem;
        height: 1.75rem;
        min-width: 1.75rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        font-weight: 700;
        background: #e2e8f0;
        color: #64748b;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .stepper__item.is-active .stepper__dot {
        background: var(--p-primary-600);
        color: #fff;
      }
      .stepper__item.is-done .stepper__dot {
        background: var(--p-primary-100);
        color: var(--p-primary-600);
      }
      .stepper__line {
        width: 2.5rem;
        max-width: 8vw;
        height: 2px;
        background: #e2e8f0;
        margin: 0 0.375rem;
      }
      .stepper__line.is-done {
        background: var(--p-primary-300);
      }
      .stepper__label {
        text-align: center;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #475569;
        margin: 0 0 1.5rem 0;
      }

      .reset-link,
      .back-link {
        background: none;
        border: none;
        padding: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .reset-link:hover,
      .back-link:hover {
        color: var(--p-primary-600);
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }

      .doc-name-row {
        min-width: 0;
      }
      .doc-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }

      .confirm-actions {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
      }
      @media (max-width: 420px) {
        .confirm-actions {
          flex-direction: column-reverse;
        }
        .confirm-actions ::ng-deep .p-button {
          width: 100%;
          justify-content: center;
        }
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

  sessionId = signal<string | null>(null);
  private sessionToken = '';
  uploads = signal<UploadEntry[]>([]);
  processedUploads = computed(() => this.uploads().filter((u) => u.status === 'PROCESSED'));
  canContinueToOptions = computed(() => this.processedUploads().length > 0);

  uploading = signal(false);
  uploadError = signal<string | null>(null);
  private docPollHandle?: ReturnType<typeof setInterval>;

  paperSizes: PaperSize[] = ['A4', 'A3', 'LETTER', 'LEGAL'];
  colorModes: ColorMode[] = ['BW', 'COLOR'];
  sideModes: SideMode[] = ['SIMPLEX', 'DUPLEX'];

  quoting = signal(false);
  quote = signal<QuoteResponse | null>(null);

  confirming = signal(false);
  jobId = signal<string | null>(null);
  tokenNumber = signal<number | null>(null);
  private jobStatusToken = '';
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
        this.restoreSession();
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

  /** Reload-resilience (SRS extension): recover a still-pending upload session or print job from localStorage. */
  private restoreSession(): void {
    const saved = this.loadPersisted();
    if (!saved) return;

    if (saved.jobId && saved.jobStatusToken) {
      this.customerService.status(saved.jobId, saved.jobStatusToken).subscribe({
        next: (job) => {
          if (TERMINAL_JOB_STATUSES.includes(job.status)) {
            this.clearPersisted();
            return;
          }
          this.sessionId.set(saved.sessionId);
          this.sessionToken = saved.sessionToken;
          this.jobId.set(saved.jobId!);
          this.jobStatusToken = saved.jobStatusToken!;
          this.tokenNumber.set(saved.tokenNumber ?? null);
          this.jobStatus.set({ status: job.status });
          this.currentStep.set(3);
          this.startPolling();
          this.messageService.add({ severity: 'info', summary: 'Resumed your print request' });
        },
        error: () => this.clearPersisted(),
      });
      return;
    }

    if (saved.sessionId && saved.sessionToken) {
      this.customerService.sessionDocuments(saved.sessionId, saved.sessionToken).subscribe({
        next: (docs) => {
          if (docs.length === 0) {
            this.clearPersisted();
            return;
          }
          this.sessionId.set(saved.sessionId);
          this.sessionToken = saved.sessionToken;
          this.mergeSessionDocuments(docs);
          if (this.canContinueToOptions()) {
            this.currentStep.set(1);
            this.recalculate();
          }
          this.startAnalysisPollingIfNeeded();
          this.messageService.add({ severity: 'info', summary: 'Restored your uploaded documents' });
        },
        error: () => this.clearPersisted(),
      });
    }
  }

  /**
   * Escape hatch for the reload-resilience restore above: without this,
   * scanning the same QR code again after an earlier not-yet-printed
   * upload/job just keeps showing that same upload/job with no way to
   * upload something different.
   */
  startNewOrder(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.docPollHandle) clearInterval(this.docPollHandle);
    this.docPollHandle = undefined;
    this.clearPersisted();

    this.sessionId.set(null);
    this.sessionToken = '';
    this.uploads.set([]);
    this.uploadError.set(null);
    this.uploading.set(false);

    this.quote.set(null);
    this.quoting.set(false);

    this.confirming.set(false);
    this.jobId.set(null);
    this.tokenNumber.set(null);
    this.jobStatusToken = '';
    this.jobStatus.set(null);

    this.currentStep.set(0);
  }

  async onFilesSelected(event: FileUploadHandlerEvent, fu: FileUpload): Promise<void> {
    const files = event.files;
    if (!files || files.length === 0) return;
    this.uploadError.set(null);
    this.uploading.set(true);

    for (const file of files) {
      try {
        const res = await firstValueFrom(this.customerService.upload(this.shopCode, file, this.sessionId() ?? undefined));
        this.sessionId.set(res.sessionId);
        this.sessionToken = res.sessionToken;
        this.uploads.update((list) => [
          ...list,
          {
            documentId: res.documentId,
            originalName: res.originalName,
            mimeType: res.mimeType,
            pageCount: res.pageCount,
            colorPages: res.colorPages,
            status: res.status,
            options: this.defaultOptionsFor(res.mimeType),
          },
        ]);
        this.persist();
      } catch {
        this.uploadError.set(`"${file.name}" could not be uploaded. Please try again.`);
      }
    }

    this.uploading.set(false);
    fu.clear();
    this.startAnalysisPollingIfNeeded();
  }

  private defaultOptionsFor(mimeType: string): DocOptions {
    return {
      paperSize: 'A4',
      colorMode: mimeType.startsWith('image/') ? 'COLOR' : 'BW',
      sideMode: 'SIMPLEX',
      copies: 1,
    };
  }

  private mergeSessionDocuments(docs: DocumentInfo[]): void {
    const existing = new Map(this.uploads().map((u) => [u.documentId, u]));
    this.uploads.set(
      docs.map((doc) => {
        const prev = existing.get(doc.id);
        return {
          documentId: doc.id,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          pageCount: doc.pageCount,
          colorPages: doc.colorPages,
          status: doc.status,
          options: prev?.options ?? this.defaultOptionsFor(doc.mimeType),
        };
      }),
    );
  }

  private startAnalysisPollingIfNeeded(): void {
    const pending = this.uploads().some((u) => u.status === 'UPLOADED' || u.status === 'PROCESSING');
    if (!pending || this.docPollHandle) return;
    this.docPollHandle = setInterval(() => this.pollSessionDocuments(), DOC_STATUS_POLL_MS);
  }

  private pollSessionDocuments(): void {
    const sessionId = this.sessionId();
    if (!sessionId) return;
    this.customerService.sessionDocuments(sessionId, this.sessionToken).subscribe({
      next: (docs) => {
        this.mergeSessionDocuments(docs);
        const stillPending = docs.some((d) => d.status === 'UPLOADED' || d.status === 'PROCESSING');
        if (!stillPending && this.docPollHandle) {
          clearInterval(this.docPollHandle);
          this.docPollHandle = undefined;
        }
      },
      error: () => {
        if (this.docPollHandle) {
          clearInterval(this.docPollHandle);
          this.docPollHandle = undefined;
        }
      },
    });
  }

  goToOptions(): void {
    this.currentStep.set(1);
    this.recalculate();
  }

  recalculate(): void {
    const docs = this.processedUploads();
    if (docs.length === 0) {
      this.quote.set(null);
      return;
    }
    this.quoting.set(true);
    const items: QuoteItemRequest[] = docs.map((d) => ({ documentId: d.documentId, ...d.options }));
    this.customerService.quote(items, this.sessionToken).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.quoting.set(false);
      },
      error: () => this.quoting.set(false),
    });
  }

  summaryLines(q: QuoteResponse): PriceSummaryLine[] {
    const byId = new Map(this.uploads().map((u) => [u.documentId, u]));
    return q.items.map((item) => ({
      label: byId.get(item.documentId)?.originalName ?? 'Document',
      value: `${item.billablePages} pg · ₹${item.amount}`,
    }));
  }

  confirm(): void {
    const q = this.quote();
    if (!q) return;
    this.confirming.set(true);
    this.customerService.confirm(q.quoteId, this.sessionToken).subscribe({
      next: (res) => {
        this.confirming.set(false);
        this.jobId.set(res.jobId);
        this.tokenNumber.set(res.tokenNumber);
        this.jobStatusToken = res.statusToken;
        this.jobStatus.set({ status: res.status });
        this.currentStep.set(3);
        this.persist();
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
        if (TERMINAL_JOB_STATUSES.includes(job.status)) {
          if (this.pollHandle) clearInterval(this.pollHandle);
          this.clearPersisted();
        }
      });
    };
    poll();
    this.pollHandle = setInterval(poll, STATUS_POLL_MS);
  }

  private persistKey(): string {
    return `printsetu.order.${this.shopCode}`;
  }

  private persist(): void {
    const sessionId = this.sessionId();
    if (!sessionId) return;
    const data: PersistedOrderSession = {
      sessionId,
      sessionToken: this.sessionToken,
      jobId: this.jobId() ?? undefined,
      jobStatusToken: this.jobStatusToken || undefined,
      tokenNumber: this.tokenNumber() ?? undefined,
    };
    try {
      localStorage.setItem(this.persistKey(), JSON.stringify(data));
    } catch {
      // Private browsing / storage disabled — reload-resilience is best-effort, never fatal.
    }
  }

  private loadPersisted(): PersistedOrderSession | null {
    try {
      const raw = localStorage.getItem(this.persistKey());
      return raw ? (JSON.parse(raw) as PersistedOrderSession) : null;
    } catch {
      return null;
    }
  }

  private clearPersisted(): void {
    try {
      localStorage.removeItem(this.persistKey());
    } catch {
      // ignore
    }
  }
}
