import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { PrinterRow, Shop } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-printers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    TagModule,
    MessageModule,
    EllipsisDirective,
  ],
  template: `
    <div class="flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="page-title">Printers &amp; Agents</h1>
        <p class="page-subtitle m-0">Register a Print Agent for a shop and monitor its connection status.</p>
      </div>
      <p-button label="Register Printer" icon="pi pi-plus" (onClick)="openRegister()" />
    </div>

    <div class="flex justify-content-end mb-3">
      <p-iconfield>
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
      </p-iconfield>
    </div>

    <p-table
      #dt
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
          <th style="width: 20%" pSortableColumn="printerName">Printer <p-sortIcon field="printerName" /></th>
          <th style="width: 20%" pSortableColumn="shopName">Shop <p-sortIcon field="shopName" /></th>
          <th style="width: 20%" pSortableColumn="agentId">Agent ID <p-sortIcon field="agentId" /></th>
          <th style="width: 20%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 20%" pSortableColumn="lastHeartbeatAt">Last heartbeat <p-sortIcon field="lastHeartbeatAt" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-p>
        <tr>
          <td>
            <span appEllipsis #printerRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="printerRef.isTruncated">{{ p.printerName }}</span></span
            >
          </td>
          <td>
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ p.shopName }}</span></span
            >
          </td>
          <td><code class="text-xs">{{ p.agentId }}</code></td>
          <td>
            <p-tag
              [value]="p.status"
              [severity]="p.status === 'ONLINE' ? 'success' : p.status === 'OFFLINE' ? 'danger' : 'secondary'"
            />
          </td>
          <td>{{ p.lastHeartbeatAt ? (p.lastHeartbeatAt | date: 'medium') : 'never' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="5">
            <div class="table-empty"><i class="pi pi-print"></i><span>No printers registered yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog header="Register Printer / Agent" [(visible)]="registerVisible" [modal]="true" [style]="{ width: '480px' }">
      @if (!issuedCredential()) {
        <div class="flex flex-column gap-3">
          <div class="flex flex-column gap-2">
            <label>Shop</label>
            <p-select [options]="shops()" optionLabel="name" optionValue="id" [(ngModel)]="form.shopId" placeholder="Select a shop" />
          </div>
          <div class="flex flex-column gap-2">
            <label>Printer name</label>
            <input pInputText [(ngModel)]="form.printerName" placeholder="e.g. HP LaserJet Pro M126" />
          </div>
          <div class="flex flex-column gap-2">
            <label>Driver (optional)</label>
            <input pInputText [(ngModel)]="form.driverName" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="registerVisible = false" />
          <p-button label="Register" (onClick)="submitRegister()" [loading]="saving()" />
        </ng-template>
      } @else {
        <p-message severity="warn" text="This credential is shown once. Copy it into the shop PC's agent.config.json now." />
        <div class="surface-card-flat p-3 mt-3">
          <div class="text-xs text-color-secondary mb-1">Agent credential (agentId.agentSecret)</div>
          <code class="text-sm break-word">{{ issuedCredential() }}</code>
        </div>
        <div class="flex justify-content-end mt-3">
          <p-button label="Done" (onClick)="closeRegister()" />
        </div>
      }
    </p-dialog>
  `,
})
export class PrintersComponent implements OnInit {
  printers = signal<PrinterRow[]>([]);
  shops = signal<Shop[]>([]);
  enrichedPrinters = computed(() => this.printers().map((p) => ({ ...p, shopName: this.shopName(p.shopId) })));
  loading = signal(true);
  saving = signal(false);
  registerVisible = false;
  issuedCredential = signal<string | null>(null);

  form: { shopId?: string; printerName: string; driverName?: string } = { printerName: '' };

  constructor(
    private readonly adminService: AdminService,
    private readonly messageService: MessageService,
  ) {}

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

  openRegister(): void {
    this.form = { printerName: '' };
    this.issuedCredential.set(null);
    this.registerVisible = true;
  }

  submitRegister(): void {
    if (!this.form.shopId || !this.form.printerName) return;
    this.saving.set(true);
    this.adminService
      .registerPrinter({ shopId: this.form.shopId, printerName: this.form.printerName, driverName: this.form.driverName })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.issuedCredential.set(res.agentCredential);
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }

  closeRegister(): void {
    this.registerVisible = false;
    this.messageService.add({ severity: 'success', summary: 'Printer registered' });
  }
}
