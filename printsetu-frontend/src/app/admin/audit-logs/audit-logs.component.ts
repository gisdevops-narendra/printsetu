import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { AuditLogRow } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';
import { EVENT_META } from '../../shared/billing/billing.util';
import { t, tn } from '../../core/i18n/i18n';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';

/** Plain wording for the action codes the backend records. */
const ACTION_LABELS: Record<string, string> = {
  get AUDIT_LOG_CLEARED() { return t('activityLog.activity_log_cleared'); },
  get SHOP_REGISTERED() { return t('activityLog.new_shop_registered'); },
  get PASSWORD_RESET() { return t('activityLog.password_reset_by_email'); },
  get SHOP_ACTIVATED() { return t('activityLog.shop_turned_on'); },
  get SHOP_DEACTIVATED() { return t('activityLog.shop_turned_off'); },
  get SHOP_UPDATED() { return t('activityLog.shop_details_changed'); },
  get SHOP_PROFILE_UPDATED() { return t('activityLog.shop_profile_changed'); },
  get SHOP_SETTINGS_UPDATED() { return t('activityLog.shop_settings_changed'); },
  get PRINTER_REMOVED() { return t('activityLog.printer_removed'); },
  get PRINT_HISTORY_CLEARED() { return t('activityLog.print_history_cleared'); },
  get PRINT_JOB_RECONCILED() { return t('activityLog.order_marked_as_printed_or_failed'); },
  get QR_REGENERATED() { return t('activityLog.new_qr_code_made'); },
  get PLAN_CREATED() { return t('activityLog.plan_created'); },
  get PLAN_UPDATED() { return t('activityLog.plan_changed'); },
  get PLAN_DELETED() { return t('activityLog.plan_deleted'); },
  get PLAN_RETIRED() { return t('activityLog.plan_discontinued'); },
  get PLAN_ACTIVATED() { return t('activityLog.plan_offered_again'); },
  get BILLING_CHECKS_RUN() { return t('activityLog.billing_checks_run'); },
  get BILLING_SETTINGS_UPDATED() { return t('activityLog.billing_rules_changed'); },
  get SYSTEM_SETTING_UPDATED() { return t('activityLog.system_setting_changed'); },
  get USER_ENABLED() { return t('activityLog.user_turned_on'); },
  get USER_DISABLED() { return t('activityLog.user_turned_off'); },
};

const ITEM_LABELS: Record<string, string> = {
  get shop() { return t('common.shop'); },
  get Shop() { return t('common.shop'); },
  get PrintSettings() { return t('activityLog.shop_settings'); },
  get plan() { return t('common.plan'); },
  get printer() { return t('common.printer'); },
  get print_job() { return t('activityLog.order'); },
  get PrintJob() { return t('activityLog.order'); },
  qr_code: 'QR code',
  get subscription() { return t('activityLog.subscription'); },
  get system_setting() { return t('activityLog.system_setting'); },
  get billing_settings() { return t('activityLog.billing_rules'); },
  get user() { return t('activityLog.user'); },
  get AuditLog() { return t('activityLog.activity_log_2'); },
};

/** "SHOP_LOGO_UPDATED" -> "Shop logo updated": codes without their own wording still read as a sentence. */
function sentence(code: string): string {
  const words = code.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function describeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (action.startsWith('SUBSCRIPTION_')) {
    const event = action.slice('SUBSCRIPTION_'.length);
    return t('activityLog.subscription_2', { event: EVENT_META[event]?.label.toLowerCase() ?? sentence(event).toLowerCase() });
  }
  return sentence(action);
}

/** An activity log row with its readable columns filled in (also what the search box matches). */
type ActivityRow = AuditLogRow & { what: string; item: string; by: string };

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [AppDatePipe, TranslatePipe, CommonModule, TableModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule, EllipsisDirective],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'activityLog.activity_log' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'activityLog.who_did_what_and_when' | translate }}</p>
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
          [disabled]="logs().length === 0"
          (onClick)="confirmClear()"
        />
      </div>
    </div>


    <p-table
      #dt
      [tableStyle]="{ 'min-width': '32rem' }"
      [value]="logs()"
      [loading]="loading()"
      [globalFilterFields]="['what', 'item', 'by']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="20"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 22%" pSortableColumn="createdAt">{{ 'common.when' | translate }} <p-sortIcon field="createdAt" /></th>
          <th style="width: 28%" pSortableColumn="what">{{ 'activityLog.what_happened' | translate }} <p-sortIcon field="what" /></th>
          <th style="width: 28%" pSortableColumn="item">{{ 'activityLog.item' | translate }} <p-sortIcon field="item" /></th>
          <th style="width: 22%" pSortableColumn="by">{{ 'activityLog.done_by' | translate }} <p-sortIcon field="by" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-log>
        <tr>
          <td [attr.data-label]="'common.when' | translate">{{ log.createdAt | appDate: 'medium' }}</td>
          <td [attr.data-label]="'activityLog.what_happened' | translate">
            <span appEllipsis #whatRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="whatRef.isTruncated">{{ log.what }}</span></span
            >
          </td>
          <td [attr.data-label]="'activityLog.item' | translate">
            <span appEllipsis #itemRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="itemRef.isTruncated">{{ log.item }}</span></span
            >
          </td>
          <td [attr.data-label]="'activityLog.done_by' | translate">{{ log.by }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="4">
            <div class="table-empty"><i class="pi pi-shield"></i><span>{{ 'activityLog.no_activity_recorded_yet' | translate }}</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class AuditLogsComponent implements OnInit {
  logs = signal<ActivityRow[]>([]);
  loading = signal(true);

  constructor(
    private readonly adminService: AdminService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.auditLogs().subscribe((res) => {
      this.logs.set(res.items.map((log) => this.toRow(log)));
      this.loading.set(false);
    });
  }

  private toRow(log: AuditLogRow): ActivityRow {
    const itemType = ITEM_LABELS[log.entityType] ?? sentence(log.entityType);
    const shopName = log.shop?.name;
    const item = !shopName ? itemType : itemType === t('common.shop') ? shopName : `${itemType} · ${shopName}`;
    const by = log.actor?.name ?? (log.actorUserId ? t('activityLog.a_removed_user') : t('activityLog.printsetu_automatic'));
    return { ...log, what: describeAction(log.action), item, by };
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      get message() { return t('activityLog.this_permanently_deletes_the_whole_activity', { logs: this.logs().length }); },
      get header() { return t('activityLog.clear_the_whole_activity_log'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.clearAuditLogs().subscribe((res) => {
          this.messageService.add({ severity: 'success', get summary() { return tn('activityLog.cleared_entries', res.cleared); } });
          this.load();
        });
      },
    });
  }
}
