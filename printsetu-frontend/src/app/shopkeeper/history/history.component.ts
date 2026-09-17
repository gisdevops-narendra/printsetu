import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrintJobRow } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, TableModule, StatusTagComponent],
  template: `
    <h1 class="page-title">Print History</h1>
    <p class="page-subtitle">Every job submitted to your shop, most recent first.</p>

    <p-table [value]="jobs()" [loading]="loading()" styleClass="surface-card-flat" [paginator]="true" [rows]="15">
      <ng-template pTemplate="header">
        <tr>
          <th>Document</th>
          <th>Options</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Created</th>
          <th>Printed</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td>{{ job.document?.originalName }}</td>
          <td class="text-xs">
            {{ job.optionsJson.paperSize }} · {{ job.optionsJson.colorMode }} · {{ job.optionsJson.sideMode }} ×{{ job.optionsJson.copies }}
          </td>
          <td>{{ job.currency }} {{ job.amount }}</td>
          <td><app-status-tag [status]="job.status" /></td>
          <td>{{ job.createdAt | date: 'short' }}</td>
          <td>{{ job.printedAt ? (job.printedAt | date: 'short') : '—' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="6">
            <div class="table-empty"><i class="pi pi-history"></i><span>No history yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class HistoryComponent implements OnInit {
  jobs = signal<PrintJobRow[]>([]);
  loading = signal(true);

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.history().subscribe((res) => {
      this.jobs.set(res.items);
      this.loading.set(false);
    });
  }
}
