import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService } from '../../core/services/billing.service';
import { InvoiceRecord, InvoiceStatus } from '../../core/models/billing.models';
import { InvoiceTableComponent } from '../../shared/billing/invoice-table.component';
import { downloadBlob, printBlob } from '../../shared/billing/billing.util';
import { RefundDialogComponent } from './refund-dialog.component';

const PAGE = 20;

/** Every invoice across all shops, with search, status filter, PDFs and refunds. */
@Component({
  selector: 'app-sub-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, InvoiceTableComponent, RefundDialogComponent],
  template: `
    <div class="gateway" role="note">
      <span class="gateway__icon"><i class="pi pi-wallet"></i></span>
      <div>
        <strong>Manual payment tracking</strong>
        <p>No payment gateway (Razorpay, Stripe, …) is connected. Payments are recorded by an admin with <b>Mark paid</b> (cash, UPI, bank transfer). Automatic renewals and retries switch on once a gateway is added.</p>
      </div>
    </div>

    <section class="pf-card">
      <div class="filters">
        <label class="search">
          <i class="pi pi-search" aria-hidden="true"></i>
          <input type="search" placeholder="Search invoice number, shop or reference" [ngModel]="search()" (ngModelChange)="onSearch($event)" aria-label="Search invoices" />
        </label>
        <div class="chips" role="tablist" aria-label="Filter by status">
          @for (f of filters; track f.key) {
            <button type="button" role="tab" class="chip" [class.is-on]="status() === f.key" [attr.aria-selected]="status() === f.key" (click)="setStatus(f.key)">{{ f.label }}</button>
          }
        </div>
      </div>

      @if (loading()) {
        <div class="pf-skeleton" style="height: 14rem"></div>
      } @else {
        <app-invoice-table
          [invoices]="items()"
          [showShop]="true"
          [canRefund]="true"
          [canMarkPaid]="false"
          emptyText="No invoices match."
          (pdf)="pdf($event)"
          (print)="print($event)"
          (refund)="refunding.set($event); refundOpen = true"
        />
        @if (total() > items().length || page() > 1) {
          <div class="pager">
            <button type="button" class="pf-btn" [disabled]="page() === 1" (click)="go(page() - 1)"><i class="pi pi-chevron-left"></i> Newer</button>
            <span>{{ (page() - 1) * pageSize + 1 }}–{{ (page() - 1) * pageSize + items().length }} of {{ total() }}</span>
            <button type="button" class="pf-btn" [disabled]="page() * pageSize >= total()" (click)="go(page() + 1)">Older <i class="pi pi-chevron-right"></i></button>
          </div>
        }
      }
    </section>

    <app-refund-dialog [invoice]="refunding()" [(visible)]="refundOpen" (done)="load()" />
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .gateway {
        display: flex;
        gap: 0.875rem;
        margin-bottom: 1rem;
        padding: 0.875rem 1rem;
        border: 1px solid var(--bd-e0e7ff);
        border-radius: 16px;
        background: var(--bg-f5f7ff);
      }
      .gateway__icon {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 12px;
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .gateway strong {
        color: var(--tx-312e81);
      }
      .gateway p {
        margin: 0.125rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-475569);
      }
      .filters {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }
      .search {
        position: relative;
        display: block;
        max-width: 26rem;
      }
      .search i {
        position: absolute;
        left: 0.875rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--tx-94a3b8);
        pointer-events: none;
      }
      .search input {
        width: 100%;
        padding: 0.625rem 0.875rem 0.625rem 2.5rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 0.9375rem;
        outline: none;
      }
      .search input:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
      }
      .chips {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        padding-bottom: 0.125rem;
        scrollbar-width: none;
      }
      .chip {
        flex: none;
        padding: 0.4rem 0.875rem;
        border: 1px solid var(--bd-e2e8f0);
        border-radius: 999px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-64748b);
        cursor: pointer;
      }
      .chip.is-on {
        border-color: var(--p-primary-600);
        background: var(--p-primary-600);
        color: #fff;
      }
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: 1rem;
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
    `,
  ],
})
export class SubPaymentsComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();

  readonly pageSize = PAGE;
  readonly filters: { key: InvoiceStatus | ''; label: string }[] = [
    { key: '', label: 'All' },
    { key: 'PAID', label: 'Paid' },
    { key: 'OPEN', label: 'Unpaid' },
    { key: 'FAILED', label: 'Failed' },
    { key: 'PARTIALLY_REFUNDED', label: 'Part refunded' },
    { key: 'REFUNDED', label: 'Refunded' },
    { key: 'VOID', label: 'Void' },
  ];

  loading = signal(true);
  items = signal<InvoiceRecord[]>([]);
  total = signal(0);
  page = signal(1);
  search = signal('');
  status = signal<InvoiceStatus | ''>('');
  refunding = signal<InvoiceRecord | null>(null);
  refundOpen = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly billing: BillingService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.billing.invoices({ status: this.status(), search: this.search(), page: this.page(), pageSize: PAGE }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.loading.set(false);
        this.changed.emit();
      },
      error: () => this.loading.set(false),
    });
  }

  onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 300);
  }

  setStatus(s: InvoiceStatus | ''): void {
    this.status.set(s);
    this.page.set(1);
    this.load();
  }

  go(p: number): void {
    this.page.set(p);
    this.load();
  }

  pdf(i: InvoiceRecord): void {
    this.billing.invoicePdf(i.id).subscribe((b) => downloadBlob(b, `${i.number}.pdf`));
  }

  print(i: InvoiceRecord): void {
    this.billing.invoicePdf(i.id).subscribe((b) => printBlob(b));
  }
}
