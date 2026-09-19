import { Component, OnDestroy, OnInit, effect } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { OrderAlertsService } from '../../core/services/order-alerts.service';
import { SubscriptionStatusService } from '../../core/services/subscription-status.service';
import { AppShellComponent, ShellNavItem } from '../../shared/components/app-shell/app-shell.component';
import { SubscriptionBannerComponent } from '../../shared/billing/subscription-banner.component';

const BILLING: ShellNavItem = { label: 'Billing', icon: 'pi pi-credit-card', route: '/shop/billing' };

const FULL_NAV: ShellNavItem[] = [
  { label: 'Print Queue', icon: 'pi pi-inbox', route: '/shop/queue' },
  { label: 'History', icon: 'pi pi-history', route: '/shop/history' },
  { label: 'Notifications', icon: 'pi pi-bell', route: '/shop/notifications' },
  { label: 'Shop Profile', icon: 'pi pi-building', route: '/shop/profile' },
  { label: 'Pricing', icon: 'pi pi-tag', route: '/shop/pricing' },
  { label: 'QR Code', icon: 'pi pi-qrcode', route: '/shop/qr' },
  { label: 'Print Agent', icon: 'pi pi-desktop', route: '/shop/print-agent' },
  BILLING,
];

/** A suspended shop can only reach Billing. */
const LOCKED_NAV: ShellNavItem[] = [BILLING];

@Component({
  selector: 'app-shopkeeper-layout',
  standalone: true,
  imports: [RouterOutlet, AppShellComponent, SubscriptionBannerComponent],
  template: `
    <app-shell title="Shop Portal" [email]="auth.user()?.email ?? ''" [navItems]="navItems" (logout)="auth.logout()">
      <app-subscription-banner />
      <router-outlet />
    </app-shell>
  `,
  styles: [
    `
      /* This is the routed component <app-shell> sits inside. Without an
         explicit height here, it has no defined height of its own, so a
         page that's taller than the viewport (e.g. Billing) can push this
         element — and the whole document — past 100vh, dragging the
         sidebar along when the page scrolls instead of scrolling only
         <app-shell>'s own internal content area. */
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class ShopkeeperLayoutComponent implements OnInit, OnDestroy {
  constructor(
    public readonly auth: AuthService,
    private readonly alerts: OrderAlertsService,
    private readonly status: SubscriptionStatusService,
    private readonly router: Router,
  ) {
    effect(() => {
      // Order alerts only make sense while the shop can actually take orders.
      if (this.status.level() === 'FULL') this.alerts.start();
      else this.alerts.stop();
    });
    effect(() => {
      // Suspended while another page is open (or the state just changed): go to Billing.
      if (this.status.suspended() && !this.router.url.startsWith('/shop/billing')) {
        void this.router.navigate(['/shop/billing']);
      }
    });
  }

  get navItems(): ShellNavItem[] {
    return this.status.suspended() ? LOCKED_NAV : FULL_NAV;
  }

  /**
   * Belt-and-suspenders for the shell's own height:100vh/overflow:hidden:
   * locks the *document* to the viewport too, only while this shell-based
   * layout is mounted, so a tall page (e.g. Billing) can never grow the
   * page itself and drag the sidebar into the scroll. Off again on
   * navigation away, e.g. to /login, which legitimately needs page scroll.
   */
  ngOnInit(): void {
    this.status.start();
    document.body.classList.add('shell-locked');
  }

  ngOnDestroy(): void {
    this.alerts.stop();
    this.status.stop();
    document.body.classList.remove('shell-locked');
  }
}
