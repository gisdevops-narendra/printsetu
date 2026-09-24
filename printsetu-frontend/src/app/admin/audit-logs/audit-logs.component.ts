import { Component, OnInit, signal } from '@angular/core';
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

/** Plain wording for the action codes the backend records. */
const ACTION_LABELS: Record<string, string> = {
  AUDIT_LOG_CLEARED: 'Activity log cleared',
  SHOP_REGISTERED: 'New shop registered',
  SHOP_ACTIVATED: 'Shop turned on',
  SHOP_DEACTIVATED: 'Shop turned off',
  SHOP_UPDATED: 'Shop details changed',
  SHOP_PROFILE_UPDATED: 'Shop profile changed',
  SHOP_SETTINGS_UPDATED: 'Shop settings changed',
  PRINTER_REMOVED: 'Printer removed',
  PRINT_HISTORY_CLEARED: 'Print history cleared',
  PRINT_JOB_RECONCILED: 'Order marked as printed or failed',
  QR_REGENERATED: 'New QR code made',
  PLAN_CREATED: 'Plan created',
  PLAN_UPDATED: 'Plan changed',
  PLAN_DELETED: 'Plan deleted',
  PLAN_RETIRED: 'Plan discontinued',
  PLAN_ACTIVATED: 'Plan offered again',
  BILLING_CHECKS_RUN: 'Billing checks run',
  BILLING_SETTINGS_UPDATED: 'Billing rules changed',
  SYSTEM_SETTING_UPDATED: 'System setting changed',
  USER_ENABLED: 'User turned on',
  USER_DISABLED: 'User turned off',
};

const ITEM_LABELS: Record<string, string> = {
  shop: 'Shop',
  Shop: 'Shop',
  PrintSettings: 'Shop settings',
  plan: 'Plan',
  printer: 'Printer',
  print_job: 'Order',
  PrintJob: 'Order',
  qr_code: 'QR code',
  subscription: 'Subscription',
  system_setting: 'System setting',
  billing_settings: 'Billing rules',
  user: 'User',
  AuditLog: 'Activity log',
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
    return `Subscription: ${EVENT_META[event]?.label.toLowerCase() ?? sentence(event).toLowerCase()}`;
  }
  return sentence(action);
}

/** An activity log row with its readable columns filled in (also what the search box matches). */
type ActivityRow = AuditLogRow & { what: string; item: string; by: string };

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule, EllipsisDirective],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Activity Log</h1>
        <p class="page-subtitle m-0">Who did what, and when.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button
          label="Clear"
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
          <th style="width: 22%" pSortableColumn="createdAt">When <p-sortIcon field="createdAt" /></th>
          <th style="width: 28%" pSortableColumn="what">What happened <p-sortIcon field="what" /></th>
          <th style="width: 28%" pSortableColumn="item">Item <p-sortIcon field="item" /></th>
          <th style="width: 22%" pSortableColumn="by">Done by <p-sortIcon field="by" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-log>
        <tr>
          <td data-label="When">{{ log.createdAt | date: 'medium' }}</td>
          <td data-label="What happened">
            <span appEllipsis #whatRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="whatRef.isTruncated">{{ log.what }}</span></span
            >
          </td>
          <td data-label="Item">
            <span appEllipsis #itemRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="itemRef.isTruncated">{{ log.item }}</span></span
            >
          </td>
          <td data-label="Done by">{{ log.by }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="4">
            <div class="table-empty"><i class="pi pi-shield"></i><span>No activity recorded yet.</span></div>
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
    const item = !shopName ? itemType : itemType === 'Shop' ? shopName : `${itemType} · ${shopName}`;
    const by = log.actor?.name ?? (log.actorUserId ? 'A removed user' : 'PrintSetu (automatic)');
    return { ...log, what: describeAction(log.action), item, by };
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      message: `This permanently deletes the whole activity log (${this.logs().length}+ entries), the record of who did what across the platform. This cannot be undone. A single "Activity log cleared" entry will remain, recording that you did this just now.`,
      header: 'Clear the whole activity log',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.clearAuditLogs().subscribe((res) => {
          this.messageService.add({ severity: 'success', summary: `Cleared ${res.cleared} activity log entr${res.cleared === 1 ? 'y' : 'ies'}` });
          this.load();
        });
      },
    });
  }
}
