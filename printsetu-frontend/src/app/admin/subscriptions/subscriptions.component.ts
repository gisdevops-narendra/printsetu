import { Component, OnInit, signal } from '@angular/core';
import { ScrollActiveTabDirective } from '../../shared/directives/scroll-active-tab.directive';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SubOverviewComponent } from './sub-overview.component';
import { SubPlansComponent } from './sub-plans.component';
import { SubShopsComponent } from './sub-shops.component';
import { SubPaymentsComponent } from './sub-payments.component';
import { SubSettingsComponent } from './sub-settings.component';

type Tab = 'overview' | 'plans' | 'shops' | 'payments' | 'settings';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Revenue', icon: 'pi-chart-line' },
  { key: 'plans', label: 'Plans', icon: 'pi-tags' },
  { key: 'shops', label: 'Shop subscriptions', icon: 'pi-building' },
  { key: 'payments', label: 'Payments', icon: 'pi-receipt' },
  { key: 'settings', label: 'Rules & reminders', icon: 'pi-sliders-h' },
];

/** Admin billing hub. Only reachable by admins (route guard + API roles). */
@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [ScrollActiveTabDirective, CommonModule, SubOverviewComponent, SubPlansComponent, SubShopsComponent, SubPaymentsComponent, SubSettingsComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Subscriptions</h1>
        <p class="page-subtitle m-0">Plans, shop subscriptions, payments and what happens when a payment is missed.</p>
      </div>
    </div>

    <nav class="tabs" appScrollActiveTab role="tablist" aria-label="Subscription sections">
      @for (t of tabs; track t.key) {
        <button type="button" role="tab" class="tab" [class.is-on]="tab() === t.key" [attr.aria-selected]="tab() === t.key" (click)="select(t.key)">
          <i class="pi" [ngClass]="t.icon"></i><span>{{ t.label }}</span>
        </button>
      }
    </nav>

    <div class="panel">
      @switch (tab()) {
        @case ('overview') { <app-sub-overview /> }
        @case ('plans') { <app-sub-plans /> }
        @case ('shops') { <app-sub-shops /> }
        @case ('payments') { <app-sub-payments /> }
        @case ('settings') { <app-sub-settings /> }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        /* Routed pages are pinned to the viewport height by a global rule; this one is taller
           than the screen and scrolls, so it must size to its content instead of shrinking. */
        height: auto !important;
      }
      .tabs {
        display: flex;
        gap: 0.375rem;
        overflow-x: auto;
        padding: 0.375rem;
        margin-bottom: clamp(1rem, 2vw, 1.5rem);
        background: var(--bg-eef1f7);
        border-radius: 16px;
        scrollbar-width: none;
      }
      .tab {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.75rem;
        padding: 0 1rem;
        border: none;
        border-radius: 12px;
        background: transparent;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-64748b);
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      }
      .tab:hover:not(.is-on) {
        color: var(--tx-0f172a);
      }
      .tab.is-on {
        background: var(--bg-ffffff);
        color: var(--accent-text-700);
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
      }
      .panel {
        min-width: 0;
        animation: fade 0.2s ease both;
      }
      @keyframes fade {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .panel {
          animation: none;
        }
      }
    `,
  ],
})
export class SubscriptionsComponent implements OnInit {
  readonly tabs = TABS;
  tab = signal<Tab>('overview');

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const wanted = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (wanted && TABS.some((t) => t.key === wanted)) this.tab.set(wanted);
  }

  select(tab: Tab): void {
    this.tab.set(tab);
    this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
