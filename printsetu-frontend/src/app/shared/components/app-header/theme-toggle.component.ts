import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ThemeService } from '../../../core/services/theme.service';

/** Sun/moon button that flips light and dark mode. */
@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <button
      type="button"
      class="icon-btn"
      [attr.aria-pressed]="theme.dark()"
      [attr.aria-label]="theme.dark() ? ('shared.switch_to_light_mode' | translate) : ('shared.switch_to_dark_mode' | translate)"
      [attr.title]="theme.dark() ? ('shared.switch_to_light_mode' | translate) : ('shared.switch_to_dark_mode' | translate)"
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
