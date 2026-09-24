import { Component, OnInit, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BillingService } from '../../core/services/billing.service';
import { BillingCycle, BillingSettings, PlanInput, SubscriptionPlan } from '../../core/models/billing.models';
import { BILLING_CYCLES, cyclePrice, cycleUnit, limit, money, yearlySaving } from '../../shared/billing/billing.util';
import { t } from '../../core/i18n/i18n';

interface Form {
  name: string;
  description: string;
  dailyPrice: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  trialDays: number | null;
  maxPrintsPerMonth: number | null;
  maxTokensPerDay: number | null;
  maxPrinters: number | null;
  prioritySupport: boolean;
  analyticsAccess: boolean;
  highlights: string;
  isActive: boolean;
}

const BLANK: Form = {
  name: '',
  description: '',
  dailyPrice: null,
  monthlyPrice: null,
  yearlyPrice: null,
  trialDays: 0,
  maxPrintsPerMonth: null,
  maxTokensPerDay: null,
  maxPrinters: null,
  prioritySupport: false,
  analyticsAccess: false,
  highlights: '',
  isActive: true,
};

@Component({
  selector: 'app-sub-plans',
  standalone: true,
  imports: [TranslatePipe, CommonModule, FormsModule, DialogModule, ToggleSwitchModule],
  template: `
    <div class="bar">
      <div class="pf-seg" role="tablist" [attr.aria-label]="'subscriptions.price_period' | translate">
        @for (c of cycles; track c.value) {
          <button type="button" role="tab" [class.is-on]="cycle() === c.value" [attr.aria-selected]="cycle() === c.value" (click)="cycle.set(c.value)">{{ c.label }}</button>
        }
      </div>
      <label class="check"><input type="checkbox" [ngModel]="showRetired()" (ngModelChange)="showRetired.set($event)" /> {{ 'subscriptions.show_discontinued_plans' | translate }}</label>
      <button type="button" class="pf-btn pf-btn--primary push" (click)="openEditor()"><i class="pi pi-plus"></i> {{ 'subscriptions.new_plan' | translate }}</button>
    </div>

    @if (loading()) {
      <div class="cards">@for (i of [1, 2, 3]; track i) { <div class="pf-skeleton" style="height: 26rem"></div> }</div>
    } @else if (visible().length === 0) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-tags"></i></span>
        <strong>{{ 'subscriptions.no_plans_yet' | translate }}</strong>
        <p>{{ 'subscriptions.create_your_first_plan_for_example' | translate }}</p>
        <button type="button" class="pf-btn pf-btn--primary" (click)="openEditor()"><i class="pi pi-plus"></i> {{ 'subscriptions.new_plan' | translate }}</button>
      </div>
    } @else {
      <div class="cards">
        @for (p of visible(); track p.id) {
          <article class="plan" [class.is-retired]="!p.isActive">
            <header class="plan__head">
              <div>
                <h3>{{ p.name }}</h3>
                @if (!p.isActive) { <span class="badge badge--muted">{{ 'subscriptions.discontinued' | translate }}</span> }
              </div>
              <span class="count" [title]="p.shopCount + ' ' + ('subscriptions.shops_on_this_plan' | translate) + ''"><i class="pi pi-building"></i> {{ p.shopCount }}</span>
            </header>
            @if (p.description) { <p class="plan__desc">{{ p.description }}</p> }

            <div class="price">
              <strong>{{ money(cyclePrice(p, cycle())) }}</strong>
              <span>/ {{ cycleUnit(cycle()) }}</span>
            </div>
            <p class="saving">
              @if (cycle() === 'YEARLY' && yearlyNote(p); as s) { <span class="badge badge--ok">{{ s }}</span> }
              @else if (cycle() === 'MONTHLY') { {{ 'subscriptions.or_billed_yearly' | translate: { yearlyPrice: money(p.yearlyPrice) } }} }
              @else if (cycle() === 'DAILY') { {{ 'subscriptions.or_billed_monthly' | translate: { monthlyPrice: money(p.monthlyPrice) } }} }
              @if (p.trialDays > 0) { <span class="badge badge--info">{{ 'subscriptions.day_free_trial' | translate: { trialDays: p.trialDays } }}</span> }
            </p>

            <ul class="features">
              <li><i class="pi pi-print"></i><span><b>{{ limit(p.maxPrintsPerMonth) }}</b> {{ 'subscriptions.prints_month' | translate }}</span></li>
              <li><i class="pi pi-ticket"></i><span><b>{{ limit(p.maxTokensPerDay) }}</b> {{ 'subscriptions.orders_day' | translate }}</span></li>
              <li><i class="pi pi-desktop"></i><span><b>{{ limit(p.maxPrinters) }}</b> {{ (p.maxPrinters === 1 ? 'subscriptions.computers_with_printer.one' : 'subscriptions.computers_with_printer.other') | translate }}</span></li>
              <li [class.off]="!p.analyticsAccess"><i class="pi" [ngClass]="p.analyticsAccess ? 'pi-check' : 'pi-times'"></i><span>{{ 'subscriptions.sales_reports' | translate }}</span></li>
              <li [class.off]="!p.prioritySupport"><i class="pi" [ngClass]="p.prioritySupport ? 'pi-check' : 'pi-times'"></i><span>{{ 'subscriptions.priority_support' | translate }}</span></li>
              @for (h of p.highlights; track h) { <li><i class="pi pi-check"></i><span>{{ h }}</span></li> }
            </ul>

            <footer class="plan__foot">
              <button type="button" class="pf-btn" (click)="openEditor(p)"><i class="pi pi-pencil"></i> {{ 'common.edit' | translate }}</button>
              <button type="button" class="pf-btn" (click)="toggleActive(p)">{{ p.isActive ? ('subscriptions.retire' | translate) : ('subscriptions.reactivate' | translate) }}</button>
              <button type="button" class="pf-btn pf-btn--quiet danger" (click)="remove(p)" [attr.aria-label]="'subscriptions.delete_plan' | translate"><i class="pi pi-trash"></i></button>
            </footer>
          </article>
        }
      </div>
    }

    <!-- ---------- Plan change rules ---------- -->
    @if (rules(); as r) {
      <section class="pf-card rules">
        <header class="pf-card__head">
          <div>
            <h3 class="pf-eyebrow">{{ 'subscriptions.plan_change_rules' | translate }}</h3>
            <p class="sub">{{ 'subscriptions.how_a_plan_change_takes_effect' | translate }}</p>
          </div>
        </header>
        <div class="rules__grid">
          <div class="rule">
            <span class="rule__icon rule__icon--up"><i class="pi pi-arrow-up-right"></i></span>
            <div class="rule__body">
              <strong>{{ 'subscriptions.upgrade' | translate }}</strong>
              <div class="pf-seg" role="tablist" [attr.aria-label]="'subscriptions.upgrade_timing' | translate">
                <button type="button" role="tab" [class.is-on]="r.upgradeTiming === 'IMMEDIATE_PRORATED'" (click)="setRule('upgradeTiming', 'IMMEDIATE_PRORATED')">{{ 'subscriptions.immediately_pay_for_days_left' | translate }}</button>
                <button type="button" role="tab" [class.is-on]="r.upgradeTiming === 'NEXT_CYCLE'" (click)="setRule('upgradeTiming', 'NEXT_CYCLE')">{{ 'subscriptions.next_renewal' | translate }}</button>
              </div>
              <p>{{ r.upgradeTiming === 'IMMEDIATE_PRORATED' ? ('subscriptions.the_new_plan_starts_now_the' | translate) : ('subscriptions.the_shop_stays_on_its_current' | translate) }}</p>
            </div>
          </div>
          <div class="rule">
            <span class="rule__icon rule__icon--down"><i class="pi pi-arrow-down-right"></i></span>
            <div class="rule__body">
              <strong>{{ 'subscriptions.downgrade' | translate }}</strong>
              <div class="pf-seg" role="tablist" [attr.aria-label]="'subscriptions.downgrade_timing' | translate">
                <button type="button" role="tab" [class.is-on]="r.downgradeTiming === 'END_OF_CYCLE'" (click)="setRule('downgradeTiming', 'END_OF_CYCLE')">{{ 'subscriptions.end_of_billing_period' | translate }}</button>
                <button type="button" role="tab" [class.is-on]="r.downgradeTiming === 'IMMEDIATE'" (click)="setRule('downgradeTiming', 'IMMEDIATE')">{{ 'subscriptions.immediately' | translate }}</button>
              </div>
              <p>{{ r.downgradeTiming === 'END_OF_CYCLE' ? ('subscriptions.the_shop_keeps_what_it_paid' | translate) : ('subscriptions.the_cheaper_plan_starts_now_no' | translate) }}</p>
            </div>
          </div>
        </div>
      </section>
    }

    <!-- ---------- Editor ---------- -->
    <p-dialog
      [header]="editingId() ? ('subscriptions.edit_plan' | translate) : ('subscriptions.new_plan' | translate)"
      [(visible)]="editorOpen"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: 'min(44rem, calc(100vw - 1.5rem))' }"
      [contentStyle]="{ 'max-height': '72dvh' }"
    >
      <form class="form" (ngSubmit)="save()" novalidate>
        <div class="field" [class.has-error]="touched() && !!errors()['name']">
          <label for="pl-name">{{ 'subscriptions.plan_name' | translate }}</label>
          <input id="pl-name" name="name" type="text" [(ngModel)]="form.name" maxlength="60" [placeholder]="'subscriptions.e_g_standard' | translate" />
          @if (touched() && errors()['name']) { <span class="err">{{ errors()['name'] }}</span> }
        </div>
        <div class="field">
          <label for="pl-desc">{{ 'subscriptions.description' | translate }}</label>
          <textarea id="pl-desc" name="description" rows="2" [(ngModel)]="form.description" maxlength="400" [placeholder]="'subscriptions.who_is_this_plan_for' | translate"></textarea>
        </div>

        <fieldset>
          <legend>{{ 'common.pricing' | translate }}</legend>
          <div class="pair">
            <div class="field" [class.has-error]="touched() && !!errors()['daily']">
              <label for="pl-d">{{ 'subscriptions.daily_price' | translate }}</label>
              <input id="pl-d" name="daily" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.dailyPrice" />
              @if (touched() && errors()['daily']) { <span class="err">{{ errors()['daily'] }}</span> }
            </div>
            <div class="field" [class.has-error]="touched() && !!errors()['monthly']">
              <label for="pl-m">{{ 'subscriptions.monthly_price' | translate }}</label>
              <input id="pl-m" name="monthly" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.monthlyPrice" />
              @if (touched() && errors()['monthly']) { <span class="err">{{ errors()['monthly'] }}</span> }
            </div>
            <div class="field" [class.has-error]="touched() && !!errors()['yearly']">
              <label for="pl-y">{{ 'subscriptions.yearly_price' | translate }}</label>
              <input id="pl-y" name="yearly" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.yearlyPrice" />
              @if (touched() && errors()['yearly']) { <span class="err">{{ errors()['yearly'] }}</span> }
            </div>
          </div>
          @if (formSaving(); as s) { <p class="hint hint--ok"><i class="pi pi-tag"></i> {{ 'subscriptions.yearly_billing' | translate: { value: s } }}</p> }
          <div class="field narrow">
            <label for="pl-trial">{{ 'subscriptions.free_trial_days' | translate }}</label>
            <input id="pl-trial" name="trial" type="number" inputmode="numeric" min="0" max="365" [(ngModel)]="form.trialDays" />
            <span class="hint">{{ 'subscriptions.0_means_no_trial_common_choices' | translate }}</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>{{ 'subscriptions.feature_limits' | translate }} <small>{{ 'subscriptions.leave_empty_for_unlimited' | translate }}</small></legend>
          <div class="triple">
            <div class="field">
              <label for="pl-p">{{ 'subscriptions.prints_month_2' | translate }}</label>
              <input id="pl-p" name="prints" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxPrintsPerMonth" [placeholder]="'subscriptions.unlimited' | translate" />
            </div>
            <div class="field">
              <label for="pl-t">{{ 'subscriptions.orders_day_2' | translate }}</label>
              <input id="pl-t" name="tokens" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxTokensPerDay" [placeholder]="'subscriptions.unlimited' | translate" />
            </div>
            <div class="field">
              <label for="pl-d">{{ 'subscriptions.computers_connected_to_a_printer' | translate }}</label>
              <input id="pl-d" name="devices" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxPrinters" [placeholder]="'subscriptions.unlimited' | translate" />
            </div>
          </div>
          <div class="toggle"><p-toggleswitch inputId="pl-an" [(ngModel)]="form.analyticsAccess" [ngModelOptions]="{ standalone: true }" /><label for="pl-an">{{ 'subscriptions.sales_reports' | translate }}</label></div>
          <div class="toggle"><p-toggleswitch inputId="pl-ps" [(ngModel)]="form.prioritySupport" [ngModelOptions]="{ standalone: true }" /><label for="pl-ps">{{ 'subscriptions.priority_support' | translate }}</label></div>
        </fieldset>

        <div class="field">
          <label for="pl-hi">{{ 'subscriptions.extra_selling_points' | translate }} <small>{{ 'subscriptions.one_per_line' | translate }}</small></label>
          <textarea id="pl-hi" name="highlights" rows="3" [(ngModel)]="form.highlights" [placeholder]="'subscriptions.email_reminders_qr_ordering_page' | translate"></textarea>
        </div>
        <div class="toggle"><p-toggleswitch inputId="pl-on" [(ngModel)]="form.isActive" [ngModelOptions]="{ standalone: true }" /><label for="pl-on">{{ 'common.active' | translate }} <small>{{ 'subscriptions.discontinued_plans_cannot_be_given_to' | translate }}</small></label></div>
      </form>
      <ng-template #footer>
        <button type="button" class="pf-btn" (click)="editorOpen = false" [disabled]="saving()">{{ 'common.cancel' | translate }}</button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> {{ 'common.saving' | translate }} } @else { <i class="pi pi-check"></i> {{ editingId() ? ('common.save_changes' | translate) : ('subscriptions.create_plan' | translate) }} }
        </button>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
        margin-bottom: 1rem;
      }
      .push {
        margin-left: auto;
      }
      .check {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--tx-475569);
        cursor: pointer;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
      }
      .plan {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: clamp(1rem, 2.2vw, 1.5rem);
        background: var(--bg-ffffff);
        border: 1px solid var(--bd-e6eaf2);
        border-radius: 20px;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .plan.is-retired {
        background: var(--bg-f8fafc);
        border-style: dashed;
      }
      .plan__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .plan__head h3 {
        margin: 0;
        font-size: 1.25rem;
        letter-spacing: -0.02em;
        color: var(--tx-0f172a);
      }
      .count {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0.625rem;
        border-radius: 999px;
        background: var(--bg-f1f5f9);
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-475569);
      }
      .plan__desc {
        margin: 0.375rem 0 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .price {
        display: flex;
        align-items: baseline;
        gap: 0.375rem;
        margin-top: 1rem;
      }
      .price strong {
        font-size: 2rem;
        line-height: 1;
        letter-spacing: -0.03em;
        color: var(--tx-0f172a);
      }
      .price span {
        color: var(--tx-64748b);
      }
      .saving {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem 0.5rem;
        min-height: 1.75rem;
        margin: 0.375rem 0 0;
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .badge {
        display: inline-block;
        padding: 0.125rem 0.6rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
      }
      .badge--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .badge--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .badge--muted {
        background: var(--bg-e2e8f0);
        color: var(--tx-475569);
      }
      .features {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 1rem 0 1.25rem;
        padding: 1rem 0 0;
        border-top: 1px solid var(--bd-eef1f7);
        list-style: none;
        flex: 1;
      }
      .features li {
        display: flex;
        align-items: flex-start;
        gap: 0.625rem;
        font-size: 0.9rem;
        color: var(--tx-334155);
      }
      .features li i {
        margin-top: 0.2rem;
        font-size: 0.8rem;
        color: var(--tx-6366f1);
      }
      .features li.off {
        color: var(--tx-94a3b8);
      }
      .features li.off i {
        color: #cbd5e1;
      }
      .plan__foot {
        display: flex;
        gap: 0.5rem;
      }
      .plan__foot .pf-btn:first-child {
        flex: 1;
      }
      .danger {
        color: var(--tx-b91c1c);
      }
      .rules {
        margin-top: clamp(0.75rem, 1.6vw, 1.25rem);
      }
      .sub {
        margin: 0.25rem 0 0;
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .rules__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
        gap: 1rem 1.5rem;
      }
      .rule {
        display: flex;
        gap: 0.875rem;
      }
      .rule__icon {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 12px;
      }
      .rule__icon--up {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .rule__icon--down {
        background: var(--bg-fef3c7);
        color: var(--tx-b45309);
      }
      .rule__body {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
        min-width: 0;
      }
      .rule__body p {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .rule__body .pf-seg {
        max-width: 100%;
        overflow-x: auto;
      }

      /* dialog form */
      .form {
        display: flex;
        flex-direction: column;
        gap: 1.125rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        min-width: 0;
      }
      .field.narrow {
        max-width: 12rem;
        margin-top: 0.75rem;
      }
      .field label,
      fieldset legend {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      label small,
      legend small {
        font-weight: 500;
        color: var(--tx-94a3b8);
      }
      .field input,
      .field textarea {
        width: 100%;
        padding: 0.65rem 0.8rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 1rem;
        color: var(--tx-0f172a);
        outline: none;
        resize: vertical;
      }
      .field input:focus,
      .field textarea:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.14);
      }
      .field.has-error input {
        border-color: var(--bd-f0a3a3);
        background: var(--bg-fffafa);
      }
      .err {
        font-size: 0.75rem;
        color: var(--tx-b42318);
      }
      .hint {
        margin: 0;
        font-size: 0.75rem;
        color: var(--tx-94a3b8);
      }
      .hint--ok {
        margin-top: 0.5rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-15803d);
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: none;
        min-width: 0;
      }
      fieldset legend {
        padding: 0;
        margin-bottom: 0.5rem;
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
        gap: 1rem;
      }
      .triple {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
        gap: 1rem;
        margin-bottom: 0.875rem;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.375rem 0;
      }
      .toggle label {
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--tx-0f172a);
      }
    `,
  ],
})
export class SubPlansComponent implements OnInit {
  readonly money = money;
  readonly limit = limit;

  loading = signal(true);
  plans = signal<SubscriptionPlan[]>([]);
  rules = signal<BillingSettings | null>(null);
  readonly cycles = BILLING_CYCLES;
  readonly cyclePrice = cyclePrice;
  readonly cycleUnit = cycleUnit;
  cycle = signal<BillingCycle>('MONTHLY');
  showRetired = signal(false);

  editorOpen = false;
  editingId = signal<string | null>(null);
  saving = signal(false);
  touched = signal(false);
  form: Form = { ...BLANK };

  constructor(
    private readonly billing: BillingService,
    private readonly messages: MessageService,
    private readonly confirm: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.billing.settings().subscribe((s) => this.rules.set(s));
  }

  load(): void {
    this.billing.plans().subscribe({
      next: (p) => {
        this.plans.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  visible(): SubscriptionPlan[] {
    return this.plans().filter((p) => this.showRetired() || p.isActive);
  }

  yearlyNote(p: SubscriptionPlan): string | null {
    return yearlySaving(p);
  }

  formSaving(): string | null {
    const m = Number(this.form.monthlyPrice);
    const y = Number(this.form.yearlyPrice);
    if (!this.form.monthlyPrice || this.form.yearlyPrice === null || y >= m * 12) return null;
    return yearlySaving({ monthlyPrice: String(m), yearlyPrice: String(y) });
  }

  errors(): Record<string, string> {
    const e: Record<string, string> = {};
    const f = this.form;
    if (f.name.trim().length < 2) e['name'] = t('subscriptions.enter_a_plan_name');
    if (f.dailyPrice === null || Number(f.dailyPrice) < 0) e['daily'] = t('subscriptions.enter_the_daily_price');
    if (f.monthlyPrice === null || Number(f.monthlyPrice) < 0) e['monthly'] = t('subscriptions.enter_the_monthly_price');
    else if (f.dailyPrice !== null && Number(f.monthlyPrice) > Number(f.dailyPrice) * 30) {
      e['monthly'] = t('subscriptions.monthly_price_can_t_be_more');
    }
    if (f.yearlyPrice === null || Number(f.yearlyPrice) < 0) e['yearly'] = t('subscriptions.enter_the_yearly_price');
    else if (f.monthlyPrice !== null && Number(f.yearlyPrice) > Number(f.monthlyPrice) * 12) {
      e['yearly'] = t('subscriptions.yearly_price_can_t_be_more');
    }
    return e;
  }

  openEditor(plan?: SubscriptionPlan): void {
    this.touched.set(false);
    this.editingId.set(plan?.id ?? null);
    this.form = plan
      ? {
          name: plan.name,
          description: plan.description ?? '',
          dailyPrice: Number(plan.dailyPrice),
          monthlyPrice: Number(plan.monthlyPrice),
          yearlyPrice: Number(plan.yearlyPrice),
          trialDays: plan.trialDays,
          maxPrintsPerMonth: plan.maxPrintsPerMonth,
          maxTokensPerDay: plan.maxTokensPerDay,
          maxPrinters: plan.maxPrinters,
          prioritySupport: plan.prioritySupport,
          analyticsAccess: plan.analyticsAccess,
          highlights: plan.highlights.join('\n'),
          isActive: plan.isActive,
        }
      : { ...BLANK };
    this.editorOpen = true;
  }

  save(): void {
    this.touched.set(true);
    if (Object.keys(this.errors()).length) return;
    const f = this.form;
    const num = (v: number | null) => (v === null || v === undefined || (v as unknown) === '' ? null : Number(v));
    const dto: PlanInput = {
      name: f.name.trim(),
      description: f.description.trim(),
      dailyPrice: Number(f.dailyPrice),
      monthlyPrice: Number(f.monthlyPrice),
      yearlyPrice: Number(f.yearlyPrice),
      trialDays: Number(f.trialDays ?? 0),
      maxPrintsPerMonth: num(f.maxPrintsPerMonth),
      maxTokensPerDay: num(f.maxTokensPerDay),
      maxPrinters: num(f.maxPrinters),
      prioritySupport: f.prioritySupport,
      analyticsAccess: f.analyticsAccess,
      highlights: f.highlights.split('\n').map((h) => h.trim()).filter(Boolean),
      isActive: f.isActive,
    };
    this.saving.set(true);
    const id = this.editingId();
    (id ? this.billing.updatePlan(id, dto) : this.billing.createPlan(dto)).subscribe({
      next: () => {
        this.saving.set(false);
        this.editorOpen = false;
        this.messages.add({ severity: 'success', summary: id ? t('subscriptions.plan_updated') : t('subscriptions.plan_created') });
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  toggleActive(p: SubscriptionPlan): void {
    this.billing.setPlanActive(p.id, !p.isActive).subscribe(() => {
      this.messages.add({ severity: 'success', summary: p.isActive ? `${p.name} discontinued` : t('subscriptions.is_active_again', { name: p.name }) });
      this.load();
    });
  }

  remove(p: SubscriptionPlan): void {
    this.confirm.confirm({
      get header() { return t('subscriptions.delete', { name: p.name }); },
      get message() { return t('subscriptions.this_can_t_be_undone_a'); },
      icon: 'pi pi-trash',
      get acceptLabel() { return t('common.delete'); },
      get rejectLabel() { return t('subscriptions.keep'); },
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.billing.deletePlan(p.id).subscribe(() => {
          this.messages.add({ severity: 'success', summary: `${p.name} deleted` });
          this.load();
        }),
    });
  }

  setRule(key: 'upgradeTiming' | 'downgradeTiming', value: string): void {
    const current = this.rules();
    if (!current || current[key] === value) return;
    this.billing.updateSettings({ [key]: value } as Partial<BillingSettings>).subscribe((s) => {
      this.rules.set(s);
      this.messages.add({ severity: 'success', get summary() { return t('subscriptions.plan_change_rule_saved'); } });
    });
  }
}
