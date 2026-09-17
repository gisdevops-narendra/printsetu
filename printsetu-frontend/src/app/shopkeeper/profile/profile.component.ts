import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PricingRate, Shop } from '../../core/models/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, TableModule, ProgressSpinnerModule],
  template: `
    <h1 class="page-title">Shop Profile</h1>
    <p class="page-subtitle">Read-only — contact an administrator to change shop details or pricing.</p>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (shop(); as s) {
      <div class="surface-card-flat p-4 mb-4">
        <div class="grid">
          <div class="col-12 sm:col-6"><span class="text-color-secondary text-sm">Shop name</span><div class="font-medium">{{ s.name }}</div></div>
          <div class="col-12 sm:col-6"><span class="text-color-secondary text-sm">Shop code</span><div class="font-medium">{{ s.shopCode }}</div></div>
          <div class="col-12 sm:col-6"><span class="text-color-secondary text-sm">Owner</span><div class="font-medium">{{ s.ownerName }}</div></div>
          <div class="col-12 sm:col-6"><span class="text-color-secondary text-sm">Mobile</span><div class="font-medium">{{ s.mobile }}</div></div>
          <div class="col-12"><span class="text-color-secondary text-sm">Address</span><div class="font-medium">{{ s.address }}, {{ s.city }}</div></div>
        </div>
      </div>

      <h3 class="mb-3">Current pricing</h3>
      <p-table [value]="pricing()" styleClass="surface-card-flat">
        <ng-template pTemplate="header">
          <tr><th>Paper</th><th>Color</th><th>Side</th><th>Price / page</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-rate>
          <tr>
            <td>{{ rate.paperSize }}</td>
            <td>{{ rate.colorMode }}</td>
            <td>{{ rate.sideMode }}</td>
            <td>₹{{ rate.pricePerPage }}</td>
          </tr>
        </ng-template>
      </p-table>
    }
  `,
})
export class ProfileComponent implements OnInit {
  loading = signal(true);
  shop = signal<Shop | null>(null);
  pricing = signal<PricingRate[]>([]);

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.profile().subscribe((res) => {
      this.shop.set(res.shop);
      this.pricing.set(res.pricing);
      this.loading.set(false);
    });
  }
}
