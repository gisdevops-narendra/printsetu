import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PaperSize, PricingRate } from '../../core/models/models';
import { rupees } from './profile.util';

interface Column {
  key: string;
  color: 'BW' | 'COLOR';
  side: 'SIMPLEX' | 'DUPLEX';
  title: string;
  sub: string;
}

/** The print services on offer, as a price list customers would recognise. */
@Component({
  selector: 'app-profile-services',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="pf-card">
      <header class="pf-card__head">
        <div>
          <h3 class="pf-eyebrow">Print services &amp; pricing</h3>
          @if (!loading() && count() > 0) {
            <p class="summary">{{ count() }} {{ count() === 1 ? 'service' : 'services' }} &middot; from {{ money(cheapest()) }} per page</p>
          }
        </div>
        <a routerLink="/shop/pricing" class="pf-btn pf-btn--primary"><i class="pi pi-pencil"></i> Manage rates</a>
      </header>

      @if (loading()) {
        <div class="pf-skeleton" style="height: 12rem"></div>
      } @else if (count() === 0) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-tag"></i></span>
          <strong>No rates set yet</strong>
          <p>Add a price for each paper size, colour and sides option to start accepting orders.</p>
          <a routerLink="/shop/pricing" class="pf-btn pf-btn--primary"><i class="pi pi-plus"></i> Add rates</a>
        </div>
      } @else {
        <div class="scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col">Paper size</th>
                @for (c of columns; track c.key) {
                  <th scope="col"><span class="col-title"><i class="pi" [ngClass]="c.color === 'COLOR' ? 'pi-palette' : 'pi-circle-fill'"></i> {{ c.title }}</span><small>{{ c.sub }}</small></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (p of papers(); track p) {
                <tr>
                  <th scope="row">{{ paperLabel(p) }}</th>
                  @for (c of columns; track c.key) {
                    @let rate = priceFor(p, c);
                    <td [attr.data-label]="c.title + ' · ' + c.sub">
                      @if (rate !== null) {
                        <span class="price" [class.is-min]="rate === cheapest()">{{ money(rate) }}</span>
                      } @else {
                        <span class="none" aria-label="Not offered">&mdash;</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="note"><i class="pi pi-info-circle"></i> Prices are per page. Changing a rate never alters orders that were already placed.</p>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .summary {
        margin: 0.25rem 0 0;
        font-size: 0.9375rem;
        color: var(--tx-475569);
      }
      .scroll {
        overflow-x: auto;
        margin: 0 -0.25rem;
        padding: 0 0.25rem;
      }
      .matrix {
        width: 100%;
        min-width: 34rem;
        border-collapse: separate;
        border-spacing: 0;
      }
      .matrix th,
      .matrix td {
        padding: 0.875rem 0.75rem;
        text-align: center;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .matrix thead th {
        vertical-align: bottom;
        font-weight: 600;
        color: var(--tx-334155);
        border-bottom: 2px solid var(--bd-e6eaf2);
      }
      .matrix thead th:first-child,
      .matrix tbody th {
        text-align: left;
      }
      .col-title {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.875rem;
      }
      .col-title .pi-circle-fill {
        font-size: 0.5rem;
        color: var(--tx-334155);
      }
      .col-title .pi-palette {
        font-size: 0.8125rem;
        color: #ec4899;
      }
      .matrix thead small {
        display: block;
        margin-top: 0.125rem;
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--tx-94a3b8);
      }
      .matrix tbody th {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
      .matrix tbody tr:last-child th,
      .matrix tbody tr:last-child td {
        border-bottom: none;
      }
      .matrix tbody tr:hover {
        background: var(--bg-f8fafc);
      }
      .price {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        background: var(--bg-f1f5f9);
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--tx-0f172a);
        font-variant-numeric: tabular-nums;
      }
      .price.is-min {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .none {
        color: #cbd5e1;
      }
      .note {
        display: flex;
        gap: 0.5rem;
        margin: 1rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .note i {
        margin-top: 0.15rem;
      }

      /* Phones: one card per paper size, prices listed with their labels. */
      @media (max-width: 640px) {
        .scroll {
          overflow: visible;
          margin: 0;
          padding: 0;
        }
        .matrix {
          min-width: 0;
        }
        .matrix,
        .matrix tbody,
        .matrix tr,
        .matrix th,
        .matrix td {
          display: block;
        }
        .matrix thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
        }
        .matrix tbody {
          display: grid;
          gap: 0.75rem;
        }
        .matrix tbody tr {
          padding: 0.25rem 1rem 0.5rem;
          border: 1px solid var(--bd-e6eaf2);
          border-radius: 16px;
        }
        .matrix tbody tr:hover {
          background: none;
        }
        .matrix tbody th {
          padding: 0.75rem 0;
          font-size: 1.0625rem;
          border-bottom: 1px solid var(--bd-eef1f7);
        }
        .matrix td,
        .matrix tbody tr:last-child td {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.625rem 0;
          text-align: right;
          border-bottom: 1px solid var(--bd-f3f5fa);
        }
        .matrix td:last-child,
        .matrix tbody tr:last-child td:last-child {
          border-bottom: none;
        }
        .matrix td::before {
          content: attr(data-label);
          font-size: 0.875rem;
          font-weight: 500;
          text-align: left;
          color: var(--tx-64748b);
        }
      }
    `,
  ],
})
export class ProfileServicesComponent implements OnInit {
  readonly columns: Column[] = [
    { key: 'bw-1', color: 'BW', side: 'SIMPLEX', title: 'B&W', sub: 'Single-sided' },
    { key: 'bw-2', color: 'BW', side: 'DUPLEX', title: 'B&W', sub: 'Double-sided' },
    { key: 'c-1', color: 'COLOR', side: 'SIMPLEX', title: 'Color', sub: 'Single-sided' },
    { key: 'c-2', color: 'COLOR', side: 'DUPLEX', title: 'Color', sub: 'Double-sided' },
  ];
  private readonly order: PaperSize[] = ['A4', 'A3', 'LETTER', 'LEGAL'];

  loading = signal(true);
  rates = signal<PricingRate[]>([]);

  count = computed(() => this.rates().length);
  papers = computed(() => this.order.filter((p) => this.rates().some((r) => r.paperSize === p)));
  cheapest = computed(() => {
    const prices = this.rates().map((r) => Number(r.pricePerPage)).filter((n) => Number.isFinite(n));
    return prices.length ? Math.min(...prices) : 0;
  });

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.listPricing().subscribe({
      next: (rates) => {
        this.rates.set(rates.filter((r) => r.active !== false));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Latest active rate for a paper/colour/sides combination, or null when it isn't offered. */
  priceFor(paper: PaperSize, col: Column): number | null {
    const matches = this.rates()
      .filter((r) => r.paperSize === paper && r.colorMode === col.color && r.sideMode === col.side)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    return matches.length ? Number(matches[0].pricePerPage) : null;
  }

  paperLabel(p: PaperSize): string {
    return p === 'LETTER' ? 'Letter' : p === 'LEGAL' ? 'Legal' : p;
  }

  money(n: number): string {
    return rupees(n);
  }
}
