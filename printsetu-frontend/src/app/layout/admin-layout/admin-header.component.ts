import { Component, ElementRef, HostListener, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminHeaderService } from '../../core/services/admin-header.service';
import { Shop } from '../../core/models/models';
import { environment } from '../../../environments/environment';
import { money } from '../../shared/billing/billing.util';
import { ShellNavItem } from '../../shared/components/app-shell/app-shell.component';
import { HeaderFrameComponent } from '../../shared/components/app-header/header-frame.component';
import { HeaderBellComponent } from '../../shared/components/app-header/header-bell.component';
import { HeaderProfileComponent } from '../../shared/components/app-header/header-profile.component';
import { HeaderClockComponent } from '../../shared/components/app-header/header-clock.component';
import { ThemeToggleComponent } from '../../shared/components/app-header/theme-toggle.component';
import { HeaderMenuItem } from '../../shared/components/app-header/header.models';

const MAX_RESULTS = 6;

/**
 * Admin page header: platform logo, breadcrumb, shop search and quick actions on
 * the primary row; live platform numbers, environment and clock on the strip.
 */
@Component({
  selector: 'app-admin-header',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    HeaderFrameComponent,
    HeaderBellComponent,
    HeaderProfileComponent,
    HeaderClockComponent,
    ThemeToggleComponent,
  ],
  template: `
    <app-header-frame rootLabel="Admin" rootLink="/admin/dashboard" [navItems]="navItems" [collapsibleStrip]="true">
      <div hdrSearch class="search">
        <i class="pi pi-search search__icon" aria-hidden="true"></i>
        <input
          #searchInput
          type="text"
          class="search__input"
          placeholder="Find a shop by name, code, owner or city"
          autocomplete="off"
          role="combobox"
          aria-label="Search shops"
          aria-autocomplete="list"
          aria-controls="admin-shop-results"
          [attr.aria-expanded]="showResults()"
          [ngModel]="query()"
          (ngModelChange)="onQuery($event)"
          (focus)="open.set(true)"
          (keydown.arrowdown)="move(1, $event)"
          (keydown.arrowup)="move(-1, $event)"
          (keydown.enter)="submit()"
          (keydown.escape)="closeSearch()"
        />
        @if (query()) {
          <button type="button" class="search__clear" aria-label="Clear search" (click)="clear(searchInput)"><i class="pi pi-times"></i></button>
        } @else {
          <kbd class="search__hint" aria-hidden="true">/</kbd>
        }
        @if (showResults()) {
          <ul class="results" id="admin-shop-results" role="listbox">
            @for (s of results(); track s.id; let i = $index) {
              <li role="option" [attr.aria-selected]="i === active()">
                <button type="button" class="result" [class.result--active]="i === active()" (mouseenter)="active.set(i)" (click)="openShop(s)">
                  <span class="result__avatar">{{ s.name.charAt(0).toUpperCase() }}</span>
                  <span class="result__text">
                    <span class="result__name">{{ s.name }}</span>
                    <span class="result__meta">{{ s.shopCode }} · {{ s.ownerName }}@if (s.city) { · {{ s.city }} }</span>
                  </span>
                  <span class="result__status" [class.result__status--off]="s.status !== 'ACTIVE'">{{ s.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span>
                </button>
              </li>
            } @empty {
              <li class="results__empty">No shop matches “{{ query().trim() }}”.</li>
            }
            @if (matchCount() > results().length) {
              <li>
                <button type="button" class="results__all" (click)="submit(true)">
                  See all {{ matchCount() }} matches <i class="pi pi-arrow-right"></i>
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <div hdrActions class="actions">
        <app-theme-toggle class="theme-inline" />
        <app-header-bell
          [alerts]="header.alerts()"
          [unread]="header.unread()"
          [newSince]="header.seenAt()"
          heading="Alerts"
          emptyText="No payment failures or new shops."
          viewAllLink="/admin/subscriptions"
          viewAllLabel="Open billing"
          (seen)="header.markAllRead()"
        />
        <app-header-profile [name]="auth.user()?.name ?? ''" [email]="auth.user()?.email ?? ''" roleLabel="Administrator" [items]="menu" (logout)="auth.logout()" />
      </div>

      <div hdrStrip class="strip">
        <span class="env" [class.env--live]="env.live" [attr.title]="'Connected to ' + env.api">
          <span class="env__dot"></span>{{ env.label }}
        </span>

        @if (header.stats(); as s) {
          <a class="chip" routerLink="/admin/shops" title="Active shops out of all shops">
            <i class="pi pi-building"></i><b>{{ s.activeShops }}</b><span class="chip__of">/ {{ s.totalShops }}</span> active shops
          </a>
          <a class="chip" [class.chip--warn]="s.unpaidInvoices > 0" routerLink="/admin/subscriptions" title="Open invoices waiting for payment">
            <i class="pi pi-wallet"></i><b>{{ s.unpaidInvoices }}</b> unpaid
            @if (s.unpaidInvoices > 0) {
              <span class="chip__of">· {{ fmt(s.unpaidAmount, s.currency) }}</span>
            }
          </a>
          <a class="chip" [class.chip--bad]="s.failedPayments > 0" routerLink="/admin/subscriptions" title="Shops that are past due or have a payment pending">
            <i class="pi pi-exclamation-triangle"></i><b>{{ s.failedPayments }}</b> payment issues
          </a>
        } @else {
          <span class="chip chip--skeleton"></span>
          <span class="chip chip--skeleton"></span>
          <span class="chip chip--skeleton"></span>
        }

        <span class="grow"></span>
        <app-header-clock />
      </div>
    </app-header-frame>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      /* ---- search ---- */
      .search {
        position: relative;
        display: flex;
        align-items: center;
        width: min(100%, 28rem);
      }
      .search__icon {
        position: absolute;
        left: 0.875rem;
        font-size: 0.875rem;
        color: var(--hdr-muted);
        pointer-events: none;
      }
      .search__input {
        width: 100%;
        height: 2.5rem;
        padding: 0 2.5rem 0 2.375rem;
        border: 1px solid transparent;
        border-radius: 12px;
        background: var(--hdr-field);
        color: var(--hdr-text);
        font: inherit;
        font-size: 0.875rem;
        transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .search__input::placeholder {
        color: var(--hdr-muted);
      }
      .search__input:hover {
        border-color: var(--hdr-border);
      }
      .search__input:focus {
        outline: none;
        border-color: var(--p-primary-400);
        background: var(--hdr-surface);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-500) 18%, transparent);
      }
      .search__hint {
        position: absolute;
        right: 0.625rem;
        padding: 0.05rem 0.4rem;
        border: 1px solid var(--hdr-border);
        border-radius: 6px;
        background: var(--hdr-surface);
        color: var(--hdr-muted);
        font: inherit;
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .search__clear {
        position: absolute;
        right: 0.375rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        border: 0;
        border-radius: 8px;
        background: none;
        color: var(--hdr-muted);
        font-size: 0.75rem;
        cursor: pointer;
      }
      .search__clear:hover {
        background: var(--hdr-hover);
        color: var(--hdr-text);
      }
      .results {
        position: absolute;
        z-index: 1200;
        top: calc(100% + 0.5rem);
        left: 0;
        right: 0;
        margin: 0;
        padding: 0.375rem;
        list-style: none;
        background: var(--hdr-surface);
        border: 1px solid var(--hdr-border);
        border-radius: 16px;
        box-shadow: var(--hdr-panel-shadow);
      }
      .result {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.5rem 0.625rem;
        border: 0;
        border-radius: 10px;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .result--active {
        background: var(--hdr-hover);
      }
      .result__avatar {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 9px;
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
        font-size: 0.8125rem;
        font-weight: 700;
      }
      .result__text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .result__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.875rem;
        font-weight: 600;
      }
      .result__meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.75rem;
        color: var(--hdr-muted);
      }
      .result__status {
        flex: none;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .result__status--off {
        background: var(--tone-muted-bg);
        color: var(--tone-muted-fg);
      }
      .results__empty {
        padding: 1rem;
        color: var(--hdr-muted);
        font-size: 0.8125rem;
        text-align: center;
      }
      .results__all {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        width: 100%;
        padding: 0.625rem;
        border: 0;
        border-top: 1px solid var(--hdr-border);
        background: none;
        color: var(--accent-text-600);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 700;
        cursor: pointer;
      }

      /* ---- actions ---- */
      .actions {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      @media (max-width: 479px) {
        .theme-inline {
          display: none; /* Dark mode moves into the account menu on phones. */
        }
      }

      /* ---- strip ---- */
      .strip {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        width: 100%;
      }
      .grow {
        flex: 1 1 auto;
      }
      .env {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        cursor: help;
      }
      .env--live {
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      .env__dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: currentColor;
        animation: env-pulse 2s ease-in-out infinite;
      }
      @keyframes env-pulse {
        50% {
          opacity: 0.35;
        }
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.7rem;
        border: 1px solid var(--hdr-border);
        border-radius: 999px;
        background: var(--hdr-surface);
        color: var(--hdr-muted);
        font-size: 0.75rem;
        white-space: nowrap;
        text-decoration: none;
        transition: border-color 0.15s ease;
      }
      a.chip:hover {
        border-color: var(--p-primary-300);
      }
      .chip b {
        color: var(--hdr-text);
        font-weight: 800;
      }
      .chip i {
        font-size: 0.75rem;
      }
      .chip__of {
        opacity: 0.85;
      }
      .chip--warn {
        border-color: transparent;
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      .chip--warn b {
        color: inherit;
      }
      .chip--bad {
        border-color: transparent;
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
      }
      .chip--bad b {
        color: inherit;
      }
      .chip--skeleton {
        width: 8rem;
        height: 1.65rem;
        border-color: transparent;
        background: linear-gradient(90deg, var(--hdr-field) 25%, var(--hdr-hover) 37%, var(--hdr-field) 63%);
        background-size: 400% 100%;
        animation: chip-shimmer 1.4s ease infinite;
      }
      @keyframes chip-shimmer {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .env__dot,
        .chip--skeleton {
          animation: none;
        }
      }
    `,
  ],
})
export class AdminHeaderComponent implements OnInit, OnDestroy {
  @Input() navItems: ShellNavItem[] = [];

  readonly auth = inject(AuthService);
  readonly header = inject(AdminHeaderService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly menu: HeaderMenuItem[] = [
    { label: 'Billing & plans', icon: 'pi pi-wallet', route: '/admin/subscriptions' },
    { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
    { label: 'Audit logs', icon: 'pi pi-shield', route: '/admin/audit-logs' },
  ];

  readonly env = {
    live: environment.production,
    label: environment.production ? 'Live' : 'Staging',
    api: environment.apiBaseUrl,
  };

  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(0);
  readonly fmt = money;

  private readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [] as Shop[];
    return this.header
      .shops()
      .filter((s) => [s.name, s.shopCode, s.ownerName, s.city, s.email, s.mobile].some((f) => f?.toLowerCase().includes(q)));
  });
  readonly matchCount = computed(() => this.matches().length);
  readonly results = computed(() => this.matches().slice(0, MAX_RESULTS));
  readonly showResults = computed(() => this.open() && this.query().trim().length > 0);

  ngOnInit(): void {
    this.header.start();
  }

  ngOnDestroy(): void {
    this.header.stop();
  }

  onQuery(value: string): void {
    this.query.set(value ?? '');
    this.active.set(0);
    this.open.set(true);
  }

  move(delta: number, event: Event): void {
    if (!this.showResults() || !this.results().length) return;
    event.preventDefault();
    const n = this.results().length;
    this.active.set((this.active() + delta + n) % n);
  }

  /** Enter: open the highlighted shop, or (no highlight / "see all") the filtered Shops page. */
  submit(all = false): void {
    const q = this.query().trim();
    if (!q) return;
    const pick = this.results()[this.active()];
    if (!all && pick) return this.openShop(pick);
    this.goToShops(q);
  }

  openShop(shop: Shop): void {
    this.goToShops(shop.shopCode);
  }

  clear(input: HTMLInputElement): void {
    this.query.set('');
    input.focus();
  }

  closeSearch(): void {
    this.open.set(false);
  }

  private goToShops(q: string): void {
    this.open.set(false);
    void this.router.navigate(['/admin/shops'], { queryParams: { q } });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.querySelector('.search')?.contains(event.target as Node)) this.open.set(false);
  }

  /** "/" jumps to the search box, like most admin tools, unless the user is already typing somewhere. */
  @HostListener('document:keydown', ['$event'])
  onSlash(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const el = event.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('.search__input');
    if (!input || input.offsetParent === null) return; // collapsed on a phone
    event.preventDefault();
    input.focus();
  }
}
