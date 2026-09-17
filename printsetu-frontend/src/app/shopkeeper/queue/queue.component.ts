import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrintJobRow } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, TooltipModule, StatusTagComponent, EllipsisDirective],
  template: `
    <div class="flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="page-title">Print Queue</h1>
        <p class="page-subtitle m-0">Incoming and pending print jobs for your shop.</p>
      </div>
      <p-button icon="pi pi-refresh" label="Refresh" severity="secondary" [text]="true" (onClick)="load()" />
    </div>

    <p-table
      [value]="jobs()"
      [loading]="loading()"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="10"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 26%">Document</th>
          <th style="width: 22%">Options</th>
          <th style="width: 12%">Amount</th>
          <th style="width: 14%">Status</th>
          <th style="width: 14%">Received</th>
          <th style="width: 12%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td>
            <span appEllipsis #docRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ job.document?.originalName }}</span></span
            >
          </td>
          <td class="text-xs">
            {{ job.optionsJson.paperSize }} · {{ job.optionsJson.colorMode }} · {{ job.optionsJson.sideMode }} ×{{ job.optionsJson.copies }}
          </td>
          <td>{{ job.currency }} {{ job.amount }}</td>
          <td><app-status-tag [status]="job.status" /></td>
          <td>{{ job.createdAt | date: 'short' }}</td>
          <td class="text-right">
            <div class="flex gap-2 justify-content-end align-items-center">
              @if (previewEnabled()) {
                <p-button
                  icon="pi pi-eye"
                  label="View"
                  size="small"
                  severity="secondary"
                  [text]="true"
                  [loading]="previewingId() === job.id"
                  (onClick)="viewDocument(job)"
                  pTooltip="Preview this document"
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
          <td colspan="6">
            <div class="table-empty"><i class="pi pi-inbox"></i><span>No pending jobs right now.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class QueueComponent implements OnInit {
  jobs = signal<PrintJobRow[]>([]);
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

  viewDocument(job: PrintJobRow): void {
    this.previewingId.set(job.id);
    this.shopkeeperService.previewUrl(job.documentId).subscribe({
      next: (res) => {
        this.previewingId.set(null);
        window.open(res.url, '_blank', 'noopener');
      },
      error: () => this.previewingId.set(null),
    });
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.queue().subscribe((jobs) => {
      this.jobs.set(jobs);
      this.loading.set(false);
    });
  }

  confirmPrint(job: PrintJobRow): void {
    this.confirmationService.confirm({
      message: `Send "${job.document?.originalName}" to the printer now?`,
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
      message: `Confirm the actual outcome for "${job.document?.originalName}"? This cannot be undone.`,
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
