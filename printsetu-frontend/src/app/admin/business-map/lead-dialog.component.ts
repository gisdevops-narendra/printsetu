import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AdminService } from '../../core/services/admin.service';
import { LeadInput, LeadStatus, MapLead } from '../../core/models/models';
import { LocationPickerComponent, PickedLocation } from '../../shared/map/location-picker.component';
import { t } from '../../core/i18n/i18n';

export const LEAD_STATUSES: LeadStatus[] = ['CONTACTED', 'DEMO_GIVEN', 'JOINED', 'NOT_INTERESTED'];

export function leadStatusLabel(status: LeadStatus): string {
  switch (status) {
    case 'CONTACTED':
      return t('businessMap.lead_contacted');
    case 'DEMO_GIVEN':
      return t('businessMap.lead_demo_given');
    case 'JOINED':
      return t('businessMap.lead_joined');
    default:
      return t('businessMap.lead_not_interested');
  }
}

/** Add or edit a prospective shop ("lead") on the Business Map. */
@Component({
  selector: 'app-lead-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe, DialogModule, SelectModule, LocationPickerComponent],
  template: `
    <p-dialog
      [header]="'businessMap.edit_lead' | translate"
      [visible]="visible"
      (visibleChange)="close()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: 'min(40rem, calc(100vw - 1.5rem))' }"
      [contentStyle]="{ 'max-height': '72dvh' }"
    >
      <form class="lf" (ngSubmit)="save()" novalidate>
        <label class="lf__field lf__field--wide" [class.has-error]="tried() && !name.trim()">
          <span>{{ 'businessMap.shop_name' | translate }} *</span>
          <input name="name" [(ngModel)]="name" maxlength="120" required />
          @if (tried() && !name.trim()) { <small class="lf__err">{{ 'businessMap.enter_the_shop_name' | translate }}</small> }
        </label>
        <label class="lf__field">
          <span>{{ 'businessMap.contact_person' | translate }}</span>
          <input name="contactName" [(ngModel)]="contactName" maxlength="120" />
        </label>
        <label class="lf__field">
          <span>{{ 'common.mobile' | translate }}</span>
          <input name="mobile" type="tel" inputmode="tel" [(ngModel)]="mobile" maxlength="20" />
        </label>
        <label class="lf__field">
          <span>{{ 'common.email' | translate }}</span>
          <input name="email" type="email" [(ngModel)]="email" maxlength="254" />
        </label>
        <label class="lf__field">
          <span>{{ 'businessMap.status' | translate }}</span>
          <p-select name="status" [options]="statusOptions" [(ngModel)]="status" optionLabel="label" optionValue="value" appendTo="body" styleClass="w-full" />
        </label>
        @if (status === 'JOINED') {
          <label class="lf__field lf__field--wide">
            <span>{{ 'businessMap.registered_shop' | translate }}</span>
            <p-select
              name="shopId"
              [options]="shopOptions"
              [(ngModel)]="shopId"
              optionLabel="label"
              optionValue="value"
              [filter]="true"
              filterBy="label"
              [showClear]="true"
              [placeholder]="'businessMap.pick_the_shop_that_registered' | translate"
              appendTo="body"
              styleClass="w-full"
            />
          </label>
        }
        <label class="lf__field lf__field--wide">
          <span>{{ 'common.address' | translate }}</span>
          <input name="address" [(ngModel)]="address" maxlength="300" />
        </label>
        <label class="lf__field">
          <span>{{ 'common.city' | translate }}</span>
          <input name="city" [(ngModel)]="city" maxlength="80" />
        </label>
        <label class="lf__field">
          <span>{{ 'location.district' | translate }}</span>
          <input name="district" [(ngModel)]="district" maxlength="80" />
        </label>
        <label class="lf__field lf__field--wide">
          <span>{{ 'businessMap.notes' | translate }}</span>
          <textarea name="notes" rows="3" [(ngModel)]="notes" maxlength="2000"></textarea>
        </label>
        <div class="lf__field lf__field--wide" [class.has-error]="tried() && !location()">
          <span>{{ 'businessMap.location_on_map' | translate }} *</span>
          <app-location-picker [latitude]="location()?.latitude ?? null" [longitude]="location()?.longitude ?? null" (locationChange)="location.set($event)" />
          @if (tried() && !location()) { <small class="lf__err">{{ 'businessMap.place_the_lead_on_the_map' | translate }}</small> }
        </div>
      </form>

      <ng-template #footer>
        @if (lead?.id) {
          <button type="button" class="pf-btn lf__delete" (click)="remove()" [disabled]="saving()"><i class="pi pi-trash"></i> {{ 'common.delete' | translate }}</button>
        }
        <button type="button" class="pf-btn" (click)="close()" [disabled]="saving()">{{ 'common.cancel' | translate }}</button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> } @else { <i class="pi pi-check"></i> }
          {{ 'common.save' | translate }}
        </button>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .lf {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.875rem 1rem;
      }
      .lf__field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      .lf__field--wide {
        grid-column: 1 / -1;
      }
      .lf__field input,
      .lf__field textarea {
        width: 100%;
        padding: 0.625rem 0.75rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 10px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-weight: 400;
        font-size: 0.9375rem;
        color: var(--tx-0f172a);
        resize: vertical;
      }
      .lf__field.has-error input {
        border-color: var(--bd-f0a3a3);
      }
      .lf__err {
        font-weight: 500;
        color: var(--tone-bad-fg);
      }
:host ::ng-deep .lf .p-select-label {
        font-size: 0.9375rem;
      }
            .lf__delete {
        margin-right: auto;
        color: var(--tone-bad-fg);
      }
      @media (max-width: 560px) {
        .lf {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class LeadDialogComponent implements OnChanges {
  /** The lead to edit; one without an id is new (its position may be pre-filled from a map click). */
  @Input() lead: Partial<MapLead> | null = null;
  @Input() visible = false;
  /** Registered shops, for linking a Joined lead. */
  @Input() shops: { id: string; name: string; shopCode?: string }[] = [];
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() changed = new EventEmitter<void>();

  name = '';
  contactName = '';
  mobile = '';
  email = '';
  address = '';
  city = '';
  district = '';
  notes = '';
  status: LeadStatus = 'CONTACTED';
  shopId: string | null = null;
  location = signal<PickedLocation | null>(null);
  saving = signal(false);
  tried = signal(false);

  get statusOptions() {
    return LEAD_STATUSES.map((value) => ({ value, label: leadStatusLabel(value) }));
  }

  get shopOptions() {
    return this.shops.map((s) => ({ value: s.id, label: s.shopCode ? `${s.name} (${s.shopCode})` : s.name }));
  }

  constructor(
    private readonly admin: AdminService,
    private readonly messages: MessageService,
    private readonly confirm: ConfirmationService,
  ) {}

  /** Fill the form as soon as it opens (not after the open animation, which would wipe early typing). */
  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['lead']) && this.visible) this.reset();
  }

  reset(): void {
    const l = this.lead ?? {};
    this.name = l.name ?? '';
    this.contactName = l.contactName ?? '';
    this.mobile = l.mobile ?? '';
    this.email = l.email ?? '';
    this.address = l.address ?? '';
    this.city = l.city ?? '';
    this.district = l.district ?? '';
    this.notes = l.notes ?? '';
    this.status = l.status ?? 'CONTACTED';
    this.shopId = l.shopId ?? l.suggestedShop?.id ?? null;
    this.location.set(l.latitude !== undefined && l.longitude !== undefined ? { latitude: l.latitude, longitude: l.longitude } : null);
    this.tried.set(false);
  }

  close(): void {
    this.visibleChange.emit(false);
  }

  save(): void {
    this.tried.set(true);
    const location = this.location();
    if (!this.name.trim() || !location) return;
    const body: LeadInput = {
      name: this.name.trim(),
      contactName: this.contactName,
      mobile: this.mobile,
      email: this.email.trim(),
      address: this.address,
      city: this.city,
      district: this.district,
      notes: this.notes,
      status: this.status,
      latitude: location.latitude,
      longitude: location.longitude,
    };
    const id = this.lead?.id;
    body.shopId = this.status === 'JOINED' ? this.shopId : null;
    this.saving.set(true);
    const request = id ? this.admin.updateLead(id, body) : this.admin.createLead(body);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: t(id ? 'businessMap.lead_saved' : 'businessMap.lead_added') });
        this.changed.emit();
        this.close();
      },
      error: () => this.saving.set(false),
    });
  }

  remove(): void {
    const id = this.lead?.id;
    if (!id) return;
    this.confirm.confirm({
      header: t('businessMap.delete_this_lead'),
      message: t('businessMap.delete_lead_message', { name: this.lead?.name ?? '' }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.saving.set(true);
        this.admin.deleteLead(id).subscribe({
          next: () => {
            this.saving.set(false);
            this.messages.add({ severity: 'success', summary: t('businessMap.lead_deleted') });
            this.changed.emit();
            this.close();
          },
          error: () => this.saving.set(false),
        });
      },
    });
  }
}
