import { Component, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Table, TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { Shop } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';
import { t } from '../../core/i18n/i18n';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [TranslatePipe, 
    CommonModule,
    FormsModule,
    RouterLink,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TagModule,
    TooltipModule,
    EllipsisDirective,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'common.shops' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'adminShops.every_shop_on_the_platform_shops' | translate }}</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" [placeholder]="'common.search' | translate" [value]="search()" (input)="onSearch($any($event.target).value)" />
        </p-iconfield>
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
          <th style="width: 20%" pSortableColumn="shopCode">{{ 'adminShops.shop_code' | translate }} <p-sortIcon field="shopCode" /></th>
          <th style="width: 24%" pSortableColumn="name">{{ 'common.name' | translate }} <p-sortIcon field="name" /></th>
          <th style="width: 18%" pSortableColumn="ownerName">{{ 'common.owner' | translate }} <p-sortIcon field="ownerName" /></th>
          <th style="width: 14%" pSortableColumn="city">{{ 'common.city' | translate }} <p-sortIcon field="city" /></th>
          <th style="width: 12%" pSortableColumn="status">{{ 'common.status' | translate }} <p-sortIcon field="status" /></th>
          <th style="width: 12%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-shop>
        <tr>
          <td [attr.data-label]="'adminShops.shop_code' | translate">{{ shop.shopCode }}</td>
          <td [attr.data-label]="'common.name' | translate">
            <span appEllipsis #nameRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="nameRef.isTruncated">{{ shop.name }}</span></span
            >
          </td>
          <td [attr.data-label]="'common.owner' | translate">
            <span appEllipsis #ownerRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="ownerRef.isTruncated">{{ shop.ownerName }}</span></span
            >
          </td>
          <td [attr.data-label]="'common.city' | translate">
            <span appEllipsis #cityRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="cityRef.isTruncated">{{ shop.city }}</span></span
            >
          </td>
          <td [attr.data-label]="'common.status' | translate">
            <p-tag
              [value]="statusLabel(shop.status)"
              [severity]="shop.status === 'ACTIVE' ? 'success' : 'danger'"
            />
          </td>
          <td class="flex gap-2 justify-content-end">
            <p-button
              icon="pi pi-qrcode"
              size="small"
              [text]="true"
              [routerLink]="['/admin/shops', shop.id, 'qr']"
              [pTooltip]="'adminShops.qr_code' | translate"
            />
            <p-button
              [icon]="shop.status === 'ACTIVE' ? 'pi pi-ban' : 'pi pi-check'"
              size="small"
              [text]="true"
              [severity]="shop.status === 'ACTIVE' ? 'danger' : 'success'"
              (onClick)="toggleStatus(shop)"
              [pTooltip]="shop.status === 'ACTIVE' ? ('adminShops.deactivate' | translate) : ('adminShops.activate' | translate)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="6">
            <div class="table-empty">
              <i class="pi pi-building"></i>
              <span>{{ 'adminShops.no_shops_have_registered_yet' | translate }}</span>
            </div>
          </td>
        </tr>
      </ng-template>
    </p-table>


  `,
})
export class ShopsComponent implements OnInit, OnDestroy {
  @ViewChild('dt') table?: Table;
  shops = signal<Shop[]>([]);
  /** Mirrors the search box; the header's shop search deep-links here via ?q= */
  search = signal('');
  private querySub?: Subscription;
  loading = signal(true);

  constructor(
    private readonly adminService: AdminService,
    private readonly confirmationService: ConfirmationService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.load();
    // The admin header's shop search links here with ?q=<text>.
    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const q = params.get('q');
      if (q !== null) this.onSearch(q);
    });
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.listShops().subscribe((res) => {
      this.shops.set(res.items);
      this.loading.set(false);
      // A search that arrived before the rows did still needs applying.
      if (this.search()) setTimeout(() => this.table?.filterGlobal(this.search(), 'contains'));
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.table?.filterGlobal(value, 'contains');
  }

  /** ACTIVE / INACTIVE shown in the reader's language. */
  statusLabel(status: string): string {
    return status === 'ACTIVE' ? t('common.active') : status === 'INACTIVE' ? t('layout.inactive') : status;
  }

  toggleStatus(shop: Shop): void {
    const next = shop.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirmationService.confirm({
      message: t(next === 'ACTIVE' ? 'adminShops.confirm_activate' : 'adminShops.confirm_deactivate', { name: shop.name }),
      get header() { return t('common.confirm'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.setShopStatus(shop.id, next).subscribe(() => this.load());
      },
    });
  }
}
