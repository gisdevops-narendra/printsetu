import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { Shop } from '../../core/models/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ProgressSpinnerModule],
  template: `
    <h1 class="page-title">Shop Profile</h1>
    <p class="page-subtitle">Read-only — contact an administrator to change shop details.</p>

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
    }
  `,
})
export class ProfileComponent implements OnInit {
  loading = signal(true);
  shop = signal<Shop | null>(null);

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.profile().subscribe((res) => {
      this.shop.set(res.shop);
      this.loading.set(false);
    });
  }
}
