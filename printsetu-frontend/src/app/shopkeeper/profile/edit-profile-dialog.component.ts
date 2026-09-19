import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { ShopkeeperService } from '../../core/services/shopkeeper.service';
import { DayKey, OpeningHours, ShopProfileInfo, ShopProfileResponse } from '../../core/models/models';
import { DAY_KEYS, DAY_LABELS, DEFAULT_HOURS } from './profile.util';

const DESCRIPTION_MAX = 600;

/** Edit the parts of the profile a shop owner controls: about text, contact, address and opening hours. */
@Component({
  selector: 'app-edit-profile-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ToggleSwitchModule],
  template: `
    <p-dialog
      header="Edit shop profile"
      [visible]="visible"
      (visibleChange)="visibleChange.emit($event)"
      (onShow)="reset()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: 'min(42rem, calc(100vw - 1.5rem))' }"
      [contentStyle]="{ 'max-height': '70dvh' }"
    >
      <form class="form" (ngSubmit)="save()" novalidate>
        <p class="lead">Your shop name, code and owner are managed by the administrator. Everything below is yours to edit.</p>

        <div class="field">
          <label for="ep-desc">About the shop</label>
          <textarea id="ep-desc" name="description" rows="4" [(ngModel)]="description" [maxlength]="max" placeholder="What do you specialise in? For example: fast colour prints, photo printing, spiral binding."></textarea>
          <span class="count" [class.is-near]="description.length > max - 40">{{ description.length }} / {{ max }}</span>
        </div>

        <div class="pair">
          <div class="field" [class.has-error]="!!errors()['mobile']">
            <label for="ep-mobile">Contact number</label>
            <input id="ep-mobile" name="mobile" type="tel" inputmode="tel" autocomplete="tel" [(ngModel)]="mobile" placeholder="+91 98765 43210" />
            @if (errors()['mobile']) { <span class="err">{{ errors()['mobile'] }}</span> }
          </div>
          <div class="field" [class.has-error]="!!errors()['city']">
            <label for="ep-city">City</label>
            <input id="ep-city" name="city" type="text" autocomplete="address-level2" [(ngModel)]="city" />
            @if (errors()['city']) { <span class="err">{{ errors()['city'] }}</span> }
          </div>
        </div>

        <div class="field" [class.has-error]="!!errors()['address']">
          <label for="ep-address">Address</label>
          <textarea id="ep-address" name="address" rows="2" autocomplete="street-address" [(ngModel)]="address"></textarea>
          @if (errors()['address']) { <span class="err">{{ errors()['address'] }}</span> }
        </div>

        <fieldset class="hours">
          <legend>Opening hours</legend>
          <div class="hours__tools">
            <button type="button" class="link" (click)="copyMondayToWeekdays()">Copy Monday to all weekdays</button>
            <button type="button" class="link" (click)="applyToAll()">Same hours every day</button>
          </div>
          @for (d of days; track d) {
            <div class="hrow" [class.is-closed]="!hours()[d].open" [class.has-error]="!!errors()['hours-' + d]">
              <span class="hrow__day">{{ labels[d] }}</span>
              <p-toggleswitch [ngModel]="hours()[d].open" (ngModelChange)="setOpen(d, $event)" [ngModelOptions]="{ standalone: true }" [attr.aria-label]="labels[d] + ' open'" />
              @if (hours()[d].open) {
                <div class="hrow__times">
                  <input type="time" [ngModel]="hours()[d].from" (ngModelChange)="setTime(d, 'from', $event)" [ngModelOptions]="{ standalone: true }" [attr.aria-label]="labels[d] + ' opens at'" />
                  <span>to</span>
                  <input type="time" [ngModel]="hours()[d].to" (ngModelChange)="setTime(d, 'to', $event)" [ngModelOptions]="{ standalone: true }" [attr.aria-label]="labels[d] + ' closes at'" />
                </div>
              } @else {
                <span class="hrow__closed">Closed</span>
              }
              @if (errors()['hours-' + d]) { <span class="err hrow__err">{{ errors()['hours-' + d] }}</span> }
            </div>
          }
        </fieldset>
      </form>

      <ng-template #footer>
        <button type="button" class="pf-btn" (click)="visibleChange.emit(false)" [disabled]="saving()">Cancel</button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="save()" [disabled]="saving() || !dirty()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check"></i> Save changes }
        </button>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .lead {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        min-width: 0;
      }
      .field label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      .field input,
      .field textarea {
        width: 100%;
        padding: 0.75rem 0.875rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 1rem;
        color: var(--tx-0f172a);
        resize: vertical;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .field input:focus,
      .field textarea:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.14);
      }
      .field.has-error input,
      .field.has-error textarea {
        border-color: var(--bd-f0a3a3);
        background: var(--bg-fffafa);
      }
      .err {
        font-size: 0.75rem;
        color: var(--tx-b42318);
      }
      .count {
        align-self: flex-end;
        font-size: 0.75rem;
        color: var(--tx-94a3b8);
      }
      .count.is-near {
        color: var(--tx-d97706);
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
        gap: 1rem;
      }
      .hours {
        margin: 0;
        padding: 0;
        border: none;
        min-width: 0;
      }
      .hours legend {
        padding: 0;
        margin-bottom: 0.5rem;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      .hours__tools {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.25rem;
        margin-bottom: 0.5rem;
      }
      .link {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--accent-text-600);
        cursor: pointer;
      }
      .link:hover {
        text-decoration: underline;
      }
      .hrow {
        display: grid;
        grid-template-columns: 6.5rem auto minmax(0, 1fr);
        align-items: center;
        gap: 0.5rem 0.875rem;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .hrow__day {
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--tx-0f172a);
      }
      .hrow.is-closed .hrow__day {
        color: var(--tx-94a3b8);
      }
      .hrow__closed {
        font-size: 0.875rem;
        color: var(--tx-94a3b8);
      }
      .hrow__times {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
      }
      .hrow__times span {
        font-size: 0.8125rem;
        color: var(--tx-94a3b8);
      }
      .hrow__times input {
        flex: 1 1 0;
        min-width: 0;
        max-width: 8.5rem;
        padding: 0.5rem 0.625rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 10px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 0.9375rem;
        outline: none;
      }
      .hrow__times input:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
      }
      .hrow.has-error .hrow__times input {
        border-color: var(--bd-f0a3a3);
      }
      .hrow__err {
        grid-column: 1 / -1;
      }
      @media (max-width: 480px) {
        /* Day + switch on one line, the two time fields below at full width (they were clipped to "09:"). */
        .hrow {
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.375rem 0.625rem;
        }
        .hrow__times,
        .hrow__closed {
          grid-column: 1 / -1;
        }
        .hrow__times input {
          max-width: none;
        }
      }
    `,
  ],
})
export class EditProfileDialogComponent {
  @Input({ required: true }) shop!: ShopProfileInfo;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<ShopProfileResponse>();

  readonly max = DESCRIPTION_MAX;
  readonly days = DAY_KEYS;
  readonly labels = DAY_LABELS;

  description = '';
  mobile = '';
  city = '';
  address = '';
  hours = signal<OpeningHours>(structuredClone(DEFAULT_HOURS));
  saving = signal(false);
  private initial = '';

  // Methods, not computed signals: they read plain ngModel-bound fields, which
  // signals cannot track, so they must re-evaluate on every change-detection pass.
  errors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!/^[0-9+\-\s()]{7,20}$/.test(this.mobile.trim())) e['mobile'] = 'Enter a valid phone number.';
    if (this.city.trim().length < 2) e['city'] = 'Enter your city.';
    if (this.address.trim().length < 3) e['address'] = 'Enter your address.';
    const h = this.hours();
    for (const d of DAY_KEYS) {
      if (h[d].open && h[d].from >= h[d].to) e['hours-' + d] = 'Closing time must be after opening time.';
    }
    return e;
  }

  /** Save is only offered when something actually changed. */
  dirty(): boolean {
    return this.snapshot() !== this.initial;
  }

  constructor(
    private readonly shopkeeperService: ShopkeeperService,
    private readonly messageService: MessageService,
  ) {}

  reset(): void {
    this.description = this.shop.description ?? '';
    this.mobile = this.shop.mobile;
    this.city = this.shop.city;
    this.address = this.shop.address;
    this.hours.set(structuredClone(this.shop.openingHours ?? DEFAULT_HOURS));
    this.initial = this.snapshot();
  }

  setOpen(day: DayKey, open: boolean): void {
    this.hours.update((h) => ({ ...h, [day]: { ...h[day], open } }));
  }

  setTime(day: DayKey, which: 'from' | 'to', value: string): void {
    if (!value) return;
    this.hours.update((h) => ({ ...h, [day]: { ...h[day], [which]: value } }));
  }

  copyMondayToWeekdays(): void {
    this.hours.update((h) => {
      const next = { ...h };
      for (const d of ['tue', 'wed', 'thu', 'fri'] as DayKey[]) next[d] = { ...h.mon };
      return next;
    });
  }

  applyToAll(): void {
    this.hours.update((h) => {
      const next = { ...h };
      for (const d of DAY_KEYS) next[d] = { ...h.mon, open: true };
      return next;
    });
  }

  save(): void {
    if (Object.keys(this.errors()).length > 0) {
      this.messageService.add({ severity: 'warn', summary: 'Please fix the highlighted fields' });
      return;
    }
    this.saving.set(true);
    this.shopkeeperService
      .updateProfile({
        description: this.description,
        mobile: this.mobile.trim(),
        city: this.city.trim(),
        address: this.address.trim(),
        openingHours: this.hours(),
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.saved.emit(res);
          this.visibleChange.emit(false);
          this.messageService.add({ severity: 'success', summary: 'Profile updated' });
        },
        error: () => this.saving.set(false),
      });
  }

  private snapshot(): string {
    return JSON.stringify([this.description.trim(), this.mobile.trim(), this.city.trim(), this.address.trim(), this.hours()]);
  }
}
