import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AppShellComponent, ShellNavItem } from '../../shared/components/app-shell/app-shell.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, AppShellComponent],
  template: `
    <app-shell title="Platform Administration" [email]="auth.user()?.email ?? ''" [navItems]="navItems" (logout)="auth.logout()">
      <router-outlet />
    </app-shell>
  `,
})
export class AdminLayoutComponent {
  navItems: ShellNavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-th-large', route: '/admin/dashboard' },
    { label: 'Shops', icon: 'pi pi-building', route: '/admin/shops' },
    { label: 'Subscriptions', icon: 'pi pi-wallet', route: '/admin/subscriptions' },
    { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
    { label: 'Printers', icon: 'pi pi-print', route: '/admin/printers' },
    { label: 'Print History', icon: 'pi pi-history', route: '/admin/print-history' },
    { label: 'Audit Logs', icon: 'pi pi-shield', route: '/admin/audit-logs' },
  ];

  constructor(public readonly auth: AuthService) {}
}
