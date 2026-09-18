import { Injectable, computed, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { BillingService } from './billing.service';
import { AccessLevel, ShopAccessInfo, ShopBillingOverview } from '../models/billing.models';

const REFRESH_MS = 60_000;

/**
 * The signed-in shop's subscription state, kept fresh while the shop portal is
 * open. It drives the warning banner, the read-only mode of the print queue and
 * the lock that sends a suspended shop to its Billing page.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionStatusService {
  readonly overview = signal<ShopBillingOverview | null>(null);
  readonly loaded = signal(false);
  readonly access = computed<ShopAccessInfo | null>(() => this.overview()?.access ?? null);
  /** Until we know better, assume full access so the portal never flashes a lock. */
  readonly level = computed<AccessLevel>(() => this.access()?.level ?? 'FULL');
  readonly suspended = computed(() => this.level() === 'SUSPENDED');
  readonly readOnly = computed(() => this.level() === 'READ_ONLY');

  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly billing: BillingService) {}

  start(): void {
    this.refresh().subscribe();
    if (!this.timer) this.timer = setInterval(() => !document.hidden && this.refresh().subscribe(), REFRESH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.overview.set(null);
    this.loaded.set(false);
  }

  refresh(): Observable<ShopBillingOverview | null> {
    return this.billing.myBilling().pipe(
      tap((o) => {
        this.overview.set(o);
        this.loaded.set(true);
      }),
      catchError(() => {
        this.loaded.set(true);
        return of(null);
      }),
    );
  }

  /** Resolves once the first status has arrived (used by the route guard). */
  ensureLoaded(): Observable<boolean> {
    if (this.loaded()) return of(true);
    return this.refresh().pipe(map(() => true));
  }

  setOverview(o: ShopBillingOverview): void {
    this.overview.set(o);
  }
}
