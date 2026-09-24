import { Component, OnInit, computed, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
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
import { t } from '../../core/i18n/i18n';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

const EVENT_META: Record<
  NotificationEventType,
  { label: string; icon: string; severity: Severity }
> = {
  UPLOAD_RECEIVED: { get label() { return t('notifications.document_uploaded'); }, icon: 'pi pi-upload', severity: 'info' },
  PRINT_QUEUED: { get label() { return t('common.pending'); }, icon: 'pi pi-clock', severity: 'info' },
  PRINT_COMPLETED: { get label() { return t('notifications.print_completed'); }, icon: 'pi pi-check-circle', severity: 'success' },
  PRINT_FAILED: { get label() { return t('notifications.print_failed'); }, icon: 'pi pi-times-circle', severity: 'danger' },
  SUBSCRIPTION_RENEWAL_REMINDER: { get label() { return t('notifications.renewal_reminder'); }, icon: 'pi pi-calendar', severity: 'info' },
  SUBSCRIPTION_TRIAL_ENDING: { get label() { return t('notifications.trial_ending'); }, icon: 'pi pi-clock', severity: 'info' },
  SUBSCRIPTION_PAYMENT_FAILED: { get label() { return t('notifications.payment_failed'); }, icon: 'pi pi-exclamation-triangle', severity: 'warn' },
  SUBSCRIPTION_GRACE_REMINDER: { get label() { return t('notifications.payment_reminder'); }, icon: 'pi pi-bell', severity: 'warn' },
  SUBSCRIPTION_FINAL_WARNING: { get label() { return t('notifications.final_warning'); }, icon: 'pi pi-exclamation-circle', severity: 'danger' },
  SUBSCRIPTION_PAST_DUE: { get label() { return t('notifications.payment_overdue'); }, icon: 'pi pi-exclamation-circle', severity: 'danger' },
  SUBSCRIPTION_SUSPENDED: { get label() { return t('notifications.shop_suspended'); }, icon: 'pi pi-lock', severity: 'danger' },
  SUBSCRIPTION_PAID: { get label() { return t('notifications.payment_received'); }, icon: 'pi pi-check-circle', severity: 'success' },
  SUBSCRIPTION_REACTIVATED: { get label() { return t('notifications.shop_reactivated'); }, icon: 'pi pi-lock-open', severity: 'success' },
  SUBSCRIPTION_CANCELLED: { get label() { return t('notifications.subscription_cancelled'); }, icon: 'pi pi-ban', severity: 'secondary' },
};

/** SRS §20: the in-application notification baseline's read surface (upload/queue/complete/fail events). */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [AppDatePipe, TranslatePipe, CommonModule, TableModule, TagModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ 'common.notifications' | translate }}</h1>
        <p class="page-subtitle m-0">{{ 'notifications.document_and_print_job_events_for' | translate }}</p>
      </div>
      <div class="page-actions">
        <p-iconfield>
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="text" [placeholder]="'common.search' | translate" (input)="dt.filterGlobal($any($event.target).value, 'contains')" />
        </p-iconfield>
        <p-button
          [label]="'common.clear' | translate"
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
          <th style="width: 60%" pSortableColumn="eventLabel">{{ 'notifications.event' | translate }} <p-sortIcon field="eventLabel" /></th>
          <th style="width: 40%" pSortableColumn="createdAt">{{ 'common.when' | translate }} <p-sortIcon field="createdAt" /></th>
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
          <td data-label="When">{{ n.createdAt | appDate: 'medium' }}</td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="2">
            <div class="table-empty"><i class="pi pi-bell"></i><span>{{ 'notifications.no_notifications_yet' | translate }}</span></div>
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
      get message() { return t('notifications.permanently_delete_all_notification_s_this', { notifications: this.notifications().length }); },
      get header() { return t('notifications.clear_notifications'); },
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.shopkeeperService.clearNotifications().subscribe(() => {
          this.messageService.add({ severity: 'success', get summary() { return t('notifications.notifications_cleared'); } });
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
