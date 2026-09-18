import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AppShellComponent, ShellNavItem } from '../../shared/components/app-shell/app-shell.component';

@Component({
  selector: 'app-shopkeeper-layout',
  standalone: true,
  imports: [RouterOutlet, AppShellComponent],
  template: `
    <app-shell title="Shop Portal" [email]="auth.user()?.email ?? ''" [navItems]="navItems" (logout)="auth.logout()">
      <router-outlet />
    </app-shell>
  `,
})
export class ShopkeeperLayoutComponent {
  navItems: ShellNavItem[] = [
    { label: 'Print Queue', icon: 'pi pi-inbox', route: '/shop/queue' },
    { label: 'History', icon: 'pi pi-history', route: '/shop/history' },
    { label: 'Notifications', icon: 'pi pi-bell', route: '/shop/notifications' },
    { label: 'Shop Profile', icon: 'pi pi-building', route: '/shop/profile' },
    { label: 'Pricing', icon: 'pi pi-tag', route: '/shop/pricing' },
    { label: 'QR Code', icon: 'pi pi-qrcode', route: '/shop/qr' },
    { label: 'Print Agent', icon: 'pi pi-desktop', route: '/shop/print-agent' },
  ];

  constructor(public readonly auth: AuthService) {}
}
