import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { InvoiceRecord } from '../../core/models/billing.models';
import { BillingPillComponent } from './billing-pill.component';
import { PAYMENT_METHODS, cycleLabel, money } from './billing.util';

/**
 * Invoice list used by the admin Payments tab, the per-shop billing drawer and
 * the shop owner's Billing page. On phones each row becomes a card.
 * Admin-only actions (mark paid / refund) show only when a handler is wired.
 */
@Component({
  selector: 'app-invoice-table',
  standalone: true,
  imports: [CommonModule, DatePipe, BillingPillComponent],
  template: `
    @if (invoices.length === 0) {
      <div class="empty"><i class="pi pi-receipt"></i><span>{{ emptyText }}</span></div>
    } @else {
      <table class="inv">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            @if (showShop) { <th scope="col">Shop</th> }
            <th scope="col">Plan &amp; period</th>
            <th scope="col" class="num">Amount</th>
            <th scope="col">Date</th>
            <th scope="col">Status</th>
            <th scope="col" class="act"><span class="sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (i of invoices; track i.id) {
            <tr>
              <td data-label="Invoice">
                <strong class="mono">{{ i.number }}</strong>
                <span class="sub">{{ kind(i) }}</span>
              </td>
              @if (showShop) {
                <td data-label="Shop"><strong>{{ i.shop?.name }}</strong><span class="sub mono">{{ i.shop?.shopCode }}</span></td>
              }
              <td data-label="Plan">
                <strong>{{ i.planName }} <em>{{ cycleLabel(i.cycle).toLowerCase() }}</em></strong>
                <span class="sub">{{ i.periodStart | date: 'd MMM y' }} – {{ i.periodEnd | date: 'd MMM y' }}</span>
              </td>
              <td data-label="Amount" class="num">
                <strong>{{ money(i.amount, i.currency) }}</strong>
                @if (+i.refundedAmount > 0) { <span class="sub refund">{{ money(i.refundedAmount, i.currency) }} refunded</span> }
              </td>
              <td data-label="Date">
                @if (i.paidAt) { <strong>{{ i.paidAt | date: 'd MMM y' }}</strong><span class="sub">paid{{ method(i) ? ' by ' + method(i) : '' }}</span> }
                @else { <strong>{{ i.dueDate | date: 'd MMM y' }}</strong><span class="sub">due</span> }
              </td>
              <td data-label="Status">
                <app-billing-pill [invoice]="i.status" />
                @if (i.attemptCount > 1 && (i.status === 'OPEN' || i.status === 'FAILED')) { <span class="sub">{{ i.attemptCount }} attempts</span> }
                @if (i.lastFailure && (i.status === 'OPEN' || i.status === 'FAILED')) { <span class="sub bad">{{ i.lastFailure }}</span> }
              </td>
              <td class="act">
                <div class="acts">
                  <button type="button" class="ic" title="Download PDF" aria-label="Download PDF" (click)="pdf.emit(i)"><i class="pi pi-download"></i></button>
                  <button type="button" class="ic" title="Print" aria-label="Print invoice" (click)="print.emit(i)"><i class="pi pi-print"></i></button>
                  @if (canMarkPaid && (i.status === 'OPEN' || i.status === 'FAILED')) {
                    <button type="button" class="txt" (click)="markPaid.emit(i)"><i class="pi pi-check"></i> Mark paid</button>
                  }
                  @if (canRefund && (i.status === 'PAID' || i.status === 'PARTIALLY_REFUNDED')) {
                    <button type="button" class="txt" (click)="refund.emit(i)"><i class="pi pi-undo"></i> Refund</button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        /* Card layout is decided by this component's own width (page, drawer or phone). */
        container-type: inline-size;
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 2rem 1rem;
        color: var(--tx-94a3b8);
        text-align: center;
      }
      .empty i {
        font-size: 1.75rem;
      }
      .inv {
        width: 100%;
        border-collapse: collapse;
      }
      .inv th {
        padding: 0.625rem 0.75rem;
        text-align: left;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--tx-94a3b8);
        border-bottom: 2px solid var(--bd-eef1f7);
      }
      .inv td {
        padding: 0.875rem 0.75rem;
        vertical-align: top;
        border-bottom: 1px solid var(--bd-eef1f7);
        font-size: 0.9rem;
        color: var(--tx-334155);
      }
      .inv td > strong,
      .inv td > span {
        display: block;
      }
      .inv td strong {
        color: var(--tx-0f172a);
      }
      .inv td strong em {
        font-style: normal;
        font-weight: 500;
        color: var(--tx-64748b);
      }
      .num {
        text-align: right !important;
        white-space: nowrap;
      }
      .sub {
        margin-top: 0.125rem;
        font-size: 0.75rem;
        color: var(--tx-94a3b8);
      }
      .sub.refund {
        color: var(--tx-4338ca);
      }
      .sub.bad {
        color: var(--tx-b91c1c);
        max-width: 14rem;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8125rem;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .act {
        width: 1%;
        white-space: nowrap;
      }
      .acts {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.25rem;
      }
      .ic,
      .txt {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-height: 2.25rem;
        border: 1px solid var(--bd-e2e8f0);
        border-radius: 10px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
        cursor: pointer;
      }
      .ic {
        width: 2.25rem;
      }
      .txt {
        padding: 0 0.75rem;
      }
      .ic:hover,
      .txt:hover {
        border-color: var(--p-primary-300);
        color: var(--accent-text-700);
        background: var(--p-primary-50);
      }

      @container (max-width: 900px) {
        .inv,
        .inv tbody,
        .inv tr,
        .inv td {
          display: block;
        }
        .inv thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
        }
        .inv tbody {
          display: grid;
          gap: 0.75rem;
        }
        .inv tr {
          padding: 0.375rem 1rem 0.75rem;
          border: 1px solid var(--bd-e6eaf2);
          border-radius: 16px;
        }
        .inv td {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          padding: 0.5rem 0;
          text-align: right;
          border-bottom: 1px solid var(--bd-f3f5fa);
        }
        .inv td::before {
          content: attr(data-label);
          flex: none;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--tx-94a3b8);
          text-align: left;
        }
        .inv td > strong,
        .inv td > span {
          text-align: right;
        }
        .inv td.act {
          width: auto;
          border-bottom: none;
          padding-top: 0.75rem;
        }
        .inv td.act::before {
          content: none;
        }
        .acts {
          flex-wrap: wrap;
          width: 100%;
          justify-content: flex-start;
        }
        .sub.bad {
          max-width: none;
        }
      }
    `,
  ],
})
export class InvoiceTableComponent {
  @Input() invoices: InvoiceRecord[] = [];
  @Input() showShop = false;
  @Input() canMarkPaid = false;
  @Input() canRefund = false;
  @Input() emptyText = 'No invoices yet.';
  @Output() pdf = new EventEmitter<InvoiceRecord>();
  @Output() print = new EventEmitter<InvoiceRecord>();
  @Output() markPaid = new EventEmitter<InvoiceRecord>();
  @Output() refund = new EventEmitter<InvoiceRecord>();

  readonly money = money;
  readonly cycleLabel = cycleLabel;

  kind(i: InvoiceRecord): string {
    return { INITIAL: 'First invoice', RENEWAL: 'Renewal', UPGRADE: 'Plan upgrade' }[i.kind] ?? i.kind;
  }

  method(i: InvoiceRecord): string {
    return PAYMENT_METHODS.find((m) => m.value === i.paymentMethod)?.label ?? (i.paymentMethod === 'GATEWAY' ? 'gateway' : '');
  }
}
