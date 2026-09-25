import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { OrderAlertsService } from '../../core/services/order-alerts.service';
import { NotificationPrefs, OpeningHours, PrinterRow, ShopProfileResponse, ShopSettingsInfo } from '../../core/models/models';
import { timeAgo } from '../../shared/utils/browser.util';
import { t } from '../../core/i18n/i18n';

/** How the shop takes orders, prints them and gets told about them. */
@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [TranslatePipe, CommonModule, FormsModule, RouterLink, ToggleSwitchModule],
  template: `
    @for (k of [renderKey()]; track k) {
    <div class="sections">
      <!-- ---------- Order handling ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'profile.order_handling' | translate }}</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-bolt"></i></span>
          <div class="setting__text">
            <label for="auto-accept">{{ 'profile.auto_accept_orders' | translate }}</label>
            <p>{{ 'profile.confirmed_orders_go_straight_to_your' | translate }}</p>
          </div>
          <p-toggleswitch inputId="auto-accept" [ngModel]="settings.autoAcceptOrders" (ngModelChange)="onAutoAccept($event)" [disabled]="saving()" />
        </div>
        @if (settings.autoAcceptOrders) {
          <p class="callout callout--warn">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ 'profile.auto_accept_is_on_make_sure' | translate }}</span>
          </p>
        } @else {
          <p class="callout"><i class="pi pi-info-circle"></i><span>{{ 'profile.manual_mode_you_review_each_order' | translate }}</span></p>
        }
      </section>

      <!-- ---------- Online / Offline schedule ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'profile.online_offline_schedule' | translate }}</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-clock"></i></span>
          <div class="setting__text">
            <label for="auto-schedule">{{ 'profile.go_online_and_offline_automatically' | translate }}</label>
            <p>{{ 'profile.your_shop_starts_taking_orders_when' | translate }}</p>
          </div>
          <p-toggleswitch inputId="auto-schedule" [ngModel]="settings.autoSchedule" (ngModelChange)="onAutoSchedule($event)" [disabled]="saving()" />
        </div>
        @if (!hasOpenDay()) {
          <p class="callout callout--warn">
            <i class="pi pi-info-circle"></i>
            <span>{{ 'profile.set_your_shop_hours_first' | translate }} <button type="button" class="linkish" (click)="editHours.emit()">{{ 'profile.set_shop_hours' | translate }}</button></span>
          </p>
        } @else if (settings.autoSchedule) {
          <p class="callout">
            <i class="pi pi-info-circle"></i>
            <span>
              {{ 'profile.following_your_shop_hours_for_an' | translate }}
              <button type="button" class="linkish" (click)="editHours.emit()">{{ 'profile.edit_shop_hours' | translate }}</button>
            </span>
          </p>
        } @else {
          <p class="callout"><i class="pi pi-info-circle"></i><span>{{ 'profile.manual_mode_you_switch_online_offline' | translate }}</span></p>
        }
      </section>

      <!-- ---------- Notifications ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'common.notifications' | translate }}</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-volume-up"></i></span>
          <div class="setting__text">
            <label for="n-sound">{{ 'profile.new_order_sound' | translate }}</label>
            <p>{{ 'profile.a_short_chime_when_a_new' | translate }}</p>
          </div>
          <button type="button" class="test" (click)="alerts.preview()" [attr.aria-label]="'profile.play_the_sound' | translate"><i class="pi pi-play"></i></button>
          <p-toggleswitch inputId="n-sound" [ngModel]="settings.notificationPrefs.newOrderSound" (ngModelChange)="onPref('newOrderSound', $event)" [disabled]="saving()" />
        </div>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-desktop"></i></span>
          <div class="setting__text">
            <label for="n-desktop">{{ 'profile.desktop_alerts' | translate }}</label>
            <p>{{ 'profile.pop_up_notifications_when_this_tab' | translate }}</p>
          </div>
          <p-toggleswitch inputId="n-desktop" [ngModel]="settings.notificationPrefs.desktopAlerts" (ngModelChange)="onDesktop($event)" [disabled]="saving()" />
        </div>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-exclamation-triangle"></i></span>
          <div class="setting__text">
            <label for="n-fail">{{ 'profile.print_problems' | translate }}</label>
            <p>{{ 'profile.tell_me_when_the_printer_goes' | translate }}</p>
          </div>
          <p-toggleswitch inputId="n-fail" [ngModel]="settings.notificationPrefs.failureAlerts" (ngModelChange)="onPref('failureAlerts', $event)" [disabled]="saving()" />
        </div>
        @if (permissionNote()) { <p class="callout callout--warn"><i class="pi pi-info-circle"></i><span>{{ permissionNote() }}</span></p> }
        <p class="fine">{{ 'profile.alerts_only_work_while_printsetu_is' | translate }}</p>
      </section>

      <!-- ---------- Printers ---------- -->
      <section class="pf-card wide">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">{{ 'common.printers' | translate }}</h3>
          <a routerLink="/shop/print-agent" class="pf-btn pf-btn--quiet">{{ 'profile.manage_printer_app' | translate }} <i class="pi pi-arrow-right"></i></a>
        </header>
        @if (printersLoading()) {
          <div class="pf-skeleton" style="height: 4.5rem"></div>
        } @else if (printers().length === 0) {
          <div class="pf-empty">
            <span class="pf-empty__icon"><i class="pi pi-print"></i></span>
            <strong>{{ 'profile.no_printer_connected' | translate }}</strong>
            <p>{{ 'profile.install_the_printer_app_on_the' | translate }}</p>
            <a routerLink="/shop/print-agent" class="pf-btn pf-btn--primary"><i class="pi pi-download"></i> {{ 'profile.set_up_printer' | translate }}</a>
          </div>
        } @else {
          <ul class="printers">
            @for (p of printers(); track p.id) {
              <li class="printer" [class.is-default]="p.id === settings.defaultPrinterId">
                <span class="printer__icon" [ngClass]="'s-' + p.status.toLowerCase()"><i class="pi pi-print"></i></span>
                <div class="printer__main">
                  <span class="printer__name" [title]="p.printerName">{{ p.printerName }}</span>
                  <span class="printer__meta">
                    <span class="pill" [ngClass]="'s-' + p.status.toLowerCase()"><span class="pill__dot"></span>{{ label(p.status) }}</span>
                    <span>{{ p.lastHeartbeatAt ? ('profile.seen_ago' | translate: { ago: ago(p.lastHeartbeatAt) }) : ('profile.never_connected' | translate) }}</span>
                  </span>
                </div>
                @if (p.id === settings.defaultPrinterId) {
                  <span class="badge"><i class="pi pi-check"></i> {{ 'profile.main_printer' | translate }}</span>
                } @else {
                  <button type="button" class="pf-btn" (click)="makeDefault(p)" [disabled]="saving()">{{ 'profile.use_as_main_printer' | translate }}</button>
                }
              </li>
            }
          </ul>
          @if (!settings.defaultPrinterId) {
            <p class="fine">{{ 'profile.no_main_printer_chosen_orders_go' | translate }}</p>
          }
        }
      </section>

      <!-- ---------- Files & privacy ---------- -->
      <section class="pf-card wide">
        <header class="pf-card__head"><h3 class="pf-eyebrow">{{ 'profile.files_privacy' | translate }}</h3></header>
        <dl class="facts">
          <div>
            <dt><i class="pi pi-trash"></i> {{ 'profile.file_cleanup' | translate }}</dt>
            <dd>{{ 'profile.customer_files_are_deleted_as_soon' | translate }}</dd>
          </div>
          <div>
            <dt><i class="pi pi-upload"></i> {{ 'profile.upload_limit' | translate }}</dt>
            <dd>{{ 'profile.no_file_size_limit' | translate }}</dd>
          </div>
          <div>
            <dt><i class="pi pi-eye"></i> {{ 'profile.document_preview' | translate }}</dt>
            <dd>{{ 'profile.enabled_you_can_review_files_before' | translate }}</dd>
          </div>
        </dl>
      </section>
    </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .sections {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        align-items: start;
      }
      @media (min-width: 900px) {
        .sections {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      .setting p-toggleswitch {
        flex: none;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .setting {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.875rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .setting:first-of-type {
        padding-top: 0;
      }
      .setting__icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 12px;
        background: var(--p-primary-50);
        color: var(--accent-text-600);
      }
      .setting__text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .setting__text label {
        display: block;
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--tx-0f172a);
        cursor: pointer;
      }
      .setting__text p {
        margin: 0.125rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--tx-64748b);
      }
      .test {
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        border: 1px solid var(--bd-e2e8f0);
        border-radius: 50%;
        background: var(--bg-ffffff);
        font-size: 0.6875rem;
        color: var(--tx-64748b);
        cursor: pointer;
      }
      .test:hover {
        border-color: var(--p-primary-300);
        color: var(--accent-text-600);
      }
      .callout {
        display: flex;
        gap: 0.625rem;
        margin: 0.875rem 0 0;
        padding: 0.75rem 0.875rem;
        border-radius: 12px;
        background: var(--bg-f1f5f9);
        font-size: 0.8125rem;
        line-height: 1.45;
        color: var(--tx-475569);
      }
      .callout i {
        margin-top: 0.15rem;
      }
      .linkish {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-weight: 600;
        color: var(--accent-text-700);
        cursor: pointer;
        text-decoration: underline;
      }
      .callout--warn {
        background: var(--bg-fffbeb);
        color: var(--tx-92400e);
      }
      .fine {
        margin: 0.875rem 0 0;
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .printers {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .printer {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        padding: 0.875rem 1rem;
        border: 1.5px solid var(--bd-e6eaf2);
        border-radius: 14px;
        background: var(--bg-fbfcfe);
      }
      .printer.is-default {
        border-color: var(--p-primary-300);
        background: var(--p-primary-50);
      }
      .printer__icon {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 12px;
        background: var(--bg-eef1f7);
        color: var(--tx-64748b);
      }
      .printer__icon.s-online {
        background: var(--bg-dcfce7);
        color: var(--tx-16a34a);
      }
      .printer__icon.s-offline {
        background: var(--bg-fee2e2);
        color: var(--tx-dc2626);
      }
      .printer__main {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
      }
      .printer__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
        font-weight: 700;
      }
      .printer__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 0.625rem;
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        background: var(--bg-eef1f7);
        font-weight: 700;
        color: var(--tx-475569);
      }
      .pill__dot {
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 50%;
        background: #94a3b8;
      }
      .pill.s-online {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .pill.s-online .pill__dot {
        background: #16a34a;
      }
      .pill.s-offline {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .pill.s-offline .pill__dot {
        background: #dc2626;
      }
      .badge {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        border-radius: 999px;
        background: var(--p-primary-600);
        font-size: 0.75rem;
        font-weight: 700;
        color: #fff;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
        gap: 1rem;
        margin: 0;
      }
      .facts div {
        padding: 0.875rem 1rem;
        border-radius: 14px;
        background: var(--bg-f8fafc);
      }
      .facts dt {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      .facts dt i {
        color: var(--accent-text-600);
      }
      .facts dd {
        margin: 0.375rem 0 0;
        font-size: 0.875rem;
        line-height: 1.45;
        color: var(--tx-64748b);
      }
      @media (max-width: 520px) {
        .printer {
          flex-wrap: wrap;
        }
        .printer .pf-btn,
        .printer .badge {
          margin-left: 3.375rem;
        }
      }
    `,
  ],
})
export class ProfileSettingsComponent implements OnInit {
  @Input({ required: true }) settings!: ShopSettingsInfo;
  /** The shop hours the Online / Offline schedule follows. */
  @Input() openingHours: OpeningHours | null = null;
  /** Opens the shop-hours editor. */
  @Output() editHours = new EventEmitter<void>();
  /** Emits the fresh profile after every successful change so the page stays in sync. */
  @Output() updated = new EventEmitter<ShopProfileResponse>();

  printers = signal<PrinterRow[]>([]);
  printersLoading = signal(true);
  saving = signal(false);
  permissionNote = signal<string | null>(null);
  /** Bumped to rebuild the switches from the stored values after a cancelled/failed change. */
  renderKey = signal(0);

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    readonly alerts: OrderAlertsService,
    private readonly confirmationService: ConfirmationService,
    private readonly messageService: MessageService,
  ) {}

  ngOnInit(): void {
    this.shopkeeperService.listPrinters().subscribe({
      next: (list) => {
        this.printers.set(list);
        this.printersLoading.set(false);
      },
      error: () => this.printersLoading.set(false),
    });
  }

  label(status: PrinterRow['status']): string {
    return status === 'ONLINE' ? t('common.online') : status === 'OFFLINE' ? t('common.offline') : t('profile.not_connected_yet');
  }

  ago(iso: string): string {
    return timeAgo(iso);
  }

  onAutoAccept(on: boolean): void {
    if (!on) {
      this.save({ autoAcceptOrders: false }, t('profile.auto_accept_turned_off'));
      return;
    }
    // Turning it on changes real behaviour (files print without review), so confirm first.
    this.confirmationService.confirm({
      get header() { return t('profile.turn_on_auto_accept'); },
      get message() { return t('profile.new_orders_will_be_sent_to'); },
      icon: 'pi pi-bolt',
      get acceptLabel() { return t('profile.turn_on'); },
      get rejectLabel() { return t('common.cancel'); },
      accept: () => this.save({ autoAcceptOrders: true }, t('profile.auto_accept_turned_on')),
      reject: () => this.revertSwitches(),
    });
  }

  hasOpenDay(): boolean {
    const hours = this.openingHours;
    return !!hours && Object.values(hours).some((d) => d.open);
  }

  onAutoSchedule(on: boolean): void {
    this.save({ autoSchedule: on }, on ? t('profile.your_shop_now_follows_its_shop') : t('profile.automatic_online_offline_turned_off'));
  }

  onPref(key: keyof NotificationPrefs, value: boolean): void {
    this.save({ notificationPrefs: { [key]: value } });
  }

  async onDesktop(on: boolean): Promise<void> {
    this.permissionNote.set(null);
    if (!on) {
      this.onPref('desktopAlerts', false);
      return;
    }
    const permission = await this.alerts.requestDesktopPermission();
    if (permission === 'granted') {
      this.onPref('desktopAlerts', true);
      return;
    }
    this.permissionNote.set(
      permission === 'unsupported'
        ? t('profile.this_browser_doesnt_support_desktop_notifications')
        : t('profile.notifications_are_blocked_for_this_site'),
    );
    this.revertSwitches();
  }

  makeDefault(printer: PrinterRow): void {
    this.save({ defaultPrinterId: printer.id }, t('profile.is_now_your_default_printer', { printerName: printer.printerName }));
  }

  /** A switch the user flipped but that was not saved must go back to what is actually stored. */
  private revertSwitches(): void {
    this.renderKey.update((n) => n + 1);
  }

  private save(dto: Parameters<ShopkeeperService['updateSettings']>[0], success?: string): void {
    this.saving.set(true);
    this.shopkeeperService.updateSettings(dto).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.alerts.setPrefs(res.settings.notificationPrefs);
        this.updated.emit(res);
        if (success) this.messageService.add({ severity: 'success', summary: success });
      },
      error: () => {
        this.saving.set(false);
        this.revertSwitches();
      },
    });
  }
}
