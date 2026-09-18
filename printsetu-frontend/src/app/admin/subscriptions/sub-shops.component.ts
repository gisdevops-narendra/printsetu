import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService } from '../../core/services/billing.service';
import { SubscriptionListRow, SubscriptionPlan } from '../../core/models/billing.models';
import { BillingPillComponent } from '../../shared/billing/billing-pill.component';
import { STATE_META, money } from '../../shared/billing/billing.util';
import { ShopBillingDrawerComponent } from './shop-billing-drawer.component';

const PAGE = 20;
const STATUS_OPTIONS = ['ACTIVE', 'TRIAL', 'PAYMENT_PENDING', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'NONE'] as const;

/** All shops with their subscription state, plus filters. Selecting a row opens that shop's billing drawer. */
@Component({
  selector: 'app-sub-shops',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, BillingPillComponent, ShopBillingDrawerComponent],
  template: `
    <section class="pf-card">
      <div class="filters">
        <label class="search">
          <i class="pi pi-search" aria-hidden="true"></i>
          <input type="search" placeholder="Search shop name, code or city" [ngModel]="search()" (ngModelChange)="onSearch($event)" aria-label="Search shops" />
        </label>
        <select [ngModel]="planId()" (ngModelChange)="setPlan($event)" aria-label="Filter by plan">
          <option value="">All plans</option>
          @for (p of plans(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
        <select [ngModel]="status()" (ngModelChange)="setStatus($event)" aria-label="Filter by status">
          <option value="">All statuses</option>
          @for (s of statusOptions; track s) { <option [value]="s">{{ label(s) }}</option> }
        </select>
        <button type="button" class="soon" [class.is-on]="expiring()" (click)="toggleExpiring()" [attr.aria-pressed]="expiring()">
          <i class="pi pi-clock"></i> Expiring in 7 days
        </button>
        @if (hasFilters()) { <button type="button" class="link" (click)="clear()">Clear filters</button> }
      </div>

      @if (loading()) {
        <div class="pf-skeleton" style="height: 16rem"></div>
      } @else if (rows().length === 0) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-building"></i></span>
          <strong>No shops match</strong>
          <p>Try a different search or clear the filters.</p>
        </div>
      } @else {
        <table class="tbl">
          <thead>
            <tr>
              <th scope="col">Shop</th>
              <th scope="col">Plan</th>
              <th scope="col">Cycle</th>
              <th scope="col">Started</th>
              <th scope="col">Next billing</th>
              <th scope="col">Auto-renew</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="sr">Open</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.shopId) {
              <tr tabindex="0" (click)="openShop(r)" (keydown.enter)="openShop(r)" [attr.aria-label]="'Open billing for ' + r.shopName">
                <td data-label="Shop"><strong>{{ r.shopName }}</strong><span class="sub">{{ r.shopCode }} &middot; {{ r.city }}</span></td>
                <td data-label="Plan">
                  @if (r.plan) { <strong>{{ r.plan.name }}</strong><span class="sub">{{ money(r.price) }}</span> } @else { <span class="none">—</span> }
                </td>
                <td data-label="Cycle">{{ r.cycle ? (r.cycle === 'YEARLY' ? 'Yearly' : 'Monthly') : '—' }}</td>
                <td data-label="Started">{{ r.startDate ? (r.startDate | date: 'd MMM y') : '—' }}</td>
                <td data-label="Next billing">
                  @if (r.currentPeriodEnd) {
                    <strong [class.soon-text]="isSoon(r)">{{ r.currentPeriodEnd | date: 'd MMM y' }}</strong>
                    @if (r.status === 'PAYMENT_PENDING' && r.graceEndsAt) { <span class="sub bad">grace ends {{ r.graceEndsAt | date: 'd MMM' }}</span> }
                    @else if (r.cancelAtPeriodEnd) { <span class="sub bad">ends, won't renew</span> }
                    @else if (r.status === 'TRIAL') { <span class="sub">trial ends</span> }
                  } @else { <span class="none">—</span> }
                </td>
                <td data-label="Auto-renew">
                  @if (r.autoRenew === null) { <span class="none">—</span> }
                  @else { <span class="ar" [class.ar--on]="r.autoRenew"><i class="pi" [ngClass]="r.autoRenew ? 'pi-sync' : 'pi-times'"></i> {{ r.autoRenew ? 'On' : 'Off' }}</span> }
                </td>
                <td data-label="Status">
                  <app-billing-pill [state]="r.status" />
                  @if (r.automationPaused) { <span class="sub"><i class="pi pi-lock"></i> manual override</span> }
                </td>
                <td class="go"><i class="pi pi-chevron-right" aria-hidden="true"></i></td>
              </tr>
            }
          </tbody>
        </table>
        <div class="pager">
          <span>{{ total() }} {{ total() === 1 ? 'shop' : 'shops' }}</span>
          @if (total() > pageSize) {
            <div>
              <button type="button" class="pf-btn" [disabled]="page() === 1" (click)="go(page() - 1)"><i class="pi pi-chevron-left"></i></button>
              <span class="pg">Page {{ page() }} of {{ pages() }}</span>
              <button type="button" class="pf-btn" [disabled]="page() >= pages()" (click)="go(page() + 1)"><i class="pi pi-chevron-right"></i></button>
            </div>
          }
        </div>
      }
    </section>

    <app-shop-billing-drawer [shopId]="selected()" [(visible)]="drawerOpen" (changed)="load(true)" />
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.625rem;
        margin-bottom: 1rem;
      }
      .search {
        position: relative;
        flex: 1 1 15rem;
        max-width: 24rem;
      }
      .search i {
        position: absolute;
        left: 0.875rem;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
        pointer-events: none;
      }
      .search input,
      .filters select {
        width: 100%;
        min-height: 2.5rem;
        padding: 0.5rem 0.875rem;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
        font: inherit;
        font-size: 0.9375rem;
        color: #0f172a;
        outline: none;
      }
      .search input {
        padding-left: 2.5rem;
      }
      .filters select {
        width: auto;
        flex: 0 1 11rem;
      }
      .search input:focus,
      .filters select:focus {
        border-color: var(--p-primary-500);
        background: #fff;
      }
      .soon {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
        padding: 0 0.875rem;
        border: 1.5px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
      }
      .soon.is-on {
        border-color: #f59e0b;
        background: #fffbeb;
        color: #b45309;
      }
      .link {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--p-primary-600);
        cursor: pointer;
      }
      @media (max-width: 640px) {
        .search,
        .filters select {
          flex: 1 1 100%;
          max-width: none;
        }
      }
      .tbl {
        width: 100%;
        border-collapse: collapse;
      }
      .tbl th {
        padding: 0.625rem 0.75rem;
        text-align: left;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #94a3b8;
        border-bottom: 2px solid #eef1f7;
      }
      .tbl td {
        padding: 0.875rem 0.75rem;
        vertical-align: middle;
        border-bottom: 1px solid #eef1f7;
        font-size: 0.9rem;
        color: #334155;
      }
      .tbl td > strong,
      .tbl td > span:not(.ar) {
        display: block;
      }
      .tbl td strong {
        color: #0f172a;
      }
      .tbl tbody tr {
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .tbl tbody tr:hover,
      .tbl tbody tr:focus-visible {
        background: #f8fafc;
        outline: none;
      }
      .sub {
        margin-top: 0.125rem;
        font-size: 0.75rem;
        color: #94a3b8;
      }
      .sub.bad {
        color: #b45309;
      }
      .none {
        color: #cbd5e1;
      }
      .soon-text {
        color: #b45309 !important;
      }
      .ar {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #94a3b8;
      }
      .ar--on {
        color: #15803d;
      }
      .go {
        width: 1%;
        color: #cbd5e1;
      }
      .sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: 1rem;
        font-size: 0.8125rem;
        color: #64748b;
      }
      .pager div {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      @media (max-width: 860px) {
        .tbl,
        .tbl tbody,
        .tbl tr,
        .tbl td {
          display: block;
        }
        .tbl thead {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
        }
        .tbl tbody {
          display: grid;
          gap: 0.75rem;
        }
        .tbl tr {
          position: relative;
          padding: 0.5rem 1rem;
          border: 1px solid #e6eaf2;
          border-radius: 16px;
        }
        .tbl td {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem 0;
          text-align: right;
          border-bottom: 1px solid #f3f5fa;
        }
        .tbl td::before {
          content: attr(data-label);
          flex: none;
          font-size: 0.75rem;
          font-weight: 600;
          color: #94a3b8;
          text-align: left;
        }
        .tbl td > strong,
        .tbl td > span:not(.ar) {
          text-align: right;
        }
        .tbl td[data-label='Shop'] {
          font-size: 1rem;
        }
        .tbl td.go {
          display: none;
        }
        .tbl td:last-of-type,
        .tbl td[data-label='Status'] {
          border-bottom: none;
        }
      }
    `,
  ],
})
export class SubShopsComponent implements OnInit {
  /** Preselect a status (used by dashboard shortcuts). */
  @Input() set initialStatus(v: string | null) {
    if (v) this.status.set(v);
  }

  readonly pageSize = PAGE;
  readonly statusOptions = STATUS_OPTIONS;
  readonly money = money;

  loading = signal(true);
  rows = signal<SubscriptionListRow[]>([]);
  total = signal(0);
  plans = signal<SubscriptionPlan[]>([]);
  page = signal(1);
  search = signal('');
  planId = signal('');
  status = signal('');
  expiring = signal(false);
  selected = signal<string | null>(null);
  drawerOpen = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly billing: BillingService) {}

  ngOnInit(): void {
    this.billing.plans().subscribe((p) => this.plans.set(p));
    this.load();
  }

  label(s: string): string {
    return STATE_META[s as keyof typeof STATE_META]?.label ?? s;
  }

  pages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE));
  }

  hasFilters(): boolean {
    return !!(this.search() || this.planId() || this.status() || this.expiring());
  }

  isSoon(r: SubscriptionListRow): boolean {
    if (!r.currentPeriodEnd || !(r.status === 'ACTIVE' || r.status === 'TRIAL')) return false;
    const ms = new Date(r.currentPeriodEnd).getTime() - Date.now();
    return ms >= 0 && ms <= 7 * 86_400_000;
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.billing
      .shops({
        search: this.search(),
        planId: this.planId(),
        status: this.status(),
        expiringSoon: this.expiring() || undefined,
        page: this.page(),
        pageSize: PAGE,
      })
      .subscribe({
        next: (r) => {
          this.rows.set(r.items);
          this.total.set(r.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private reset(): void {
    this.page.set(1);
    this.load();
  }

  onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reset(), 300);
  }
  setPlan(v: string): void {
    this.planId.set(v);
    this.reset();
  }
  setStatus(v: string): void {
    this.status.set(v);
    this.reset();
  }
  toggleExpiring(): void {
    this.expiring.set(!this.expiring());
    this.reset();
  }
  clear(): void {
    this.search.set('');
    this.planId.set('');
    this.status.set('');
    this.expiring.set(false);
    this.reset();
  }
  go(p: number): void {
    this.page.set(p);
    this.load();
  }

  openShop(r: SubscriptionListRow): void {
    this.selected.set(r.shopId);
    this.drawerOpen = true;
  }
}
