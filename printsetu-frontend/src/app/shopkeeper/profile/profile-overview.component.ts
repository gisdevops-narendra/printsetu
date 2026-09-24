import { Component, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { ShopStats } from '../../core/models/models';
import { BarChartComponent, BarDatum } from '../../shared/components/bar-chart/bar-chart.component';
import { rupees } from './profile.util';
import { t as tr, intlLocale, tn } from '../../core/i18n/i18n';
import { AppNumberPipe } from '../../core/i18n/i18n-format.pipes';
import { TranslateCountPipe } from '../../core/i18n/translate-count.pipe';

type Period = 'today' | 'week' | 'month';
type Metric = 'earnings' | 'jobs';

/** Performance at a glance: headline numbers, an earnings summary and a daily chart. */
@Component({
  selector: 'app-profile-overview',
  standalone: true,
  imports: [TranslateCountPipe, AppNumberPipe, TranslatePipe, CommonModule, RouterLink, BarChartComponent],
  template: `
    @if (loading()) {
      <div class="kpis">
        @for (i of [1, 2, 3, 4]; track i) { <div class="pf-skeleton" style="height: 7.5rem"></div> }
      </div>
      <div class="pf-skeleton" style="height: 18rem; margin-top: 1rem"></div>
    } @else if (error()) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
        <strong>{{ 'profile.couldnt_load_your_statistics' | translate }}</strong>
        <p>{{ 'profile.please_try_again_in_a_moment' | translate }}</p>
        <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> {{ 'common.try_again' | translate }}</button>
      </div>
    } @else if (stats(); as s) {
      <!-- ---------- Headline numbers ---------- -->
      <div class="kpis">
        <article class="kpi">
          <span class="kpi__icon kpi__icon--ok"><i class="pi pi-check-circle"></i></span>
          <p class="kpi__label">{{ 'profile.prints_completed' | translate }}</p>
          <strong class="kpi__value">{{ s.totals.completed | appNumber }}</strong>
          <span class="kpi__sub">{{ 'profile.today' | translate: { today: s.jobs.today } }}</span>
        </article>

        <article class="kpi">
          <span class="kpi__icon kpi__icon--info"><i class="pi pi-hourglass"></i></span>
          <p class="kpi__label">{{ 'profile.orders_waiting' | translate }}</p>
          <strong class="kpi__value">{{ s.totals.pending | appNumber }}</strong>
          <a routerLink="/shop/queue" class="kpi__link">{{ 'profile.open_print_orders' | translate }} <i class="pi pi-arrow-right"></i></a>
        </article>

        <article class="kpi kpi--earn">
          <span class="kpi__icon kpi__icon--warn"><i class="pi pi-wallet"></i></span>
          <div class="kpi__top">
            <p class="kpi__label">{{ 'profile.earnings' | translate }}</p>
            <div class="pf-seg" role="tablist" [attr.aria-label]="'profile.earnings_period' | translate">
              @for (p of periods; track p.key) {
                <button type="button" role="tab" [class.is-on]="period() === p.key" [attr.aria-selected]="period() === p.key" (click)="period.set(p.key)">{{ p.label }}</button>
              }
            </div>
          </div>
          <strong class="kpi__value">{{ money(s.earnings[period()]) }}</strong>
          <span class="kpi__sub">{{ 'common.count.prints' | translateCount: s.jobs[period()] }}</span>
        </article>

        <article class="kpi">
          <span class="kpi__icon kpi__icon--violet"><i class="pi pi-file"></i></span>
          <p class="kpi__label">{{ 'profile.pages_printed' | translate }}</p>
          <strong class="kpi__value">{{ s.totals.pagesPrinted | appNumber }}</strong>
          <span class="kpi__sub">{{ 'profile.earned_all_time' | translate: { earnings: money(s.totals.earnings) } }}</span>
        </article>
      </div>

      <div class="sections">
        <!-- ---------- Chart ---------- -->
        <section class="pf-card">
          <header class="pf-card__head">
            <div>
              <h3 class="pf-eyebrow">{{ 'profile.last_days' | translate: { metric: (metric() === 'earnings' ? ('profile.earnings' | translate) : ('profile.prints' | translate)), days: range() } }}</h3>
              <p class="total">{{ metric() === 'earnings' ? money(rangeTotal()) : ('common.count.prints' | translateCount: rangeTotal()) }}</p>
            </div>
            <div class="controls">
              <div class="pf-seg" role="tablist" [attr.aria-label]="'profile.metric' | translate">
                <button type="button" [class.is-on]="metric() === 'earnings'" (click)="metric.set('earnings')">{{ 'profile.earnings' | translate }}</button>
                <button type="button" [class.is-on]="metric() === 'jobs'" (click)="metric.set('jobs')">{{ 'profile.prints' | translate }}</button>
              </div>
              <div class="pf-seg" role="tablist" [attr.aria-label]="'profile.range' | translate">
                @for (r of ranges; track r) {
                  <button type="button" [class.is-on]="range() === r" (click)="range.set(r)">{{ r }}d</button>
                }
              </div>
            </div>
          </header>
          @if (rangeTotal() === 0) {
            <div class="pf-empty">
              <span class="pf-empty__icon"><i class="pi pi-chart-bar"></i></span>
              <strong>{{ 'profile.no_completed_prints_in_this_period' | translate }}</strong>
              <p>{{ (metric() === 'earnings' ? 'profile.empty_chart_earnings' : 'profile.empty_chart_prints') | translate }}</p>
            </div>
          } @else {
            <app-bar-chart [data]="chartData()" [format]="chartFormat()" [ariaLabel]="(metric() === 'earnings' ? 'profile.chart_aria_earnings' : 'profile.chart_aria_prints') | translate: { days: range() }" />
          }
        </section>

        <!-- ---------- Status breakdown ---------- -->
        <section class="pf-card">
          <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'profile.all_time_breakdown' | translate }}</h3></header>
          @if (s.totals.all === 0) {
            <div class="pf-empty">
              <span class="pf-empty__icon"><i class="pi pi-inbox"></i></span>
              <strong>{{ 'profile.no_print_requests_yet' | translate }}</strong>
              <p>{{ 'profile.share_your_qr_code_so_customers' | translate }}</p>
              <a routerLink="/shop/qr" class="pf-btn"><i class="pi pi-qrcode"></i> {{ 'profile.get_my_qr_code' | translate }}</a>
            </div>
          } @else {
            <div class="stack" role="img" [attr.aria-label]="'profile.breakdown_aria' | translate: { total: s.totals.all, breakdown: breakdownText() }">
              @for (seg of breakdown(); track seg.key) {
                @if (seg.count > 0) { <span class="stack__seg" [style.flex-grow]="seg.count" [ngClass]="'c-' + seg.key"></span> }
              }
            </div>
            <ul class="legend">
              @for (seg of breakdown(); track seg.key) {
                <li>
                  <span class="dot" [ngClass]="'c-' + seg.key"></span>
                  <span class="legend__name">{{ seg.label }}</span>
                  <b>{{ seg.count | appNumber }}</b>
                  <small>{{ seg.pct }}%</small>
                </li>
              }
            </ul>
          }
        </section>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
      }
      @media (max-width: 640px) {
        .kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.625rem;
        }
        .kpi--earn {
          grid-column: 1 / -1;
        }
      }
      .kpi {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
        padding: clamp(1rem, 2vw, 1.25rem);
        background: var(--bg-ffffff);
        border: 1px solid var(--bd-e6eaf2);
        border-radius: 18px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        transition: box-shadow 0.15s ease, transform 0.15s ease;
      }
      .kpi:hover {
        box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
        transform: translateY(-1px);
      }
      .kpi__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        margin-bottom: 0.5rem;
        border-radius: 12px;
        font-size: 1.125rem;
      }
      .kpi__icon--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-16a34a);
      }
      .kpi__icon--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4f46e5);
      }
      .kpi__icon--warn {
        background: var(--bg-fef3c7);
        color: var(--tx-d97706);
      }
      .kpi__icon--violet {
        background: var(--bg-f3e8ff);
        color: #9333ea;
      }
      .kpi__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .kpi__top .kpi__label {
        margin: 0;
      }
      .kpi--earn .kpi__icon {
        margin-bottom: 0.25rem;
      }
      .kpi__label {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-64748b);
      }
      .kpi__value {
        font-size: clamp(1.5rem, 2.4vw, 1.875rem);
        line-height: 1.15;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--tx-0f172a);
        font-variant-numeric: tabular-nums;
      }
      .kpi__sub {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .kpi__link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        text-decoration: none;
      }
      .kpi__link:hover {
        text-decoration: underline;
      }
      .kpi__link i {
        font-size: 0.7rem;
      }

      .sections {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        margin-top: clamp(0.75rem, 1.6vw, 1.25rem);
      }
      @media (min-width: 1100px) {
        .sections {
          grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
          align-items: start;
        }
      }
      .total {
        margin: 0.25rem 0 0;
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .stack {
        display: flex;
        height: 0.875rem;
        gap: 3px;
        margin-bottom: 1.25rem;
      }
      .stack__seg {
        flex-basis: 0;
        min-width: 6px;
        border-radius: 999px;
      }
      .c-completed {
        background: #22c55e;
      }
      .c-pending {
        background: #6366f1;
      }
      .c-failed {
        background: #ef4444;
      }
      .c-cancelled {
        background: #94a3b8;
      }
      .legend {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .legend li {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        font-size: 0.9375rem;
      }
      .legend__name {
        flex: 1 1 auto;
        color: var(--tx-475569);
      }
      .legend b {
        font-variant-numeric: tabular-nums;
      }
      .legend small {
        width: 2.75rem;
        text-align: right;
        color: var(--tx-94a3b8);
        font-variant-numeric: tabular-nums;
      }
      .dot {
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 50%;
      }
    `,
  ],
})
export class ProfileOverviewComponent implements OnInit {
  readonly periods: { key: Period; label: string }[] = [
    { key: 'today', get label() { return tr('common.today'); } },
    { key: 'week', get label() { return tr('profile.week'); } },
    { key: 'month', get label() { return tr('profile.month'); } },
  ];
  readonly ranges = [7, 14, 30];

  loading = signal(true);
  error = signal(false);
  stats = signal<ShopStats | null>(null);
  period = signal<Period>('today');
  metric = signal<Metric>('earnings');
  range = signal(14);

  private series = computed(() => (this.stats()?.series ?? []).slice(-this.range()));
  rangeTotal = computed(() => this.series().reduce((sum, d) => sum + (this.metric() === 'earnings' ? d.earnings : d.jobs), 0));
  chartData = computed<BarDatum[]>(() =>
    this.series().map((d) => {
      const date = new Date(d.date + 'T00:00:00');
      return {
        title: date.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' }),
        axis: this.range() <= 7 ? date.toLocaleDateString(intlLocale(), { weekday: 'short' }) : String(date.getDate()),
        value: this.metric() === 'earnings' ? d.earnings : d.jobs,
      };
    }),
  );
  chartFormat = computed(() => (this.metric() === 'earnings' ? (n: number) => rupees(n) : (n: number) => tn('common.count.prints', n)));

  breakdown = computed(() => {
    const t = this.stats()?.totals;
    if (!t) return [];
    const total = Math.max(1, t.all);
    const rows = [
      { key: 'completed', get label() { return tr('profile.completed'); }, count: t.completed },
      { key: 'pending', get label() { return tr('profile.pending_in_progress'); }, count: t.pending },
      { key: 'failed', get label() { return tr('common.failed'); }, count: t.failed },
      { key: 'cancelled', get label() { return tr('common.cancelled'); }, count: t.cancelled },
    ];
    return rows.map((r) => ({ ...r, pct: Math.round((r.count / total) * 100) }));
  });
  breakdownText = computed(() => this.breakdown().map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', '));

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.shopkeeperService.stats().subscribe({
      next: (s) => {
        this.stats.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  money(value: string | number): string {
    return rupees(value);
  }
}
