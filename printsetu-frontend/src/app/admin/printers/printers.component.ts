import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TagModule } from 'primeng/tag';
import { AdminService } from '../../core/services/admin.service';
import { PrinterRow, Shop } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

/**
 * Read-only monitoring: registering and unlinking a printer/agent is
 * entirely shop self-serve (Print Agent page — download, connect, unlink),
 * admin has no role in provisioning it. This page just lets admin see
 * what's connected and its live status per shop.
 */
@Component({
  selector: 'app-printers',
  standalone: true,
  imports: [CommonModule, TableModule, InputTextModule, IconFieldModule, InputIconModule, TagModule, EllipsisDirective],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Printers &amp; Agents</h1>
        <p class="page-subtitle m-0">Monitor each shop's connected Print Agent. Shops connect and unlink their own printers from their Print Agent page.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
      </div>
    </div>

    <p-table
      #dt
      [tableStyle]="{ 'min-width': '38rem' }"
      [value]="enrichedPrinters()"
      [loading]="loading()"
      [globalFilterFields]="['printerName', 'shopName', 'agentId', 'status']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="10"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 25%" pSortableColumn="printerName">Printer <p-sortIcon field="printerName" /></th>
          <th style="width: 22%" pSortableColumn="shopName">Shop <p-sortIcon field="shopName" /></th>
          <th style="width: 19%" pSortableColumn="agentId">Agent ID <p-sortIcon field="agentId" /></th>
          <th style="width: 14%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 20%" pSortableColumn="lastHeartbeatAt">Last heartbeat <p-sortIcon field="lastHeartbeatAt" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-p>
        <tr>
          <td data-label="Printer">
            <span appEllipsis #printerRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="printerRef.isTruncated">{{ p.printerName }}</span></span
            >
          </td>
          <td data-label="Shop">
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ p.shopName }}</span></span
            >
          </td>
          <td data-label="Agent ID"><code class="text-xs">{{ p.agentId }}</code></td>
          <td data-label="Status">
            <p-tag
              [value]="p.status"
              [severity]="p.status === 'ONLINE' ? 'success' : p.status === 'OFFLINE' ? 'danger' : 'secondary'"
            />
          </td>
          <td data-label="Last heartbeat">{{ p.lastHeartbeatAt ? (p.lastHeartbeatAt | date: 'medium') : 'never' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="5">
            <div class="table-empty"><i class="pi pi-print"></i><span>No printers connected yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class PrintersComponent implements OnInit {
  printers = signal<PrinterRow[]>([]);
  shops = signal<Shop[]>([]);
  enrichedPrinters = computed(() => this.printers().map((p) => ({ ...p, shopName: this.shopName(p.shopId) })));
  loading = signal(true);

  constructor(private readonly adminService: AdminService) {}

  ngOnInit(): void {
    this.load();
    this.adminService.listShops().subscribe((res) => this.shops.set(res.items));
  }

  load(): void {
    this.loading.set(true);
    this.adminService.listPrinters().subscribe((printers) => {
      this.printers.set(printers);
      this.loading.set(false);
    });
  }

  shopName(shopId: string): string {
    return this.shops().find((s) => s.id === shopId)?.name || shopId;
  }
}
