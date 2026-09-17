import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';

@Component({
  selector: 'app-qr',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonModule, ProgressSpinnerModule],
  template: `
    <a routerLink="/admin/shops" class="text-sm" style="color: var(--p-primary-600)">&larr; Back to shops</a>
    <h1 class="page-title mt-2">Shop QR Code</h1>
    <p class="page-subtitle">
      Customers scan this to reach the upload page for this shop. Regenerating issues a new code without
      affecting any past order.
    </p>

    @if (loading()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (qr(); as q) {
      <div class="surface-card-flat p-5 flex flex-column align-items-center gap-3" style="max-width: 360px">
        <img [src]="q.dataUrl" alt="Shop QR code" width="240" height="240" />
        <code class="text-sm text-color-secondary break-word">{{ q.url }}</code>
        <div class="flex gap-2 mt-2">
          <a [href]="q.dataUrl" download="printsetu-shop-qr.png">
            <p-button label="Download" icon="pi pi-download" severity="secondary" />
          </a>
          <p-button label="Regenerate" icon="pi pi-refresh" severity="danger" [text]="true" (onClick)="regenerate()" />
        </div>
      </div>
    }
  `,
})
export class QrComponent implements OnInit {
  shopId!: string;
  loading = signal(true);
  qr = signal<{ dataUrl: string; url: string; code: string } | null>(null);

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
    this.adminService.getQr(this.shopId).subscribe((qr) => {
      this.qr.set(qr);
      this.loading.set(false);
    });
  }

  regenerate(): void {
    this.confirmationService.confirm({
      message: 'Regenerate the QR code? The old printed QR sheet will stop working immediately.',
      header: 'Confirm regeneration',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.adminService.regenerateQr(this.shopId).subscribe((qr) => {
          this.qr.set(qr);
          this.messageService.add({ severity: 'success', summary: 'QR code regenerated' });
        });
      },
    });
  }
}
