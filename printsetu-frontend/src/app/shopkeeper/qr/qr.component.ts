import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { QrData, QrPanelComponent } from '../../shared/components/qr-panel/qr-panel.component';

@Component({
  selector: 'app-shop-qr',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ButtonModule, ProgressSpinnerModule, QrPanelComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'shopQr.shop_qr_code' | translate }}</h1>
        <p class="page-subtitle">
          {{ 'shopQr.print_the_counter_sign_and_customers' | translate }}
        </p>
      </div>
    </div>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (qr(); as q) {
      <app-qr-panel [qr]="q" [shopName]="shopName()" />
    } @else {
      <div class="surface-card-flat p-5 text-center">
        <i class="pi pi-exclamation-circle" style="font-size: 1.75rem; color: var(--tx-dc2626)"></i>
        <p class="mt-3 mb-3">{{ 'shopQr.we_couldnt_load_your_qr_code' | translate }}</p>
        <p-button [label]="'common.try_again' | translate" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="load()" />
      </div>
    }
  `,
})
export class ShopQrComponent implements OnInit {
  loading = signal(true);
  qr = signal<QrData | null>(null);
  shopName = signal<string | null>(null);

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    // The shop's name makes the sign recognisable; if the profile call fails the sign simply omits it.
    this.shopkeeperService.profile().subscribe({
      next: (res) => this.shopName.set(res.shop?.name ?? null),
      error: () => this.shopName.set(null),
    });
    this.shopkeeperService.getQr().subscribe({
      next: (qr) => {
        this.qr.set(qr);
        this.loading.set(false);
      },
      error: () => {
        this.qr.set(null);
        this.loading.set(false);
      },
    });
  }
}
