import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { AdminService } from '../../core/services/admin.service';
import { PrintJobRow } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-print-history',
  standalone: true,
  imports: [CommonModule, TableModule, InputTextModule, IconFieldModule, InputIconModule, StatusTagComponent, EllipsisDirective],
  template: `
    <h1 class="page-title">Print History</h1>
    <p class="page-subtitle">All print jobs across every shop, most recent first.</p>

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
      [globalFilterFields]="['tokenNumber', 'shop.name', 'documentNames', 'status']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="15"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 10%" pSortableColumn="tokenNumber">Token <p-sortIcon field="tokenNumber" /></th>
          <th style="width: 14%" pSortableColumn="shop.name">Shop <p-sortIcon field="shop.name" /></th>
          <th style="width: 22%">Documents</th>
          <th style="width: 16%">Options</th>
          <th style="width: 10%" pSortableColumn="amount">Amount <p-sortIcon field="amount" /></th>
          <th style="width: 12%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 12%" pSortableColumn="createdAt">Created <p-sortIcon field="createdAt" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-job>
        <tr>
          <td><span class="font-semibold">#{{ job.tokenNumber }}</span></td>
          <td>
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ job.shop?.name }}</span></span
            >
          </td>
          <td>
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span appEllipsis #docRef="appEllipsis"
                  ><span class="cell-ellipsis__text" [class.is-truncated]="docRef.isTruncated">{{ item.document?.originalName }}</span></span
                >
              }
            </div>
          </td>
          <td class="text-xs">
            <div class="item-stack">
              @for (item of job.items; track item.id) {
                <span>{{ item.paperSize }} · {{ item.colorMode }} · {{ item.sideMode }} ×{{ item.copies }}</span>
              }
            </div>
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
  enrichedJobs = computed(() =>
    this.jobs().map((job) => ({
      ...job,
      documentNames: job.items.map((item) => item.document?.originalName).join(' '),
    })),
  );
  loading = signal(true);

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.adminService.printHistory().subscribe((res) => {
      this.jobs.set(res.items);
      this.loading.set(false);
    });
  }
}
