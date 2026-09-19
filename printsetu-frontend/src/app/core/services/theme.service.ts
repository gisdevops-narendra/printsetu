import { Injectable, signal } from '@angular/core';

const KEY = 'printsetu.theme';
/** PrimeNG's `darkModeSelector` (see app.config.ts) and the global dark rules in styles.scss key off this class. */
const DARK_CLASS = 'app-dark';

/** Light / dark mode, remembered per browser. Light is the default. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(this.read());
  /**
   * Dark mode is only applied while a portal (admin / shop) is on screen. The login page
   * and the public customer order page have no toggle and are designed light-only, so a
   * stored "dark" choice must not leak onto them.
   */
  private attached = false;

  attach(): void {
    this.attached = true;
    this.apply(this.dark());
  }

  detach(): void {
    this.attached = false;
    this.apply(false);
  }

  toggle(): void {
    this.set(!this.dark());
  }

  set(dark: boolean): void {
    this.dark.set(dark);
    this.apply(this.attached && dark);
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light');
    } catch {
      // private mode / blocked storage: the choice just won't survive a reload
    }
  }

  private read(): boolean {
    try {
      return localStorage.getItem(KEY) === 'dark';
    } catch {
      return false;
    }
  }

  private apply(dark: boolean): void {
    document.documentElement.classList.toggle(DARK_CLASS, dark);
  }
}
