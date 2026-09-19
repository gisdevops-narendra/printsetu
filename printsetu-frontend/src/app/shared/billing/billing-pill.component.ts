import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoiceStatus, SubscriptionStateOrNone } from '../../core/models/billing.models';
import { INVOICE_META, STATE_META, Tone } from './billing.util';

/** Coloured status pill for a subscription state or an invoice status. */
@Component({
  selector: 'app-billing-pill',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="pill" [ngClass]="'pill--' + meta().tone" [attr.title]="hint()"><span class="dot"></span>{{ meta().label }}</span>`,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1.4;
        white-space: nowrap;
      }
      .dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: currentColor;
      }
      .pill--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .pill--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .pill--warn {
        background: var(--bg-fef3c7);
        color: var(--tx-92400e);
      }
      .pill--bad {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .pill--muted {
        background: var(--bg-f1f5f9);
        color: var(--tx-475569);
      }
    `,
  ],
})
export class BillingPillComponent {
  @Input() state: SubscriptionStateOrNone | null = null;
  @Input() invoice: InvoiceStatus | null = null;

  meta(): { label: string; tone: Tone } {
    if (this.invoice) return INVOICE_META[this.invoice] ?? { label: this.invoice, tone: 'muted' };
    return STATE_META[this.state ?? 'NONE'] ?? { label: String(this.state), tone: 'muted' };
  }

  hint(): string | null {
    return this.invoice ? null : STATE_META[this.state ?? 'NONE']?.hint ?? null;
  }
}
