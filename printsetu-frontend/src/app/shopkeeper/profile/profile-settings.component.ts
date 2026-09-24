import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { OrderAlertsService } from '../../core/services/order-alerts.service';
import { NotificationPrefs, OpeningHours, PrinterRow, ShopProfileResponse, ShopSettingsInfo } from '../../core/models/models';
import { timeAgo } from '../../shared/utils/browser.util';

/** How the shop takes orders, prints them and gets told about them. */
@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ToggleSwitchModule],
  template: `
    @for (k of [renderKey()]; track k) {
    <div class="sections">
      <!-- ---------- Order handling ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">Order handling</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-bolt"></i></span>
          <div class="setting__text">
            <label for="auto-accept">Auto-accept orders</label>
            <p>Confirmed orders go straight to your printer. You won't need to tap Print, and you won't review them first.</p>
          </div>
          <p-toggleswitch inputId="auto-accept" [ngModel]="settings.autoAcceptOrders" (ngModelChange)="onAutoAccept($event)" [disabled]="saving()" />
        </div>
        @if (settings.autoAcceptOrders) {
          <p class="callout callout--warn">
            <i class="pi pi-exclamation-triangle"></i>
            <span>Auto-accept is on. Make sure your printer has paper and is connected. If it can't print, the order stays in Print Orders.</span>
          </p>
        } @else {
          <p class="callout"><i class="pi pi-info-circle"></i><span>Manual mode: you review each order in Print Orders and tap Print.</span></p>
        }
      </section>

      <!-- ---------- Online / Offline schedule ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">Online / Offline schedule</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-clock"></i></span>
          <div class="setting__text">
            <label for="auto-schedule">Go online and offline automatically</label>
            <p>Your shop starts taking orders when it opens and stops when it closes, every day, using your shop hours.</p>
          </div>
          <p-toggleswitch inputId="auto-schedule" [ngModel]="settings.autoSchedule" (ngModelChange)="onAutoSchedule($event)" [disabled]="saving()" />
        </div>
        @if (!hasOpenDay()) {
          <p class="callout callout--warn">
            <i class="pi pi-info-circle"></i>
            <span>Set your shop hours first. <button type="button" class="linkish" (click)="editHours.emit()">Set shop hours</button></span>
          </p>
        } @else if (settings.autoSchedule) {
          <p class="callout">
            <i class="pi pi-info-circle"></i>
            <span>
              Following your shop hours. For an unplanned break (lunch, a printer issue) use the Online / Offline switch at the top;
              the schedule takes over again at the next opening or closing time.
              <button type="button" class="linkish" (click)="editHours.emit()">Edit shop hours</button>
            </span>
          </p>
        } @else {
          <p class="callout"><i class="pi pi-info-circle"></i><span>Manual mode: you switch Online / Offline yourself using the switch at the top.</span></p>
        }
      </section>

      <!-- ---------- Notifications ---------- -->
      <section class="pf-card">
        <header class="pf-card__head"><h3 class="pf-eyebrow">Notifications</h3></header>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-volume-up"></i></span>
          <div class="setting__text">
            <label for="n-sound">New order sound</label>
            <p>A short chime when a new print request arrives.</p>
          </div>
          <button type="button" class="test" (click)="alerts.preview()" aria-label="Play the sound"><i class="pi pi-play"></i></button>
          <p-toggleswitch inputId="n-sound" [ngModel]="settings.notificationPrefs.newOrderSound" (ngModelChange)="onPref('newOrderSound', $event)" [disabled]="saving()" />
        </div>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-desktop"></i></span>
          <div class="setting__text">
            <label for="n-desktop">Desktop alerts</label>
            <p>Pop-up notifications when this tab is in the background.</p>
          </div>
          <p-toggleswitch inputId="n-desktop" [ngModel]="settings.notificationPrefs.desktopAlerts" (ngModelChange)="onDesktop($event)" [disabled]="saving()" />
        </div>
        <div class="setting">
          <span class="setting__icon"><i class="pi pi-exclamation-triangle"></i></span>
          <div class="setting__text">
            <label for="n-fail">Print problems</label>
            <p>Tell me when the printer goes offline or an order needs checking.</p>
          </div>
          <p-toggleswitch inputId="n-fail" [ngModel]="settings.notificationPrefs.failureAlerts" (ngModelChange)="onPref('failureAlerts', $event)" [disabled]="saving()" />
        </div>
        @if (permissionNote()) { <p class="callout callout--warn"><i class="pi pi-info-circle"></i><span>{{ permissionNote() }}</span></p> }
        <p class="fine">Alerts only work while PrintSetu is open in your browser.</p>
      </section>

      <!-- ---------- Printers ---------- -->
      <section class="pf-card wide">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">Printers</h3>
          <a routerLink="/shop/print-agent" class="pf-btn pf-btn--quiet">Manage Printer App <i class="pi pi-arrow-right"></i></a>
        </header>
        @if (printersLoading()) {
          <div class="pf-skeleton" style="height: 4.5rem"></div>
        } @else if (printers().length === 0) {
          <div class="pf-empty">
            <span class="pf-empty__icon"><i class="pi pi-print"></i></span>
            <strong>No printer connected</strong>
            <p>Install the Printer App on the computer connected to your printer.</p>
            <a routerLink="/shop/print-agent" class="pf-btn pf-btn--primary"><i class="pi pi-download"></i> Set up printer</a>
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
                    <span>{{ p.lastHeartbeatAt ? 'Seen ' + ago(p.lastHeartbeatAt) : 'Never connected' }}</span>
                  </span>
                </div>
                @if (p.id === settings.defaultPrinterId) {
                  <span class="badge"><i class="pi pi-check"></i> Main printer</span>
                } @else {
                  <button type="button" class="pf-btn" (click)="makeDefault(p)" [disabled]="saving()">Use as main printer</button>
                }
              </li>
            }
          </ul>
          @if (!settings.defaultPrinterId) {
            <p class="fine">No main printer chosen: orders go to the first printer that's online.</p>
          }
        }
      </section>

      <!-- ---------- Files & privacy ---------- -->
      <section class="pf-card wide">
        <header class="pf-card__head"><h3 class="pf-eyebrow">Files &amp; privacy</h3></header>
        <dl class="facts">
          <div>
            <dt><i class="pi pi-trash"></i> File cleanup</dt>
            <dd>Customer files are deleted as soon as their order is printed.</dd>
          </div>
          <div>
            <dt><i class="pi pi-upload"></i> Upload limit</dt>
            <dd>No file size limit.</dd>
          </div>
          <div>
            <dt><i class="pi pi-eye"></i> Document preview</dt>
            <dd>Enabled: you can review files before printing.</dd>
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
        color: var(--p-primary-600);
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
        color: var(--tx-94a3b8);
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
        color: var(--tx-94a3b8);
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
    return status === 'ONLINE' ? 'Online' : status === 'OFFLINE' ? 'Offline' : 'Not connected yet';
  }

  ago(iso: string): string {
    return timeAgo(iso);
  }

  onAutoAccept(on: boolean): void {
    if (!on) {
      this.save({ autoAcceptOrders: false }, 'Auto-accept turned off');
      return;
    }
    // Turning it on changes real behaviour (files print without review), so confirm first.
    this.confirmationService.confirm({
      header: 'Turn on auto-accept?',
      message: 'New orders will be sent to your printer automatically, without you reviewing or editing them first. You can turn this off at any time.',
      icon: 'pi pi-bolt',
      acceptLabel: 'Turn on',
      rejectLabel: 'Cancel',
      accept: () => this.save({ autoAcceptOrders: true }, 'Auto-accept turned on'),
      reject: () => this.revertSwitches(),
    });
  }

  hasOpenDay(): boolean {
    const hours = this.openingHours;
    return !!hours && Object.values(hours).some((d) => d.open);
  }

  onAutoSchedule(on: boolean): void {
    this.save({ autoSchedule: on }, on ? 'Your shop now follows its shop hours' : 'Automatic Online / Offline turned off');
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
        ? "This browser doesn't support desktop notifications."
        : 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
    );
    this.revertSwitches();
  }

  makeDefault(printer: PrinterRow): void {
    this.save({ defaultPrinterId: printer.id }, `${printer.printerName} is now your default printer`);
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
