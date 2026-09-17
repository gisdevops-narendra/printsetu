import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shopkeeper-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ButtonModule],
  template: `
    <div class="flex flex-column min-h-screen">
      <header class="topbar">
        <span class="brand">PrintSetu</span>
        <nav class="flex gap-4">
          <a routerLink="/shop/queue" routerLinkActive="active" class="nav-link">Print Queue</a>
          <a routerLink="/shop/history" routerLinkActive="active" class="nav-link">History</a>
          <a routerLink="/shop/notifications" routerLinkActive="active" class="nav-link"
            >Notifications</a
          >
          <a routerLink="/shop/profile" routerLinkActive="active" class="nav-link">Shop Profile</a>
        </nav>
        <div class="flex align-items-center gap-3">
          <span class="text-sm text-color-secondary">{{ auth.user()?.email }}</span>
          <p-button
            label="Logout"
            size="small"
            severity="secondary"
            [text]="true"
            (onClick)="auth.logout()"
          />
        </div>
      </header>
      <main class="app-shell-content flex-1">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .topbar {
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 2rem;
        background: white;
        border-bottom: 1px solid #e2e8f0;
        gap: 2rem;
      }
      .brand {
        font-weight: 700;
        font-size: 1.15rem;
        color: var(--p-primary-600);
      }
      .nav-link {
        text-decoration: none;
        color: #64748b;
        font-weight: 500;
        padding: 0.4rem 0;
        border-bottom: 2px solid transparent;
      }
      .nav-link.active {
        color: var(--p-primary-600);
        border-bottom-color: var(--p-primary-600);
      }
    `,
  ],
})
export class ShopkeeperLayoutComponent {
  constructor(public readonly auth: AuthService) {}
}
