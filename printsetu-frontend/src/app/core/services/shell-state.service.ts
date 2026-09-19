import { Injectable, signal } from '@angular/core';

/**
 * Open/closed state of the mobile navigation drawer. It lives in a service (not
 * in <app-shell>) because the drawer's hamburger button sits in the page header,
 * which is projected into the shell from the portal layouts.
 */
@Injectable({ providedIn: 'root' })
export class ShellStateService {
  readonly drawerOpen = signal(false);

  toggle(): void {
    this.drawerOpen.update((open) => !open);
  }

  close(): void {
    this.drawerOpen.set(false);
  }
}
