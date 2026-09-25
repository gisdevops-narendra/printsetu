import { Component, Input, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
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
import { LanguagePickerComponent } from '../../shared/components/app-header/language-picker.component';
import { HeaderMenuItem } from '../../shared/components/app-header/header.models';
import { t, intlLocale, tn } from '../../core/i18n/i18n';

const DAY_MS = 24 * 60 * 60 * 1000;

interface RenewalNote {
  text: string;
  urgent: boolean;
}


/**
 * Shop page header: the shop's own logo and name, the subscription badge with
 * days remaining, the Online/Offline switch, and the live queue. The things a
 * shopkeeper must never lose sight of (badge, queue, switch) are always visible,
 * even on a phone.
 */
/** "6:00 PM" today, "tomorrow 9:00 AM", or "Mon 9:00 AM". */
function whenLabel(at: Date, now = new Date()): string {
  const time = at.toLocaleTimeString(intlLocale(), { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((day(at) - day(now)) / 86_400_000);
  if (diffDays <= 0) return time;
  if (diffDays === 1) return `tomorrow ${time}`;
  return `${at.toLocaleDateString(intlLocale(), { weekday: 'short' })} ${time}`;
}

@Component({
  selector: 'app-shop-header',
  standalone: true,
  imports: [TranslatePipe, CommonModule, RouterLink, BillingPillComponent, HeaderFrameComponent, HeaderBellComponent, HeaderProfileComponent, HeaderClockComponent, ThemeToggleComponent, LanguagePickerComponent],
  template: `
    <app-header-frame [rootLabel]="'common.shop' | translate" rootLink="/shop/queue" [navItems]="navItems" [phoneBreadcrumb]="false">
      <a hdrBrand class="shop" routerLink="/shop/profile" [attr.aria-label]="'layout.shop_profile_aria' | translate: { name: header.shop()?.name ?? ('common.shop' | translate) }">
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
            <strong class="shop__name">{{ 'layout.my_shop' | translate }}</strong>
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
          <span class="online__label">{{ locked() ? ('layout.paused' | translate) : online() ? ('common.online' | translate) : ('common.offline' | translate) }}</span>
          <span class="online__track"><span class="online__knob"></span></span>
        </button>
        <app-language-picker class="theme-inline" />
        <app-theme-toggle class="theme-inline" />
        <app-header-bell
          [alerts]="header.alerts()"
          [unread]="header.unread()"
          [newSince]="header.seenAt()"
          [heading]="'common.notifications' | translate"
          [emptyText]="'layout.no_new_uploads_or_alerts' | translate"
          viewAllLink="/shop/notifications"
          [viewAllLabel]="'layout.view_all_notifications' | translate"
          (seen)="header.markAllRead()"
        />
        <app-header-profile [name]="auth.user()?.name ?? ''" [email]="auth.user()?.email ?? ''" [roleLabel]="'layout.shop_owner' | translate" [items]="menu" (logout)="auth.logout()" />
      </div>

      <div hdrStrip class="strip">
        <a class="sub" routerLink="/shop/billing" [title]="'layout.subscription_and_billing' | translate">
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
          <a class="chip" routerLink="/shop/queue" [title]="'layout.orders_waiting_to_be_printed' | translate">
            <i class="pi pi-inbox"></i><b>{{ header.queue().pending }}</b> {{ 'layout.pending' | translate }}
          </a>
          <a class="chip" routerLink="/shop/queue" [title]="'layout.orders_being_printed_right_now' | translate">
            <i class="pi pi-print"></i><b>{{ header.queue().printing }}</b> {{ 'layout.printing' | translate }}
          </a>
          @if (header.queue().attention > 0) {
            <a class="chip chip--bad" routerLink="/shop/queue" [title]="'layout.printer_offline_or_a_print_failed' | translate">
              <i class="pi pi-exclamation-triangle"></i><b>{{ header.queue().attention }}</b> {{ (header.queue().attention === 1 ? 'layout.needs_attention.one' : 'layout.needs_attention.other') | translate }}
            </a>
          }
          @if (!online()) {
            <span class="chip chip--warn" [title]="'layout.customers_see_your_shop_as_unavailable' | translate"><i class="pi pi-pause"></i>{{ scheduleNote() ?? ('layout.not_accepting_orders' | translate) }}</span>
          } @else if (scheduleNote(); as note) {
            <span class="chip chip--muted" [title]="'layout.your_shop_goes_online_and_offline' | translate"><i class="pi pi-clock"></i>{{ note }}</span>
          }
        } @else {
          <span class="chip chip--muted" [title]="'layout.printing_is_paused_while_your_subscription' | translate"><i class="pi pi-lock"></i>{{ 'layout.printing_paused' | translate }}</span>
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
      /* Phones: the status chips and plan link are links, so give them a finger-sized height. */
      @media (max-width: 767px) {
        a.chip,
        .sub {
          min-height: 2rem;
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
    { get label() { return t('layout.shop_profile_settings'); }, icon: 'pi pi-building', route: '/shop/profile' },
    { get label() { return t('layout.billing_invoices'); }, icon: 'pi pi-credit-card', route: '/shop/billing' },
    { get label() { return t('layout.printer_app'); }, icon: 'pi pi-desktop', route: '/shop/print-agent' },
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
        return n === null ? null : { text: n === 0 ? t('layout.trial_ends_today') : tn('layout.days_left', n), urgent: n <= 3 };
      }
      case 'PAYMENT_PENDING': {
        const n = access.daysLeft ?? days(access.graceEndsAt);
        return n === null ? null : { text: n === 0 ? t('layout.pay_today') : tn('layout.days_to_pay', n), urgent: true };
      }
      case 'ACTIVE': {
        const n = days(subscription?.currentPeriodEnd ?? null);
        if (n === null) return null;
        const ends = subscription?.cancelAtPeriodEnd;
        return { text: n === 0 ? (ends ? t('layout.ends_today') : t('layout.renews_today')) : tn('layout.days_left', n), urgent: n <= 3 };
      }
      default:
        return null;
    }
  });

  /** "Closes 6:00 PM", "Opens tomorrow 9:00 AM", "Break until 6:00 PM" while the daily schedule is on. */
  readonly scheduleNote = computed<string | null>(() => {
    const a = this.header.availability();
    if (this.locked() || !a || a.source === 'MANUAL') return null;
    const at = a.nextChangeAt ? whenLabel(new Date(a.nextChangeAt)) : null;
    if (a.source === 'OVERRIDE') {
      const kind = this.online() ? t('layout.open_late') : t('layout.on_a_break');
      return at ? `${kind} until ${at}` : kind;
    }
    if (!at) return this.online() ? t('common.open') : t('common.closed');
    return this.online() ? t('layout.open_closes', { at }) : t('layout.closed_opens', { at });
  });

  readonly onlineHint = computed(() => {
    if (this.locked()) return t('layout.new_orders_are_paused_because_your');
    const a = this.header.availability();
    if (a && a.source !== 'MANUAL') {
      return this.online()
        ? t('layout.accepting_new_orders_on_your_shop')
        : t('layout.closed_on_your_shop_hours_or');
    }
    return this.online() ? t('layout.accepting_new_orders_click_to_go') : t('layout.not_accepting_new_orders_click_to');
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
      () => this.messages.add({ severity: 'error', get summary() { return t('layout.could_not_update_your_status'); }, get detail() { return t('layout.check_your_connection_and_try_again'); } }),
    );
  }
}
