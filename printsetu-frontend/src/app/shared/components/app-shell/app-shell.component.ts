import { Component, HostListener, Input, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ShellStateService } from '../../../core/services/shell-state.service';

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
 * - Mobile (< 768px): the sidebar becomes an off-canvas drawer opened from the
 *   header's hamburger, closed by the scrim, Escape or navigating.
 *
 * The page header is supplied by each portal (see AdminHeaderComponent /
 * ShopHeaderComponent) and projected into the [shellHeader] slot; the routed
 * page goes into <main class="app-shell-content"> (styled in styles.scss),
 * which is fluid: it uses the whole width that is left.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="shell" [class.drawer-open]="state.drawerOpen()">
      <aside class="sidebar" id="app-sidebar" [attr.aria-hidden]="null">
        <div class="brand">
          <span class="brand__logo" aria-hidden="true"><i class="pi pi-print"></i></span>
          <span class="brand__full">PrintSetu</span>
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
      <div class="scrim" (click)="state.close()"></div>

      <div class="main">
        <ng-content select="[shellHeader]" />
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
        padding: 1.25rem 1rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        overflow-y: auto;
        border-right: 1px solid rgba(148, 163, 184, 0.12);
        transition: width 0.18s ease, transform 0.22s ease;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        font-size: 1.2rem;
        font-weight: 700;
        color: white;
        padding: 0 0.5rem;
        white-space: nowrap;
      }
      .brand__logo {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
        box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35);
        font-size: 1rem;
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

      /* ---------- Main column ---------- */
      .main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
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
          justify-content: center;
          padding: 0;
        }
        .brand__full,
        .nav-link__label {
          display: none;
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
      }
    `,
  ],
})
export class AppShellComponent implements OnDestroy {
  @Input({ required: true }) navItems: ShellNavItem[] = [];

  readonly state = inject(ShellStateService);
  private readonly navSub = inject(Router)
    // Navigating from the drawer should close it.
    .events.pipe(filter((e) => e instanceof NavigationEnd))
    .subscribe(() => this.state.close());

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    this.state.close();
  }

  ngOnDestroy(): void {
    this.navSub.unsubscribe();
    this.state.close();
  }
}
