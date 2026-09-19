import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { BillingService } from '../../core/services/billing.service';
import { RevenueDashboard } from '../../core/models/billing.models';
import { BarDatum, BarChartComponent } from '../../shared/components/bar-chart/bar-chart.component';
import { STATE_META, money } from '../../shared/billing/billing.util';

const STATUS_ORDER = ['ACTIVE', 'TRIAL', 'PAYMENT_PENDING', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'] as const;

/** Revenue dashboard: recurring revenue, renewals coming up, churn and failed-payment recovery. */
@Component({
  selector: 'app-sub-overview',
  standalone: true,
  imports: [CommonModule, DatePipe, BarChartComponent],
  template: `
    @if (loading()) {
      <div class="kpis">@for (i of [1, 2, 3, 4]; track i) { <div class="pf-skeleton" style="height: 7.5rem"></div> }</div>
      <div class="pf-skeleton" style="height: 16rem; margin-top: 1rem"></div>
    } @else if (error()) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
        <strong>Couldn't load the revenue dashboard</strong>
        <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> Try again</button>
      </div>
    } @else if (d(); as d) {
      <div class="kpis">
        <article class="kpi">
          <span class="kpi__icon kpi__icon--ok"><i class="pi pi-chart-line"></i></span>
          <p class="kpi__label">MRR <em>monthly recurring</em></p>
          <strong class="kpi__value">{{ money(d.mrr) }}</strong>
          <span class="kpi__sub">ARR {{ money(d.arr) }}</span>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--info"><i class="pi pi-verified"></i></span>
          <p class="kpi__label">Active subscriptions</p>
          <strong class="kpi__value">{{ d.activeSubscriptions.total }}</strong>
          <span class="kpi__sub">{{ d.activeSubscriptions.monthly }} monthly &middot; {{ d.activeSubscriptions.yearly }} yearly</span>
          <div class="split" aria-hidden="true">
            <span class="split__m" [style.flex-grow]="d.activeSubscriptions.monthly"></span>
            <span class="split__y" [style.flex-grow]="d.activeSubscriptions.yearly"></span>
          </div>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--warn"><i class="pi pi-wallet"></i></span>
          <p class="kpi__label">Collected this month</p>
          <strong class="kpi__value">{{ money(d.collectedThisMonth) }}</strong>
          <span class="kpi__sub">{{ money(d.outstanding.amount) }} outstanding ({{ d.outstanding.invoices }})</span>
        </article>
        <article class="kpi">
          <span class="kpi__icon kpi__icon--bad"><i class="pi pi-user-minus"></i></span>
          <p class="kpi__label">Churn this month</p>
          <strong class="kpi__value">{{ d.churn.thisMonth }}</strong>
          <span class="kpi__sub">{{ d.churn.cancelled }} cancelled &middot; {{ d.churn.expired }} expired @if (d.churn.lostMrr > 0) { &middot; {{ money(d.churn.lostMrr) }}/mo lost }</span>
        </article>
      </div>

      <div class="sections">
        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><div><h3 class="pf-eyebrow">Revenue collected</h3><p class="sub">Last 6 months, net of refunds</p></div></header>
            <app-bar-chart [data]="series()" [format]="fmt" ariaLabel="Revenue collected in the last six months" />
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Renewals in the next 7 days</h3></header>
            @if (d.upcomingRenewals.length === 0) {
              <p class="empty">Nothing renews this week.</p>
            } @else {
              <ul class="list">
                @for (r of d.upcomingRenewals; track r.shopId) {
                  <li>
                    <div class="list__main">
                      <strong>{{ r.shopName }}</strong>
                      <span>{{ r.plan }} &middot; {{ r.cycle === 'YEARLY' ? 'yearly' : 'monthly' }}@if (r.isTrial) { &middot; trial ends } @else if (!r.autoRenew) { &middot; won't auto-renew }</span>
                    </div>
                    <div class="list__side"><strong>{{ money(r.amount) }}</strong><span>{{ r.date | date: 'd MMM' }}</span></div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>

        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Failed payments</h3></header>
            <div class="fail">
              <div><strong>{{ d.failedPayments.last30Days }}</strong><span>failed in 30 days</span></div>
              <div><strong>{{ d.failedPayments.shopsAffected }}</strong><span>shops affected</span></div>
              <div>
                <strong [class.ok]="(d.failedPayments.recoveryRate ?? 0) >= 50">{{ d.failedPayments.recoveryRate === null ? '—' : d.failedPayments.recoveryRate + '%' }}</strong>
                <span>recovery rate</span>
              </div>
            </div>
            <p class="note">{{ d.failedPayments.recovered }} of {{ d.failedPayments.shopsAffected }} shops paid or were reactivated afterwards. Right now {{ d.failedPayments.currentlyPending }} in grace and {{ d.failedPayments.currentlyPastDue }} past due.</p>
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Shops by status</h3></header>
            <ul class="list list--tight">
              @for (s of statuses(); track s.key) {
                <li>
                  <div class="list__main"><span class="swatch" [ngClass]="'swatch--' + s.tone"></span><strong>{{ s.label }}</strong></div>
                  <div class="list__side"><strong>{{ s.count }}</strong></div>
                </li>
              }
              <li>
                <div class="list__main"><span class="swatch swatch--muted"></span><strong>No plan yet</strong></div>
                <div class="list__side"><strong>{{ noPlan() }}</strong></div>
              </li>
            </ul>
            @if (d.perPlan.length) {
              <h3 class="pf-eyebrow sep">Revenue by plan</h3>
              <ul class="list list--tight">
                @for (p of d.perPlan; track p.planId) {
                  <li>
                    <div class="list__main"><strong>{{ p.name }}</strong><span>{{ p.shops }} {{ p.shops === 1 ? 'shop' : 'shops' }}</span></div>
                    <div class="list__side"><strong>{{ money(p.mrr) }}</strong><span>per month</span></div>
                  </li>
                }
              </ul>
            }
          </section>
        </div>
      </div>
      <p class="foot">MRR counts shops that are paying (Active and Payment pending); trials are not counted. Yearly plans count as one twelfth of the yearly price.</p>
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
          border-bottom: 1px solid #eef1f7;
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
        background: #fff;
        border: 1px solid #e6eaf2;
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
        background: #dcfce7;
        color: #15803d;
      }
      .kpi__icon--info {
        background: #e0e7ff;
        color: #4338ca;
      }
      .kpi__icon--warn {
        background: #fef3c7;
        color: #b45309;
      }
      .kpi__icon--bad {
        background: #fee2e2;
        color: #b91c1c;
      }
      .kpi__label {
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #64748b;
      }
      .kpi__label em {
        font-style: normal;
        font-weight: 500;
        color: #94a3b8;
      }
      .kpi__value {
        font-size: clamp(1.5rem, 2.6vw, 2rem);
        line-height: 1.15;
        letter-spacing: -0.02em;
        color: #0f172a;
        overflow-wrap: anywhere;
      }
      .kpi__sub {
        font-size: 0.8125rem;
        color: #64748b;
      }
      .split {
        display: flex;
        gap: 3px;
        height: 6px;
        margin-top: 0.375rem;
        border-radius: 999px;
        overflow: hidden;
        background: #f1f5f9;
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
        color: #64748b;
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
        color: #0f172a;
      }
      .fail strong.ok {
        color: #15803d;
      }
      .fail span {
        font-size: 0.75rem;
        color: #64748b;
      }
      .note,
      .foot {
        margin: 0.875rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: #64748b;
      }
      .foot {
        margin-top: 1rem;
      }
      .empty {
        margin: 0;
        font-size: 0.9rem;
        color: #64748b;
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
        border-bottom: 1px solid #eef1f7;
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
        color: #0f172a;
        overflow-wrap: anywhere;
      }
      .list span {
        font-size: 0.8125rem;
        color: #64748b;
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
        title: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        axis: date.toLocaleDateString('en-GB', { month: 'short' }),
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
