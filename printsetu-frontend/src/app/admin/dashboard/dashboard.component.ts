import { Component, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AdminService } from '../../core/services/admin.service';
import { ShopDashboard, ShopDashboardRow } from '../../core/models/models';
import { TrendChartComponent, TrendPoint } from './charts/trend-chart.component';
import { HBarChartComponent, HBarRow, HBarSeries } from './charts/hbar-chart.component';
import { t, intlLocale, tn } from '../../core/i18n/i18n';
import { AppDatePipe, AppNumberPipe } from '../../core/i18n/i18n-format.pipes';
import { STATE_META, cycleLabel as billingCycleLabel } from '../../shared/billing/billing.util';
import { BillingCycle } from '../../core/models/billing.models';

type Preset = 'today' | 'week' | 'month' | 'custom';

/** YYYY-MM-DD of a local date. */
function ymd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive [from, to] for a preset; weeks start on Monday. */
function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): [string, string] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return [ymd(today), ymd(today)];
  if (preset === 'week') {
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [ymd(monday), ymd(today)];
  }
  return [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), ymd(today)];
}

const TOP_N = 5;
const PAGES_TOP_N = 8;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AppDatePipe, AppNumberPipe, TranslatePipe, 
    CommonModule,
    FormsModule,
    TableModule,
    DatePickerModule,
    SelectButtonModule,
    SelectModule,
    ProgressSpinnerModule,
    TrendChartComponent,
    HBarChartComponent,
  ],
  template: `
    <h1 class="page-title">{{ 'common.dashboard' | translate }}</h1>
    <p class="page-subtitle">
      @if (selectedShop(); as s) {
        {{ 'adminDashboard.activity_revenue_and_health_for' | translate: { name: s.name } }}
      } @else {
        {{ 'adminDashboard.shop_by_shop_activity_revenue_and' | translate }}
      }
    </p>

    <!-- One filter row above everything it scopes. -->
    <div class="filters">
      <div class="presets" role="group" [attr.aria-label]="'adminDashboard.date_range' | translate">
        @for (p of presets; track p.value) {
          <button type="button" class="preset" [class.is-on]="preset() === p.value" (click)="choosePreset(p.value)">
            {{ p.label }}
          </button>
        }
      </div>
      @if (preset() === 'custom') {
        <p-datepicker
          [(ngModel)]="customRange"
          selectionMode="range"
          [readonlyInput]="true"
          [maxDate]="today"
          dateFormat="d M yy"
          [placeholder]="'adminDashboard.pick_start_and_end_dates' | translate"
          [showIcon]="true"
          [firstDayOfWeek]="1"
          (onSelect)="onCustomSelect()"
          appendTo="body"
          inputStyleClass="range-input"
        />
      }
      <p-select
        [options]="shopSelectOptions()"
        [ngModel]="shopId()"
        (ngModelChange)="selectShop($event ?? null)"
        optionLabel="label"
        optionValue="value"
        [filter]="true"
        filterBy="label"
        [filterPlaceholder]="'adminDashboard.search_shops' | translate"
        [showClear]="true"
        [placeholder]="'adminDashboard.all_shops' | translate"
        [ariaLabel]="'common.shop' | translate"
        appendTo="body"
        styleClass="shop-picker"
      />
      <span class="range-label">
        @if (preset() !== 'custom') {
          {{ rangeLabel() }}
        }
        @if (loading() && data()) {
          <i class="pi pi-spin pi-spinner ml-2" [attr.aria-label]="'adminDashboard.refreshing' | translate"></i>
        }
      </span>
    </div>

    @if (loading() && !data()) {
      <div class="flex justify-content-center p-6"><p-progressSpinner strokeWidth="4" /></div>
    } @else if (error() && !data()) {
      <div class="surface-card-flat p-4 text-center">
        <p class="m-0 mb-3">{{ 'adminDashboard.couldnt_load_the_dashboard' | translate }}</p>
        <button type="button" class="preset is-on" (click)="load()">{{ 'common.try_again' | translate }}</button>
      </div>
    } @else if (data(); as d) {
      @if (selectedShop(); as s) {
        <section class="surface-card-flat shop-card">
          <div class="shop-card__id">
            <div class="shop-card__name">{{ s.name }}</div>
            <div class="shop-sub">{{ s.shopCode }} &middot; {{ s.city }}</div>
          </div>
          <dl class="shop-card__facts">
            <div>
              <dt>{{ 'common.status' | translate }}</dt>
              <dd>
                <span class="pill" [attr.data-tone]="s.online ? 'ok' : 'muted'">
                  <i class="pi" [ngClass]="s.online ? 'pi-circle-fill' : 'pi-circle'"></i>{{ s.online ? ('common.online' | translate) : ('common.offline' | translate) }}
                </span>
                <span class="shop-sub ml-2">
                  @if (s.shopStatus !== 'ACTIVE') { {{ 'adminDashboard.shop' | translate: { shopStatus: shopStatusWord(s.shopStatus) } }} }
                  {{ 'adminDashboard.printer_app' | translate: { agentStatus: agentLabel(s.agentStatus) } }}
                </span>
              </dd>
            </div>
            <div>
              <dt>{{ 'common.plan' | translate }}</dt>
              <dd>
                @if (s.subscription; as sub) {
                  {{ sub.plan }} <span class="shop-sub">&middot; {{ stateLabel(sub.status) }} &middot; {{ cycleLabel(sub.cycle) }}</span>
                } @else {
                  <span class="shop-sub">{{ 'adminDashboard.no_subscription' | translate }}</span>
                }
              </dd>
            </div>
            <div>
              <dt>{{ 'adminDashboard.expires' | translate }}</dt>
              <dd>
                @if (s.subscription; as sub) {
                  @if (sub.expiringSoon) {
                    <span class="pill" data-tone="warn"><i class="pi pi-exclamation-triangle"></i>{{ sub.currentPeriodEnd | appDate: 'd MMM y' }}</span>
                    <span class="shop-sub ml-2">{{ daysLeft(sub.currentPeriodEnd) }}</span>
                  } @else {
                    {{ sub.currentPeriodEnd | appDate: 'd MMM y' }}
                  }
                } @else {
                  <span class="shop-sub">—</span>
                }
              </dd>
            </div>
          </dl>
          <button type="button" class="link" (click)="selectShop(null)"><i class="pi pi-arrow-left"></i> {{ 'adminDashboard.all_shops' | translate }}</button>
        </section>
      }

      <!-- Headline numbers for the period -->
      <div class="grid-auto">
        <div class="surface-card-flat p-4 stat-tile">
          <div class="stat-tile__icon"><i class="pi pi-file"></i></div>
          <div>
            <div class="text-color-secondary text-sm mb-1">{{ 'common.orders' | translate }}</div>
            <div class="text-3xl font-bold line-height-2">{{ d.totals.jobs | appNumber }}</div>
            <div class="text-xs text-color-secondary">{{ 'adminDashboard.printed' | translate: { printed: (d.totals.statusCounts.printed | appNumber) } }}</div>
          </div>
        </div>
        <div class="surface-card-flat p-4 stat-tile">
          <div class="stat-tile__icon warn"><i class="pi pi-indian-rupee"></i></div>
          <div>
            <div class="text-color-secondary text-sm mb-1">{{ 'adminDashboard.revenue_recorded' | translate }}</div>
            <div class="text-3xl font-bold line-height-2">{{ inr(d.totals.revenue) }}</div>
            <div class="text-xs text-color-secondary">{{ 'adminDashboard.from_printed_orders' | translate }}</div>
          </div>
        </div>
        <div class="surface-card-flat p-4 stat-tile">
          <div class="stat-tile__icon success"><i class="pi pi-copy"></i></div>
          <div>
            <div class="text-color-secondary text-sm mb-1">{{ 'adminDashboard.pages_printed' | translate }}</div>
            <div class="text-3xl font-bold line-height-2">{{ d.totals.pagesBw + d.totals.pagesColor | appNumber }}</div>
            <div class="text-xs text-color-secondary">
              {{ 'adminDashboard.b_w_color' | translate: { pagesBw: (d.totals.pagesBw | appNumber), pagesColor: (d.totals.pagesColor | appNumber) } }}
            </div>
          </div>
        </div>
        @if (d.shopId) {
          <div class="surface-card-flat p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-receipt"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">{{ 'adminDashboard.average_order_value' | translate }}</div>
              <div class="text-3xl font-bold line-height-2">
                {{ d.totals.statusCounts.printed ? inr(d.totals.revenue / d.totals.statusCounts.printed) : '—' }}
              </div>
              <div class="text-xs text-color-secondary">{{ 'adminDashboard.per_printed_order' | translate }}</div>
            </div>
          </div>
        } @else {
          <div class="surface-card-flat p-4 stat-tile">
            <div class="stat-tile__icon"><i class="pi pi-building"></i></div>
            <div>
              <div class="text-color-secondary text-sm mb-1">{{ 'adminDashboard.shops_online' | translate }}</div>
              <div class="text-3xl font-bold line-height-2">{{ onlineCount() }} / {{ d.shops.length }}</div>
              <div class="text-xs text-color-secondary">{{ 'adminDashboard.taking_orders_right_now' | translate }}</div>
            </div>
          </div>
        }
      </div>

      <!-- Job status summary -->
      <section class="section">
        <h2 class="section__title">{{ 'adminDashboard.order_status' | translate }}</h2>
        <div class="status-row">
          @for (s of statusTiles(); track s.key) {
            <div class="surface-card-flat status" [attr.data-tone]="s.tone">
              <i class="pi status__icon" [ngClass]="s.icon" aria-hidden="true"></i>
              <div>
                <div class="status__value">{{ s.value | appNumber }}</div>
                <div class="status__label">{{ s.label }}</div>
              </div>
            </div>
          }
        </div>
        @if (d.totals.statusCounts.cancelled > 0) {
          <p class="note">{{ 'adminDashboard.cancelled_not_included_above' | translate: { cancelled: (d.totals.statusCounts.cancelled | appNumber) } }}</p>
        }
      </section>

      <!-- Daily trend: two measures, two charts (never a dual axis) -->
      <section class="section">
        <div class="section__head">
          <h2 class="section__title">{{ 'adminDashboard.daily_trend' | translate }}</h2>
          <button type="button" class="link" (click)="trendTable.set(!trendTable())">
            <i class="pi" [ngClass]="trendTable() ? 'pi-chart-bar' : 'pi-table'"></i>
            {{ trendTable() ? ('adminDashboard.show_charts' | translate) : ('adminDashboard.show_table' | translate) }}
          </button>
        </div>
        @if (trendTable()) {
          <div class="surface-card-flat daily-table">
            <table>
              <thead>
                <tr><th scope="col">{{ 'adminDashboard.day' | translate }}</th><th scope="col">{{ 'common.orders' | translate }}</th><th scope="col">{{ 'common.revenue' | translate }}</th></tr>
              </thead>
              <tbody>
                @for (day of d.daily; track day.date) {
                  <tr>
                    <td>{{ day.date | appDate: 'EEE, d MMM y' }}</td>
                    <td>{{ day.jobs | appNumber }}</td>
                    <td>{{ inr(day.revenue) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="two-col">
            <div class="surface-card-flat card">
              <h3 class="card__title">{{ 'adminDashboard.orders_per_day' | translate }}</h3>
              <app-trend-chart [points]="jobsTrend()" kind="column" format="count" [ariaLabel]="'adminDashboard.orders_per_day' | translate" />
            </div>
            <div class="surface-card-flat card">
              <h3 class="card__title">{{ 'adminDashboard.revenue_per_day' | translate }}</h3>
              <app-trend-chart [points]="revenueTrend()" kind="line" format="inr" [ariaLabel]="'adminDashboard.revenue_per_day' | translate" />
            </div>
          </div>
        }
      </section>

      @if (!d.shopId) {
      <!-- Rankings -->
      <section class="section two-col">
        <div class="surface-card-flat card">
          <div class="card__head">
            <h3 class="card__title m-0">{{ 'adminDashboard.top_shops' | translate }}</h3>
            <p-selectbutton
              [options]="topMetricOptions"
              [ngModel]="topMetric()"
              (ngModelChange)="topMetric.set($event)"
              optionLabel="label"
              optionValue="value"
              [allowEmpty]="false"
              size="small"
            />
          </div>
          <app-hbar-chart
            [rows]="topShops()"
            [series]="topSeries()"
            [format]="topMetric() === 'revenue' ? 'inr' : 'count'"
            [emptyText]="'adminDashboard.no_orders_in_this_period' | translate"
            [selectable]="true"
            (rowSelect)="selectShop($event)"
          />
        </div>
        <div class="surface-card-flat card">
          <div class="card__head">
            <h3 class="card__title m-0">{{ 'adminDashboard.pages_printed_per_shop' | translate }}</h3>
          </div>
          <app-hbar-chart
            [rows]="pagesByShop()"
            [series]="pageSeries"
            format="pages"
            [emptyText]="'adminDashboard.no_pages_printed_in_this_period' | translate"
            [selectable]="true"
            (rowSelect)="selectShop($event)"
          />
        </div>
      </section>

      <!-- Every shop, with status and subscription (also the table view of the charts) -->
      <section class="section">
        <div class="section__head">
          <h2 class="section__title">{{ 'adminDashboard.all_shops' | translate }}</h2>
          <div class="flex gap-2 align-items-center">
            <button type="button" class="chip-toggle" [class.is-on]="onlyExpiring()" (click)="onlyExpiring.set(!onlyExpiring())" [attr.aria-pressed]="onlyExpiring()">
              <i class="pi pi-clock"></i> {{ 'adminDashboard.expiring_in_7_days' | translate: { expiringCount: expiringCount() } }}
            </button>
          </div>
        </div>
        <p-table
          [value]="visibleShops()"
          [tableStyle]="{ 'min-width': '71rem' }"
          styleClass="surface-card-flat"
          sortField="jobs"
          [sortOrder]="-1"
          [rowTrackBy]="trackShop"
        >
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="name" style="width: 11rem">{{ 'common.shop' | translate }} <p-sortIcon field="name" /></th>
              <th pSortableColumn="online" style="width: 8.5rem">{{ 'common.status' | translate }} <p-sortIcon field="online" /></th>
              <th pSortableColumn="jobs" class="num" style="width: 5.25rem">{{ 'common.orders' | translate }} <p-sortIcon field="jobs" /></th>
              <th pSortableColumn="revenue" class="num" style="width: 7rem">{{ 'common.revenue' | translate }} <p-sortIcon field="revenue" /></th>
              <th pSortableColumn="pagesBw" class="num" style="width: 6.5rem">{{ 'adminDashboard.b_w_pages' | translate }} <p-sortIcon field="pagesBw" /></th>
              <th pSortableColumn="pagesColor" class="num" style="width: 7.75rem">{{ 'adminDashboard.color_pages' | translate }} <p-sortIcon field="pagesColor" /></th>
              <th style="width: 9rem; padding-left: 1.25rem">{{ 'adminDashboard.order_status' | translate }}</th>
              <th pSortableColumn="subscription.plan" style="width: 7.5rem">{{ 'common.plan' | translate }} <p-sortIcon field="subscription.plan" /></th>
              <th pSortableColumn="subscription.currentPeriodEnd" style="width: 10rem">{{ 'adminDashboard.expires' | translate }} <p-sortIcon field="subscription.currentPeriodEnd" /></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-s>
            <tr [class.row--soon]="s.subscription?.expiringSoon">
              <td [attr.data-label]="'common.shop' | translate">
                <div class="item-stack">
                  <button type="button" class="shop-name shop-link" (click)="selectShop(s.shopId)">{{ s.name }}</button>
                  <div class="shop-sub">{{ s.shopCode }} &middot; {{ s.city }}</div>
                </div>
              </td>
              <td [attr.data-label]="'common.status' | translate">
                <div class="item-stack">
                  <span class="pill" [attr.data-tone]="s.online ? 'ok' : 'muted'">
                    <i class="pi" [ngClass]="s.online ? 'pi-circle-fill' : 'pi-circle'"></i>{{ s.online ? ('common.online' | translate) : ('common.offline' | translate) }}
                  </span>
                  <div class="shop-sub mt-1 nowrap">
                    @if (s.shopStatus !== 'ACTIVE') { {{ 'adminDashboard.shop' | translate: { shopStatus: shopStatusWord(s.shopStatus) } }} }
                    {{ 'adminDashboard.printer_app' | translate: { agentStatus: agentLabel(s.agentStatus) } }}
                  </div>
                </div>
              </td>
              <td class="num" [attr.data-label]="'common.orders' | translate">{{ s.jobs | appNumber }}</td>
              <td class="num" [attr.data-label]="'common.revenue' | translate">{{ inr(s.revenue) }}</td>
              <td class="num" [attr.data-label]="'adminDashboard.b_w_pages' | translate">{{ s.pagesBw | appNumber }}</td>
              <td class="num" [attr.data-label]="'adminDashboard.color_pages' | translate">{{ s.pagesColor | appNumber }}</td>
              <td [attr.data-label]="'adminDashboard.order_status' | translate" class="counts-cell">
                <div class="counts">
                  @for (t of statusTiles(); track t.key) {
                    <span
                      class="count"
                      [attr.data-tone]="t.tone"
                      [class.count--zero]="countOf(s, t.key) === 0"
                      [attr.title]="t.label"
                      [attr.aria-label]="countOf(s, t.key) + ' ' + t.label.toLowerCase()"
                    >
                      <i class="pi" [ngClass]="t.icon" aria-hidden="true"></i>{{ countOf(s, t.key) | appNumber }}
                    </span>
                  }
                </div>
              </td>
              <td [attr.data-label]="'common.plan' | translate">
                @if (s.subscription; as sub) {
                  <div class="item-stack">
                    <div>{{ sub.plan }}</div>
                    <div class="shop-sub">{{ stateLabel(sub.status) }} &middot; {{ cycleLabel(sub.cycle) }}</div>
                  </div>
                } @else {
                  <span class="shop-sub">{{ 'adminDashboard.no_subscription' | translate }}</span>
                }
              </td>
              <td [attr.data-label]="'adminDashboard.expires' | translate">
                @if (s.subscription; as sub) {
                  @if (sub.expiringSoon) {
                    <div class="item-stack">
                      <span class="pill" data-tone="warn"><i class="pi pi-exclamation-triangle"></i>{{ sub.currentPeriodEnd | appDate: 'd MMM y' }}</span>
                      <div class="shop-sub mt-1">{{ daysLeft(sub.currentPeriodEnd) }}</div>
                    </div>
                  } @else {
                    {{ sub.currentPeriodEnd | appDate: 'd MMM y' }}
                  }
                } @else {
                  <span class="shop-sub">—</span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="9">
                <div class="table-empty">
                  <i class="pi pi-building"></i>
                  <span>{{ onlyExpiring() ? ('adminDashboard.no_subscriptions_expire_in_the_next' | translate) : ('adminDashboard.no_shops_yet' | translate) }}</span>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </section>
      }
    }
  `,
  styles: [
    `
      :host {
        --viz-s1: #2a78d6;
        --viz-s2: #eb6834;
      }
      :host-context(html.app-dark) {
        --viz-s1: #3987e5;
        --viz-s2: #d95926;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.25rem;
      }
      .presets {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 10px;
        background: var(--bg-eef1f7);
      }
      .preset {
        border: 0;
        background: transparent;
        padding: 0.4rem 0.8rem;
        border-radius: 8px;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .preset:hover {
        color: var(--tx-0f172a);
      }
      .preset.is-on {
        background: var(--hdr-surface);
        color: var(--accent-text-600);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
      }
      .range-label {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .section {
        margin-top: clamp(1rem, 2vw, 1.75rem);
      }
      .section__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }
      .section__title {
        margin: 0 0 0.75rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
      .section__head .section__title {
        margin: 0;
      }
      .two-col {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
        gap: clamp(0.75rem, 1.5vw, 1.25rem);
      }
      .card {
        padding: 1rem clamp(1rem, 1.6vw, 1.5rem) 1.25rem;
        min-width: 0;
      }
      .card__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .card__title {
        margin: 0 0 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-334155);
      }
      .status-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
        gap: clamp(0.75rem, 1.5vw, 1.25rem);
      }
      .status {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
      }
      .status__icon {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        flex-shrink: 0;
      }
      .status__value {
        font-size: 1.5rem;
        font-weight: 700;
        line-height: 1.1;
        color: var(--tx-0f172a);
      }
      .status__label {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      [data-tone='ok'] .status__icon,
      .pill[data-tone='ok'] {
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      [data-tone='info'] .status__icon {
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
      }
      [data-tone='warn'] .status__icon,
      .pill[data-tone='warn'] {
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      [data-tone='bad'] .status__icon {
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
      }
      .pill[data-tone='muted'] {
        background: var(--tone-muted-bg);
        color: var(--tone-muted-fg);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
      }
      .pill .pi {
        font-size: 0.6rem;
      }
      .pill[data-tone='warn'] .pi {
        font-size: 0.7rem;
      }
      .note {
        margin: 0.5rem 0 0;
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .link {
        border: 0;
        background: none;
        /* Taller tap area without moving the text. */
        padding: 8px 0;
        margin: -8px 0;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .chip-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.8rem;
        border-radius: 999px;
        border: 1px solid var(--bd-e2e8f0);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-334155);
        cursor: pointer;
      }
      .chip-toggle.is-on {
        background: var(--tone-warn-bg);
        border-color: transparent;
        color: var(--tone-warn-fg);
      }
      .daily-table {
        max-height: 22rem;
        overflow: auto;
      }
      .daily-table table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
      }
      .daily-table th,
      .daily-table td {
        padding: 0.5rem 1rem;
        text-align: left;
        border-bottom: 1px solid var(--bd-f1f5f9);
        font-variant-numeric: tabular-nums;
      }
      .daily-table th {
        position: sticky;
        top: 0;
        background: inherit;
        color: var(--tx-64748b);
        font-weight: 600;
      }
      .shop-link {
        border: 0;
        background: none;
        padding: 0;
        font: inherit;
        text-align: inherit;
        cursor: pointer;
      }
      .shop-link:hover,
      .shop-link:focus-visible {
        color: var(--accent-text-600);
        text-decoration: underline;
      }
      .shop-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1rem 2rem;
        padding: 1rem clamp(1rem, 1.6vw, 1.5rem);
        margin-bottom: clamp(0.75rem, 1.5vw, 1.25rem);
      }
      .shop-card__name {
        font-size: 1.125rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
      .shop-card__facts {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 2rem;
        margin: 0;
        flex: 1 1 auto;
      }
      .shop-card__facts dt {
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--tx-64748b);
        margin-bottom: 0.25rem;
      }
      .shop-card__facts dd {
        margin: 0;
        font-size: 0.875rem;
        color: var(--tx-0f172a);
      }
      :host ::ng-deep .shop-picker {
        min-width: 14rem;
      }
      .shop-name {
        font-weight: 600;
        color: var(--tx-0f172a);
      }
      .shop-sub {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .nowrap {
        white-space: nowrap;
      }
      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      /* Pending / Printing on the first line, Printed / Failed on the second. */
      .counts {
        display: inline-grid;
        grid-template-columns: repeat(2, auto);
        justify-content: start;
        gap: 0.3rem 0.35rem;
      }
      @media (min-width: 641px) {
        .counts-cell {
          padding-left: 1.25rem;
        }
      }
      .count {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.1rem 0.45rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .count .pi {
        font-size: 0.65rem;
      }
      .count[data-tone='warn'] {
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      .count[data-tone='info'] {
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
      }
      .count[data-tone='ok'] {
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      .count[data-tone='bad'] {
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
      }
      .count--zero {
        background: transparent !important;
        color: var(--tx-64748b) !important;
        opacity: 0.7;
      }

      @media (min-width: 641px) {
        .row--soon > td:first-child {
          box-shadow: inset 3px 0 0 var(--tone-warn-fg);
        }
      }
      .item-stack > .pill {
        align-self: flex-start;
      }
      @media (max-width: 640px) {
        .item-stack > .pill {
          align-self: flex-end;
        }
        .counts {
          grid-template-columns: repeat(4, auto);
        }
      }
      :host ::ng-deep .range-input {
        width: 15rem;
      }
      /* Phones: finger-sized targets (the link keeps its place). */
      @media (max-width: 767px) {
        .preset,
        .chip-toggle {
          min-height: 2.25rem;
        }
        .shop-link {
          padding: 0.5rem 0;
          margin: -0.5rem 0;
        }
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  /** Subscription state and billing period in the reader's language (the API sends codes such as PAYMENT_PENDING / DAILY). */
  stateLabel(status: string): string {
    return STATE_META[status as keyof typeof STATE_META]?.label ?? status;
  }

  /** "inactive" in the reader's language, for the "Shop … ·" note. */
  shopStatusWord(status: string): string {
    return status === 'INACTIVE' ? t('layout.inactive').toLowerCase() : status.toLowerCase();
  }

  cycleLabel(cycle: string): string {
    return ['DAILY', 'MONTHLY', 'YEARLY'].includes(cycle) ? billingCycleLabel(cycle as BillingCycle) : cycle;
  }

  readonly presets: { label: string; value: Preset }[] = [
    { get label() { return t('common.today'); }, value: 'today' },
    { get label() { return t('adminDashboard.this_week'); }, value: 'week' },
    { get label() { return t('adminDashboard.this_month'); }, value: 'month' },
    { get label() { return t('adminDashboard.custom'); }, value: 'custom' },
  ];
  readonly topMetricOptions = [
    { get label() { return t('common.orders'); }, value: 'jobs' },
    { get label() { return t('common.revenue'); }, value: 'revenue' },
  ];
  readonly pageSeries: HBarSeries[] = [
    { name: 'B/W', color: 'var(--viz-s1)' },
    { get name() { return t('common.color'); }, color: 'var(--viz-s2)' },
  ];
  readonly today = new Date();

  preset = signal<Preset>('month');
  range = signal<[string, string]>(presetRange('month'));
  customRange: Date[] | null = null;

  loading = signal(true);
  error = signal(false);
  data = signal<ShopDashboard | null>(null);

  topMetric = signal<'jobs' | 'revenue'>('jobs');
  trendTable = signal(false);
  onlyExpiring = signal(false);

  private requestSeq = 0;

  /** null = all shops. Mirrored in the ?shop= query param so a shop's view can be bookmarked or shared. */
  shopId = signal<string | null>(null);
  private shopOptions = signal<ShopDashboard['shopOptions']>([]);

  constructor(
    private readonly adminService: AdminService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.shopId.set(this.route.snapshot.queryParamMap.get('shop'));
    this.load();
  }

  selectShop(shopId: string | null): void {
    if (shopId === this.shopId()) return;
    this.shopId.set(shopId);
    this.onlyExpiring.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: { shop: shopId }, queryParamsHandling: 'merge' });
    document.querySelector('.app-shell-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    this.load();
  }

  shopSelectOptions = computed(() =>
    this.shopOptions().map((s) => ({ label: `${s.name} — ${s.city}`, value: s.shopId })),
  );

  selectedShop = computed(() => {
    const d = this.data();
    return d?.shopId ? (d.shops[0] ?? null) : null;
  });

  load(): void {
    const [from, to] = this.range();
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(false);
    this.adminService.shopDashboard(from, to, this.shopId()).subscribe({
      next: (d) => {
        if (seq !== this.requestSeq) return; // a newer filter won
        this.data.set(d);
        this.shopOptions.set(d.shopOptions);
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        if (seq !== this.requestSeq) return;
        // A bookmarked shop that no longer exists: fall back to all shops.
        if (err?.status === 404 && this.shopId()) {
          this.selectShop(null);
          return;
        }
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  choosePreset(preset: Preset): void {
    this.preset.set(preset);
    if (preset === 'custom') {
      const [from, to] = this.range();
      this.customRange = [new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`)];
      return;
    }
    this.range.set(presetRange(preset));
    this.load();
  }

  onCustomSelect(): void {
    const [start, end] = this.customRange ?? [];
    if (!start || !end) return; // wait for the second click
    this.range.set([ymd(start), ymd(end)]);
    this.load();
  }

  rangeLabel = computed(() => {
    const [from, to] = this.range();
    const fmt = (s: string) =>
      new Date(`${s}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  });

  onlineCount = computed(() => this.data()?.shops.filter((s) => s.online).length ?? 0);
  expiringCount = computed(() => this.data()?.shops.filter((s) => s.subscription?.expiringSoon).length ?? 0);
  visibleShops = computed(() => {
    const shops = this.data()?.shops ?? [];
    return this.onlyExpiring() ? shops.filter((s) => s.subscription?.expiringSoon) : shops;
  });

  statusTiles = computed(() => {
    const c = this.data()?.totals.statusCounts;
    return [
      { key: 'pending', get label() { return t('common.pending'); }, value: c?.pending ?? 0, icon: 'pi-clock', tone: 'warn' },
      { key: 'printing', get label() { return t('common.printing'); }, value: c?.printing ?? 0, icon: 'pi-print', tone: 'info' },
      { key: 'printed', get label() { return t('common.printed'); }, value: c?.printed ?? 0, icon: 'pi-check', tone: 'ok' },
      { key: 'failed', get label() { return t('common.failed'); }, value: c?.failed ?? 0, icon: 'pi-times', tone: 'bad' },
    ];
  });

  jobsTrend = computed<TrendPoint[]>(() => (this.data()?.daily ?? []).map((d) => ({ date: d.date, value: d.jobs })));
  revenueTrend = computed<TrendPoint[]>(() =>
    (this.data()?.daily ?? []).map((d) => ({ date: d.date, value: d.revenue })),
  );

  topSeries = computed<HBarSeries[]>(() => [
    { name: this.topMetric() === 'revenue' ? t('common.revenue') : t('common.orders'), color: 'var(--viz-s1)' },
  ]);
  topShops = computed<HBarRow[]>(() => {
    const metric = this.topMetric();
    return [...(this.data()?.shops ?? [])]
      .filter((s) => s[metric] > 0)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, TOP_N)
      .map((s) => ({ id: s.shopId, label: s.name, sublabel: s.city, values: [s[metric]] }));
  });

  pagesByShop = computed<HBarRow[]>(() =>
    [...(this.data()?.shops ?? [])]
      .filter((s) => s.pagesBw + s.pagesColor > 0)
      .sort((a, b) => b.pagesBw + b.pagesColor - (a.pagesBw + a.pagesColor))
      .slice(0, PAGES_TOP_N)
      .map((s) => ({ id: s.shopId, label: s.name, sublabel: s.city, values: [s.pagesBw, s.pagesColor] })),
  );

  trackShop = (_: number, s: ShopDashboardRow) => s.shopId;

  countOf(shop: ShopDashboardRow, key: string): number {
    return shop.statusCounts[key as keyof ShopDashboardRow['statusCounts']];
  }

  inr(value: number): string {
    return `₹${value.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  agentLabel(status: ShopDashboardRow['agentStatus']): string {
    return status === 'ONLINE' ? 'online' : status === 'OFFLINE' ? 'offline' : t('adminDashboard.not_set_up');
  }

  daysLeft(iso: string): string {
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
    return days <= 0 ? t('adminDashboard.ends_today') : tn('adminDashboard.days_left', days);
  }
}
