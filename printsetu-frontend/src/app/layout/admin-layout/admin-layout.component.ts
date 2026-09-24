import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AppShellComponent, ShellNavItem } from '../../shared/components/app-shell/app-shell.component';
import { AdminHeaderComponent } from './admin-header.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, AppShellComponent, AdminHeaderComponent],
  template: `
    <app-shell [navItems]="navItems">
      <app-admin-header shellHeader [navItems]="navItems" />
      <router-outlet />
    </app-shell>
  `,
  styles: [
    `
      /* See the identical rule in ShopkeeperLayoutComponent: without this,
         a tall page can push the whole document past 100vh and drag the
         sidebar into the scroll instead of only <app-shell>'s own content
         area scrolling. */
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private readonly theme = inject(ThemeService);

  navItems: ShellNavItem[] = [
    { label: 'Dashboard', icon: 'pi pi-th-large', route: '/admin/dashboard' },
    { label: 'Shops', icon: 'pi pi-building', route: '/admin/shops' },
    { label: 'Subscriptions', icon: 'pi pi-wallet', route: '/admin/subscriptions' },
    { label: 'Users', icon: 'pi pi-users', route: '/admin/users' },
    { label: 'Printers', icon: 'pi pi-print', route: '/admin/printers' },
    { label: 'Print History', icon: 'pi pi-history', route: '/admin/print-history' },
    { label: 'Activity Log', icon: 'pi pi-shield', route: '/admin/audit-logs' },
  ];

  /**
   * Belt-and-suspenders for the shell's own height:100vh/overflow:hidden:
   * locks the *document* to the viewport too, only while this shell-based
   * layout is mounted, so a tall page can never grow the page itself and
   * drag the sidebar into the scroll. Off again on navigation away (e.g. to
   * a route that legitimately needs page-level scroll, like /login).
   */
  ngOnInit(): void {
    document.body.classList.add('shell-locked');
    this.theme.attach();
  }

  ngOnDestroy(): void {
    document.body.classList.remove('shell-locked');
    this.theme.detach();
  }
}
