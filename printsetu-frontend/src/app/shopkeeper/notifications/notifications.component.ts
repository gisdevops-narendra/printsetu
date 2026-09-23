import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { NotificationEventType, NotificationRow } from '../../core/models/models';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const EVENT_META: Record<
  NotificationEventType,
  { label: string; icon: string; severity: Severity }
> = {
  UPLOAD_RECEIVED: { label: 'Document uploaded', icon: 'pi pi-upload', severity: 'info' },
  PRINT_QUEUED: { label: 'Pending', icon: 'pi pi-clock', severity: 'info' },
  PRINT_COMPLETED: { label: 'Print completed', icon: 'pi pi-check-circle', severity: 'success' },
  PRINT_FAILED: { label: 'Print failed', icon: 'pi pi-times-circle', severity: 'danger' },
  SUBSCRIPTION_RENEWAL_REMINDER: { label: 'Renewal reminder', icon: 'pi pi-calendar', severity: 'info' },
  SUBSCRIPTION_TRIAL_ENDING: { label: 'Trial ending', icon: 'pi pi-clock', severity: 'info' },
  SUBSCRIPTION_PAYMENT_FAILED: { label: 'Payment failed', icon: 'pi pi-exclamation-triangle', severity: 'warn' },
  SUBSCRIPTION_GRACE_REMINDER: { label: 'Payment reminder', icon: 'pi pi-bell', severity: 'warn' },
  SUBSCRIPTION_FINAL_WARNING: { label: 'Final warning', icon: 'pi pi-exclamation-circle', severity: 'danger' },
  SUBSCRIPTION_PAST_DUE: { label: 'Payment overdue', icon: 'pi pi-exclamation-circle', severity: 'danger' },
  SUBSCRIPTION_SUSPENDED: { label: 'Shop suspended', icon: 'pi pi-lock', severity: 'danger' },
  SUBSCRIPTION_PAID: { label: 'Payment received', icon: 'pi pi-check-circle', severity: 'success' },
  SUBSCRIPTION_REACTIVATED: { label: 'Shop reactivated', icon: 'pi pi-lock-open', severity: 'success' },
  SUBSCRIPTION_CANCELLED: { label: 'Subscription cancelled', icon: 'pi pi-ban', severity: 'secondary' },
};

/** SRS §20: the in-application notification baseline's read surface (upload/queue/complete/fail events). */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Notifications</h1>
        <p class="page-subtitle m-0">Document and print-job events for your shop, most recent first.</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button
          label="Clear"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          [outlined]="true"
          [disabled]="notifications().length === 0"
          (onClick)="confirmClear()"
        />
      </div>
    </div>


    <p-table
      #dt
      [value]="enrichedNotifications()"
      [loading]="loading()"
      [globalFilterFields]="['eventLabel']"
      styleClass="surface-card-flat table-fill"
      [scrollable]="true"
      scrollHeight="flex"
      [paginator]="true"
      [rows]="20"
    >
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 60%" pSortableColumn="eventLabel">Event <p-sortIcon field="eventLabel" /></th>
          <th style="width: 40%" pSortableColumn="createdAt">When <p-sortIcon field="createdAt" /></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-n>
        <tr>
          <td data-label="Event">
            <p-tag
              [value]="meta(n.eventType).label"
              [icon]="meta(n.eventType).icon"
              [severity]="meta(n.eventType).severity"
            />
            @if (n.message) { <p class="notif-msg">{{ n.message }}</p> }
          </td>
          <td data-label="When">{{ n.createdAt | date: 'medium' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="2">
            <div class="table-empty"><i class="pi pi-bell"></i><span>No notifications yet.</span></div>
          </td>
        </tr>
      </ng-template>
    </p-table>
  `,
})
export class NotificationsComponent implements OnInit {
  notifications = signal<NotificationRow[]>([]);
  loading = signal(true);
  enrichedNotifications = computed(() =>
    this.notifications().map((n) => ({ ...n, eventLabel: this.meta(n.eventType).label })),
  );

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.shopkeeperService.notifications().subscribe((res) => {
      this.notifications.set(res.items);
      this.loading.set(false);
    });
  }

  confirmClear(): void {
    this.confirmationService.confirm({
      message: `Permanently delete all ${this.notifications().length} notification(s)? This cannot be undone.`,
      header: 'Clear notifications',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.clearNotifications().subscribe(() => {
          this.messageService.add({ severity: 'success', summary: 'Notifications cleared' });
          this.load();
        });
      },
    });
  }

  meta(eventType: NotificationEventType) {
    return (
      EVENT_META[eventType] ?? {
        label: eventType,
        icon: 'pi pi-bell',
        severity: 'secondary' as Severity,
      }
    );
  }
}
