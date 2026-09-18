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
  selector: 'app-history',
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
    <div class="flex justify-content-between align-items-start mb-3">
      <div>
        <h1 class="page-title">Print History</h1>
        <p class="page-subtitle m-0">Every job submitted to your shop, most recent first.</p>
      </div>
      <p-button
        label="Clear"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        [outlined]="true"
        [disabled]="jobs().length === 0"
        (onClick)="confirmClear()"
        pTooltip="Permanently deletes completed/cancelled jobs. Jobs still in progress are kept."
      />
    </div>

    <div class="flex justify-content-end mb-3">
      <p-iconfield>
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
      </p-iconfield>
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
      [rows]="15"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 14.29%" pSortableColumn="tokenNumber">Token <p-sortIcon field="tokenNumber" /></th>
          <th style="width: 14.29%">Documents</th>
          <th style="width: 14.29%; border-left: 1px solid #f1f5f9">Options</th>
          <th style="width: 14.29%" pSortableColumn="amount">Amount <p-sortIcon field="amount" /></th>
          <th style="width: 14.29%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 14.29%" pSortableColumn="createdAt">Created <p-sortIcon field="createdAt" /></th>
          <th style="width: 14.26%" pSortableColumn="printedAt">Printed <p-sortIcon field="printedAt" /></th>
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
          <td class="text-xs" style="border-left: 1px solid #f1f5f9">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ item.paperSize }} · {{ item.colorMode }} · {{ item.sideMode }} ×{{ item.copies }}</span>
              }
            </div>
          </td>
          <td>{{ job.currency }} {{ job.amount }}</td>
          <td><app-status-tag [status]="job.status" /></td>
          <td>{{ job.createdAt | date: 'short' }}</td>
          <td>{{ job.printedAt ? (job.printedAt | date: 'short') : '—' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-history"></i><span>No history yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class HistoryComponent implements OnInit {
  jobs = signal<PrintJobRow[]>([]);
  enrichedJobs = computed(() =>
    this.jobs().map((job) => ({
      ...job,
      documentNames: job.items.map((item) => item.document?.originalName).join(' '),
    })),
  );
  loading = signal(true);

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.history().subscribe((res) => {
      this.jobs.set(res.items);
      this.loading.set(false);
    });
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      message:
        'Permanently delete completed and cancelled jobs from your history? Jobs still in progress are kept. This cannot be undone.',
      header: 'Clear print history',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.clearHistory().subscribe((res) => {
          this.messageService.add({ severity: 'success', summary: `Cleared ${res.cleared} job(s)` });
          this.load();
        });
      },
    });
  }
}
