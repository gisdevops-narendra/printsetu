import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { QrData, QrPanelComponent } from '../../shared/components/qr-panel/qr-panel.component';

@Component({
  selector: 'app-qr',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, ProgressSpinnerModule, QrPanelComponent],
  template: `
    <a routerLink="/admin/shops" class="back-link"><i class="pi pi-arrow-left"></i> Back to shops</a>
    <div class="page-header">
      <div>
        <h1 class="page-title">Shop QR Code</h1>
        <p class="page-subtitle">
          @if (shopName()) { <strong>{{ shopName() }}</strong> &middot; }
          Customers scan this to reach the upload page for this shop. Regenerating issues a new code without
          affecting any past order.
        </p>
      </div>
    </div>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (qr(); as q) {
      <app-qr-panel [qr]="q" [shopName]="shopName()" [canRegenerate]="true" (regenerate)="regenerate()" />
    } @else {
      <div class="surface-card-flat p-5 text-center">
        <p class="mt-0 mb-3">We couldn't load this QR code.</p>
        <p-button label="Try again" icon="pi pi-refresh" severity="secondary" [outlined]="true" (onClick)="load()" />
      </div>
    }
  `,
  styles: [
    `
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--accent-text-600);
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class QrComponent implements OnInit {
  shopId!: string;
  loading = signal(true);
  qr = signal<QrData | null>(null);
  shopName = signal<string | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly adminService: AdminService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.shopId = this.route.snapshot.paramMap.get('shopId')!;
    this.load();
  }

  load(): void {
    this.loading.set(true);
    // Name for the sign; best effort (there is no single-shop endpoint, so pick it from the list).
    this.adminService.listShops().subscribe({
      next: (res) => this.shopName.set(res.items.find((s) => s.id === this.shopId)?.name ?? null),
      error: () => this.shopName.set(null),
    });
    this.adminService.getQr(this.shopId).subscribe({
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

  regenerate(): void {
    this.confirmationService.confirm({
      message: 'Regenerate the QR code? The old printed QR sheet will stop working immediately.',
      header: 'Confirm regeneration',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Regenerate',
      rejectLabel: 'Cancel',
      accept: () => {
        this.adminService.regenerateQr(this.shopId).subscribe((qr) => {
          this.qr.set(qr);
          this.messageService.add({ severity: 'success', summary: 'QR code regenerated' });
        });
      },
    });
  }
}
