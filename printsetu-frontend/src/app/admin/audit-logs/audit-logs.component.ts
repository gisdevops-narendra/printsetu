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

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule, EllipsisDirective],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Audit Logs</h1>
        <p class="page-subtitle m-0">Record of administrative and sensitive operational actions.</p>
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
      [globalFilterFields]="['action', 'entityType', 'entityId', 'actorUserId']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="20"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 22%" pSortableColumn="createdAt">When <p-sortIcon field="createdAt" /></th>
          <th style="width: 28%" pSortableColumn="action">Action <p-sortIcon field="action" /></th>
          <th style="width: 28%" pSortableColumn="entityType">Entity <p-sortIcon field="entityType" /></th>
          <th style="width: 22%" pSortableColumn="actorUserId">Actor <p-sortIcon field="actorUserId" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-log>
        <tr>
          <td data-label="When">{{ log.createdAt | date: 'medium' }}</td>
          <td data-label="Action">
            <code appEllipsis #actionRef="appEllipsis" class="text-xs"
              ><span class="cell-ellipsis__text" [class.is-truncated]="actionRef.isTruncated">{{ log.action }}</span></code
            >
          </td>
          <td data-label="Entity">
            <span appEllipsis #entityRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="entityRef.isTruncated">
                {{ log.entityType }}
                @if (log.entityId) {
                  <span class="text-color-secondary">({{ log.entityId.slice(0, 8) }})</span>
                }
              </span></span
            >
          </td>
          <td data-label="Actor">{{ log.actorUserId ? log.actorUserId.slice(0, 8) : 'system' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="4">
            <div class="table-empty"><i class="pi pi-shield"></i><span>No audit events recorded yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class AuditLogsComponent implements OnInit {
  logs = signal<AuditLogRow[]>([]);
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
      this.logs.set(res.items);
      this.loading.set(false);
    });
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      message: `This permanently deletes the entire audit trail (${this.logs().length}+ entries) — the compliance record of who did what across the whole platform. This cannot be undone. A single "audit log cleared" entry will remain, recording that you did this just now.`,
      header: 'Clear ALL audit logs',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.clearAuditLogs().subscribe((res) => {
          this.messageService.add({ severity: 'success', summary: `Cleared ${res.cleared} audit log entr${res.cleared === 1 ? 'y' : 'ies'}` });
          this.load();
        });
      },
    });
  }
}
