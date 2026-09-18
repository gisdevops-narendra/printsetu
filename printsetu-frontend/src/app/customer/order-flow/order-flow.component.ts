import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CustomerService } from '../../core/services/customer.service';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import {
  ColorMode,
  DocumentInfo,
  DocumentStatus,
  PaperSize,
  PrintJobStatus,
  QuoteItemRequest,
  QuoteItemResponse,
  QuoteResponse,
  SideMode,
} from '../../core/models/models';

const STATUS_POLL_MS = 4000;
const DOC_STATUS_POLL_MS = 2000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const QUOTE_DEBOUNCE_MS = 250;
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
  imports: [CommonModule, ProgressSpinnerModule, StatusTagComponent],
  template: `
    <div class="page">
      <!-- ================= App bar ================= -->
      <header class="appbar">
        <div class="wrap">
          <div class="appbar__row">
            <div class="appbar__side">
              @if (canGoBack()) {
                <button type="button" class="icon-btn" (click)="goBack()" aria-label="Back">
                  <i class="pi pi-arrow-left"></i>
                </button>
              }
            </div>
            <div class="appbar__title">
              <span class="brand">PrintSetu</span>
              @if (shopName()) {
                <span class="shop">{{ shopName() }}</span>
              }
            </div>
            <div class="appbar__side appbar__side--end">
              @if (canStartOver()) {
                <button type="button" class="text-link" (click)="confirmStartOver()">Start over</button>
              }
            </div>
          </div>
          @if (!shopUnavailable()) {
          <div
            class="progress"
            role="progressbar"
            aria-valuemin="1"
            [attr.aria-valuemax]="stepItems.length"
            [attr.aria-valuenow]="currentStep() + 1"
            [attr.aria-label]="'Step ' + (currentStep() + 1) + ' of ' + stepItems.length + ': ' + stepItems[currentStep()].label"
          >
            @for (s of stepItems; track s.label; let i = $index) {
              <span class="progress__seg" [class.is-on]="i <= currentStep()"></span>
            }
          </div>
          <p class="progress__label">
            Step {{ currentStep() + 1 }} of {{ stepItems.length }} &middot;&nbsp;<strong>{{ stepItems[currentStep()].label }}</strong>
          </p>
          }
        </div>
      </header>

      <!-- ================= Content ================= -->
      <main class="content">
        <div class="wrap">
          @if (resolvingShop()) {
            <div class="center-block"><p-progressSpinner strokeWidth="4" /></div>
          } @else if (shopUnavailable(); as unavailable) {
            <div class="state-card state-card--unavailable" role="status">
              <i class="pi pi-clock"></i>
              <h2>This shop is temporarily unavailable</h2>
              <p>{{ unavailableDetail(unavailable) }}</p>
              <p class="state-card__shop">{{ shopName() }}</p>
            </div>
          } @else if (shopError()) {
            <div class="state-card state-card--error">
              <i class="pi pi-exclamation-circle"></i>
              <p>{{ shopError() }}</p>
            </div>
          } @else {
            <!-- ---------- Step 1: Upload & set up ---------- -->
            @if (currentStep() === 0) {
              <h1 class="title">Upload &amp; set up</h1>
              <p class="lead">Add your files, then choose how each one should be printed.</p>

              @if (uploadError()) {
                <div class="notice notice--error" role="alert">
                  <i class="pi pi-exclamation-circle"></i>
                  <span>{{ uploadError() }}</span>
                </div>
              }

              @if (uploads().length === 0) {
                <label class="dropzone" [class.is-drag]="dragging()" (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
                  <input class="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" (change)="onFilesChosen($event)" />
                  <span class="dropzone__icon"><i class="pi pi-cloud-upload"></i></span>
                  <span class="dropzone__title">Choose files to print</span>
                  <span class="dropzone__hint">PDF, JPG or PNG &middot; up to 25&nbsp;MB each</span>
                  <span class="dropzone__cta"><i class="pi pi-plus"></i> Select files</span>
                </label>
              } @else {
                <div class="files">
                  @for (u of uploads(); track u.documentId) {
                    <article class="file" [id]="'doc-' + u.documentId" [class.is-flash]="highlightId() === u.documentId">
                      <button type="button" class="file__head" (click)="toggleName(u.documentId)" [attr.aria-expanded]="isExpanded(u.documentId)" [title]="u.originalName">
                        <span class="file__icon" [class.is-pdf]="isPdf(u)" [class.is-bad]="u.status === 'ANALYSIS_FAILED'">
                          <i class="pi" [ngClass]="u.status === 'ANALYSIS_FAILED' ? 'pi-exclamation-triangle' : isPdf(u) ? 'pi-file-pdf' : 'pi-image'"></i>
                        </span>
                        <span class="fname" [class.is-open]="isExpanded(u.documentId)">
                          <span class="fname__base">{{ nameParts(u.originalName).base }}</span>
                          <span class="fname__ext">{{ nameParts(u.originalName).ext }}</span>
                        </span>
                        @if (u.status === 'PROCESSED') {
                          <span class="file__meta">{{ u.pageCount }} {{ u.pageCount === 1 ? 'page' : 'pages' }}</span>
                        } @else if (u.status === 'ANALYSIS_FAILED') {
                          <span class="file__meta file__meta--error">Failed</span>
                        } @else {
                          <p-progressSpinner strokeWidth="8" [style]="{ width: '18px', height: '18px' }" />
                        }
                      </button>

                      @if (u.status === 'PROCESSED') {
                        <div class="opts">
                          <div class="opt">
                            <span class="opt__label">Paper</span>
                            <div class="seg" role="radiogroup" aria-label="Paper size">
                              @for (p of paperSizes; track p) {
                                <button type="button" class="seg__btn" role="radio" [attr.aria-checked]="u.options.paperSize === p" [class.is-on]="u.options.paperSize === p" (click)="setOption(u, 'paperSize', p)">
                                  {{ paperLabel(p) }}
                                </button>
                              }
                            </div>
                          </div>

                          <div class="opts__pair">
                            <div class="opt">
                              <span class="opt__label">Color</span>
                              <div class="seg" role="radiogroup" aria-label="Color">
                                @for (c of colorModes; track c) {
                                  <button type="button" class="seg__btn" role="radio" [attr.aria-checked]="u.options.colorMode === c" [class.is-on]="u.options.colorMode === c" (click)="setOption(u, 'colorMode', c)">
                                    {{ c === 'BW' ? 'B&W' : 'Color' }}
                                  </button>
                                }
                              </div>
                            </div>
                            <div class="opt">
                              <span class="opt__label">Sides</span>
                              <div class="seg" role="radiogroup" aria-label="Sides">
                                @for (s of sideModes; track s) {
                                  <button type="button" class="seg__btn" role="radio" [attr.aria-checked]="u.options.sideMode === s" [class.is-on]="u.options.sideMode === s" (click)="setOption(u, 'sideMode', s)">
                                    {{ s === 'SIMPLEX' ? 'Single' : 'Double' }}
                                  </button>
                                }
                              </div>
                            </div>
                          </div>

                          <div class="opt opt--row">
                            <span class="opt__label">Copies</span>
                            <div class="qty" role="group" aria-label="Copies">
                              <button type="button" class="qty__btn" (click)="stepCopies(u, -1)" [disabled]="u.options.copies <= 1" aria-label="Fewer copies">
                                <i class="pi pi-minus"></i>
                              </button>
                              <input
                                class="qty__input"
                                type="text"
                                inputmode="numeric"
                                pattern="[0-9]*"
                                maxlength="3"
                                aria-label="Number of copies"
                                [value]="u.options.copies"
                                (focus)="$any($event.target).select()"
                                (change)="setCopies(u, $any($event.target))"
                                (keydown.enter)="$any($event.target).blur()"
                              />
                              <button type="button" class="qty__btn" (click)="stepCopies(u, 1)" [disabled]="u.options.copies >= 999" aria-label="More copies">
                                <i class="pi pi-plus"></i>
                              </button>
                            </div>
                          </div>

                          @if (lineFor(u.documentId); as line) {
                            <div class="file__price">
                              <span>{{ line.billablePages }} {{ line.billablePages === 1 ? 'page' : 'pages' }} to print</span>
                              <strong>{{ money(line.amount) }}</strong>
                            </div>
                          }
                        </div>
                      } @else if (u.status === 'ANALYSIS_FAILED') {
                        <p class="file__note file__note--error">We couldn't read this file. Try a different PDF, JPG or PNG.</p>
                      } @else {
                        <p class="file__note">Checking your file&hellip;</p>
                      }
                    </article>
                  }
                </div>

                <label class="add-more" [class.is-drag]="dragging()" (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
                  <input class="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" (change)="onFilesChosen($event)" />
                  <i class="pi pi-plus"></i> Add more files
                </label>
              }

              @if (uploading()) {
                <div class="uploading"><p-progressSpinner strokeWidth="6" [style]="{ width: '20px', height: '20px' }" /> Uploading&hellip;</div>
              }
            }

            <!-- ---------- Step 2: Review ---------- -->
            @if (currentStep() === 1) {
              <h1 class="title">Review your order</h1>
              <p class="lead">Check the details, then confirm to send it to the shop.</p>

              @if (quote(); as q) {
                <section class="review">
                  @for (line of reviewLines(); track line.documentId) {
                    <div class="rline">
                      <div class="rline__main">
                        <span class="fname">
                          <span class="fname__base">{{ nameParts(line.name).base }}</span>
                          <span class="fname__ext">{{ nameParts(line.name).ext }}</span>
                        </span>
                        <span class="rline__meta">{{ line.summary }}</span>
                        <button type="button" class="text-link text-link--small" (click)="editDoc(line.documentId)">Edit</button>
                      </div>
                      <strong class="rline__amount">{{ money(line.amount) }}</strong>
                    </div>
                  }
                  <div class="rtotal">
                    <span>Total</span>
                    <strong>{{ money(q.amount) }}</strong>
                  </div>
                </section>

                <div class="notice notice--info">
                  <i class="pi pi-info-circle"></i>
                  <span>No online payment. Pay at the shop counter if required.</span>
                </div>
              } @else {
                <div class="center-block"><p-progressSpinner strokeWidth="4" /></div>
              }
            }

            <!-- ---------- Step 3: Done ---------- -->
            @if (currentStep() === 2 && jobStatus(); as job) {
              <section class="done">
                <span class="done__icon" [class.is-warn]="statusTone(job.status) === 'warn'" [class.is-bad]="statusTone(job.status) === 'bad'">
                  <i class="pi" [ngClass]="statusTone(job.status) === 'bad' ? 'pi-times' : statusTone(job.status) === 'warn' ? 'pi-clock' : 'pi-check'"></i>
                </span>
                <h1 class="title title--center">{{ statusCopy(job.status) }}</h1>
                <div class="token">
                  <span class="token__label">Your token</span>
                  <strong class="token__value">#{{ tokenNumber() }}</strong>
                </div>
                <app-status-tag [status]="job.status" />
                <p class="hint">Show or quote this number at the counter for anything about this order.</p>
              </section>
            }
          }
        </div>
      </main>

      <!-- ================= Bottom action bar ================= -->
      @if (!resolvingShop() && !shopError() && !shopUnavailable()) {
        @if (currentStep() === 0) {
          <footer class="actionbar">
            <div class="wrap">
              @if (uploads().length > 0) {
                <div class="summary">
                  <span class="summary__label">
                    {{ processedUploads().length }} {{ processedUploads().length === 1 ? 'file' : 'files' }} ready
                    @if (pendingCount() > 0) { <span class="summary__pending">&middot; {{ pendingCount() }} checking</span> }
                  </span>
                  @if (quote(); as q) {
                    <strong class="summary__total" [class.is-stale]="quoting()">{{ money(q.amount) }}</strong>
                  } @else if (quoting()) {
                    <p-progressSpinner strokeWidth="8" [style]="{ width: '18px', height: '18px' }" />
                  }
                </div>
              }
              <button type="button" class="btn btn--primary" [disabled]="!canContinue()" (click)="goToReview()">
                @if (uploads().length === 0) { Add a file to continue } @else { Continue <i class="pi pi-arrow-right"></i> }
              </button>
            </div>
          </footer>
        }
        @if (currentStep() === 1 && quote(); as q) {
          <footer class="actionbar">
            <div class="wrap">
              <div class="summary">
                <span class="summary__label">Total</span>
                <strong class="summary__total">{{ money(q.amount) }}</strong>
              </div>
              <button type="button" class="btn btn--primary" [disabled]="confirming()" (click)="confirm()">
                @if (confirming()) { <i class="pi pi-spin pi-spinner"></i> Sending&hellip; } @else { <i class="pi pi-check"></i> Confirm order }
              </button>
            </div>
          </footer>
        }
        @if (currentStep() === 2 && jobStatus()) {
          <footer class="actionbar">
            <div class="wrap">
              <button type="button" class="btn btn--secondary" (click)="confirmStartOver()">Print something else</button>
            </div>
          </footer>
        }
      }
    </div>
  `,
  styles: [
    `
      /* Customer flow: mobile-first. 8px spacing grid, one column, 48px+ touch
         targets, and every text run is allowed to shrink (min-width: 0) so
         nothing — file names, inputs — can push past the screen edge. */
      :host {
        display: block;
        --ink: #0f172a;
        --muted: #64748b;
        --line: #e6eaf2;
        --surface: #ffffff;
        --soft: #f3f5fa;
        --radius: 16px;
      }
      .page {
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, #eef2ff 0, #f7f8fc 240px);
        color: var(--ink);
      }
      .wrap {
        width: 100%;
        max-width: 640px;
        margin: 0 auto;
        padding-inline: 16px;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      /* ---------- App bar ---------- */
      .appbar {
        position: sticky;
        top: 0;
        z-index: 20;
        padding-top: env(safe-area-inset-top);
        background: rgba(255, 255, 255, 0.86);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-bottom: 1px solid var(--line);
      }
      .appbar__row {
        display: grid;
        grid-template-columns: 72px minmax(0, 1fr) 72px;
        align-items: center;
        min-height: 56px;
      }
      .appbar__side {
        display: flex;
        align-items: center;
      }
      .appbar__side--end {
        justify-content: flex-end;
      }
      .appbar__title {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
        line-height: 1.2;
      }
      .brand {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--p-primary-600);
      }
      .shop {
        max-width: 100%;
        font-size: 0.75rem;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .icon-btn {
        width: 44px;
        height: 44px;
        margin-left: -8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 12px;
        background: transparent;
        color: #334155;
        font-size: 1.125rem;
        cursor: pointer;
      }
      .icon-btn:active {
        background: var(--soft);
      }
      .text-link {
        padding: 8px 0 8px 8px;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--muted);
        cursor: pointer;
        white-space: nowrap;
      }
      .text-link:hover {
        color: var(--p-primary-600);
      }
      .text-link--small {
        padding: 0;
        font-size: 0.75rem;
        color: var(--p-primary-600);
      }

      .progress {
        display: flex;
        gap: 6px;
        padding-top: 4px;
      }
      .progress__seg {
        flex: 1 1 0;
        height: 4px;
        border-radius: 999px;
        background: #dfe4ee;
        transition: background 0.2s ease;
      }
      .progress__seg.is-on {
        background: var(--p-primary-600);
      }
      .progress__label {
        margin: 0;
        padding: 8px 0 12px;
        text-align: center;
        font-size: 0.75rem;
        color: var(--muted);
      }
      .progress__label strong {
        color: #334155;
        font-weight: 600;
      }

      /* ---------- Content ---------- */
      .content {
        flex: 1 1 auto;
        padding-block: 24px 32px;
      }
      .title {
        margin: 0 0 4px;
        font-size: 1.5rem;
        line-height: 1.25;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .title--center {
        text-align: center;
      }
      .lead {
        margin: 0 0 24px;
        font-size: 0.9375rem;
        line-height: 1.5;
        color: var(--muted);
      }
      .center-block {
        display: flex;
        justify-content: center;
        padding: 48px 0;
      }
      .uploading {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        font-size: 0.875rem;
        color: var(--muted);
      }

      .notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 0 0 16px;
        padding: 12px 16px;
        border-radius: 12px;
        font-size: 0.875rem;
        line-height: 1.4;
      }
      .notice i {
        margin-top: 2px;
      }
      .notice--error {
        background: #fef2f2;
        color: #b91c1c;
      }
      .notice--info {
        margin: 16px 0 0;
        background: #eef2ff;
        color: #3730a3;
      }
      .state-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 32px 24px;
        border-radius: var(--radius);
        background: var(--surface);
        border: 1px solid var(--line);
        text-align: center;
      }
      .state-card i {
        font-size: 1.75rem;
      }
      .state-card p {
        margin: 0;
        line-height: 1.5;
      }
      .state-card--error i,
      .state-card--error p {
        color: #b91c1c;
      }
      .state-card--unavailable {
        gap: 10px;
        padding: 40px 24px;
      }
      .state-card--unavailable i {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        margin-bottom: 4px;
        border-radius: 50%;
        background: #fef3c7;
        font-size: 1.75rem;
        color: #b45309;
      }
      .state-card--unavailable h2 {
        margin: 0;
        font-size: 1.25rem;
        line-height: 1.3;
        color: #0f172a;
      }
      .state-card--unavailable p {
        color: #64748b;
      }
      .state-card__shop {
        margin-top: 6px !important;
        padding: 4px 14px;
        border-radius: 999px;
        background: #f1f5f9;
        font-size: 0.875rem;
        font-weight: 600;
        color: #475569 !important;
      }

      /* ---------- Upload ---------- */
      .dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px 24px;
        border: 2px dashed #cbd5f5;
        border-radius: 20px;
        background: var(--surface);
        text-align: center;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .dropzone.is-drag {
        border-color: var(--p-primary-500);
        background: var(--p-primary-50);
      }
      .dropzone__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        margin-bottom: 8px;
        border-radius: 50%;
        background: var(--p-primary-50);
        color: var(--p-primary-600);
        font-size: 1.75rem;
      }
      .dropzone__title {
        font-size: 1.0625rem;
        font-weight: 700;
      }
      .dropzone__hint {
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .dropzone__cta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 16px;
        min-height: 48px;
        padding: 0 24px;
        border-radius: 14px;
        background: var(--p-primary-600);
        color: #fff;
        font-weight: 600;
      }
      .add-more {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 52px;
        margin-top: 16px;
        border: 2px dashed #cbd5f5;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.6);
        color: var(--p-primary-600);
        font-weight: 600;
        cursor: pointer;
      }
      .add-more.is-drag {
        background: var(--p-primary-50);
        border-color: var(--p-primary-500);
      }

      /* ---------- File cards ---------- */
      .files {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .file {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        overflow: hidden;
        transition: box-shadow 0.3s ease, border-color 0.3s ease;
      }
      .file.is-flash {
        border-color: var(--p-primary-400);
        box-shadow: 0 0 0 4px var(--p-primary-100);
      }
      .file__head {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        min-width: 0;
        padding: 16px;
        border: none;
        background: none;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .file__icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: var(--p-primary-50);
        color: var(--p-primary-600);
        font-size: 1.125rem;
      }
      .file__icon.is-pdf {
        background: #fee2e2;
        color: #dc2626;
      }
      .file__icon.is-bad {
        background: #fef3c7;
        color: #d97706;
      }
      .file__meta {
        flex: 0 0 auto;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--muted);
        white-space: nowrap;
      }
      .file__meta--error {
        color: #dc2626;
      }
      .file__note {
        margin: 0;
        padding: 0 16px 16px;
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .file__note--error {
        color: #b91c1c;
      }

      /* File names: shrink in the middle so the extension always shows;
         tapping the row expands the whole name onto multiple lines. */
      .fname {
        flex: 1 1 auto;
        display: flex;
        min-width: 0;
        font-size: 0.9375rem;
        font-weight: 600;
      }
      .fname__base {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .fname__ext {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      .fname.is-open {
        flex-wrap: wrap;
        word-break: break-all;
      }
      .fname.is-open .fname__base {
        overflow: visible;
        white-space: normal;
      }

      /* ---------- Options ---------- */
      .opts {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
        border-top: 1px solid var(--line);
        background: #fbfcfe;
      }
      .opts__pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .opt {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
      }
      .opt--row {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .opt__label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .seg {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: 2px;
        padding: 3px;
        border-radius: 12px;
        background: #e9edf5;
      }
      .seg__btn {
        min-height: 40px;
        padding: 0 4px;
        border: none;
        border-radius: 9px;
        background: transparent;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .seg__btn.is-on {
        background: var(--surface);
        color: var(--p-primary-700);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
      }

      /* Copies: – [n] + . A grid with a fixed-width input, so it can never
         spill out of the row the way a raw number field did. */
      .qty {
        display: inline-grid;
        grid-template-columns: 44px 56px 44px;
        align-items: center;
        max-width: 100%;
        padding: 3px;
        border-radius: 12px;
        background: #e9edf5;
      }
      .qty__btn {
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 10px;
        background: var(--surface);
        color: var(--p-primary-700);
        font-size: 0.875rem;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
      }
      .qty__btn:disabled {
        background: transparent;
        color: #a3aec2;
        box-shadow: none;
        cursor: default;
      }
      .qty__btn:active:not(:disabled) {
        background: var(--p-primary-50);
      }
      .qty__input {
        width: 100%;
        min-width: 0;
        height: 44px;
        padding: 0;
        border: none;
        background: transparent;
        text-align: center;
        font: inherit;
        font-size: 1.0625rem;
        font-weight: 700;
        color: var(--ink);
        outline: none;
      }
      .file__price {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-top: 12px;
        border-top: 1px dashed var(--line);
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .file__price strong {
        font-size: 1rem;
        color: var(--ink);
      }

      /* ---------- Review ---------- */
      .review {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .rline {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 16px;
        border-bottom: 1px solid var(--line);
      }
      .rline__main {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        min-width: 0;
        flex: 1 1 auto;
      }
      .rline__main .fname {
        width: 100%;
      }
      .rline__meta {
        font-size: 0.8125rem;
        color: var(--muted);
        line-height: 1.4;
      }
      .rline__amount {
        flex: 0 0 auto;
        font-size: 1rem;
      }
      .rtotal {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 16px;
        background: #f6f8fd;
        font-weight: 600;
      }
      .rtotal strong {
        font-size: 1.5rem;
        letter-spacing: -0.02em;
      }

      /* ---------- Done ---------- */
      .done {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding-top: 24px;
        text-align: center;
      }
      .done__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: #dcfce7;
        color: #16a34a;
        font-size: 2rem;
      }
      .done__icon.is-warn {
        background: #fef3c7;
        color: #d97706;
      }
      .done__icon.is-bad {
        background: #fee2e2;
        color: #dc2626;
      }
      .token {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 200px;
        padding: 16px 32px;
        border-radius: 20px;
        background: var(--p-primary-50);
        border: 1px solid var(--p-primary-100);
      }
      .token__label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--p-primary-600);
      }
      .token__value {
        font-size: 3rem;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--p-primary-700);
      }
      .hint {
        margin: 0;
        max-width: 28ch;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--muted);
      }

      /* ---------- Bottom action bar (thumb zone) ---------- */
      .actionbar {
        position: sticky;
        bottom: 0;
        z-index: 20;
        padding-block: 12px;
        padding-bottom: calc(12px + env(safe-area-inset-bottom));
        background: rgba(255, 255, 255, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--line);
        box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.06);
      }
      .summary {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .summary__label {
        font-size: 0.8125rem;
        color: var(--muted);
      }
      .summary__pending {
        color: #d97706;
      }
      .summary__total {
        font-size: 1.25rem;
        letter-spacing: -0.02em;
        transition: opacity 0.15s ease;
      }
      .summary__total.is-stale {
        opacity: 0.45;
      }
      .btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        min-height: 56px;
        padding: 0 24px;
        border: none;
        border-radius: 16px;
        font: inherit;
        font-size: 1.0625rem;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.08s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .btn:active:not(:disabled) {
        transform: scale(0.985);
      }
      .btn--primary {
        background: var(--p-primary-600);
        color: #fff;
        box-shadow: 0 8px 20px rgba(79, 70, 229, 0.28);
      }
      .btn--primary:hover:not(:disabled) {
        background: var(--p-primary-700);
      }
      .btn--primary:disabled {
        background: #d5dbe8;
        color: #7c889d;
        box-shadow: none;
        cursor: default;
      }
      .btn--secondary {
        background: var(--surface);
        color: var(--p-primary-700);
        border: 1.5px solid #cfd6f0;
      }

      /* ---------- Larger screens ---------- */
      @media (min-width: 900px) {
        .wrap {
          padding-inline: 24px;
        }
        .content {
          padding-block: 40px 56px;
        }
        .title {
          font-size: 1.75rem;
        }
        .actionbar .wrap {
          display: flex;
          align-items: center;
          gap: 24px;
        }
        .actionbar .summary {
          flex: 1 1 auto;
          margin: 0;
        }
        .actionbar .btn {
          width: auto;
          min-width: 240px;
        }
        .opts {
          padding: 24px;
        }
        .file__head {
          padding: 20px 24px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
        }
      }
    `,
  ],
})
export class OrderFlowComponent implements OnInit, OnDestroy {
  currentStep = signal(0);
  /** Three steps: upload + set up options, review, done (confirmation / live status). */
  stepItems: { label: string }[] = [{ label: 'Upload' }, { label: 'Review' }, { label: 'Done' }];

  resolvingShop = signal(true);
  shopError = signal<string | null>(null);
  /** The heading already says "temporarily unavailable", so only show what the server adds to it. */
  unavailableDetail(message: string): string {
    return message.replace(/^This shop is temporarily unavailable\.?\s*/i, '').trim() || 'Please try again later.';
  }
  /** The shop exists but is not taking orders (suspended, overdue, or at its plan limit). */
  shopUnavailable = signal<string | null>(null);
  shopName = signal<string | null>(null);
  shopCode!: string;

  sessionId = signal<string | null>(null);
  private sessionToken = '';
  uploads = signal<UploadEntry[]>([]);
  processedUploads = computed(() => this.uploads().filter((u) => u.status === 'PROCESSED'));
  pendingCount = computed(() => this.uploads().filter((u) => u.status === 'UPLOADED' || u.status === 'PROCESSING').length);
  dragging = signal(false);
  highlightId = signal<string | null>(null);
  private expanded = signal<ReadonlySet<string>>(new Set());

  uploading = signal(false);
  uploadError = signal<string | null>(null);
  private docPollHandle?: ReturnType<typeof setInterval>;

  paperSizes: PaperSize[] = ['A4', 'A3', 'LETTER', 'LEGAL'];
  colorModes: ColorMode[] = ['BW', 'COLOR'];
  sideModes: SideMode[] = ['SIMPLEX', 'DUPLEX'];

  quoting = signal(false);
  quote = signal<QuoteResponse | null>(null);
  private quoteSeq = 0;
  private recalcTimer?: ReturnType<typeof setTimeout>;
  private processedKey = '';

  canContinue = computed(
    () =>
      this.processedUploads().length > 0 &&
      this.pendingCount() === 0 &&
      !this.uploading() &&
      !this.quoting() &&
      !!this.quote(),
  );
  canGoBack = computed(() => this.currentStep() === 1);
  canStartOver = computed(
    () => !this.resolvingShop() && !this.shopError() && !this.shopUnavailable() && this.currentStep() !== 2 && (!!this.sessionId() || !!this.jobId()),
  );
  reviewLines = computed(() => {
    const q = this.quote();
    if (!q) return [];
    const byId = new Map(this.uploads().map((u) => [u.documentId, u]));
    return q.items.map((item) => {
      const u = byId.get(item.documentId);
      const o = u?.options;
      const pages = `${item.billablePages} ${item.billablePages === 1 ? 'page' : 'pages'}`;
      return {
        documentId: item.documentId,
        name: u?.originalName ?? 'Document',
        amount: item.amount,
        summary: o
          ? `${this.paperLabel(o.paperSize)} · ${o.colorMode === 'BW' ? 'B&W' : 'Color'} · ${o.sideMode === 'SIMPLEX' ? 'Single-sided' : 'Double-sided'} · ×${o.copies} · ${pages}`
          : pages,
      };
    });
  });

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
    private readonly confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.shopCode = this.route.snapshot.paramMap.get('shopCode')!;
    this.customerService.resolveShop(this.shopCode).subscribe({
      next: (res) => {
        this.shopName.set(res.shopName);
        this.resolvingShop.set(false);
        if (res.available === false) {
          this.shopUnavailable.set(res.unavailableMessage ?? 'Please try again later.');
          return;
        }
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
    if (this.recalcTimer) clearTimeout(this.recalcTimer);
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
          this.currentStep.set(2);
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
    this.quoteSeq++;
    this.processedKey = '';
    if (this.recalcTimer) clearTimeout(this.recalcTimer);
    this.expanded.set(new Set());
    this.highlightId.set(null);

    this.confirming.set(false);
    this.jobId.set(null);
    this.tokenNumber.set(null);
    this.jobStatusToken = '';
    this.jobStatus.set(null);

    this.currentStep.set(0);
    this.scrollTop();
  }

  /** Asks first — starting over throws away the current files/settings. */
  confirmStartOver(): void {
    const status = this.jobStatus()?.status;
    if (this.jobId() && status && TERMINAL_JOB_STATUSES.includes(status)) {
      this.startNewOrder();
      return;
    }
    this.confirmationService.confirm({
      header: 'Start over?',
      message: this.jobId()
        ? 'This stops tracking the current order on this phone. The shop still has your request, so keep your token number.'
        : 'Your current files and print settings will be cleared.',
      icon: 'pi pi-refresh',
      acceptLabel: 'Start over',
      rejectLabel: 'Keep going',
      accept: () => this.startNewOrder(),
    });
  }

  onFilesChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // lets the same file be picked again
    void this.uploadFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.uploadFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  private async uploadFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.uploadError.set(null);
    const problems: string[] = [];
    const valid = files.filter((file) => {
      if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        problems.push(`"${file.name}" isn't a PDF, JPG or PNG.`);
        return false;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(`"${file.name}" is larger than 25 MB.`);
        return false;
      }
      return true;
    });

    this.uploading.set(true);
    for (const file of valid) {
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
        problems.push(`"${file.name}" could not be uploaded. Please try again.`);
      }
    }
    this.uploading.set(false);
    if (problems.length) this.uploadError.set(problems.join(' '));
    this.processedKey = this.processedUploads().map((u) => u.documentId).join(',');
    this.startAnalysisPollingIfNeeded();
    this.recalculate();
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
    // A file just finished being analysed (or was restored): price it.
    const key = this.processedUploads().map((u) => u.documentId).join(',');
    if (key !== this.processedKey) {
      this.processedKey = key;
      this.recalculate();
    }
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

  // ---------- Navigation ----------

  goToReview(): void {
    if (!this.canContinue()) return;
    this.currentStep.set(1);
    this.scrollTop();
  }

  goBack(): void {
    if (this.currentStep() === 1) {
      this.currentStep.set(0);
      this.scrollTop();
    }
  }

  /** "Edit" on the review screen: back to the file's card, highlighted. */
  editDoc(documentId: string): void {
    this.currentStep.set(0);
    this.highlightId.set(documentId);
    setTimeout(() => document.getElementById('doc-' + documentId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    setTimeout(() => this.highlightId.set(null), 1800);
  }

  private scrollTop(): void {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- File cards ----------

  paperLabel(p: PaperSize): string {
    return p === 'LETTER' ? 'Letter' : p === 'LEGAL' ? 'Legal' : p;
  }

  isPdf(u: UploadEntry): boolean {
    return u.mimeType === 'application/pdf';
  }

  /** Splits "report_final.pdf" so the extension can stay visible when the name is shortened. */
  nameParts(name: string): { base: string; ext: string } {
    const dot = name.lastIndexOf('.');
    return dot > 0 && name.length - dot <= 6 ? { base: name.slice(0, dot), ext: name.slice(dot) } : { base: name, ext: '' };
  }

  isExpanded(id: string): boolean {
    return this.expanded().has(id);
  }

  toggleName(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  setOption<K extends keyof DocOptions>(doc: UploadEntry, key: K, value: DocOptions[K]): void {
    if (doc.options[key] === value) return;
    doc.options[key] = value;
    this.scheduleRecalc();
  }

  stepCopies(doc: UploadEntry, delta: number): void {
    this.setCopiesValue(doc, doc.options.copies + delta);
  }

  setCopies(doc: UploadEntry, input: HTMLInputElement): void {
    const n = parseInt(input.value.replace(/\D/g, ''), 10);
    this.setCopiesValue(doc, Number.isFinite(n) ? n : doc.options.copies);
    input.value = String(doc.options.copies);
  }

  private setCopiesValue(doc: UploadEntry, value: number): void {
    const copies = Math.min(999, Math.max(1, Math.round(value)));
    if (copies === doc.options.copies) return;
    doc.options.copies = copies;
    this.scheduleRecalc();
  }

  // ---------- Pricing ----------

  lineFor(documentId: string): QuoteItemResponse | null {
    return this.quote()?.items.find((i) => i.documentId === documentId) ?? null;
  }

  money(amount: string | number): string {
    const currency = this.quote()?.currency ?? 'INR';
    return currency === 'INR' ? `₹${amount}` : `${currency} ${amount}`;
  }

  /** Option taps come in bursts (e.g. holding +): mark the price stale now, ask the server once things settle. */
  private scheduleRecalc(): void {
    this.quoting.set(true);
    if (this.recalcTimer) clearTimeout(this.recalcTimer);
    this.recalcTimer = setTimeout(() => this.recalculate(), QUOTE_DEBOUNCE_MS);
  }

  recalculate(): void {
    const docs = this.processedUploads();
    if (docs.length === 0) {
      this.quoteSeq++;
      this.quote.set(null);
      this.quoting.set(false);
      return;
    }
    const seq = ++this.quoteSeq;
    this.quoting.set(true);
    const items: QuoteItemRequest[] = docs.map((d) => ({ documentId: d.documentId, ...d.options }));
    this.customerService.quote(items, this.sessionToken).subscribe({
      next: (q) => {
        if (seq !== this.quoteSeq) return; // a newer quote is already on its way
        this.quote.set(q);
        this.quoting.set(false);
      },
      error: () => {
        if (seq === this.quoteSeq) this.quoting.set(false);
      },
    });
  }

  // ---------- Status copy ----------

  statusCopy(status: PrintJobStatus): string {
    switch (status) {
      case 'PRINT_ELIGIBLE':
        return 'Order confirmed';
      case 'QUEUED':
        return 'Queued at the shop';
      case 'PRINTING':
        return 'Printing now…';
      case 'PRINTED':
      case 'RETENTION_PENDING':
        return 'All done. Please collect your printout';
      case 'PRINT_FAILED':
        return 'Printing failed. Please check with the shop';
      case 'AGENT_OFFLINE':
        return "The shop's printer is offline. Your order is still queued";
      default:
        return 'Tracking your order…';
    }
  }

  statusTone(status: PrintJobStatus): 'ok' | 'warn' | 'bad' {
    if (status === 'PRINT_FAILED') return 'bad';
    if (status === 'AGENT_OFFLINE') return 'warn';
    return 'ok';
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
        this.currentStep.set(2);
        this.scrollTop();
        this.persist();
        this.startPolling();
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
