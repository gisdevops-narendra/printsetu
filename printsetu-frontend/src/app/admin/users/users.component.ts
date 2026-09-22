import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { Shop, UserRow } from '../../core/models/models';
import { EllipsisDirective } from '../../shared/directives/ellipsis.directive';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    TagModule,
    EllipsisDirective,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Users</h1>
        <p class="page-subtitle m-0">Shop user accounts. There is one admin for the whole platform; every user created here is a shop user. Credentials are managed by Keycloak.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button label="New Shop User" icon="pi pi-plus" (onClick)="openCreate()" />
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
          <th style="width: 15%" pSortableColumn="name">Name <p-sortIcon field="name" /></th>
          <th style="width: 20%" pSortableColumn="email">Email <p-sortIcon field="email" /></th>
          <th style="width: 19%">Password</th>
          <th style="width: 9%" pSortableColumn="role.name">Role <p-sortIcon field="role.name" /></th>
          <th style="width: 13%" pSortableColumn="shop.name">Shop <p-sortIcon field="shop.name" /></th>
          <th style="width: 9%" pSortableColumn="status">Status <p-sortIcon field="status" /></th>
          <th style="width: 12%"></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-user>
        <tr>
          <td data-label="Name">
            <span appEllipsis #nameRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="nameRef.isTruncated">{{ user.name }}</span></span
            >
          </td>
          <td data-label="Email">
            <span appEllipsis #emailRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="emailRef.isTruncated">{{ user.email }}</span></span
            >
          </td>
          <td data-label="Password">
            @if (user.currentPassword) {
              <div class="pw-cell">
                <span class="pw-cell__value">{{ isRevealed(user.id) ? user.currentPassword : '••••••••••' }}</span>
                <button
                  type="button"
                  class="pw-cell__toggle"
                  (click)="toggleReveal(user.id)"
                  [attr.aria-label]="isRevealed(user.id) ? 'Hide password' : 'Show password'"
                >
                  <i class="pi" [ngClass]="isRevealed(user.id) ? 'pi-eye-slash' : 'pi-eye'"></i>
                </button>
                @if (user.mustChangePassword) {
                  <span class="pw-cell__badge">Temporary</span>
                }
              </div>
            } @else {
              <span class="text-color-secondary">Changed by user</span>
            }
          </td>
          <td data-label="Role">{{ user.role.name }}</td>
          <td data-label="Shop">
            <span appEllipsis #shopRef="appEllipsis"
              ><span class="cell-ellipsis__text" [class.is-truncated]="shopRef.isTruncated">{{ user.shop?.name || '—' }}</span></span
            >
          </td>
          <td data-label="Status"><p-tag [value]="user.status" [severity]="user.status === 'ACTIVE' ? 'success' : 'danger'" /></td>
          <td class="text-right">
            <p-button
              [label]="user.status === 'ACTIVE' ? 'Disable' : 'Enable'"
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
            <div class="table-empty"><i class="pi pi-users"></i><span>No users yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog header="New Shop User" [(visible)]="createVisible" [modal]="true" [style]="{ width: '460px' }">
      <div class="flex flex-column gap-3">
        <div class="flex flex-column gap-2">
          <label>Full name</label>
          <input pInputText [(ngModel)]="form.name" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Email</label>
          <input pInputText [(ngModel)]="form.email" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Mobile</label>
          <input pInputText [(ngModel)]="form.mobile" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Shop</label>
          <p-select [options]="shops()" optionLabel="name" optionValue="id" [(ngModel)]="form.shopId" placeholder="Select a shop" appendTo="body" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="createVisible = false" />
        <p-button label="Create" (onClick)="submitCreate()" [loading]="saving()" />
      </ng-template>
    </p-dialog>
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
  shops = signal<Shop[]>([]);
  loading = signal(true);
  saving = signal(false);
  createVisible = false;
  private revealedIds = signal<ReadonlySet<string>>(new Set());

  form: { name: string; email: string; mobile: string; shopId: string } = {
    name: '',
    email: '',
    mobile: '',
    shopId: '',
  };

  constructor(
    private readonly adminService: AdminService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.adminService.listShops().subscribe((res) => this.shops.set(res.items));
  }

  load(): void {
    this.loading.set(true);
    this.adminService.listUsers().subscribe((users) => {
      this.users.set(users);
      this.loading.set(false);
    });
  }

  openCreate(): void {
    this.form = { name: '', email: '', mobile: '', shopId: '' };
    this.createVisible = true;
  }

  submitCreate(): void {
    if (!this.form.name.trim() || !this.form.email.trim() || !this.form.shopId) {
      this.messageService.add({ severity: 'warn', summary: 'Name, email and shop are required' });
      return;
    }
    this.saving.set(true);
    this.adminService.createUser(this.form).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.createVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: 'User created',
          detail: `Temporary password: ${user.temporaryPassword} (share this securely; they'll be asked to change it on first login)`,
          life: 15000,
        });
        this.load();
      },
      error: () => this.saving.set(false),
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
      header: 'Confirm',
      icon: 'pi pi-exclamation-triangle',
      accept: () => this.adminService.setUserStatus(user.id, next).subscribe(() => this.load()),
    });
  }
}
