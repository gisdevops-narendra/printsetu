import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrinterRow } from '../../core/models/models';

type PrinterStatus = PrinterRow['status'];

const PRINTER_POLL_MS = 5000;

@Component({
  selector: 'app-print-agent',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule, TagModule],
  template: `
    <h1 class="page-title">Print Agent</h1>
    <p class="page-subtitle">
      Install this small program on the computer connected to your printer so PrintSetu can send
      print jobs to it automatically.
    </p>

    <div class="surface-card-flat p-4 mb-4" style="max-width: 640px">
      <p-button
        label="Download Print Agent"
        icon="pi pi-download"
        [loading]="downloading()"
        (onClick)="download()"
      />
      <p class="text-sm text-color-secondary mt-3 mb-0">
        This creates a one-time setup file made just for your shop — you won't need to type in
        any codes or edit any files.
      </p>
    </div>

    <div class="surface-card-flat p-4 mb-4" style="max-width: 640px">
      <h3 class="mt-0">How to install it</h3>
      <ol class="text-sm line-height-3 pl-3">
        <li>Click <strong>Download Print Agent</strong> above. A file will be saved to your computer.</li>
        <li>Open the downloaded file, then double-click <strong>Install.bat</strong> inside it.</li>
        <li>
          If Windows asks "Do you want to allow this app to make changes?", click
          <strong>Yes</strong>.
        </li>
        <li>Wait a few seconds — it will tell you your shop is connected.</li>
      </ol>
      <p class="text-sm text-color-secondary mb-0">
        That's it. It will keep running quietly in the background, start automatically whenever
        this computer turns on, and restart itself if it's ever interrupted — you shouldn't need
        to touch it again.
      </p>
    </div>

    <div class="surface-card-flat p-4" style="max-width: 640px">
      <h3 class="mt-0 flex align-items-center justify-content-between">
        <span>Connected printers</span>
        @if (loading()) {
          <p-progressSpinner strokeWidth="6" [style]="{ width: '18px', height: '18px' }" />
        }
      </h3>
      @if (!loading() && printers().length === 0) {
        <p class="text-sm text-color-secondary mb-0">
          No Print Agent has connected yet. Download and install it above, then check back here.
        </p>
      }
      @for (printer of printers(); track printer.id) {
        <div class="flex align-items-center justify-content-between py-2 border-bottom-1 surface-border">
          <span class="text-sm">{{ printer.printerName }}</span>
          <p-tag [value]="statusLabel(printer.status)" [severity]="statusSeverity(printer.status)" />
        </div>
      }
    </div>
  `,
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

  statusSeverity(status: PrinterStatus): 'success' | 'danger' | 'secondary' {
    return status === 'ONLINE' ? 'success' : status === 'OFFLINE' ? 'danger' : 'secondary';
  }
}
