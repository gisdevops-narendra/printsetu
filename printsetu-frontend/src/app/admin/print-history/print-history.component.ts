import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { AdminService } from '../../core/services/admin.service';
import { PrintJobRow } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-print-history',
  standalone: true,
  imports: [CommonModule, TableModule, StatusTagComponent, EllipsisDirective],
  template: `
    <h1 class="page-title">Print History</h1>
    <p class="page-subtitle">All print jobs across every shop, most recent first.</p>

    <p-table
      [value]="jobs()"
      [loading]="loading()"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="15"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 10%">Job</th>
          <th style="width: 16%">Shop</th>
          <th style="width: 20%">Document</th>
          <th style="width: 18%">Options</th>
          <th style="width: 10%">Amount</th>
          <th style="width: 12%">Status</th>
          <th style="width: 14%">Created</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td><code class="text-xs">{{ job.id.slice(0, 8) }}</code></td>
          <td>
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ job.shop?.name }}</span></span
            >
          </td>
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
          <td>{{ job.createdAt | date: 'medium' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-history"></i><span>No print jobs yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class PrintHistoryComponent implements OnInit {
  jobs = signal<PrintJobRow[]>([]);
  loading = signal(true);

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.adminService.printHistory().subscribe((res) => {
      this.jobs.set(res.items);
      this.loading.set(false);
    });
  }
}
