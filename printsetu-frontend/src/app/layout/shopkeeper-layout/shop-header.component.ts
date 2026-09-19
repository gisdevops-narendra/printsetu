import { Component, Input, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../core/auth/auth.service';
import { ShopHeaderService } from '../../core/services/shop-header.service';
import { SubscriptionStatusService } from '../../core/services/subscription-status.service';
import { BillingPillComponent } from '../../shared/billing/billing-pill.component';
import { ShellNavItem } from '../../shared/components/app-shell/app-shell.component';
import { HeaderFrameComponent } from '../../shared/components/app-header/header-frame.component';
import { HeaderBellComponent } from '../../shared/components/app-header/header-bell.component';
import { HeaderProfileComponent } from '../../shared/components/app-header/header-profile.component';
import { HeaderClockComponent } from '../../shared/components/app-header/header-clock.component';
import { ThemeToggleComponent } from '../../shared/components/app-header/theme-toggle.component';
import { HeaderMenuItem } from '../../shared/components/app-header/header.models';

const DAY_MS = 24 * 60 * 60 * 1000;

interface RenewalNote {
  text: string;
  urgent: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Shop page header: the shop's own logo and name, the subscription badge with
 * days remaining, the Online/Offline switch, and the live queue. The things a
 * shopkeeper must never lose sight of (badge, queue, switch) are always visible,
 * even on a phone.
 */
@Component({
  selector: 'app-shop-header',
  standalone: true,
  imports: [CommonModule, RouterLink, BillingPillComponent, HeaderFrameComponent, HeaderBellComponent, HeaderProfileComponent, HeaderClockComponent, ThemeToggleComponent],
  template: `
    <app-header-frame rootLabel="Shop" rootLink="/shop/queue" [navItems]="navItems" [phoneBreadcrumb]="false">
      <a hdrBrand class="shop" routerLink="/shop/profile" [attr.aria-label]="(header.shop()?.name ?? 'Shop') + ' profile'">
        <span class="shop__logo" [class.shop__logo--empty]="!header.shop()?.logoUrl">
          @if (header.shop()?.logoUrl; as url) {
            <img [src]="url" alt="" />
          } @else {
            {{ initial() }}
          }
        </span>
        <span class="shop__text">
          @if (header.shop(); as s) {
            <strong class="shop__name">{{ s.name }}</strong>
            <small class="shop__meta">{{ s.shopCode }}@if (s.city) { · {{ s.city }} }</small>
          } @else {
            <strong class="shop__name">Shop Portal</strong>
          }
        </span>
      </a>

      <div hdrActions class="actions">
        <button
          type="button"
          class="online"
          role="switch"
          [class.online--on]="online()"
          [class.online--paused]="locked()"
          [attr.aria-checked]="online()"
          [disabled]="locked() || header.togglingOnline()"
          [attr.title]="onlineHint()"
          (click)="toggleOnline()"
        >
          <span class="online__dot"></span>
          <span class="online__label">{{ locked() ? 'Paused' : online() ? 'Online' : 'Offline' }}</span>
          <span class="online__track"><span class="online__knob"></span></span>
        </button>
        <app-theme-toggle class="theme-inline" />
        <app-header-bell
          [alerts]="header.alerts()"
          [unread]="header.unread()"
          [newSince]="header.seenAt()"
          heading="Notifications"
          emptyText="No new uploads or alerts."
          viewAllLink="/shop/notifications"
          viewAllLabel="View all notifications"
          (seen)="header.markAllRead()"
        />
        <app-header-profile [name]="auth.user()?.name ?? ''" [email]="auth.user()?.email ?? ''" roleLabel="Shop owner" [items]="menu" (logout)="auth.logout()" />
      </div>

      <div hdrStrip class="strip">
        <a class="sub" routerLink="/shop/billing" title="Subscription and billing">
          @if (status.loaded()) {
            <app-billing-pill [state]="status.access()?.state ?? 'NONE'" />
            @if (renewal(); as r) {
              <span class="sub__days" [class.sub__days--urgent]="r.urgent"><i class="pi pi-calendar"></i>{{ r.text }}</span>
            }
          } @else {
            <span class="skeleton"></span>
          }
        </a>

        <span class="divider" aria-hidden="true"></span>

        @if (status.level() === 'FULL') {
          <a class="chip" routerLink="/shop/queue" title="Orders waiting to be printed">
            <i class="pi pi-inbox"></i><b>{{ header.queue().pending }}</b> pending
          </a>
          <a class="chip" routerLink="/shop/queue" title="Orders being printed right now">
            <i class="pi pi-print"></i><b>{{ header.queue().printing }}</b> printing
          </a>
          @if (header.queue().attention > 0) {
            <a class="chip chip--bad" routerLink="/shop/queue" title="Printer offline or a print failed">
              <i class="pi pi-exclamation-triangle"></i><b>{{ header.queue().attention }}</b> need{{ header.queue().attention === 1 ? 's' : '' }} attention
            </a>
          }
          @if (!online()) {
            <span class="chip chip--warn" title="Customers see your shop as unavailable. Orders already in the queue are unaffected."><i class="pi pi-pause"></i>Not accepting orders</span>
          }
        } @else {
          <span class="chip chip--muted" title="Queue status is paused while your subscription needs attention."><i class="pi pi-lock"></i>Queue paused</span>
        }

        <span class="grow"></span>
        <app-header-clock class="clock" />
      </div>
    </app-header-frame>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .shop {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        min-width: 0;
        color: var(--hdr-text);
        text-decoration: none;
      }
      .shop__logo {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        overflow: hidden;
        border-radius: 11px;
        background: var(--hdr-surface);
        border: 1px solid var(--hdr-border);
      }
      .shop__logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .shop__logo--empty {
        border-color: transparent;
        background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.28);
        color: #fff;
        font-size: 0.9375rem;
        font-weight: 700;
      }
      .shop__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.2;
      }
      .shop__name {
        max-width: 14rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
        letter-spacing: -0.01em;
      }
      .shop__meta {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.6875rem;
        color: var(--hdr-muted);
      }
      @media (max-width: 1099px) {
        .shop__name {
          max-width: 11rem;
        }
      }
      @media (max-width: 479px) {
        .shop__name {
          max-width: 7.5rem;
        }
        .shop__meta {
          display: none;
        }
      }

      .actions {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      /* ---- Online / Offline switch ---- */
      .online {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        height: 2.5rem;
        padding: 0 0.625rem 0 0.875rem;
        border: 1px solid var(--tone-bad-fg);
        border-radius: 999px;
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .online--on {
        border-color: var(--tone-ok-fg);
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      .online--paused,
      .online:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
      .online--paused {
        border-color: var(--tone-warn-fg);
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      .online__dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: currentColor;
      }
      .online--on .online__dot {
        animation: online-pulse 2s ease-in-out infinite;
      }
      @keyframes online-pulse {
        50% {
          opacity: 0.35;
        }
      }
      .online__track {
        position: relative;
        width: 2rem;
        height: 1.125rem;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.9;
      }
      .online__knob {
        position: absolute;
        top: 0.125rem;
        left: 0.125rem;
        width: 0.875rem;
        height: 0.875rem;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.3);
        transition: transform 0.15s ease;
      }
      .online--on .online__knob {
        transform: translateX(0.875rem);
      }
      @media (max-width: 479px) {
        .theme-inline {
          display: none; /* Dark mode moves into the account menu on phones. */
        }
      }
      @media (max-width: 599px) {
        .online {
          padding: 0 0.5rem;
        }
        .online__label,
        .online__dot {
          display: none;
        }
      }

      /* ---- strip ---- */
      .strip {
        display: flex;
        align-items: center;
        gap: 0.5rem 0.75rem;
        width: 100%;
        min-width: 0;
      }
      /* Tablet and up: wrap rather than push the clock off-screen. (Phones scroll the strip sideways instead.) */
      @media (min-width: 768px) {
        .strip {
          flex-wrap: wrap;
        }
      }
      .grow {
        flex: 1 1 auto;
      }
      .divider {
        flex: none;
        width: 1px;
        height: 1.25rem;
        background: var(--hdr-border);
      }
      .sub {
        display: inline-flex;
        align-items: center;
        gap: 0.625rem;
        flex: none;
        color: inherit;
        text-decoration: none;
      }
      .sub__days {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--hdr-muted);
        white-space: nowrap;
      }
      .sub__days i {
        font-size: 0.75rem;
      }
      .sub__days--urgent {
        color: var(--tone-warn-fg);
      }
      .skeleton {
        width: 9rem;
        height: 1.5rem;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--hdr-field) 25%, var(--hdr-hover) 37%, var(--hdr-field) 63%);
        background-size: 400% 100%;
        animation: shimmer 1.4s ease infinite;
      }
      @keyframes shimmer {
        0% {
          background-position: 100% 50%;
        }
        100% {
          background-position: 0 50%;
        }
      }
      .chip {
        flex: none;
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
      .chip--bad {
        border-color: transparent;
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
      }
      .chip--bad b {
        color: inherit;
      }
      .chip--warn {
        border-color: transparent;
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      .chip--muted {
        background: var(--tone-muted-bg);
        color: var(--tone-muted-fg);
        border-color: transparent;
      }
      @media (max-width: 767px) {
        .clock,
        .grow {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .online--on .online__dot,
        .skeleton {
          animation: none;
        }
        .online__knob {
          transition: none;
        }
      }
    `,
  ],
})
export class ShopHeaderComponent implements OnInit, OnDestroy {
  @Input() navItems: ShellNavItem[] = [];

  readonly auth = inject(AuthService);
  readonly header = inject(ShopHeaderService);
  readonly status = inject(SubscriptionStatusService);
  private readonly messages = inject(MessageService);

  readonly menu: HeaderMenuItem[] = [
    { label: 'Shop profile & settings', icon: 'pi pi-building', route: '/shop/profile' },
    { label: 'Billing & invoices', icon: 'pi pi-credit-card', route: '/shop/billing' },
    { label: 'Print agent', icon: 'pi pi-desktop', route: '/shop/print-agent' },
  ];

  /** The switch only means something while the subscription lets the shop take orders at all. */
  readonly locked = computed(() => this.status.level() !== 'FULL');
  readonly online = computed(() => !this.locked() && this.header.acceptingOrders());

  readonly initial = computed(() => (this.header.shop()?.name ?? 'S').trim().charAt(0).toUpperCase() || 'S');

  /** "12 days left" for an active plan, "3 days of grace" while payment is pending, etc. */
  readonly renewal = computed<RenewalNote | null>(() => {
    const o = this.status.overview();
    if (!o) return null;
    const { access, subscription } = o;
    const days = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)) : null);

    switch (access.state) {
      case 'TRIAL': {
        const n = access.daysLeft ?? days(subscription?.trialEndsAt ?? null);
        return n === null ? null : { text: n === 0 ? 'Trial ends today' : `${plural(n, 'day')} left`, urgent: n <= 3 };
      }
      case 'PAYMENT_PENDING': {
        const n = access.daysLeft ?? days(access.graceEndsAt);
        return n === null ? null : { text: n === 0 ? 'Pay today' : `${plural(n, 'day')} to pay`, urgent: true };
      }
      case 'ACTIVE': {
        const n = days(subscription?.currentPeriodEnd ?? null);
        if (n === null) return null;
        const ends = subscription?.cancelAtPeriodEnd;
        return { text: n === 0 ? (ends ? 'Ends today' : 'Renews today') : `${plural(n, 'day')} left`, urgent: n <= 3 };
      }
      default:
        return null;
    }
  });

  readonly onlineHint = computed(() => {
    if (this.locked()) return 'New orders are paused because your subscription needs attention.';
    return this.online() ? 'Accepting new orders. Click to go offline (e.g. lunch break or printer issue).' : 'Not accepting new orders. Click to go online.';
  });

  ngOnInit(): void {
    this.header.start();
  }

  ngOnDestroy(): void {
    this.header.stop();
  }

  toggleOnline(): void {
    const next = !this.online();
    // No success toast: it would land on top of this very switch. The switch and the strip chip are the confirmation.
    this.header.setAccepting(
      next,
      () => undefined,
      () => this.messages.add({ severity: 'error', summary: 'Could not update your status', detail: 'Check your connection and try again.' }),
    );
  }
}
