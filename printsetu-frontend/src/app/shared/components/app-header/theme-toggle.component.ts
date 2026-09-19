import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';

/** Sun/moon button that flips light and dark mode. */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      class="icon-btn"
      [attr.aria-pressed]="theme.dark()"
      [attr.aria-label]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
      [attr.title]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
      (click)="theme.toggle()"
    >
      <i class="pi" [class.pi-moon]="!theme.dark()" [class.pi-sun]="theme.dark()"></i>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
    `,
  ],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
