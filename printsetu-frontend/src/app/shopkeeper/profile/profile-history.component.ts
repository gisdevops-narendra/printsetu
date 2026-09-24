import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { PrintJobRow, PrintJobStatus } from '../../core/models/models';
import { StatusTagComponent } from '../../shared/components/status-tag/status-tag.component';
import { rupees } from './profile.util';

type Filter = 'all' | 'progress' | 'completed' | 'failed' | 'cancelled';

const GROUPS: Record<Exclude<Filter, 'all'>, PrintJobStatus[]> = {
  progress: ['CREATED', 'PRINT_ELIGIBLE', 'QUEUED', 'PRINTING', 'AGENT_OFFLINE', 'PRINT_UNKNOWN'],
  completed: ['PRINTED', 'RETENTION_PENDING', 'DELETED'],
  failed: ['PRINT_FAILED'],
  cancelled: ['CANCELLED'],
};

const PAGE = 8;

/** Recent orders with quick status filters and search; the full log lives on the History page. */
@Component({
  selector: 'app-profile-history',
  standalone: true,
  imports: [CommonModule, RouterLink, StatusTagComponent],
  template: `
    <section class="pf-card">
      <header class="pf-card__head">
        <div>
          <h3 class="pf-eyebrow">Order history</h3>
          @if (!loading() && total() > 0) {
            <p class="summary">Showing your latest {{ jobs().length }}{{ total() > jobs().length ? ' of ' + total() : '' }} orders</p>
          }
        </div>
        <a routerLink="/shop/history" class="pf-btn">Full history <i class="pi pi-arrow-right"></i></a>
      </header>

      <!-- filters + search -->
      <div class="toolbar">
        <div class="chips" role="tablist" aria-label="Filter by status">
          @for (f of filters; track f.key) {
            <button type="button" role="tab" class="chip" [class.is-on]="filter() === f.key" [attr.aria-selected]="filter() === f.key" (click)="setFilter(f.key)">
              {{ f.label }}<span class="chip__n">{{ counts()[f.key] }}</span>
            </button>
          }
        </div>
        <label class="search">
          <i class="pi pi-search"></i>
          <input type="search" placeholder="Search order number or file name" [value]="query()" (input)="onSearch($any($event.target).value)" aria-label="Search orders" />
        </label>
      </div>

      @if (loading()) {
        @for (i of [1, 2, 3, 4]; track i) { <div class="pf-skeleton" style="height: 3.75rem; margin-bottom: 0.625rem"></div> }
      } @else if (error()) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
          <strong>Couldn't load your orders</strong>
          <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> Try again</button>
        </div>
      } @else if (jobs().length === 0) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-history"></i></span>
          <strong>No orders yet</strong>
          <p>Orders appear here as customers send files to your shop.</p>
        </div>
      } @else if (visible().length === 0) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-filter"></i></span>
          <strong>Nothing matches</strong>
          <p>Try a different status or clear the search.</p>
          <button type="button" class="pf-btn" (click)="reset()">Clear filters</button>
        </div>
      } @else {
        <ul class="list">
          @for (j of shown(); track j.id) {
            <li class="row">
              <span class="row__token">#{{ j.tokenNumber }}</span>
              <div class="row__main">
                <span class="row__name" [title]="names(j)">{{ firstName(j) }}@if (j.items.length > 1) { <em>+{{ j.items.length - 1 }} more</em> }</span>
                <span class="row__meta">{{ j.createdAt | date: 'MMM d, h:mm a' }} &middot; {{ pages(j) }} {{ pages(j) === 1 ? 'page' : 'pages' }}</span>
              </div>
              <span class="row__amount">{{ money(j.amount) }}</span>
              <app-status-tag [status]="j.status" />
            </li>
          }
        </ul>
        @if (visible().length > shown().length) {
          <button type="button" class="pf-btn more" (click)="limit.set(limit() + PAGE)">
            Show {{ Math.min(PAGE, visible().length - shown().length) }} more
          </button>
        }
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
        font-size: 0.875rem;
        color: var(--tx-64748b);
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem 1rem;
        margin-bottom: 1rem;
      }
      .chips {
        display: flex;
        gap: 0.375rem;
        overflow-x: auto;
        max-width: 100%;
        padding-bottom: 2px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        flex: 0 0 auto;
        min-height: 2.25rem;
        padding: 0 0.875rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 999px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-475569);
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
      }
      .chip:hover {
        border-color: var(--p-primary-300);
      }
      .chip.is-on {
        border-color: var(--p-primary-600);
        background: var(--p-primary-600);
        color: #fff;
      }
      .chip__n {
        min-width: 1.25rem;
        padding: 0 0.375rem;
        border-radius: 999px;
        background: var(--bg-eef1f7);
        font-size: 0.6875rem;
        text-align: center;
        color: var(--tx-64748b);
      }
      .chip.is-on .chip__n {
        background: rgba(255, 255, 255, 0.22);
        color: #fff;
      }
      .search {
        position: relative;
        flex: 1 1 14rem;
        max-width: 22rem;
      }
      .search i {
        position: absolute;
        left: 0.875rem;
        top: 50%;
        transform: translateY(-50%);
        font-size: 0.875rem;
        color: var(--tx-94a3b8);
      }
      .search input {
        width: 100%;
        height: 2.5rem;
        padding: 0 0.875rem 0 2.375rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 0.875rem;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .search input:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.14);
      }
      .list {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .row {
        display: grid;
        grid-template-columns: 4.25rem minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.75rem 1rem;
        padding: 0.875rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .row:last-child {
        border-bottom: none;
      }
      .row__token {
        font-size: 0.9375rem;
        font-weight: 800;
        color: var(--tx-0f172a);
        font-variant-numeric: tabular-nums;
      }
      .row__main {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
      }
      .row__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--tx-1e293b);
      }
      .row__name em {
        margin-left: 0.5rem;
        font-size: 0.75rem;
        font-style: normal;
        font-weight: 600;
        color: var(--accent-text-600);
      }
      .row__meta {
        font-size: 0.75rem;
        color: var(--tx-94a3b8);
      }
      .row__amount {
        font-size: 0.9375rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .more {
        width: 100%;
        margin-top: 0.75rem;
      }
      @media (max-width: 640px) {
        .row {
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-areas: 'token status' 'main main' 'amount amount';
          gap: 0.375rem 0.75rem;
          padding: 1rem 0;
        }
        .row__token {
          grid-area: token;
        }
        .row app-status-tag {
          grid-area: status;
          justify-self: end;
        }
        .row__main {
          grid-area: main;
        }
        .row__amount {
          grid-area: amount;
          color: var(--tx-475569);
        }
      }
    `,
  ],
})
export class ProfileHistoryComponent implements OnInit {
  readonly PAGE = PAGE;
  readonly Math = Math;
  readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  loading = signal(true);
  error = signal(false);
  jobs = signal<PrintJobRow[]>([]);
  total = signal(0);
  filter = signal<Filter>('all');
  query = signal('');
  limit = signal(PAGE);

  counts = computed<Record<Filter, number>>(() => {
    const all = this.jobs();
    const inGroup = (g: Exclude<Filter, 'all'>) => all.filter((j) => GROUPS[g].includes(j.status)).length;
    return { all: all.length, progress: inGroup('progress'), completed: inGroup('completed'), failed: inGroup('failed'), cancelled: inGroup('cancelled') };
  });

  visible = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase().replace(/^#/, '');
    return this.jobs().filter((j) => {
      if (f !== 'all' && !GROUPS[f].includes(j.status)) return false;
      if (!q) return true;
      return String(j.tokenNumber).includes(q) || j.items.some((i) => (i.document?.originalName ?? '').toLowerCase().includes(q));
    });
  });
  shown = computed(() => this.visible().slice(0, this.limit()));

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.shopkeeperService.history(1, 100).subscribe({
      next: (res) => {
        this.jobs.set(res.items);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  setFilter(f: Filter): void {
    this.filter.set(f);
    this.limit.set(PAGE);
  }

  onSearch(value: string): void {
    this.query.set(value);
    this.limit.set(PAGE);
  }

  reset(): void {
    this.filter.set('all');
    this.query.set('');
    this.limit.set(PAGE);
  }

  firstName(j: PrintJobRow): string {
    return j.items[0]?.document?.originalName ?? 'Document';
  }

  names(j: PrintJobRow): string {
    return j.items.map((i) => i.document?.originalName ?? 'Document').join(', ');
  }

  pages(j: PrintJobRow): number {
    return j.items.reduce((sum, i) => sum + (i.billablePages ?? 0), 0);
  }

  money(amount: string | number): string {
    return rupees(amount);
  }
}
