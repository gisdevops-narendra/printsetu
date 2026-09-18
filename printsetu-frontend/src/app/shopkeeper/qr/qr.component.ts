import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
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
      <div class="qr-stage">
        <div class="qr-card">
          <div class="qr-eyebrow">
            <span class="qr-eyebrow__icon"><i class="pi pi-qrcode"></i></span>
            <span>Scan to order</span>
          </div>

          <div class="qr-frame">
            <img [src]="q.dataUrl" alt="Shop QR code" width="220" height="220" />
          </div>

          <div class="qr-code-badge">{{ q.code }}</div>

          <div class="qr-url-row">
            <code class="qr-url">{{ q.url }}</code>
            <button type="button" class="qr-copy-btn" (click)="copyLink(q.url)" aria-label="Copy link">
              <i class="pi pi-copy"></i>
            </button>
          </div>

          <div class="qr-actions">
            <a [href]="q.dataUrl" download="printsetu-shop-qr.png" class="flex-1">
              <p-button label="Download" icon="pi pi-download" styleClass="w-full" />
            </a>
            <p-button
              label="Copy link"
              icon="pi pi-link"
              severity="secondary"
              [outlined]="true"
              styleClass="flex-1 w-full"
              (onClick)="copyLink(q.url)"
            />
          </div>

          <div class="qr-steps">
            <div class="qr-step">
              <span class="qr-step__icon"><i class="pi pi-print"></i></span>
              <span class="qr-step__label">Print it</span>
            </div>
            <i class="pi pi-angle-right qr-step__arrow"></i>
            <div class="qr-step">
              <span class="qr-step__icon"><i class="pi pi-mobile"></i></span>
              <span class="qr-step__label">Customer scans</span>
            </div>
            <i class="pi pi-angle-right qr-step__arrow"></i>
            <div class="qr-step">
              <span class="qr-step__icon"><i class="pi pi-inbox"></i></span>
              <span class="qr-step__label">Order lands in queue</span>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .qr-stage {
        flex: 1 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.5rem 1rem 2rem;
        border-radius: 20px;
        background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 65%);
      }

      .qr-card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
        padding: 2.25rem 2rem 1.75rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
      }

      .qr-eyebrow {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--p-primary-600);
      }

      .qr-eyebrow__icon {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        background: var(--p-primary-50);
        color: var(--p-primary-600);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
      }

      .qr-frame {
        padding: 1rem;
        border-radius: 20px;
        background: #f8fafc;
        border: 2px solid var(--p-primary-100);
        box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
      }

      .qr-frame img {
        display: block;
        border-radius: 6px;
      }

      .qr-code-badge {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-weight: 700;
        letter-spacing: 0.05em;
        font-size: 0.8125rem;
        color: #475569;
        background: #f1f5f9;
        padding: 0.3rem 0.85rem;
        border-radius: 999px;
      }

      .qr-url-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 0.5rem 0.6rem 0.5rem 0.75rem;
      }

      .qr-url {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 0.75rem;
        color: #64748b;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: transparent;
      }

      .qr-copy-btn {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        padding: 0.35rem;
        border-radius: 6px;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .qr-copy-btn:hover {
        background: #e2e8f0;
        color: #0f172a;
      }

      .qr-actions {
        display: flex;
        gap: 0.75rem;
        width: 100%;
      }

      .qr-actions > * {
        flex: 1 1 0;
      }

      .qr-steps {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.625rem;
        width: 100%;
        margin-top: 0.5rem;
        padding-top: 1.25rem;
        border-top: 1px solid #f1f5f9;
      }

      .qr-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        flex: 1;
        min-width: 0;
      }

      .qr-step__icon {
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        background: #f1f5f9;
        color: #64748b;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
      }

      .qr-step__label {
        font-size: 0.6875rem;
        color: #64748b;
        text-align: center;
        line-height: 1.3;
      }

      .qr-step__arrow {
        color: #cbd5e1;
        font-size: 0.75rem;
        flex-shrink: 0;
      }

      @media (max-width: 480px) {
        .qr-card {
          padding: 1.75rem 1.25rem 1.5rem;
        }

        .qr-step__label {
          display: none;
        }
      }
    `,
  ],
})
export class ShopQrComponent implements OnInit {
  loading = signal(true);
  qr = signal<{ dataUrl: string; url: string; code: string } | null>(null);

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.shopkeeperService.getQr().subscribe((qr) => {
      this.qr.set(qr);
      this.loading.set(false);
    });
  }

  copyLink(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.messageService.add({ severity: 'success', summary: 'Link copied to clipboard' });
    });
  }
}
