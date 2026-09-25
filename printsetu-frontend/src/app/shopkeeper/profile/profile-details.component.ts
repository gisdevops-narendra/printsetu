import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { DayKey, ShopProfileInfo } from '../../core/models/models';
import { copyText } from '../../shared/utils/browser.util';
import { DAY_KEYS, DAY_LABELS, OpenStatus, dayKeyOf, format12h, openStatus } from './profile.util';
import { t } from '../../core/i18n/i18n';
import { AppDatePipe } from '../../core/i18n/i18n-format.pipes';

/** Everything customers and the owner need to know about the shop, clearly laid out. */
@Component({
  selector: 'app-profile-details',
  standalone: true,
  imports: [AppDatePipe, TranslatePipe, CommonModule],
  template: `
    <div class="sections">
      <!-- ---------- Contact ---------- -->
      <section class="pf-card">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">{{ 'common.contact' | translate }}</h3>
          <button type="button" class="pf-btn pf-btn--quiet" (click)="edit.emit()"><i class="pi pi-pencil"></i> {{ 'common.edit' | translate }}</button>
        </header>
        <ul class="rows">
          <li>
            <span class="rows__icon"><i class="pi pi-user"></i></span>
            <div class="rows__text"><small>{{ 'common.owner' | translate }}</small><span>{{ shop.ownerName }}</span></div>
          </li>
          <li>
            <span class="rows__icon"><i class="pi pi-phone"></i></span>
            <div class="rows__text"><small>{{ 'common.phone' | translate }}</small><a [href]="'tel:' + shop.mobile">{{ shop.mobile }}</a></div>
            <button type="button" class="icon" (click)="copy(shop.mobile, 'Phone number')" [attr.aria-label]="'profile.copy_phone_number' | translate"><i class="pi pi-copy"></i></button>
          </li>
          <li>
            <span class="rows__icon"><i class="pi pi-envelope"></i></span>
            <div class="rows__text"><small>{{ 'common.email' | translate }}</small><a [href]="'mailto:' + shop.email">{{ shop.email }}</a></div>
            <button type="button" class="icon" (click)="copy(shop.email, 'Email')" [attr.aria-label]="'profile.copy_email' | translate"><i class="pi pi-copy"></i></button>
          </li>
        </ul>
      </section>

      <!-- ---------- Location ---------- -->
      <section class="pf-card">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">{{ 'profile.location' | translate }}</h3>
          <button type="button" class="pf-btn pf-btn--quiet" (click)="edit.emit()"><i class="pi pi-pencil"></i> {{ 'common.edit' | translate }}</button>
        </header>
        <div class="place">
          <span class="rows__icon rows__icon--lg"><i class="pi pi-map-marker"></i></span>
          <div>
            <p class="place__address">{{ shop.address }}</p>
            <p class="place__city">{{ shop.city }}</p>
          </div>
        </div>
        <div class="actions">
          <a class="pf-btn" [href]="mapsUrl()" target="_blank" rel="noopener"><i class="pi pi-external-link"></i> {{ 'profile.open_in_maps' | translate }}</a>
          <button type="button" class="pf-btn" (click)="copy(shop.address + ', ' + shop.city, 'Address')"><i class="pi pi-copy"></i> {{ 'profile.copy_address' | translate }}</button>
        </div>
      </section>

      <!-- ---------- Opening hours ---------- -->
      <section class="pf-card">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">{{ 'profile.opening_hours' | translate }}</h3>
          <button type="button" class="pf-btn pf-btn--quiet" (click)="edit.emit()"><i class="pi pi-pencil"></i> {{ shop.openingHours ? ('common.edit' | translate) : ('profile.set_hours' | translate) }}</button>
        </header>
        @if (shop.openingHours; as hours) {
          <p class="status" [ngClass]="'status--' + status().state"><span class="status__dot"></span>{{ status().label }}</p>
          <ul class="hours">
            @for (d of days; track d) {
              <li [class.is-today]="d === today()">
                <span class="hours__day">{{ labels[d] }}@if (d === today()) { <em>{{ 'common.today' | translate }}</em> }</span>
                @if (hours[d].open) {
                  <span class="hours__time">{{ time(hours[d].from) }} &ndash; {{ time(hours[d].to) }}</span>
                } @else {
                  <span class="hours__closed">{{ 'common.closed' | translate }}</span>
                }
              </li>
            }
          </ul>
        } @else {
          <div class="pf-empty">
            <span class="pf-empty__icon"><i class="pi pi-clock"></i></span>
            <strong>{{ 'profile.opening_hours_arent_set' | translate }}</strong>
            <p>{{ 'profile.let_customers_know_when_youre_open' | translate }}</p>
            <button type="button" class="pf-btn pf-btn--primary" (click)="edit.emit()">{{ 'profile.set_opening_hours' | translate }}</button>
          </div>
        }
      </section>

      <!-- ---------- About ---------- -->
      <section class="pf-card">
        <header class="pf-card__head">
          <h3 class="pf-eyebrow">{{ 'profile.about_the_shop' | translate }}</h3>
          <button type="button" class="pf-btn pf-btn--quiet" (click)="edit.emit()"><i class="pi pi-pencil"></i> {{ 'common.edit' | translate }}</button>
        </header>
        @if (shop.description) {
          <p class="about">{{ shop.description }}</p>
        } @else {
          <p class="about about--empty">{{ 'profile.add_a_short_description_for_example' | translate }}</p>
        }
        <dl class="facts">
          <div><dt>{{ 'profile.shop_code' | translate }}</dt><dd>{{ shop.shopCode }}</dd></div>
          <div><dt>{{ 'profile.member_since' | translate }}</dt><dd>{{ shop.createdAt | appDate: 'MMM yyyy' }}</dd></div>
        </dl>
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .sections {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        align-items: start;
      }
      .rows {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .rows li {
        display: flex;
        align-items: center;
        gap: 0.875rem;
        min-width: 0;
      }
      .rows__icon {
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
      .rows__icon--lg {
        width: 3rem;
        height: 3rem;
        font-size: 1.25rem;
      }
      .rows__text {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .rows__text small {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .rows__text span,
      .rows__text a {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--tx-0f172a);
        text-decoration: none;
      }
      .rows__text a:hover {
        color: var(--accent-text-600);
        text-decoration: underline;
      }
      .icon {
        flex: 0 0 auto;
        width: 2.25rem;
        height: 2.25rem;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: var(--tx-94a3b8);
        cursor: pointer;
      }
      .icon:hover {
        background: var(--bg-eef1f7);
        color: var(--tx-0f172a);
      }
      .place {
        display: flex;
        gap: 0.875rem;
      }
      .place__address {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.45;
        color: var(--tx-0f172a);
      }
      .place__city {
        margin: 0.125rem 0 0;
        font-size: 0.875rem;
        color: var(--tx-64748b);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 1.25rem;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 1rem;
        padding: 0.375rem 0.875rem;
        border-radius: 999px;
        font-size: 0.8125rem;
        font-weight: 700;
      }
      .status__dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: currentColor;
      }
      .status--open {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .status--closed {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .status--unknown {
        background: var(--bg-eef1f7);
        color: var(--tx-64748b);
      }
      .hours {
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .hours li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.5rem 0.75rem;
        margin: 0 -0.75rem;
        border-radius: 10px;
        font-size: 0.9375rem;
      }
      .hours li.is-today {
        background: var(--p-primary-50);
        font-weight: 700;
      }
      .hours__day {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--tx-334155);
      }
      .hours__day em {
        padding: 0.05rem 0.5rem;
        border-radius: 999px;
        background: var(--p-primary-600);
        font-size: 0.625rem;
        font-style: normal;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #fff;
      }
      .hours__time {
        font-variant-numeric: tabular-nums;
        color: var(--tx-0f172a);
      }
      .hours__closed {
        color: var(--tx-64748b);
      }
      .about {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.65;
        color: var(--tx-334155);
        white-space: pre-line;
      }
      .about--empty {
        color: var(--tx-64748b);
        font-style: italic;
      }
      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        margin: 1.25rem 0 0;
        padding-top: 1rem;
        border-top: 1px solid var(--bd-eef1f7);
      }
      .facts dt {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .facts dd {
        margin: 0.125rem 0 0;
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--tx-0f172a);
      }
    `,
  ],
})
export class ProfileDetailsComponent {
  @Input({ required: true }) shop!: ShopProfileInfo;
  @Output() edit = new EventEmitter<void>();

  readonly days = DAY_KEYS;
  readonly labels = DAY_LABELS;
  // Plain methods (not computed): they read the `shop` @Input, which is not a signal,
  // so they must re-evaluate on every change-detection pass to reflect edits.
  today(): DayKey {
    return dayKeyOf(new Date());
  }

  status(): OpenStatus {
    return openStatus(this.shop?.openingHours ?? null, new Date());
  }

  constructor(private readonly messageService: MessageService) {}

  time(value: string): string {
    return format12h(value);
  }

  mapsUrl(): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${this.shop.name}, ${this.shop.address}, ${this.shop.city}`);
  }

  async copy(text: string, what: string): Promise<void> {
    const ok = await copyText(text);
    this.messageService.add(ok ? { severity: 'success', summary: `${what} copied` } : { severity: 'warn', get summary() { return t('profile.couldnt_copy_automatically'); } });
  }
}
