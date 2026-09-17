import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">PrintSetu</div>
        <nav class="flex flex-column gap-1">
          @for (item of navItems; track item.route) {
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              class="nav-link"
            >
              <i [class]="item.icon"></i>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <span class="text-color-secondary">Platform Administration</span>
          <div class="flex align-items-center gap-3">
            <span class="text-sm">{{ auth.user()?.email }}</span>
            <p-button label="Logout" size="small" severity="secondary" [text]="true" (onClick)="auth.logout()" />
          </div>
        </header>
        <main class="app-shell-content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }
      .sidebar {
        width: 240px;
        flex-shrink: 0;
        background: #0f172a;
        color: #e2e8f0;
        padding: 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow-y: auto;
      }
      .brand {
        font-size: 1.25rem;
        font-weight: 700;
        color: white;
        padding: 0 0.5rem;
      }
      .nav-link {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.6rem 0.75rem;
        border-radius: 8px;
        color: #cbd5e1;
        text-decoration: none;
        font-size: 0.9rem;
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .nav-link.active {
        background: var(--p-primary-600);
        color: white;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .topbar {
        height: 64px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 2rem;
        background: white;
        border-bottom: 1px solid #e2e8f0;
      }
    `,
  ],
})
export class AdminLayoutComponent {
  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-th-large', route: '/admin/dashboard' },
    { label: 'Shops', icon: 'pi pi-building', route: '/admin/shops' },
    { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
    { label: 'Printers', icon: 'pi pi-print', route: '/admin/printers' },
    { label: 'Print History', icon: 'pi pi-history', route: '/admin/print-history' },
    { label: 'Audit Logs', icon: 'pi pi-shield', route: '/admin/audit-logs' },
  ];

  constructor(public readonly auth: AuthService) {}
}
