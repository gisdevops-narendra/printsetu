import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { RoleName, Shop, UserRow } from '../../core/models/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, DialogModule, InputTextModule, SelectModule, TagModule],
  template: `
    <div class="flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="page-title">Users</h1>
        <p class="page-subtitle m-0">Admin and shopkeeper accounts. Credentials are managed by Keycloak.</p>
      </div>
      <p-button label="New User" icon="pi pi-plus" (onClick)="openCreate()" />
    </div>

    <p-table [value]="users()" [loading]="loading()" styleClass="surface-card-flat" [paginator]="true" [rows]="10">
      <ng-template pTemplate="header">
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Shop</th>
          <th>Status</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-user>
        <tr>
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td>{{ user.role.name }}</td>
          <td>{{ user.shop?.name || '—' }}</td>
          <td><p-tag [value]="user.status" [severity]="user.status === 'ACTIVE' ? 'success' : 'danger'" /></td>
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
        <tr><td colspan="6" class="text-center text-color-secondary p-4">No users yet.</td></tr>
      </ng-template>
    </p-table>

    <p-dialog header="New User" [(visible)]="createVisible" [modal]="true" [style]="{ width: '460px' }">
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
          <label>Role</label>
          <p-select [options]="roles" [(ngModel)]="form.role" />
        </div>
        @if (form.role === 'SHOPKEEPER') {
          <div class="flex flex-column gap-2">
            <label>Shop</label>
            <p-select [options]="shops()" optionLabel="name" optionValue="id" [(ngModel)]="form.shopId" placeholder="Select a shop" />
          </div>
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="createVisible = false" />
        <p-button label="Create" (onClick)="submitCreate()" [loading]="saving()" />
      </ng-template>
    </p-dialog>
  `,
})
export class UsersComponent implements OnInit {
  users = signal<UserRow[]>([]);
  shops = signal<Shop[]>([]);
  loading = signal(true);
  saving = signal(false);
  createVisible = false;
  roles: RoleName[] = ['ADMIN', 'SHOPKEEPER'];

  form: { name: string; email: string; mobile: string; role: RoleName; shopId?: string } = {
    name: '',
    email: '',
    mobile: '',
    role: 'SHOPKEEPER',
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
    this.form = { name: '', email: '', mobile: '', role: 'SHOPKEEPER' };
    this.createVisible = true;
  }

  submitCreate(): void {
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
