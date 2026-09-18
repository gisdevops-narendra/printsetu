import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { NotificationEventType, NotificationRow } from '../../core/models/models';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const EVENT_META: Record<
  NotificationEventType,
  { label: string; icon: string; severity: Severity }
> = {
  UPLOAD_RECEIVED: { label: 'Document uploaded', icon: 'pi pi-upload', severity: 'info' },
  PRINT_QUEUED: { label: 'Print queued', icon: 'pi pi-clock', severity: 'info' },
  PRINT_COMPLETED: { label: 'Print completed', icon: 'pi pi-check-circle', severity: 'success' },
  PRINT_FAILED: { label: 'Print failed', icon: 'pi pi-times-circle', severity: 'danger' },
};

/** SRS §20: the in-application notification baseline's read surface (upload/queue/complete/fail events). */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, TableModule, TagModule, InputTextModule, IconFieldModule, InputIconModule],
  template: `
    <h1 class="page-title">Notifications</h1>
    <p class="page-subtitle">Document and print-job events for your shop, most recent first.</p>

    <div class="flex justify-content-end mb-3">
      <p-iconfield>
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="text" placeholder="Search" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
      </p-iconfield>
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
          <td>
            <p-tag
              [value]="meta(n.eventType).label"
              [icon]="meta(n.eventType).icon"
              [severity]="meta(n.eventType).severity"
            />
          </td>
          <td>{{ n.createdAt | date: 'medium' }}</td>
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

  constructor(private readonly shopkeeperService: ShopkeeperService) {}

  ngOnInit(): void {
    this.shopkeeperService.notifications().subscribe((res) => {
      this.notifications.set(res.items);
      this.loading.set(false);
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
