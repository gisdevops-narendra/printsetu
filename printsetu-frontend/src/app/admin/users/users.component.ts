import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TagModule } from 'primeng/tag';
import { ConfirmationService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { UserRow } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';
import { t } from '../../core/i18n/i18n';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [TranslatePipe, 
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TagModule,
    EllipsisDirective,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'common.users' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'adminUsers.shop_user_accounts_each_is_created' | translate }}</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" [placeholder]="'common.search' | translate" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
      </div>
    </div>


    <p-table
      #dt
      [tableStyle]="{ 'min-width': '42rem' }"
      [value]="users()"
      [loading]="loading()"
      [globalFilterFields]="['name', 'email', 'role.name', 'shop.name', 'status']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="10"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 15%" pSortableColumn="name">{{ 'common.name' | translate }} <p-sortIcon field="name" /></th>
          <th style="width: 20%" pSortableColumn="email">{{ 'common.email' | translate }} <p-sortIcon field="email" /></th>
          <th style="width: 19%">{{ 'adminUsers.password' | translate }}</th>
          <th style="width: 9%" pSortableColumn="role.name">{{ 'adminUsers.role' | translate }} <p-sortIcon field="role.name" /></th>
          <th style="width: 13%" pSortableColumn="shop.name">{{ 'common.shop' | translate }} <p-sortIcon field="shop.name" /></th>
          <th style="width: 9%" pSortableColumn="status">{{ 'common.status' | translate }} <p-sortIcon field="status" /></th>
          <th style="width: 12%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-user>
        <tr>
          <td [attr.data-label]="'common.name' | translate">
            <span appEllipsis #nameRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="nameRef.isTruncated">{{ user.name }}</span></span
            >
          </td>
          <td [attr.data-label]="'common.email' | translate">
            <span appEllipsis #emailRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="emailRef.isTruncated">{{ user.email }}</span></span
            >
          </td>
          <td [attr.data-label]="'adminUsers.password' | translate">
            @if (user.currentPassword) {
              <div class="pw-cell">
                <span class="pw-cell__value">{{ isRevealed(user.id) ? user.currentPassword : '••••••••••' }}</span>
                <button
                  type="button"
                  class="pw-cell__toggle"
                  (click)="toggleReveal(user.id)"
                  [attr.aria-label]="isRevealed(user.id) ? ('adminUsers.hide_password' | translate) : ('adminUsers.show_password' | translate)"
                >
                  <i class="pi" [ngClass]="isRevealed(user.id) ? 'pi-eye-slash' : 'pi-eye'"></i>
                </button>
                @if (user.mustChangePassword) {
                  <span class="pw-cell__badge">{{ 'adminUsers.temporary' | translate }}</span>
                }
              </div>
            } @else {
              <span class="text-color-secondary">{{ 'adminUsers.set_by_user' | translate }}</span>
            }
          </td>
          <td [attr.data-label]="'adminUsers.role' | translate">{{ user.role.name }}</td>
          <td [attr.data-label]="'common.shop' | translate">
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ user.shop?.name || '—' }}</span></span
            >
          </td>
          <td [attr.data-label]="'common.status' | translate"><p-tag [value]="user.status" [severity]="user.status === 'ACTIVE' ? 'success' : 'danger'" /></td>
          <td class="text-right">
            <p-button
              [label]="user.status === 'ACTIVE' ? ('adminUsers.disable' | translate) : ('adminUsers.enable' | translate)"
              size="small"
              [text]="true"
              [severity]="user.status === 'ACTIVE' ? 'danger' : 'success'"
              (onClick)="toggleStatus(user)"
            />
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="7">
            <div class="table-empty"><i class="pi pi-users"></i><span>{{ 'adminUsers.no_users_yet' | translate }}</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>

  `,
  styles: [
    `
      .pw-cell {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        min-width: 0;
      }
      .pw-cell__value {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        font-size: 0.8125rem;
        letter-spacing: 0.02em;
        color: #334155;
      }
      .pw-cell__toggle {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .pw-cell__toggle:hover {
        background: #eef2ff;
        color: var(--p-primary-600, #4f46e5);
      }
      .pw-cell__toggle:focus-visible {
        outline: 2px solid var(--p-primary-400, #818cf8);
        outline-offset: 1px;
      }
      .pw-cell__toggle i {
        font-size: 0.8125rem;
      }
      .pw-cell__badge {
        flex: 0 0 auto;
        padding: 0.1875rem 0.5rem;
        border-radius: 999px;
        background: #fffbeb;
        color: #b45309;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
    `,
  ],
})
export class UsersComponent implements OnInit {
  users = signal<UserRow[]>([]);
  loading = signal(true);
  private revealedIds = signal<ReadonlySet<string>>(new Set());

  constructor(
    private readonly adminService: AdminService,
    private readonly confirmationService: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.adminService.listUsers().subscribe((users) => {
      this.users.set(users);
      this.loading.set(false);
    });
  }

  isRevealed(userId: string): boolean {
    return this.revealedIds().has(userId);
  }

  toggleReveal(userId: string): void {
    const next = new Set(this.revealedIds());
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    this.revealedIds.set(next);
  }

  toggleStatus(user: UserRow): void {
    const next = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    this.confirmationService.confirm({
      message: `${next === 'ACTIVE' ? 'Enable' : 'Disable'} ${user.email}?`,
      get header() { return t('common.confirm'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => this.adminService.setUserStatus(user.id, next).subscribe(() => this.load()),
    });
  }
}
