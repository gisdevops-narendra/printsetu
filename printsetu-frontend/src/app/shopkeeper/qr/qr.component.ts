import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';

@Component({
  selector: 'app-shop-qr',
  standalone: true,
  imports: [CommonModule, ButtonModule, ProgressSpinnerModule],
  template: `
    <h1 class="page-title">Shop QR Code</h1>
    <p class="page-subtitle">
      Customers scan this to reach your upload page. Contact an administrator if you need it
      regenerated (e.g. a damaged or misused printed sheet).
    </p>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (qr(); as q) {
      <div class="surface-card-flat p-5 flex flex-column align-items-center gap-3" style="max-width: 360px">
        <img [src]="q.dataUrl" alt="Shop QR code" width="240" height="240" />
        <code class="text-sm text-color-secondary break-word">{{ q.url }}</code>
        <a [href]="q.dataUrl" download="printsetu-shop-qr.png">
          <p-button label="Download" icon="pi pi-download" severity="secondary" />
        </a>
      </div>
    }
  `,
})
export class ShopQrComponent implements OnInit {
  loading = signal(true);
  qr = signal<{ dataUrl: string; url: string; code: string } | null>(null);

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.getQr().subscribe((qr) => {
      this.qr.set(qr);
      this.loading.set(false);
    });
  }
}
