import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrintJobRow } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    TooltipModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    StatusTagComponent,
    EllipsisDirective,
  ],
  template: `
    <div class="flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="page-title">Print Queue</h1>
        <p class="page-subtitle m-0">Incoming and pending print jobs for your shop.</p>
      </div>
      <div class="flex align-items-center gap-2">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button icon="pi pi-refresh" label="Refresh" severity="secondary" [text]="true" (onClick)="load()" />
      </div>
    </div>

    <p-table
      #dt
      [value]="enrichedJobs()"
      [loading]="loading()"
      [globalFilterFields]="['tokenNumber', 'documentNames', 'status']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="10"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 8%" pSortableColumn="tokenNumber">Token <p-sortIcon field="tokenNumber" /></th>
          <th style="width: 30%">Documents</th>
          <th style="width: 20%">Options</th>
          <th style="width: 10%" pSortableColumn="amount">Amount <p-sortIcon field="amount" /></th>
          <th style="width: 14%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 10%" pSortableColumn="createdAt">Received <p-sortIcon field="createdAt" /></th>
          <th style="width: 8%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td><span class="font-semibold">#{{ job.tokenNumber }}</span></td>
          <td>
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span appEllipsis #docRef="appEllipsis"
                  ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ item.document?.originalName }}</span></span
                >
              }
            </div>
          </td>
          <td class="text-xs">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ item.paperSize }} · {{ item.colorMode }} · {{ item.sideMode }} ×{{ item.copies }}</span>
              }
            </div>
          </td>
          <td>{{ job.currency }} {{ job.amount }}</td>
          <td><app-status-tag [status]="job.status" /></td>
          <td>{{ job.createdAt | date: 'short' }}</td>
          <td class="text-right">
            <div class="flex gap-2 justify-content-end align-items-center">
              @if (previewEnabled()) {
                <p-button
                  icon="pi pi-eye"
                  size="small"
                  severity="secondary"
                  [text]="true"
                  [loading]="previewingId() === job.id"
                  (onClick)="viewDocuments(job)"
                  [pTooltip]="job.items.length > 1 ? 'Preview these documents' : 'Preview this document'"
                />
              }
              @if (job.status === 'PRINT_ELIGIBLE' || job.status === 'AGENT_OFFLINE' || job.status === 'PRINT_FAILED') {
                <p-button label="PRINT" icon="pi pi-print" size="small" (onClick)="confirmPrint(job)" />
              }
              @if (job.status === 'PRINT_UNKNOWN') {
                <p-button label="Mark Printed" size="small" severity="success" [text]="true" (onClick)="reconcile(job, 'PRINTED')" />
                <p-button label="Mark Failed" size="small" severity="danger" [text]="true" (onClick)="reconcile(job, 'PRINT_FAILED')" />
              }
            </div>
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-inbox"></i><span>No pending jobs right now.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class QueueComponent implements OnInit {
  jobs = signal<PrintJobRow[]>([]);
  enrichedJobs = computed(() =>
    this.jobs().map((job) => ({
      ...job,
      documentNames: job.items.map((item) => item.document?.originalName).join(' '),
    })),
  );
  loading = signal(true);
  previewEnabled = signal(false);
  previewingId = signal<string | null>(null);

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.shopkeeperService.profile().subscribe((res) => {
      this.previewEnabled.set(!!res.shop?.printSettings?.documentPreviewEnabled);
    });
  }

  /** A print request can now bundle several documents (SRS extension) — preview each one in its own tab. */
  viewDocuments(job: PrintJobRow): void {
    this.previewingId.set(job.id);
    let remaining = job.items.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) this.previewingId.set(null);
    };
    for (const item of job.items) {
      this.shopkeeperService.previewUrl(item.documentId).subscribe({
        next: (res) => {
          window.open(res.url, '_blank', 'noopener');
          done();
        },
        error: done,
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.queue().subscribe((jobs) => {
      this.jobs.set(jobs);
      this.loading.set(false);
    });
  }

  private describe(job: PrintJobRow): string {
    return job.items.length === 1
      ? `"${job.items[0].document?.originalName}"`
      : `${job.items.length} documents (Token #${job.tokenNumber})`;
  }

  confirmPrint(job: PrintJobRow): void {
    this.confirmationService.confirm({
      message: `Send ${this.describe(job)} to the printer now?`,
      header: 'Confirm print',
      icon: 'pi pi-print',
      accept: () => {
        this.shopkeeperService.print(job.id).subscribe({
          next: (res) => {
            this.messageService.add({ severity: 'success', summary: res.message });
            this.load();
          },
        });
      },
    });
  }

  reconcile(job: PrintJobRow, outcome: 'PRINTED' | 'PRINT_FAILED'): void {
    this.confirmationService.confirm({
      message: `Confirm the actual outcome for ${this.describe(job)}? This cannot be undone.`,
      header: 'Reconcile job',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.reconcile(job.id, outcome).subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Job reconciled' });
          this.load();
        });
      },
    });
  }
}
