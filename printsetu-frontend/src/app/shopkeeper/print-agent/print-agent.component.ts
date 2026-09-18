import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrinterRow } from '../../core/models/models';

type PrinterStatus = PrinterRow['status'];

const PRINTER_POLL_MS = 5000;

@Component({
  selector: 'app-print-agent',
  standalone: true,
  imports: [CommonModule, DatePipe, ButtonModule, ProgressSpinnerModule],
  template: `
    <h1 class="page-title">Print Agent</h1>
    <p class="page-subtitle">
      Install this small program on the computer connected to your printer so PrintSetu can send
      print jobs to it automatically.
    </p>

    <div class="pa-layout">
    <div class="pa-col">
    <div class="pa-hero surface-card-flat">
      <div class="pa-hero__top">
        <div class="pa-hero__icon"><i class="pi pi-desktop"></i></div>
        <div>
          <h2 class="pa-hero__title">Connect your printer in under a minute</h2>
          <p class="pa-hero__desc">
            Download the Print Agent and run one installer &mdash; PrintSetu will start sending jobs
            straight to your printer. No codes, no config files.
          </p>
        </div>
      </div>

      <p-button
        label="Download Print Agent"
        icon="pi pi-download"
        size="large"
        [loading]="downloading()"
        (onClick)="download()"
        styleClass="pa-hero__cta"
      />

      <div class="pa-stepper">
        <div class="pa-stepper__step">
          <div class="pa-stepper__icon"><i class="pi pi-download"></i></div>
          <div class="pa-stepper__label">Download</div>
        </div>
        <div class="pa-stepper__line"></div>
        <div class="pa-stepper__step">
          <div class="pa-stepper__icon"><i class="pi pi-box"></i></div>
          <div class="pa-stepper__label">Run Install.bat</div>
        </div>
        <div class="pa-stepper__line"></div>
        <div class="pa-stepper__step">
          <div class="pa-stepper__icon"><i class="pi pi-shield"></i></div>
          <div class="pa-stepper__label">Click &ldquo;Yes&rdquo;</div>
        </div>
        <div class="pa-stepper__line"></div>
        <div class="pa-stepper__step">
          <div class="pa-stepper__icon pa-stepper__icon--done"><i class="pi pi-check-circle"></i></div>
          <div class="pa-stepper__label">Connected</div>
        </div>
      </div>

      <p class="pa-hero__note">
        <i class="pi pi-info-circle"></i>
        Runs quietly in the background, starts automatically when this computer turns on, and
        restarts itself if ever interrupted.
      </p>
    </div>

    </div>
    <div class="pa-col">
    <div class="pa-printers-header">
      <h3 class="pa-section-title">Connected printers</h3>
      @if (loading()) {
        <p-progressSpinner strokeWidth="6" [style]="{ width: '15px', height: '15px' }" />
      } @else if (printers().length > 0) {
        <span class="pa-live-dot" title="Auto-refreshes every 5s"></span>
      }
    </div>

    @if (!loading() && printers().length === 0) {
      <div class="pa-printer-empty">
        <i class="pi pi-print"></i>
        <span class="font-medium">No Print Agent has connected yet</span>
        <span class="text-sm text-color-secondary">Download and install it above, then check back here.</span>
      </div>
    } @else {
      <div class="pa-printer-grid">
        @for (printer of printers(); track printer.id) {
          <div class="pa-device-card" [class.online]="printer.status === 'ONLINE'" [class.offline]="printer.status === 'OFFLINE'">
            <span class="pa-device-card__dot"></span>
            <div class="pa-device-card__icon"><i class="pi pi-print"></i></div>
            <div class="pa-device-card__name">{{ printer.printerName }}</div>
            <div class="pa-device-card__status">{{ statusLabel(printer.status) }}</div>
            @if (printer.status === 'OFFLINE' && printer.lastHeartbeatAt) {
              <div class="pa-device-card__meta">Last seen {{ printer.lastHeartbeatAt | date: 'MMM d, h:mm a' }}</div>
            }
          </div>
        }
      </div>
    }
    </div>
    </div>
  `,
  styles: [
    `
      .pa-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0 clamp(1.25rem, 2.5vw, 2.5rem);
        align-items: start;
      }
      @media (min-width: 1100px) {
        .pa-layout {
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
        }
      }
      .pa-col {
        min-width: 0;
      }

      .pa-hero {
        padding: 2rem;
        margin-bottom: 2rem;
      }

      .pa-hero__top {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .pa-hero__icon {
        flex-shrink: 0;
        width: 3rem;
        height: 3rem;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.3rem;
        background: var(--p-primary-50);
        color: var(--p-primary-600);
      }

      .pa-hero__title {
        margin: 0 0 0.375rem;
        font-size: 1.125rem;
        font-weight: 700;
        color: #0f172a;
      }

      .pa-hero__desc {
        margin: 0;
        font-size: 0.875rem;
        color: #64748b;
        line-height: 1.5;
      }

      :host ::ng-deep .pa-hero__cta {
        margin-bottom: 2rem;
      }

      :host ::ng-deep .pa-hero__cta.p-button {
        border: none;
        border-radius: 999px;
        padding: 0.875rem 1.875rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
        box-shadow: 0 10px 24px -6px rgba(79, 70, 229, 0.45);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }

      :host ::ng-deep .pa-hero__cta.p-button:not(:disabled):hover {
        background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
        transform: translateY(-2px);
        box-shadow: 0 14px 28px -6px rgba(79, 70, 229, 0.5);
      }

      :host ::ng-deep .pa-hero__cta.p-button:not(:disabled):active {
        transform: translateY(0);
        box-shadow: 0 8px 18px -6px rgba(79, 70, 229, 0.4);
      }

      .pa-stepper {
        display: flex;
        align-items: flex-start;
        gap: 0.25rem;
        padding: 1.25rem 0.5rem;
        background: #f8fafc;
        border-radius: 14px;
        margin-bottom: 1.25rem;
      }

      .pa-stepper__step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        width: 5.5rem;
        text-align: center;
      }

      .pa-stepper__icon {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.05rem;
        background: #ffffff;
        color: var(--p-primary-600);
        box-shadow: 0 0 0 4px var(--p-primary-50), 0 1px 2px rgba(15, 23, 42, 0.06);
      }

      .pa-stepper__icon--done {
        background: #dcfce7;
        color: #16a34a;
        box-shadow: 0 0 0 4px #f0fdf4, 0 1px 2px rgba(15, 23, 42, 0.06);
      }

      .pa-stepper__label {
        font-size: 0.75rem;
        font-weight: 600;
        color: #475569;
        line-height: 1.3;
      }

      .pa-stepper__line {
        flex: 1 1 auto;
        min-width: 12px;
        height: 2px;
        background: var(--p-primary-100);
        margin-top: 1.375rem;
      }

      .pa-hero__note {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        margin: 0;
        font-size: 0.8125rem;
        color: #64748b;
        line-height: 1.5;
      }

      .pa-hero__note i {
        margin-top: 0.15rem;
        flex-shrink: 0;
      }

      .pa-printers-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.875rem;
      }

      .pa-section-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        color: #0f172a;
      }

      .pa-live-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
      }

      .pa-printer-empty {
        border: 1.5px dashed #cbd5e1;
        border-radius: 14px;
        background: #f8fafc;
        padding: 2.5rem 1.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        text-align: center;
      }

      .pa-printer-empty i {
        font-size: 1.75rem;
        color: #cbd5e1;
        margin-bottom: 0.25rem;
      }

      .pa-printer-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 1rem;
      }

      .pa-device-card {
        position: relative;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        padding: 1.25rem 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 0.375rem;
        transition: box-shadow 0.15s ease, border-color 0.15s ease;
      }

      .pa-device-card:hover {
        border-color: #cbd5e1;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
      }

      .pa-device-card__dot {
        position: absolute;
        top: 0.875rem;
        right: 0.875rem;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: #cbd5e1;
      }

      .pa-device-card.online .pa-device-card__dot {
        background: #22c55e;
        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
      }

      .pa-device-card.offline .pa-device-card__dot {
        background: #ef4444;
      }

      .pa-device-card__icon {
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        background: #f1f5f9;
        color: #94a3b8;
        margin-bottom: 0.25rem;
      }

      .pa-device-card.online .pa-device-card__icon {
        background: #dcfce7;
        color: #16a34a;
      }

      .pa-device-card.offline .pa-device-card__icon {
        background: #fee2e2;
        color: #dc2626;
      }

      .pa-device-card__name {
        font-weight: 600;
        font-size: 0.8125rem;
        color: #1e293b;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pa-device-card__status {
        font-size: 0.75rem;
        font-weight: 600;
        color: #94a3b8;
      }

      .pa-device-card.online .pa-device-card__status {
        color: #16a34a;
      }

      .pa-device-card.offline .pa-device-card__status {
        color: #dc2626;
      }

      .pa-device-card__meta {
        font-size: 0.6875rem;
        color: #94a3b8;
      }

      @media (max-width: 560px) {
        .pa-hero {
          padding: 1.5rem;
        }

        .pa-stepper {
          flex-wrap: wrap;
          justify-content: center;
          row-gap: 1rem;
        }

        .pa-stepper__line {
          display: none;
        }
      }
    `,
  ],
})
export class PrintAgentComponent implements OnInit, OnDestroy {
  downloading = signal(false);
  loading = signal(true);
  printers = signal<PrinterRow[]>([]);
  private pollHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.pollHandle = setInterval(() => this.refresh(), PRINTER_POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  private refresh(): void {
    this.shopkeeperService.listPrinters().subscribe({
      next: (printers) => {
        this.printers.set(printers);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  download(): void {
    this.downloading.set(true);
    this.shopkeeperService.downloadAgentPackage().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'PrintSetu-Print-Agent.zip';
        link.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
        this.messageService.add({
          severity: 'success',
          summary: 'Download started',
          detail: 'Open the downloaded file and run Install.bat to finish setup.',
        });
        this.refresh();
      },
      error: () => this.downloading.set(false),
    });
  }

  statusLabel(status: PrinterStatus): string {
    return status === 'ONLINE' ? 'Online' : status === 'OFFLINE' ? 'Offline' : 'Not connected yet';
  }
}
