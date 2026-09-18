import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AdminService } from '../../core/services/admin.service';
import { AuditLogRow } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, TableModule, InputTextModule, IconFieldModule, InputIconModule, EllipsisDirective],
  template: `
    <h1 class="page-title">Audit Logs</h1>
    <p class="page-subtitle">Append-only record of administrative and sensitive operational actions.</p>

    <div class="flex justify-content-end mb-3">
      <p-iconfield>
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
      </p-iconfield>
    </div>

    <p-table
      #dt
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
          <th style="width: 30%" pSortableColumn="action">Action <p-sortIcon field="action" /></th>
          <th style="width: 28%" pSortableColumn="entityType">Entity <p-sortIcon field="entityType" /></th>
          <th style="width: 20%" pSortableColumn="actorUserId">Actor <p-sortIcon field="actorUserId" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-log>
        <tr>
          <td>{{ log.createdAt | date: 'medium' }}</td>
          <td>
            <code appEllipsis #actionRef="appEllipsis" class="text-xs"
              ><span class="cell-ellipsis__text" [class.is-truncated]="actionRef.isTruncated">{{ log.action }}</span></code
            >
          </td>
          <td>
            <span appEllipsis #entityRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="entityRef.isTruncated">
                {{ log.entityType }}
                @if (log.entityId) {
                  <span class="text-color-secondary">({{ log.entityId.slice(0, 8) }})</span>
                }
              </span></span
            >
          </td>
          <td>{{ log.actorUserId ? log.actorUserId.slice(0, 8) : 'system' }}</td>
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

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.adminService.auditLogs().subscribe((res) => {
      this.logs.set(res.items);
      this.loading.set(false);
    });
  }
}
