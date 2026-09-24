import { Injectable, computed, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { AdminService } from './admin.service';
import { BillingService } from './billing.service';
import { Shop } from '../models/models';
import { HeaderAlert, readSeenAt, writeSeenAt } from '../../shared/components/app-header/header.models';
import { money } from '../../shared/billing/billing.util';
import { t } from '../i18n/i18n';

const REFRESH_MS = 60_000;
const SEEN_SCOPE = 'admin';
const SIGNUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ALERTS = 12;

export interface AdminQuickStats {
  activeShops: number;
  totalShops: number;
  unpaidInvoices: number;
  unpaidAmount: number;
  failedPayments: number;
  currency: string;
}

/**
 * Everything the admin header shows that isn't static: the quick-stat chips,
 * the notification bell (failed payments, new shop sign-ups) and the shop list
 * behind the header search. Refreshed every minute while the admin portal is open.
 */
@Injectable({ providedIn: 'root' })
export class AdminHeaderService {
  readonly stats = signal<AdminQuickStats | null>(null);
  readonly shops = signal<Shop[]>([]);
  readonly alerts = signal<HeaderAlert[]>([]);
  /** Epoch ms of the last time the bell was read. */
  readonly seenAt = signal(readSeenAt(SEEN_SCOPE));
  readonly unread = computed(() => this.alerts().filter((a) => new Date(a.at).getTime() > this.seenAt()).length);

  private timer?: ReturnType<typeof setInterval>;
  private readonly onVisibility = () => {
    if (!document.hidden) this.refresh();
  };

  constructor(
    private readonly admin: AdminService,
    private readonly billing: BillingService,
  ) {}

  start(): void {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => !document.hidden && this.refresh(), REFRESH_MS);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stats.set(null);
    this.shops.set([]);
    this.alerts.set([]);
  }

  markAllRead(): void {
    const now = Date.now();
    this.seenAt.set(now);
    writeSeenAt(SEEN_SCOPE, now);
  }

  refresh(): void {
    // Each feed fails independently: a slow billing call must not blank the shop search.
    forkJoin({
      summary: this.admin.summary().pipe(catchError(() => of(null))),
      dashboard: this.billing.dashboard().pipe(catchError(() => of(null))),
      failed: this.billing.invoices({ status: 'FAILED', pageSize: 8 }).pipe(catchError(() => of(null))),
      shops: this.admin.listShops(1, 100).pipe(catchError(() => of(null))),
    }).subscribe(({ summary, dashboard, failed, shops }) => {
      if (shops) this.shops.set(shops.items);

      if (summary || dashboard) {
        const prev = this.stats();
        this.stats.set({
          activeShops: summary?.activeShops ?? prev?.activeShops ?? 0,
          totalShops: summary?.totalShops ?? prev?.totalShops ?? 0,
          unpaidInvoices: dashboard?.outstanding.invoices ?? prev?.unpaidInvoices ?? 0,
          unpaidAmount: dashboard?.outstanding.amount ?? prev?.unpaidAmount ?? 0,
          failedPayments: dashboard
            ? dashboard.failedPayments.currentlyPastDue + dashboard.failedPayments.currentlyPending
            : (prev?.failedPayments ?? 0),
          currency: dashboard?.currency ?? prev?.currency ?? 'INR',
        });
      }

      // Keep the previous entries of a feed that failed this round, so the bell doesn't flicker.
      const prevPayment = this.alerts().filter((a) => a.id.startsWith('pay-'));
      const prevSignup = this.alerts().filter((a) => a.id.startsWith('shop-'));
      const payment = failed
        ? failed.items.map(
            (inv): HeaderAlert => ({
              id: `pay-${inv.id}`,
              icon: 'pi pi-exclamation-triangle',
              tone: 'bad',
              get title() { return t('app.payment_failed', { shop: inv.shop?.name ?? t('app.a_shop') }); },
              detail: `${inv.number} · ${money(inv.amount, inv.currency)}${inv.lastFailure ? ` · ${inv.lastFailure}` : ''}`,
              at: inv.createdAt,
              link: '/admin/subscriptions',
            }),
          )
        : prevPayment;
      const signup = shops
        ? shops.items
            .filter((s) => Date.now() - new Date(s.createdAt).getTime() < SIGNUP_WINDOW_MS)
            .map(
              (s): HeaderAlert => ({
                id: `shop-${s.id}`,
                icon: 'pi pi-building',
                tone: 'ok',
                get title() { return t('app.new_shop', { name: s.name }); },
                detail: `${s.shopCode}${s.city ? ` · ${s.city}` : ''}`,
                at: s.createdAt,
                link: '/admin/shops',
              }),
            )
        : prevSignup;

      this.alerts.set([...payment, ...signup].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, MAX_ALERTS));
    });
  }
}
