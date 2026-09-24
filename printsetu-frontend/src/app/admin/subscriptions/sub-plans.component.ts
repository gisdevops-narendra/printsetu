import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BillingService } from '../../core/services/billing.service';
import { BillingCycle, BillingSettings, PlanInput, SubscriptionPlan } from '../../core/models/billing.models';
import { BILLING_CYCLES, cyclePrice, cycleUnit, limit, money, yearlySaving } from '../../shared/billing/billing.util';

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
  imports: [CommonModule, FormsModule, DialogModule, ToggleSwitchModule],
  template: `
    <div class="bar">
      <div class="pf-seg" role="tablist" aria-label="Price period">
        @for (c of cycles; track c.value) {
          <button type="button" role="tab" [class.is-on]="cycle() === c.value" [attr.aria-selected]="cycle() === c.value" (click)="cycle.set(c.value)">{{ c.label }}</button>
        }
      </div>
      <label class="check"><input type="checkbox" [ngModel]="showRetired()" (ngModelChange)="showRetired.set($event)" /> Show discontinued plans</label>
      <button type="button" class="pf-btn pf-btn--primary push" (click)="openEditor()"><i class="pi pi-plus"></i> New plan</button>
    </div>

    @if (loading()) {
      <div class="cards">@for (i of [1, 2, 3]; track i) { <div class="pf-skeleton" style="height: 26rem"></div> }</div>
    } @else if (visible().length === 0) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-tags"></i></span>
        <strong>No plans yet</strong>
        <p>Create your first plan, for example Basic, Standard and Premium.</p>
        <button type="button" class="pf-btn pf-btn--primary" (click)="openEditor()"><i class="pi pi-plus"></i> New plan</button>
      </div>
    } @else {
      <div class="cards">
        @for (p of visible(); track p.id) {
          <article class="plan" [class.is-retired]="!p.isActive">
            <header class="plan__head">
              <div>
                <h3>{{ p.name }}</h3>
                @if (!p.isActive) { <span class="badge badge--muted">Discontinued</span> }
              </div>
              <span class="count" [title]="p.shopCount + ' shops on this plan'"><i class="pi pi-building"></i> {{ p.shopCount }}</span>
            </header>
            @if (p.description) { <p class="plan__desc">{{ p.description }}</p> }

            <div class="price">
              <strong>{{ money(cyclePrice(p, cycle())) }}</strong>
              <span>/ {{ cycleUnit(cycle()) }}</span>
            </div>
            <p class="saving">
              @if (cycle() === 'YEARLY' && yearlyNote(p); as s) { <span class="badge badge--ok">{{ s }}</span> }
              @else if (cycle() === 'MONTHLY') { or {{ money(p.yearlyPrice) }} billed yearly }
              @else if (cycle() === 'DAILY') { or {{ money(p.monthlyPrice) }} billed monthly }
              @if (p.trialDays > 0) { <span class="badge badge--info">{{ p.trialDays }}-day free trial</span> }
            </p>

            <ul class="features">
              <li><i class="pi pi-print"></i><span><b>{{ limit(p.maxPrintsPerMonth) }}</b> prints / month</span></li>
              <li><i class="pi pi-ticket"></i><span><b>{{ limit(p.maxTokensPerDay) }}</b> orders / day</span></li>
              <li><i class="pi pi-desktop"></i><span><b>{{ limit(p.maxPrinters) }}</b> {{ p.maxPrinters === 1 ? 'computer' : 'computers' }} with a printer</span></li>
              <li [class.off]="!p.analyticsAccess"><i class="pi" [ngClass]="p.analyticsAccess ? 'pi-check' : 'pi-times'"></i><span>Sales reports</span></li>
              <li [class.off]="!p.prioritySupport"><i class="pi" [ngClass]="p.prioritySupport ? 'pi-check' : 'pi-times'"></i><span>Priority support</span></li>
              @for (h of p.highlights; track h) { <li><i class="pi pi-check"></i><span>{{ h }}</span></li> }
            </ul>

            <footer class="plan__foot">
              <button type="button" class="pf-btn" (click)="openEditor(p)"><i class="pi pi-pencil"></i> Edit</button>
              <button type="button" class="pf-btn" (click)="toggleActive(p)">{{ p.isActive ? 'Retire' : 'Reactivate' }}</button>
              <button type="button" class="pf-btn pf-btn--quiet danger" (click)="remove(p)" aria-label="Delete plan"><i class="pi pi-trash"></i></button>
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
            <h3 class="pf-eyebrow">Plan change rules</h3>
            <p class="sub">How a plan change takes effect when an admin moves a shop. You can still override this per change.</p>
          </div>
        </header>
        <div class="rules__grid">
          <div class="rule">
            <span class="rule__icon rule__icon--up"><i class="pi pi-arrow-up-right"></i></span>
            <div class="rule__body">
              <strong>Upgrade</strong>
              <div class="pf-seg" role="tablist" aria-label="Upgrade timing">
                <button type="button" role="tab" [class.is-on]="r.upgradeTiming === 'IMMEDIATE_PRORATED'" (click)="setRule('upgradeTiming', 'IMMEDIATE_PRORATED')">Immediately, pay for days left</button>
                <button type="button" role="tab" [class.is-on]="r.upgradeTiming === 'NEXT_CYCLE'" (click)="setRule('upgradeTiming', 'NEXT_CYCLE')">Next renewal</button>
              </div>
              <p>{{ r.upgradeTiming === 'IMMEDIATE_PRORATED' ? 'The new plan starts now. The shop is charged the price difference for the days left in the billing period.' : 'The shop stays on its current plan until the next renewal, then moves to the new one.' }}</p>
            </div>
          </div>
          <div class="rule">
            <span class="rule__icon rule__icon--down"><i class="pi pi-arrow-down-right"></i></span>
            <div class="rule__body">
              <strong>Downgrade</strong>
              <div class="pf-seg" role="tablist" aria-label="Downgrade timing">
                <button type="button" role="tab" [class.is-on]="r.downgradeTiming === 'END_OF_CYCLE'" (click)="setRule('downgradeTiming', 'END_OF_CYCLE')">End of billing period</button>
                <button type="button" role="tab" [class.is-on]="r.downgradeTiming === 'IMMEDIATE'" (click)="setRule('downgradeTiming', 'IMMEDIATE')">Immediately</button>
              </div>
              <p>{{ r.downgradeTiming === 'END_OF_CYCLE' ? 'The shop keeps what it paid for until the cycle ends, then moves to the cheaper plan. No refund is due.' : 'The cheaper plan starts now. No refund or credit is given for the unused days.' }}</p>
            </div>
          </div>
        </div>
      </section>
    }

    <!-- ---------- Editor ---------- -->
    <p-dialog
      [header]="editingId() ? 'Edit plan' : 'New plan'"
      [(visible)]="editorOpen"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: 'min(44rem, calc(100vw - 1.5rem))' }"
      [contentStyle]="{ 'max-height': '72dvh' }"
    >
      <form class="form" (ngSubmit)="save()" novalidate>
        <div class="field" [class.has-error]="touched() && !!errors()['name']">
          <label for="pl-name">Plan name</label>
          <input id="pl-name" name="name" type="text" [(ngModel)]="form.name" maxlength="60" placeholder="e.g. Standard" />
          @if (touched() && errors()['name']) { <span class="err">{{ errors()['name'] }}</span> }
        </div>
        <div class="field">
          <label for="pl-desc">Description</label>
          <textarea id="pl-desc" name="description" rows="2" [(ngModel)]="form.description" maxlength="400" placeholder="Who is this plan for?"></textarea>
        </div>

        <fieldset>
          <legend>Pricing</legend>
          <div class="pair">
            <div class="field" [class.has-error]="touched() && !!errors()['daily']">
              <label for="pl-d">Daily price (₹)</label>
              <input id="pl-d" name="daily" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.dailyPrice" />
              @if (touched() && errors()['daily']) { <span class="err">{{ errors()['daily'] }}</span> }
            </div>
            <div class="field" [class.has-error]="touched() && !!errors()['monthly']">
              <label for="pl-m">Monthly price (₹)</label>
              <input id="pl-m" name="monthly" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.monthlyPrice" />
              @if (touched() && errors()['monthly']) { <span class="err">{{ errors()['monthly'] }}</span> }
            </div>
            <div class="field" [class.has-error]="touched() && !!errors()['yearly']">
              <label for="pl-y">Yearly price (₹)</label>
              <input id="pl-y" name="yearly" type="number" inputmode="decimal" min="0" step="1" [(ngModel)]="form.yearlyPrice" />
              @if (touched() && errors()['yearly']) { <span class="err">{{ errors()['yearly'] }}</span> }
            </div>
          </div>
          @if (formSaving(); as s) { <p class="hint hint--ok"><i class="pi pi-tag"></i> Yearly billing: {{ s }}</p> }
          <div class="field narrow">
            <label for="pl-trial">Free trial (days)</label>
            <input id="pl-trial" name="trial" type="number" inputmode="numeric" min="0" max="365" [(ngModel)]="form.trialDays" />
            <span class="hint">0 means no trial. Common choices: 7 or 14.</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Feature limits <small>leave empty for unlimited</small></legend>
          <div class="triple">
            <div class="field">
              <label for="pl-p">Prints / month</label>
              <input id="pl-p" name="prints" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxPrintsPerMonth" placeholder="Unlimited" />
            </div>
            <div class="field">
              <label for="pl-t">Orders / day</label>
              <input id="pl-t" name="tokens" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxTokensPerDay" placeholder="Unlimited" />
            </div>
            <div class="field">
              <label for="pl-d">Computers connected to a printer</label>
              <input id="pl-d" name="devices" type="number" inputmode="numeric" min="1" [(ngModel)]="form.maxPrinters" placeholder="Unlimited" />
            </div>
          </div>
          <div class="toggle"><p-toggleswitch inputId="pl-an" [(ngModel)]="form.analyticsAccess" [ngModelOptions]="{ standalone: true }" /><label for="pl-an">Sales reports</label></div>
          <div class="toggle"><p-toggleswitch inputId="pl-ps" [(ngModel)]="form.prioritySupport" [ngModelOptions]="{ standalone: true }" /><label for="pl-ps">Priority support</label></div>
        </fieldset>

        <div class="field">
          <label for="pl-hi">Extra selling points <small>one per line</small></label>
          <textarea id="pl-hi" name="highlights" rows="3" [(ngModel)]="form.highlights" placeholder="Email reminders&#10;QR ordering page"></textarea>
        </div>
        <div class="toggle"><p-toggleswitch inputId="pl-on" [(ngModel)]="form.isActive" [ngModelOptions]="{ standalone: true }" /><label for="pl-on">Active <small>discontinued plans cannot be given to new shops but keep their history</small></label></div>
      </form>
      <ng-template #footer>
        <button type="button" class="pf-btn" (click)="editorOpen = false" [disabled]="saving()">Cancel</button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="save()" [disabled]="saving()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check"></i> {{ editingId() ? 'Save changes' : 'Create plan' }} }
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
    if (f.name.trim().length < 2) e['name'] = 'Enter a plan name.';
    if (f.dailyPrice === null || Number(f.dailyPrice) < 0) e['daily'] = 'Enter the daily price.';
    if (f.monthlyPrice === null || Number(f.monthlyPrice) < 0) e['monthly'] = 'Enter the monthly price.';
    else if (f.dailyPrice !== null && Number(f.monthlyPrice) > Number(f.dailyPrice) * 30) {
      e['monthly'] = 'Monthly price can’t be more than 30 days of the daily price.';
    }
    if (f.yearlyPrice === null || Number(f.yearlyPrice) < 0) e['yearly'] = 'Enter the yearly price.';
    else if (f.monthlyPrice !== null && Number(f.yearlyPrice) > Number(f.monthlyPrice) * 12) {
      e['yearly'] = 'Yearly price can’t be more than 12 months of the monthly price.';
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
        this.messages.add({ severity: 'success', summary: id ? 'Plan updated' : 'Plan created' });
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  toggleActive(p: SubscriptionPlan): void {
    this.billing.setPlanActive(p.id, !p.isActive).subscribe(() => {
      this.messages.add({ severity: 'success', summary: p.isActive ? `${p.name} discontinued` : `${p.name} is active again` });
      this.load();
    });
  }

  remove(p: SubscriptionPlan): void {
    this.confirm.confirm({
      header: `Delete ${p.name}?`,
      message: 'This can’t be undone. A plan that shops or invoices still use can only be discontinued, not deleted.',
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep',
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
      this.messages.add({ severity: 'success', summary: 'Plan change rule saved' });
    });
  }
}
