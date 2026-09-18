import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { Shop } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    InputNumberModule,
    TagModule,
    TooltipModule,
    ToggleSwitchModule,
    EllipsisDirective,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Shops</h1>
        <p class="page-subtitle m-0">Create, activate and manage every shop on the platform.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button label="New Shop" icon="pi pi-plus" (onClick)="openCreate()" />
      </div>
    </div>


    <p-table
      #dt
      [tableStyle]="{ 'min-width': '40rem' }"
      [value]="shops()"
      [loading]="loading()"
      [globalFilterFields]="['shopCode', 'name', 'ownerName', 'city', 'status']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="10"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 20%" pSortableColumn="shopCode">Shop Code <p-sortIcon field="shopCode" /></th>
          <th style="width: 24%" pSortableColumn="name">Name <p-sortIcon field="name" /></th>
          <th style="width: 18%" pSortableColumn="ownerName">Owner <p-sortIcon field="ownerName" /></th>
          <th style="width: 14%" pSortableColumn="city">City <p-sortIcon field="city" /></th>
          <th style="width: 12%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 12%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-shop>
        <tr>
          <td data-label="Shop code">{{ shop.shopCode }}</td>
          <td data-label="Name">
            <span appEllipsis #nameRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="nameRef.isTruncated">{{ shop.name }}</span></span
            >
          </td>
          <td data-label="Owner">
            <span appEllipsis #ownerRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="ownerRef.isTruncated">{{ shop.ownerName }}</span></span
            >
          </td>
          <td data-label="City">
            <span appEllipsis #cityRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="cityRef.isTruncated">{{ shop.city }}</span></span
            >
          </td>
          <td data-label="Status">
            <p-tag
              [value]="shop.status"
              [severity]="shop.status === 'ACTIVE' ? 'success' : 'danger'"
            />
          </td>
          <td class="flex gap-2 justify-content-end">
            <p-button
              icon="pi pi-qrcode"
              size="small"
              [text]="true"
              [routerLink]="['/admin/shops', shop.id, 'qr']"
              pTooltip="QR code"
            />
            <p-button
              icon="pi pi-cog"
              size="small"
              [text]="true"
              (onClick)="openSettings(shop)"
              pTooltip="Print settings"
            />
            <p-button
              [icon]="shop.status === 'ACTIVE' ? 'pi pi-ban' : 'pi pi-check'"
              size="small"
              [text]="true"
              [severity]="shop.status === 'ACTIVE' ? 'danger' : 'success'"
              (onClick)="toggleStatus(shop)"
              [pTooltip]="shop.status === 'ACTIVE' ? 'Deactivate' : 'Activate'"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="6">
            <div class="table-empty">
              <i class="pi pi-building"></i>
              <span>No shops yet — create the first one.</span>
            </div>
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog
      header="New Shop"
      [(visible)]="createVisible"
      [modal]="true"
      [style]="{ width: '460px' }"
    >
      <div class="flex flex-column gap-3">
        <div class="flex flex-column gap-2">
          <label>Shop name</label>
          <input pInputText [(ngModel)]="form.name" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Owner name</label>
          <input pInputText [(ngModel)]="form.ownerName" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Mobile</label>
          <input pInputText [(ngModel)]="form.mobile" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Email</label>
          <input pInputText [(ngModel)]="form.email" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Address</label>
          <input pInputText [(ngModel)]="form.address" />
        </div>
        <div class="flex flex-column gap-2">
          <label>City</label>
          <input pInputText [(ngModel)]="form.city" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          (onClick)="createVisible = false"
        />
        <p-button label="Create" (onClick)="submitCreate()" [loading]="saving()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      header="Print settings"
      [(visible)]="settingsVisible"
      [modal]="true"
      [style]="{ width: '420px' }"
    >
      @if (settingsShop()) {
        <p class="text-color-secondary text-sm mt-0">{{ settingsShop()!.name }}</p>
        <div class="flex flex-column gap-3">
          <div class="flex flex-column gap-2">
            <label>Document retention window (minutes)</label>
            <p-inputNumber
              [(ngModel)]="settingsForm.retentionMinutes"
              [min]="1"
              [max]="10080"
              suffix=" min"
            />
            <small class="text-color-secondary">
              How long a document stays in storage after a successful print before it's
              automatically deleted (SRS §9 recommends 15–60).
            </small>
          </div>
          <div class="flex flex-column gap-2">
            <label>Max upload size (MB)</label>
            <p-inputNumber
              [(ngModel)]="settingsForm.maxFileSizeMb"
              [min]="1"
              [max]="100"
              suffix=" MB"
            />
          </div>
          <div class="flex align-items-center justify-content-between gap-3">
            <div>
              <label>Document preview</label>
              <div class="text-color-secondary text-sm">
                Lets this shop's staff preview a file before printing it. Off by default for every
                new shop.
              </div>
            </div>
            <p-toggleswitch [(ngModel)]="settingsForm.documentPreviewEnabled" />
          </div>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          (onClick)="settingsVisible = false"
        />
        <p-button label="Save" (onClick)="submitSettings()" [loading]="savingSettings()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ShopsComponent implements OnInit {
  shops = signal<Shop[]>([]);
  loading = signal(true);
  saving = signal(false);
  createVisible = false;
  form: Partial<Shop> = {};

  settingsVisible = false;
  savingSettings = signal(false);
  settingsShop = signal<Shop | null>(null);
  settingsForm: { retentionMinutes: number; maxFileSizeMb: number; documentPreviewEnabled: boolean } = {
    retentionMinutes: 30,
    maxFileSizeMb: 25,
    documentPreviewEnabled: false,
  };

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
    this.adminService.listShops().subscribe((res) => {
      this.shops.set(res.items);
      this.loading.set(false);
    });
  }

  openCreate(): void {
    this.form = {};
    this.createVisible = true;
  }

  submitCreate(): void {
    this.saving.set(true);
    this.adminService.createShop(this.form).subscribe({
      next: () => {
        this.saving.set(false);
        this.createVisible = false;
        this.messageService.add({ severity: 'success', summary: 'Shop created' });
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  openSettings(shop: Shop): void {
    this.settingsShop.set(shop);
    this.settingsVisible = true;
    this.adminService.getShopSettings(shop.id).subscribe((settings) => {
      this.settingsForm = {
        retentionMinutes: settings.retentionMinutes,
        maxFileSizeMb: Math.round(settings.maxFileSizeBytes / (1024 * 1024)),
        documentPreviewEnabled: settings.documentPreviewEnabled,
      };
    });
  }

  submitSettings(): void {
    const shop = this.settingsShop();
    if (!shop) return;
    this.savingSettings.set(true);
    this.adminService
      .updateShopSettings(shop.id, {
        retentionMinutes: this.settingsForm.retentionMinutes,
        maxFileSizeBytes: this.settingsForm.maxFileSizeMb * 1024 * 1024,
        documentPreviewEnabled: this.settingsForm.documentPreviewEnabled,
      })
      .subscribe({
        next: () => {
          this.savingSettings.set(false);
          this.settingsVisible = false;
          this.messageService.add({ severity: 'success', summary: 'Print settings updated' });
        },
        error: () => this.savingSettings.set(false),
      });
  }

  toggleStatus(shop: Shop): void {
    const next = shop.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirmationService.confirm({
      message: `${next === 'ACTIVE' ? 'Activate' : 'Deactivate'} "${shop.name}"? ${
        next === 'INACTIVE' ? 'Customers will no longer be able to submit new print requests.' : ''
      }`,
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.setShopStatus(shop.id, next).subscribe(() => this.load());
      },
    });
  }
}
