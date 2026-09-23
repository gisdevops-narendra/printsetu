import { Injectable, Signal, computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { NotificationEventType, NotificationRow, PrintJobStatus, ShopProfileInfo, ShopAvailabilityInfo } from '../models/models';
import { ShopkeeperService } from './shopkeeper.service';
import { OrderAlertsService } from './order-alerts.service';
import { HeaderAlert, readSeenAt, writeSeenAt } from '../../shared/components/app-header/header.models';

const REFRESH_MS = 30_000;
const SEEN_SCOPE = 'shop';

const WAITING: PrintJobStatus[] = ['PRINT_ELIGIBLE', 'QUEUED'];
const ATTENTION: PrintJobStatus[] = ['AGENT_OFFLINE', 'PRINT_FAILED', 'PRINT_UNKNOWN'];

const EVENT: Record<NotificationEventType, { label: string; icon: string; tone: HeaderAlert['tone'] }> = {
  UPLOAD_RECEIVED: { label: 'New customer upload', icon: 'pi pi-upload', tone: 'info' },
  PRINT_QUEUED: { label: 'Print queued', icon: 'pi pi-clock', tone: 'info' },
  PRINT_COMPLETED: { label: 'Print completed', icon: 'pi pi-check-circle', tone: 'ok' },
  PRINT_FAILED: { label: 'Print failed', icon: 'pi pi-times-circle', tone: 'bad' },
  SUBSCRIPTION_RENEWAL_REMINDER: { label: 'Renewal reminder', icon: 'pi pi-calendar', tone: 'info' },
  SUBSCRIPTION_TRIAL_ENDING: { label: 'Trial ending', icon: 'pi pi-clock', tone: 'info' },
  SUBSCRIPTION_PAYMENT_FAILED: { label: 'Payment failed', icon: 'pi pi-exclamation-triangle', tone: 'warn' },
  SUBSCRIPTION_GRACE_REMINDER: { label: 'Payment reminder', icon: 'pi pi-bell', tone: 'warn' },
  SUBSCRIPTION_FINAL_WARNING: { label: 'Final warning', icon: 'pi pi-exclamation-circle', tone: 'bad' },
  SUBSCRIPTION_PAST_DUE: { label: 'Payment overdue', icon: 'pi pi-exclamation-circle', tone: 'bad' },
  SUBSCRIPTION_SUSPENDED: { label: 'Shop suspended', icon: 'pi pi-lock', tone: 'bad' },
  SUBSCRIPTION_PAID: { label: 'Payment received', icon: 'pi pi-check-circle', tone: 'ok' },
  SUBSCRIPTION_REACTIVATED: { label: 'Shop reactivated', icon: 'pi pi-lock-open', tone: 'ok' },
  SUBSCRIPTION_CANCELLED: { label: 'Subscription cancelled', icon: 'pi pi-ban', tone: 'muted' },
};

export interface QueueSummary {
  /** Confirmed orders waiting for the shopkeeper / printer. */
  pending: number;
  printing: number;
  /** Printer offline, print failed or unknown outcome: needs a human. */
  attention: number;
}

/**
 * Data for the shop portal header: who the shop is (name, logo), whether it is
 * taking orders, the queue at a glance and the notification bell.
 */
@Injectable({ providedIn: 'root' })
export class ShopHeaderService {
  readonly shop = signal<ShopProfileInfo | null>(null);
  readonly acceptingOrders = signal(true);
  /** How the status is being decided, and when it next changes on its own. */
  readonly availability = signal<ShopAvailabilityInfo | null>(null);
  readonly togglingOnline = signal(false);
  readonly alerts = signal<HeaderAlert[]>([]);
  /** Epoch ms of the last time the bell was read. */
  readonly seenAt = signal(readSeenAt(SEEN_SCOPE));
  readonly unread = computed(() => this.alerts().filter((a) => new Date(a.at).getTime() > this.seenAt()).length);

  readonly queue: Signal<QueueSummary>;

  private timer?: ReturnType<typeof setInterval>;
  private profileSub?: Subscription;
  private ticks = 0;
  /** Re-reads the status the moment the schedule (or a break) is due to flip it. */
  private flipTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly shopkeeper: ShopkeeperService,
    alerts: OrderAlertsService,
  ) {
    this.queue = computed(() => {
      const jobs = alerts.jobs();
      const count = (statuses: PrintJobStatus[]) => jobs.filter((j) => statuses.includes(j.status)).length;
      return { pending: count(WAITING), printing: count(['PRINTING']), attention: count(ATTENTION) };
    });
  }

  start(): void {
    if (this.timer) return;
    this.profileSub = this.shopkeeper.profileChanged.subscribe((res) => {
      this.shop.set(res.shop);
      this.acceptingOrders.set(res.settings.acceptingOrders ?? true);
      this.availability.set(res.settings.availability ?? null);
      this.scheduleFlip(res.settings.availability?.nextChangeAt ?? null);
    });
    this.ticks = 0;
    this.refresh();
    this.timer = setInterval(() => {
      if (document.hidden) return;
      this.ticks++;
      this.refresh();
    }, REFRESH_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.flipTimer) clearTimeout(this.flipTimer);
    this.flipTimer = undefined;
    this.availability.set(null);
    this.profileSub?.unsubscribe();
    this.shop.set(null);
    this.alerts.set([]);
    this.acceptingOrders.set(true);
  }

  markAllRead(): void {
    const now = Date.now();
    this.seenAt.set(now);
    writeSeenAt(SEEN_SCOPE, now);
  }

  /** The Online / Offline switch. Optimistic; rolls back (and reports) if the API refuses. */
  setAccepting(on: boolean, onDone: () => void, onError: () => void): void {
    if (this.togglingOnline()) return;
    const before = this.acceptingOrders();
    this.acceptingOrders.set(on);
    this.togglingOnline.set(true);
    this.shopkeeper.updateSettings({ acceptingOrders: on }).subscribe({
      next: () => {
        this.togglingOnline.set(false);
        onDone();
      },
      error: () => {
        this.acceptingOrders.set(before);
        this.togglingOnline.set(false);
        onError();
      },
    });
  }

  private scheduleFlip(nextChangeAt: string | null): void {
    if (this.flipTimer) clearTimeout(this.flipTimer);
    this.flipTimer = undefined;
    if (!nextChangeAt) return;
    // A couple of seconds late so the server is already past the boundary; capped to stay within setTimeout's range.
    const delay = Math.min(new Date(nextChangeAt).getTime() - Date.now() + 2000, 6 * 3600_000);
    this.flipTimer = setTimeout(() => this.shopkeeper.profile().subscribe({ error: () => undefined }), Math.max(delay, 1000));
  }

  private refresh(): void {
    // The signed logo URL expires after an hour: re-read the profile every ~5 minutes.
    if (!this.shop() || this.ticks % 10 === 0) this.shopkeeper.profile().subscribe({ error: () => undefined });
    this.shopkeeper.notifications(1, 10).subscribe({
      next: (res) => this.alerts.set(res.items.map((n) => this.toAlert(n))),
      error: () => undefined, // keep what we had
    });
  }

  private toAlert(n: NotificationRow): HeaderAlert {
    const meta = EVENT[n.eventType] ?? { label: n.eventType, icon: 'pi pi-bell', tone: 'muted' as const };
    return {
      id: n.id,
      icon: meta.icon,
      tone: meta.tone,
      title: meta.label,
      detail: n.message ?? undefined,
      at: n.createdAt,
      link: n.eventType.startsWith('SUBSCRIPTION_') ? '/shop/billing' : '/shop/notifications',
    };
  }
}
