import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { SubscriptionStatusService } from '../../core/services/subscription-status.service';
import { OrderAlertsService } from '../../core/services/order-alerts.service';
import { PrintJobRow, PrintJobStatus } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

const DONE: PrintJobStatus[] = ['PRINTED', 'RETENTION_PENDING', 'DELETED'];
const isDone = (status: PrintJobStatus) => DONE.includes(status);

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
    <div class="page-header">
      <div>
        <h1 class="page-title">Print Queue</h1>
        <p class="page-subtitle m-0">Incoming and pending print jobs for your shop.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button icon="pi pi-refresh" label="Refresh" severity="secondary" [text]="true" (onClick)="load()" />
      </div>
    </div>

    <p-table
      #dt
      [tableStyle]="{ 'min-width': '46rem' }"
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
          <th style="width: 23%">Documents</th>
          <th style="width: 17%; border-left: 1px solid var(--hdr-hover)">Options</th>
          <th style="width: 10%" pSortableColumn="amount">Amount <p-sortIcon field="amount" /></th>
          <th style="width: 14%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 13%" pSortableColumn="createdAt">Received <p-sortIcon field="createdAt" /></th>
          <th style="width: 15%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td data-label="Token"><span class="font-semibold">#{{ job.tokenNumber }}</span></td>
          <td data-label="Documents">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span appEllipsis #docRef="appEllipsis"
                  ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ item.document?.originalName }}</span></span
                >
              }
            </div>
          </td>
          <td class="text-xs" style="border-left: 1px solid var(--hdr-hover)" data-label="Options">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ item.paperSize }} · {{ item.colorMode }} · {{ item.sideMode }} ×{{ item.copies }}</span>
              }
            </div>
          </td>
          <td data-label="Amount">{{ job.currency }} {{ job.amount }}</td>
          <td data-label="Status"><app-status-tag [status]="job.status" /></td>
          <td data-label="Received">{{ job.createdAt | date: 'short' }}</td>
          <td class="text-right">
            <div class="flex flex-wrap gap-2 justify-content-end align-items-center row-gap-2">
              @if (!job.done) {
                <p-button
                  icon="pi pi-eye"
                  size="small"
                  severity="secondary"
                  [outlined]="true"
                  (onClick)="openEditor(job)"
                  pTooltip="View / edit documents"
                />
              }
              @if (job.done) {
                <span class="text-xs text-color-secondary"><i class="pi pi-check-circle"></i> {{ job.printedAt | date: 'shortTime' }}</span>
              } @else if (readOnly()) {
                <span class="text-xs paused" title="Your subscription needs attention, so new print requests are paused."><i class="pi pi-pause-circle"></i> Paused</span>
              } @else if (job.status === 'PRINT_ELIGIBLE' || job.status === 'AGENT_OFFLINE' || job.status === 'PRINT_FAILED') {
                <p-button label="PRINT" icon="pi pi-print" size="small" (onClick)="confirmPrint(job)" />
              }
              @if (job.status === 'PRINT_UNKNOWN' && !readOnly()) {
                <p-button label="Mark Printed" size="small" severity="success" [outlined]="true" (onClick)="reconcile(job, 'PRINTED')" />
                <p-button label="Mark Failed" size="small" severity="danger" [outlined]="true" (onClick)="reconcile(job, 'PRINT_FAILED')" />
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
  /** The live queue, kept fresh by OrderAlertsService (faster while a job is printing). */
  readonly jobs = computed(() => {
    const jobs = this.alerts.jobs();
    // Jobs still to do first (oldest first), then the ones that just finished (most recent first).
    const todo = jobs.filter((j) => !isDone(j.status));
    const done = jobs.filter((j) => isDone(j.status)).sort((a, b) => (b.printedAt ?? '').localeCompare(a.printedAt ?? ''));
    return [...todo, ...done];
  });
  enrichedJobs = computed(() =>
    this.jobs().map((job) => ({
      ...job,
      documentNames: job.items.map((item) => item.document?.originalName).join(' '),
      done: isDone(job.status),
    })),
  );
  readonly loading = computed(() => !this.alerts.loaded());
  /** Past due / expired / cancelled shops can look at orders but not print them. */
  readOnly = () => this.subscriptionStatus.readOnly();

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
    private readonly router: Router,
    private readonly subscriptionStatus: SubscriptionStatusService,
    private readonly alerts: OrderAlertsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** Dedicated full-page workspace to review/reorder/edit every document in this job before printing. */
  openEditor(job: PrintJobRow): void {
    this.router.navigate(['/shop/print-jobs', job.id, 'edit']);
  }

  load(): void {
    this.alerts.refresh();
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
