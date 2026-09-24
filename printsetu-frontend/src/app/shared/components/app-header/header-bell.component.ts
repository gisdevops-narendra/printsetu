import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HdrDropdownComponent } from './hdr-dropdown.component';
import { HeaderAlert, timeAgo } from './header.models';
import { t } from '../../../core/i18n/i18n';

/**
 * Notification bell with an unread badge and a dropdown of recent items.
 * "Unread" is anything newer than `newSince` (epoch ms); the owner clears it by
 * handling `seen`, which fires when the dropdown closes so items stay
 * highlighted while the user is reading them.
 */
@Component({
  selector: 'app-header-bell',
  standalone: true,
  imports: [TranslatePipe, CommonModule, RouterLink, HdrDropdownComponent],
  template: `
    <app-hdr-dropdown [label]="'common.notifications' | translate" triggerClass="icon-btn" width="24rem" (openChange)="onOpenChange($event)">
      <span trigger class="bell">
        <i class="pi pi-bell"></i>
        @if (unread > 0) {
          <span class="bell__badge" [attr.aria-label]="'shared.unread_count' | translate: { count: unread }">{{ unread > 9 ? '9+' : unread }}</span>
        }
      </span>
      <div class="head">
        <strong>{{ heading }}</strong>
        @if (unread > 0) {
          <span class="head__count">{{ 'shared.new' | translate: { unread: unread } }}</span>
        }
      </div>
      @if (alerts.length) {
        <ul class="list">
          @for (a of alerts; track a.id) {
            <li>
              <a class="item" [class.item--new]="isNew(a)" [routerLink]="a.link ?? viewAllLink">
                <span class="item__icon" [ngClass]="'tone--' + a.tone"><i [class]="a.icon"></i></span>
                <span class="item__body">
                  <span class="item__title">{{ a.title }}</span>
                  @if (a.detail) {
                    <span class="item__detail">{{ a.detail }}</span>
                  }
                </span>
                <span class="item__time">{{ ago(a.at) }}</span>
              </a>
            </li>
          }
        </ul>
      } @else {
        <div class="empty"><i class="pi pi-bell-slash"></i><span>{{ emptyText }}</span></div>
      }
      @if (viewAllLink) {
        <a class="foot" [routerLink]="viewAllLink">{{ viewAllLabel }} <i class="pi pi-arrow-right"></i></a>
      }
    </app-hdr-dropdown>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .bell {
        position: relative;
        display: inline-flex;
        font-size: 1.05rem;
      }
      .bell__badge {
        position: absolute;
        top: -0.55rem;
        right: -0.6rem;
        min-width: 1.05rem;
        height: 1.05rem;
        padding: 0 0.28rem;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        font-size: 0.625rem;
        font-weight: 800;
        line-height: 1.05rem;
        text-align: center;
        box-shadow: 0 0 0 2px var(--hdr-bg-solid);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.875rem 1rem 0.625rem;
        font-size: 0.9375rem;
      }
      .head__count {
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .list {
        margin: 0;
        padding: 0 0.375rem;
        list-style: none;
      }
      .item {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.625rem;
        border-radius: 12px;
        color: inherit;
        text-decoration: none;
      }
      .item:hover {
        background: var(--hdr-hover);
      }
      .item--new {
        background: color-mix(in srgb, var(--tone-info-bg) 55%, transparent);
      }
      .item__icon {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 10px;
        font-size: 0.875rem;
      }
      .item__body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .item__title {
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1.35;
      }
      .item__detail {
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--hdr-muted);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .item__time {
        flex: none;
        font-size: 0.6875rem;
        color: var(--hdr-muted);
        white-space: nowrap;
        padding-top: 0.125rem;
      }
      .tone--ok {
        background: var(--tone-ok-bg);
        color: var(--tone-ok-fg);
      }
      .tone--info {
        background: var(--tone-info-bg);
        color: var(--tone-info-fg);
      }
      .tone--warn {
        background: var(--tone-warn-bg);
        color: var(--tone-warn-fg);
      }
      .tone--bad {
        background: var(--tone-bad-bg);
        color: var(--tone-bad-fg);
      }
      .tone--muted {
        background: var(--tone-muted-bg);
        color: var(--tone-muted-fg);
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        padding: 2rem 1rem;
        color: var(--hdr-muted);
        font-size: 0.8125rem;
        text-align: center;
      }
      .empty i {
        font-size: 1.5rem;
        opacity: 0.6;
      }
      .foot {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        margin-top: 0.375rem;
        padding: 0.75rem;
        border-top: 1px solid var(--hdr-border);
        color: var(--accent-text-600);
        font-size: 0.8125rem;
        font-weight: 700;
        text-decoration: none;
      }
      .foot:hover {
        background: var(--hdr-hover);
        border-radius: 0 0 16px 16px;
      }
    `,
  ],
})
export class HeaderBellComponent {
  @Input() alerts: HeaderAlert[] = [];
  @Input() unread = 0;
  /** Epoch ms of the last time the owner looked; items newer than this are highlighted. */
  @Input() newSince = 0;
  @Input() heading = t('common.notifications');
  @Input() emptyText = t('shared.youre_all_caught_up');
  @Input() viewAllLink = '';
  @Input() viewAllLabel = t('shared.view_all');
  @Output() seen = new EventEmitter<void>();

  isNew(a: HeaderAlert): boolean {
    return new Date(a.at).getTime() > this.newSince;
  }

  ago(iso: string): string {
    return timeAgo(iso);
  }

  onOpenChange(open: boolean): void {
    if (!open && this.unread > 0) this.seen.emit();
  }
}
