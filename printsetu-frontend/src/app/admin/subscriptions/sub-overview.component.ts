import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { BillingService } from '../../core/services/billing.service';
import { RevenueDashboard } from '../../core/models/billing.models';
import { BarDatum, BarChartComponent } from '../../shared/components/bar-chart/bar-chart.component';
import { STATE_META, cycleLabel, money } from '../../shared/billing/billing.util';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';
import { intlLocale } from '../../core/i18n/i18n';
import { TranslateCountPipe } from '../../core/i18n/translate-count.pipe';

const STATUS_ORDER = ['ACTIVE', 'TRIAL', 'PAYMENT_PENDING', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'] as const;

/** Revenue dashboard: recurring revenue, renewals coming up, churn and failed-payment recovery. */
@Component({
  selector: 'app-sub-overview',
  standalone: true,
  imports: [TranslateCountPipe, AppDatePipe, TranslatePipe, CommonModule, BarChartComponent],
  template: `
    @if (loading()) {
      <div class="kpis">@for (i of [1, 2, 3, 4]; track i) { <div class="pf-skeleton" style="height: 7.5rem"></div> }</div>
      <div class="pf-skeleton" style="height: 16rem; margin-top: 1rem"></div>
    } @else if (error()) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
        <strong>{{ 'subscriptions.couldnt_load_the_revenue_dashboard' | translate }}</strong>
        <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> {{ 'common.try_again' | translate }}</button>
      </div>
    } @else if (d(); as d) {
      <div class="kpis">
        <article class="kpi">
          <span class="kpi__icon kpi__icon--ok"><i class="pi pi-chart-line"></i></span>
          <p class="kpi__label">{{ 'subscriptions.monthly_income' | translate }} <em>{{ 'subscriptions.from_subscriptions' | translate }}</em></p>
          <strong class="kpi__value">{{ money(d.mrr) }}</strong>
          <span class="kpi__sub">{{ 'subscriptions.yearly_income' | translate: { arr: money(d.arr) } }}</span>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--info"><i class="pi pi-verified"></i></span>
          <p class="kpi__label">{{ 'subscriptions.active_subscriptions' | translate }}</p>
          <strong class="kpi__value">{{ d.activeSubscriptions.total }}</strong>
          <span class="kpi__sub">{{ 'subscriptions.daily_monthly_yearly' | translate: { daily: d.activeSubscriptions.daily, monthly: d.activeSubscriptions.monthly, yearly: d.activeSubscriptions.yearly } }}</span>
          <div class="split" aria-hidden="true">
            <span class="split__d" [style.flex-grow]="d.activeSubscriptions.daily"></span>
            <span class="split__m" [style.flex-grow]="d.activeSubscriptions.monthly"></span>
            <span class="split__y" [style.flex-grow]="d.activeSubscriptions.yearly"></span>
          </div>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--warn"><i class="pi pi-wallet"></i></span>
          <p class="kpi__label">{{ 'subscriptions.collected_this_month' | translate }}</p>
          <strong class="kpi__value">{{ money(d.collectedThisMonth) }}</strong>
          <span class="kpi__sub">{{ 'subscriptions.still_to_collect' | translate: { amount: money(d.outstanding.amount), invoices: d.outstanding.invoices } }}</span>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--bad"><i class="pi pi-user-minus"></i></span>
          <p class="kpi__label">{{ 'subscriptions.shops_lost_this_month' | translate }}</p>
          <strong class="kpi__value">{{ d.churn.thisMonth }}</strong>
          <span class="kpi__sub">{{ 'subscriptions.cancelled_expired' | translate: { cancelled: d.churn.cancelled, expired: d.churn.expired } }} @if (d.churn.lostMrr > 0) { {{ 'subscriptions.mo_lost' | translate: { lostMrr: money(d.churn.lostMrr) } }} }</span>
        </article>
      </div>

      <div class="sections">
        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><div><h3 class="pf-eyebrow">{{ 'subscriptions.revenue_collected' | translate }}</h3><p class="sub">{{ 'subscriptions.last_6_months_after_refunds' | translate }}</p></div></header>
            <app-bar-chart [data]="series()" [format]="fmt" [ariaLabel]="'subscriptions.revenue_collected_in_the_last_six' | translate" />
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'subscriptions.renewals_in_the_next_7_days' | translate }}</h3></header>
            @if (d.upcomingRenewals.length === 0) {
              <p class="empty">{{ 'subscriptions.nothing_renews_this_week' | translate }}</p>
            } @else {
              <ul class="list">
                @for (r of d.upcomingRenewals; track r.shopId) {
                  <li>
                    <div class="list__main">
                      <strong>{{ r.shopName }}</strong>
                      <span>{{ r.plan }} &middot; {{ cycleLabel(r.cycle).toLowerCase() }}@if (r.isTrial) { {{ 'subscriptions.trial_ends_2' | translate }} } @else if (!r.autoRenew) { {{ 'subscriptions.wont_renew_automatically' | translate }} }</span>
                    </div>
                    <div class="list__side"><strong>{{ money(r.amount) }}</strong><span>{{ r.date | appDate: 'd MMM' }}</span></div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>

        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'subscriptions.failed_payments' | translate }}</h3></header>
            <div class="fail">
              <div><strong>{{ d.failedPayments.last30Days }}</strong><span>{{ 'subscriptions.failed_in_30_days' | translate }}</span></div>
              <div><strong>{{ d.failedPayments.shopsAffected }}</strong><span>{{ 'subscriptions.shops_affected' | translate }}</span></div>
              <div>
                <strong [class.ok]="(d.failedPayments.recoveryRate ?? 0) >= 50">{{ d.failedPayments.recoveryRate === null ? '—' : d.failedPayments.recoveryRate + '%' }}</strong>
                <span>{{ 'subscriptions.paid_after_a_failed_payment' | translate }}</span>
              </div>
            </div>
            <p class="note">{{ 'subscriptions.of_shops_paid_or_were_reactivated' | translate: { recovered: d.failedPayments.recovered, shopsAffected: d.failedPayments.shopsAffected, currentlyPending: d.failedPayments.currentlyPending, currentlyPastDue: d.failedPayments.currentlyPastDue } }}</p>
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'subscriptions.shops_by_status' | translate }}</h3></header>
            <ul class="list list--tight">
              @for (s of statuses(); track s.key) {
                <li>
                  <div class="list__main"><span class="swatch" [ngClass]="'swatch--' + s.tone"></span><strong>{{ s.label }}</strong></div>
                  <div class="list__side"><strong>{{ s.count }}</strong></div>
                </li>
              }
              <li>
                <div class="list__main"><span class="swatch swatch--muted"></span><strong>{{ 'subscriptions.no_plan_yet' | translate }}</strong></div>
                <div class="list__side"><strong>{{ noPlan() }}</strong></div>
              </li>
            </ul>
            @if (d.perPlan.length) {
              <h3 class="pf-eyebrow sep">{{ 'subscriptions.revenue_by_plan' | translate }}</h3>
              <ul class="list list--tight">
                @for (p of d.perPlan; track p.planId) {
                  <li>
                    <div class="list__main"><strong>{{ p.name }}</strong><span>{{ 'common.count.shops' | translateCount: p.shops }}</span></div>
                    <div class="list__side"><strong>{{ money(p.mrr) }}</strong><span>{{ 'subscriptions.per_month' | translate }}</span></div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      </div>
      <p class="foot">{{ 'subscriptions.monthly_income_counts_shops_that_are' | translate }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
      }
      @media (max-width: 1100px) {
        .kpis {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 520px) {
        .kpis {
          grid-template-columns: minmax(0, 1fr);
          gap: 0.625rem;
        }
        .fail {
          grid-template-columns: minmax(0, 1fr);
          gap: 0.625rem;
        }
        .fail div {
          flex-direction: row;
          align-items: baseline;
          justify-content: space-between;
          padding: 0.375rem 0;
          border-bottom: 1px solid var(--bd-eef1f7);
        }
        .fail div:last-child {
          border-bottom: none;
        }
      }
      .kpi {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
        padding: clamp(0.875rem, 2vw, 1.25rem);
        background: var(--bg-ffffff);
        border: 1px solid var(--bd-e6eaf2);
        border-radius: 18px;
      }
      .kpi__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        margin-bottom: 0.5rem;
        border-radius: 12px;
        font-size: 1.05rem;
      }
      .kpi__icon--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .kpi__icon--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .kpi__icon--warn {
        background: var(--bg-fef3c7);
        color: var(--tx-b45309);
      }
      .kpi__icon--bad {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .kpi__label {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-64748b);
      }
      .kpi__label em {
        font-style: normal;
        font-weight: 500;
        color: var(--tx-64748b);
      }
      .kpi__value {
        font-size: clamp(1.5rem, 2.6vw, 2rem);
        line-height: 1.15;
        letter-spacing: -0.02em;
        color: var(--tx-0f172a);
        overflow-wrap: anywhere;
      }
      .kpi__sub {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .split {
        display: flex;
        gap: 3px;
        height: 6px;
        margin-top: 0.375rem;
        border-radius: 999px;
        overflow: hidden;
        background: var(--bg-f1f5f9);
      }
      .split__d {
        flex: 1 1 0;
        background: #f59e0b;
      }
      .split__m {
        flex: 1 1 0;
        background: #6366f1;
      }
      .split__y {
        flex: 1 1 0;
        background: #22c55e;
      }
      .sections {
        display: grid;
        grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        margin-top: clamp(0.75rem, 1.6vw, 1.25rem);
        align-items: start;
      }
      /* Each column stacks its own cards independently (no shared row
         height with the other column), so a short card never leaves a
         block of empty space under it just because its neighbour is tall. */
      .col {
        display: flex;
        flex-direction: column;
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        min-width: 0;
      }
      @media (max-width: 900px) {
        .sections {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .sub {
        margin: 0.25rem 0 0;
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .fail {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
      }
      .fail div {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .fail strong {
        font-size: 1.5rem;
        line-height: 1.2;
        color: var(--tx-0f172a);
      }
      .fail strong.ok {
        color: var(--tx-15803d);
      }
      .fail span {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .note,
      .foot {
        margin: 0.875rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .foot {
        margin-top: 1rem;
      }
      .empty {
        margin: 0;
        font-size: 0.9rem;
        color: var(--tx-64748b);
      }
      .list {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .list li:last-child {
        border-bottom: none;
      }
      .list--tight li {
        padding: 0.5rem 0;
      }
      .list__main,
      .list__side {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .list__main {
        flex-direction: column;
      }
      .list__side {
        align-items: flex-end;
        flex: none;
      }
      .list strong {
        font-size: 0.9375rem;
        color: var(--tx-0f172a);
        overflow-wrap: anywhere;
      }
      .list span {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .list--tight .list__main {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
      }
      .swatch {
        flex: none;
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
      }
      .swatch--ok {
        background: #22c55e;
      }
      .swatch--info {
        background: #6366f1;
      }
      .swatch--warn {
        background: #f59e0b;
      }
      .swatch--bad {
        background: #ef4444;
      }
      .swatch--muted {
        background: #94a3b8;
      }
      .sep {
        margin: 1.25rem 0 0.25rem;
      }
    `,
  ],
})
export class SubOverviewComponent implements OnInit {
  loading = signal(true);
  error = signal(false);
  d = signal<RevenueDashboard | null>(null);

  readonly money = (v: number) => money(v);
  readonly cycleLabel = cycleLabel;
  readonly fmt = (n: number) => money(n);

  constructor(private readonly billing: BillingService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.billing.dashboard().subscribe({
      next: (res) => {
        this.d.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  series(): BarDatum[] {
    return (this.d()?.series ?? []).map((s) => {
      const date = new Date(s.month + '-01T00:00:00');
      return {
        title: date.toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' }),
        axis: date.toLocaleDateString(intlLocale(), { month: 'short' }),
        value: s.collected,
      };
    });
  }

  statuses() {
    const by = this.d()?.byStatus ?? {};
    return STATUS_ORDER.map((key) => ({ key, label: STATE_META[key].label, tone: STATE_META[key].tone, count: by[key] ?? 0 }));
  }

  noPlan(): number {
    const d = this.d();
    if (!d) return 0;
    const withPlan = Object.values(d.byStatus).reduce((a, b) => a + b, 0);
    return Math.max(d.totalShops - withPlan, 0);
  }
}
