import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HdrDropdownComponent } from './hdr-dropdown.component';
import { HeaderMenuItem } from './header.models';
import { ThemeService } from '../../../core/services/theme.service';

/** Avatar + name button that opens the account menu (links + sign out). */
@Component({
  selector: 'app-header-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, HdrDropdownComponent],
  template: `
    <app-hdr-dropdown label="Account menu" triggerClass="profile-btn" width="17rem">
      <span trigger class="who">
        <span class="avatar">{{ initials() }}</span>
        <span class="who__text">
          <span class="who__name">{{ name || email }}</span>
          <span class="who__role">{{ roleLabel }}</span>
        </span>
        <i class="pi pi-chevron-down who__chev"></i>
      </span>

      <div class="card">
        <span class="avatar avatar--lg">{{ initials() }}</span>
        <div class="card__text">
          <strong>{{ name || email }}</strong>
          <span>{{ email }}</span>
        </div>
      </div>
      <nav class="menu">
        @for (item of items; track item.route) {
          <a class="menu__item" [routerLink]="item.route"><i [class]="item.icon"></i>{{ item.label }}</a>
        }
      </nav>
      <div class="menu menu--foot">
        <button type="button" class="menu__item" role="switch" [attr.aria-checked]="theme.dark()" (click)="theme.toggle()">
          <i class="pi" [class.pi-moon]="!theme.dark()" [class.pi-sun]="theme.dark()"></i>
          <span class="menu__grow">Dark mode</span>
          <span class="pill" [class.pill--on]="theme.dark()">{{ theme.dark() ? 'On' : 'Off' }}</span>
        </button>
        <button type="button" class="menu__item menu__item--danger" data-close (click)="logout.emit()">
          <i class="pi pi-sign-out"></i>Sign out
        </button>
      </div>
    </app-hdr-dropdown>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .who {
        display: inline-flex;
        align-items: center;
        gap: 0.625rem;
        min-width: 0;
      }
      .avatar {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.125rem;
        height: 2.125rem;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--p-primary-500), var(--p-primary-700));
        color: #fff;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .avatar--lg {
        width: 2.75rem;
        height: 2.75rem;
        font-size: 0.9375rem;
      }
      .who__text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        min-width: 0;
        line-height: 1.2;
      }
      .who__name {
        max-width: 9rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .who__role {
        font-size: 0.6875rem;
        color: var(--hdr-muted);
      }
      .who__chev {
        font-size: 0.6875rem;
        color: var(--hdr-muted);
      }
      .card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        border-bottom: 1px solid var(--hdr-border);
      }
      .card__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 0.125rem;
      }
      .card__text strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
      }
      .card__text span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.75rem;
        color: var(--hdr-muted);
      }
      .menu {
        display: flex;
        flex-direction: column;
        padding: 0.375rem;
      }
      .menu--foot {
        border-top: 1px solid var(--hdr-border);
      }
      .menu__item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: 0;
        border-radius: 10px;
        background: none;
        color: inherit;
        font: inherit;
        font-size: 0.875rem;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
      }
      .menu__item i {
        width: 1rem;
        color: var(--hdr-muted);
      }
      .menu__item:hover {
        background: var(--hdr-hover);
      }
      .menu__grow {
        flex: 1;
      }
      .pill {
        padding: 0.05rem 0.5rem;
        border-radius: 999px;
        background: var(--tone-muted-bg);
        color: var(--tone-muted-fg);
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .pill--on {
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      .menu__item--danger,
      .menu__item--danger i {
        color: #dc2626;
      }
      @media (max-width: 899px) {
        .who__text,
        .who__chev {
          display: none;
        }
      }
    `,
  ],
})
export class HeaderProfileComponent {
  readonly theme = inject(ThemeService);
  @Input() name = '';
  @Input() email = '';
  @Input() roleLabel = '';
  @Input() items: HeaderMenuItem[] = [];
  @Output() logout = new EventEmitter<void>();

  initials(): string {
    const source = (this.name || this.email || '?').trim();
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
  }
}
