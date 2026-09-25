import { Component, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
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
import { printOptionsLabel } from '../../shared/utils/print-options.util';
import { t } from '../../core/i18n/i18n';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';

const DONE: PrintJobStatus[] = ['PRINTED', 'RETENTION_PENDING', 'DELETED'];
const isDone = (status: PrintJobStatus) => DONE.includes(status);

@Component({
  selector: 'app-queue',
  standalone: true,
  imports: [AppDatePipe, TranslatePipe, 
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
        <h1 class="page-title">{{ 'printOrders.print_orders' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'printOrders.your_customers_orders_waiting_to_be' | translate }}</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" [placeholder]="'common.search' | translate" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button icon="pi pi-refresh" [label]="'common.refresh' | translate" severity="secondary" [text]="true" (onClick)="load()" />
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
          <th style="width: 8%" pSortableColumn="tokenNumber">{{ 'common.order_no' | translate }} <p-sortIcon field="tokenNumber" /></th>
          <th style="width: 23%">{{ 'common.documents' | translate }}</th>
          <th style="width: 17%; border-left: 1px solid var(--hdr-hover)">{{ 'common.options' | translate }}</th>
          <th style="width: 10%" pSortableColumn="amount">{{ 'common.amount' | translate }} <p-sortIcon field="amount" /></th>
          <th style="width: 14%" pSortableColumn="status">{{ 'common.status' | translate }} <p-sortIcon field="status" /></th>
          <th style="width: 13%" pSortableColumn="createdAt">{{ 'common.received' | translate }} <p-sortIcon field="createdAt" /></th>
          <th style="width: 15%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td [attr.data-label]="'common.order_no' | translate"><span class="font-semibold">#{{ job.tokenNumber }}</span></td>
          <td [attr.data-label]="'common.documents' | translate">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span appEllipsis #docRef="appEllipsis"
                  ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ item.document?.originalName }}</span></span
                >
              }
            </div>
          </td>
          <td class="text-xs" style="border-left: 1px solid var(--hdr-hover)" [attr.data-label]="'common.options' | translate">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ optionsLabel(item) }}</span>
              }
            </div>
          </td>
          <td [attr.data-label]="'common.amount' | translate">{{ job.priced ? job.currency + ' ' + job.amount : '—' }}</td>
          <td [attr.data-label]="'common.status' | translate"><app-status-tag [status]="job.status" /></td>
          <td [attr.data-label]="'common.received' | translate">{{ job.createdAt | appDate: 'short' }}</td>
          <td class="text-right">
            <div class="flex flex-wrap gap-2 justify-content-end align-items-center row-gap-2">
              @if (!job.done) {
                <p-button
                  icon="pi pi-eye"
                  size="small"
                  severity="secondary"
                  [outlined]="true"
                  (onClick)="openEditor(job)"
                  [pTooltip]="'printOrders.view_edit_documents' | translate"
                />
              }
              @if (job.done) {
                <span class="text-xs text-color-secondary"><i class="pi pi-check-circle"></i> {{ job.printedAt | appDate: 'shortTime' }}</span>
              } @else if (readOnly()) {
                <span class="text-xs paused" [title]="'printOrders.your_subscription_needs_attention_so_new' | translate"><i class="pi pi-pause-circle"></i> {{ 'printOrders.paused' | translate }}</span>
              } @else if (job.status === 'PRINT_ELIGIBLE' || job.status === 'AGENT_OFFLINE' || job.status === 'PRINT_FAILED') {
                <p-button [label]="'printOrders.print' | translate" icon="pi pi-print" size="small" [loading]="sending().has(job.id)" (onClick)="print(job)" />
              }
              @if (job.status === 'PRINT_UNKNOWN' && !readOnly()) {
                <p-button [label]="'printOrders.mark_printed' | translate" size="small" severity="success" [outlined]="true" (onClick)="reconcile(job, 'PRINTED')" />
                <p-button [label]="'printOrders.mark_failed' | translate" size="small" severity="danger" [outlined]="true" (onClick)="reconcile(job, 'PRINT_FAILED')" />
              }
            </div>
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-inbox"></i><span>{{ 'printOrders.no_orders_waiting_right_now' | translate }}</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class QueueComponent implements OnInit {
  readonly optionsLabel = printOptionsLabel;
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
      : t('printOrders.documents_order', { items: job.items.length, tokenNumber: job.tokenNumber });
  }

  /** Jobs whose PRINT request is in flight — the button stays busy so a double-click can't send it twice. */
  sending = signal<ReadonlySet<string>>(new Set());

  /** Sends the job straight to the printer (no confirmation step). */
  print(job: PrintJobRow): void {
    if (this.sending().has(job.id)) return;
    this.setSending(job.id, true);
    this.shopkeeperService.print(job.id).subscribe({
      next: (res) => {
        this.setSending(job.id, false);
        this.messageService.add({ severity: 'success', summary: res.message });
        this.load();
      },
      error: () => this.setSending(job.id, false),
    });
  }

  private setSending(jobId: string, on: boolean): void {
    const next = new Set(this.sending());
    if (on) next.add(jobId);
    else next.delete(jobId);
    this.sending.set(next);
  }

  reconcile(job: PrintJobRow, outcome: 'PRINTED' | 'PRINT_FAILED'): void {
    this.confirmationService.confirm({
      message: t('printOrders.did_actually_print_this_cant_be', { job: this.describe(job) }),
      get header() { return t('printOrders.did_it_print'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.reconcile(job.id, outcome).subscribe(() => {
          this.messageService.add({ severity: 'success', get summary() { return t('printOrders.order_updated'); } });
          this.load();
        });
      },
    });
  }
}
