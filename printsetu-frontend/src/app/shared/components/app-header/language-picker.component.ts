import { Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LANGUAGES, Lang, LanguageService } from '../../../core/i18n/language.service';

/**
 * Language dropdown shown next to the light/dark toggle (and on the sign-in and
 * customer pages). A native <select> so it works well on phones.
 */
@Component({
  selector: 'app-language-picker',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <label class="lang icon-btn" [title]="'common.language' | translate">
      <i class="pi pi-globe" aria-hidden="true"></i>
      <span class="lang__short" aria-hidden="true">{{ language.option().short }}</span>
      <select
        class="lang__select"
        [attr.aria-label]="'common.language' | translate"
        [value]="language.current()"
        (change)="choose($any($event.target).value)"
      >
        @for (l of languages; track l.code) {
          <option [value]="l.code" [selected]="l.code === language.current()">{{ l.nativeName }}</option>
        }
      </select>
    </label>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .lang {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        width: auto;
        padding: 0 0.6rem;
        cursor: pointer;
      }
      .lang__short {
        font-size: 0.75rem;
        font-weight: 700;
        line-height: 1;
      }
      /* The real <select> covers the button, so a click/tap opens the native list. */
      .lang__select {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
        font: inherit;
      }
      .lang:focus-within {
        outline: 2px solid var(--accent-text-500);
        outline-offset: 2px;
      }
    `,
  ],
})
export class LanguagePickerComponent {
  readonly language = inject(LanguageService);
  readonly languages = LANGUAGES;

  choose(code: string): void {
    this.language.set(code as Lang);
  }
}
