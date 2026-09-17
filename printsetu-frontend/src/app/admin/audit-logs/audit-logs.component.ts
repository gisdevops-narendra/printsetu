import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { AdminService } from '../../core/services/admin.service';
import { AuditLogRow } from '../../core/models/models';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, TableModule],
  template: `
    <h1 class="page-title">Audit Logs</h1>
    <p class="page-subtitle">Append-only record of administrative and sensitive operational actions.</p>

    <p-table [value]="logs()" [loading]="loading()" styleClass="surface-card-flat" [paginator]="true" [rows]="20">
      <ng-template pTemplate="header">
        <tr>
          <th>When</th>
          <th>Action</th>
          <th>Entity</th>
          <th>Actor</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-log>
        <tr>
          <td>{{ log.createdAt | date: 'medium' }}</td>
          <td><code class="text-xs">{{ log.action }}</code></td>
          <td>
            {{ log.entityType }}
            @if (log.entityId) {
              <span class="text-color-secondary">({{ log.entityId.slice(0, 8) }})</span>
            }
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
