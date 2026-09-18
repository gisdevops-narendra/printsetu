import { Component, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { filter } from 'rxjs';

export interface ShellNavItem {
  label: string;
  icon: string;
  route: string;
}

/**
 * Responsive application frame shared by the admin and shop portals.
 *
 * - Desktop (>= 1200px): full 240px sidebar.
 * - Tablet (768-1199px): icon-only rail, so pages keep the width they need.
 * - Mobile (< 768px): the sidebar becomes an off-canvas drawer opened from a
 *   hamburger in the top bar, closed by the scrim, Escape or navigating.
 *
 * The routed page is projected into <main class="app-shell-content"> (styled
 * in styles.scss), which is fluid: it uses the whole width that is left.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ButtonModule],
  template: `
    <div class="shell" [class.drawer-open]="drawerOpen()">
      <aside class="sidebar" id="app-sidebar" [attr.aria-hidden]="null">
        <div class="brand">
          <span class="brand__full">PrintSetu</span>
          <span class="brand__mark" aria-hidden="true">PS</span>
        </div>
        <nav class="nav">
          @for (item of navItems; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active" class="nav-link" [attr.title]="item.label">
              <i [class]="item.icon"></i>
              <span class="nav-link__label">{{ item.label }}</span>
            </a>
          }
        </nav>
      </aside>
      <div class="scrim" (click)="drawerOpen.set(false)"></div>

      <div class="main">
        <header class="topbar">
          <button type="button" class="menu-btn" (click)="drawerOpen.set(!drawerOpen())" aria-label="Toggle navigation" aria-controls="app-sidebar" [attr.aria-expanded]="drawerOpen()">
            <i class="pi" [ngClass]="drawerOpen() ? 'pi-times' : 'pi-bars'"></i>
          </button>
          <span class="topbar__title">{{ title }}</span>
          <span class="spacer"></span>
          <span class="topbar__email" [title]="email">{{ email }}</span>
          <p-button class="logout" label="Logout" icon="pi pi-sign-out" size="small" severity="secondary" [text]="true" (onClick)="logout.emit()" />
        </header>
        <main class="app-shell-content">
          <ng-content />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .shell {
        display: flex;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
      }

      /* ---------- Sidebar ---------- */
      .sidebar {
        width: 240px;
        flex: 0 0 auto;
        background: #0f172a;
        color: #e2e8f0;
        padding: 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow-y: auto;
        transition: width 0.18s ease, transform 0.22s ease;
      }
      .brand {
        font-size: 1.25rem;
        font-weight: 700;
        color: white;
        padding: 0 0.5rem;
        white-space: nowrap;
      }
      .brand__mark {
        display: none;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
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
        white-space: nowrap;
      }
      .nav-link i {
        flex: 0 0 auto;
        width: 1.1rem;
        text-align: center;
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .nav-link.active {
        background: var(--p-primary-600);
        color: white;
      }

      /* ---------- Main column / top bar ---------- */
      .main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .topbar {
        height: 64px;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0 clamp(1rem, 2vw, 2rem);
        background: white;
        border-bottom: 1px solid #e2e8f0;
      }
      .topbar__title {
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .topbar__email {
        font-size: 0.875rem;
        color: #1e293b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .menu-btn {
        display: none;
        width: 2.5rem;
        height: 2.5rem;
        flex: 0 0 auto;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        color: #334155;
        cursor: pointer;
        align-items: center;
        justify-content: center;
      }
      .scrim {
        display: none;
      }

      /* ---------- Tablet: icon rail ---------- */
      @media (max-width: 1199px) and (min-width: 768px) {
        .sidebar {
          width: 72px;
          padding: 1.25rem 0.5rem;
          align-items: stretch;
        }
        .brand {
          text-align: center;
          padding: 0;
        }
        .brand__full,
        .nav-link__label {
          display: none;
        }
        .brand__mark {
          display: block;
          font-size: 1.1rem;
        }
        .nav-link {
          justify-content: center;
          padding: 0.75rem 0;
        }
        .nav-link i {
          font-size: 1.15rem;
          width: auto;
        }
      }

      /* ---------- Mobile: off-canvas drawer ---------- */
      @media (max-width: 767px) {
        .sidebar {
          position: fixed;
          z-index: 1100;
          top: 0;
          bottom: 0;
          left: 0;
          width: min(280px, 85vw);
          transform: translateX(-100%);
          box-shadow: none;
        }
        .drawer-open .sidebar {
          transform: none;
          box-shadow: 0 0 40px rgba(2, 6, 23, 0.45);
        }
        .scrim {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 1090;
          background: rgba(15, 23, 42, 0.5);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        .drawer-open .scrim {
          opacity: 1;
          visibility: visible;
        }
        .menu-btn {
          display: inline-flex;
        }
        .topbar {
          height: 56px;
        }
        .topbar__email {
          display: none;
        }
        .logout ::ng-deep .p-button-label {
          display: none;
        }
      }
      @media (max-width: 1023px) and (min-width: 768px) {
        .topbar__email {
          max-width: 14rem;
        }
      }
    `,
  ],
})
export class AppShellComponent {
  @Input() title = '';
  @Input() email = '';
  @Input({ required: true }) navItems: ShellNavItem[] = [];
  @Output() logout = new EventEmitter<void>();

  drawerOpen = signal(false);

  constructor() {
    // Navigating from the drawer should close it.
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.drawerOpen.set(false));
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    this.drawerOpen.set(false);
  }
}
