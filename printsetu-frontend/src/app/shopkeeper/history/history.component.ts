import { Component, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
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
import { printOptionsLabel } from '../../shared/utils/print-options.util';
import { t } from '../../core/i18n/i18n';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';

@Component({
  selector: 'app-history',
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
        <h1 class="page-title">{{ 'history.print_history' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'history.every_order_sent_to_your_shop' | translate }}</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" [placeholder]="'common.search' | translate" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button
          [label]="'common.clear' | translate"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          [outlined]="true"
          [disabled]="jobs().length === 0"
          (onClick)="confirmClear()"
          [pTooltip]="'history.permanently_deletes_completed_and_cancelled_orders' | translate"
        />
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
      [rows]="15"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 8%" pSortableColumn="tokenNumber">{{ 'common.order_no' | translate }} <p-sortIcon field="tokenNumber" /></th>
          <th style="width: 24%">{{ 'common.documents' | translate }}</th>
          <th style="width: 17%; border-left: 1px solid var(--bd-f1f5f9)">{{ 'common.options' | translate }}</th>
          <th style="width: 10%" pSortableColumn="amount">{{ 'common.amount' | translate }} <p-sortIcon field="amount" /></th>
          <th style="width: 14%" pSortableColumn="status">{{ 'common.status' | translate }} <p-sortIcon field="status" /></th>
          <th style="width: 14%" pSortableColumn="createdAt">{{ 'common.created' | translate }} <p-sortIcon field="createdAt" /></th>
          <th style="width: 13%" pSortableColumn="printedAt">{{ 'common.printed' | translate }} <p-sortIcon field="printedAt" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td data-label="Order no."><span class="font-semibold">#{{ job.tokenNumber }}</span></td>
          <td data-label="Documents">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span appEllipsis #docRef="appEllipsis"
                  ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ item.document?.originalName }}</span></span
                >
              }
            </div>
          </td>
          <td class="text-xs" style="border-left: 1px solid var(--bd-f1f5f9)" data-label="Options">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ optionsLabel(item) }}</span>
              }
            </div>
          </td>
          <td data-label="Amount">{{ job.currency }} {{ job.amount }}</td>
          <td data-label="Status"><app-status-tag [status]="job.status" /></td>
          <td data-label="Created">{{ job.createdAt | appDate: 'short' }}</td>
          <td data-label="Printed">{{ job.printedAt ? (job.printedAt | appDate: 'short') : '—' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-history"></i><span>{{ 'history.no_history_yet' | translate }}</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class HistoryComponent implements OnInit {
  readonly optionsLabel = printOptionsLabel;
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
      get message() { return t('history.permanently_delete_completed_and_cancelled_orders'); },
      get header() { return t('history.clear_print_history'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.clearHistory().subscribe((res) => {
          this.messageService.add({ severity: 'success', get summary() { return t('history.cleared_order_s', { cleared: res.cleared }); } });
          this.load();
        });
      },
    });
  }
}
