import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { BillingService } from '../../core/services/billing.service';
import { BillingChannel, BillingSettings } from '../../core/models/billing.models';
import { CHANNEL_META } from '../../shared/billing/billing.util';

interface Form {
  graceDays: number;
  suspendAfterPastDueDays: number;
  retryAttempts: number;
  retryIntervalDays: number;
  renewalReminderDays: number;
  defaultChannels: BillingChannel[];
}

/** Payment-failure rules and notification defaults for the whole platform. */
@Component({
  selector: 'app-sub-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (loading()) {
      <div class="pf-skeleton" style="height: 24rem"></div>
    } @else {
      <div class="grid">
        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">When a payment is missed</h3></header>

            <ol class="timeline">
              <li>
                <span class="tl tl--warn">1</span>
                <div class="tl__body">
                  <strong>Extra days to pay</strong>
                  <p>The shop keeps <b>full access</b> and sees a warning banner.</p>
                  <label class="num"><input type="number" min="0" max="60" [(ngModel)]="form.graceDays" name="grace" /> days</label>
                </div>
              </li>
              <li>
                <span class="tl tl--bad">2</span>
                <div class="tl__body">
                  <strong>Payment overdue</strong>
                  <p>Read-only: old orders can be viewed but no new print requests are accepted. Customers see the shop as unavailable.</p>
                  <label class="num">Suspend after <input type="number" min="0" max="90" [(ngModel)]="form.suspendAfterPastDueDays" name="susp" /> days</label>
                </div>
              </li>
              <li>
                <span class="tl tl--dark">3</span>
                <div class="tl__body">
                  <strong>Suspended</strong>
                  <p>The shop portal is locked except Billing. Customers see &ldquo;This shop is temporarily unavailable&rdquo;.</p>
                </div>
              </li>
            </ol>
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Reminders</h3></header>
            <p class="lead">Automatic messages are sent: before renewal, when a payment fails, halfway through the extra days to pay, and a final warning before suspension.</p>
            <label class="num">Renewal reminder <input type="number" min="0" max="30" [(ngModel)]="form.renewalReminderDays" name="remind" /> days before <span class="fine inline">(0 turns it off)</span></label>
          </section>
        </div>

        <div class="col">
          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Automatic payment retries</h3></header>
            <p class="lead">Only for shops paying through a connected online payment service. Shops that pay offline are followed up with reminders instead.</p>
            <div class="row">
              <label class="num"><input type="number" min="0" max="10" [(ngModel)]="form.retryAttempts" name="retries" /> retries</label>
              <label class="num">every <input type="number" min="1" max="14" [(ngModel)]="form.retryIntervalDays" name="interval" /> days</label>
            </div>
            <p class="fine"><i class="pi pi-info-circle"></i> No online payment service is connected yet, so these rules take effect once one is added.</p>
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Default notification channels</h3></header>
            <p class="lead">Used for every shop unless that shop picks its own on its billing page.</p>
            <div class="channels">
              @for (c of channels; track c.value) {
                <button type="button" class="channel" [class.is-on]="has(c.value)" [disabled]="c.locked" (click)="toggle(c.value)" [attr.aria-pressed]="has(c.value)">
                  <i class="pi" [ngClass]="c.icon"></i>
                  <span>{{ c.label }}</span>
                  @if (c.locked) { <em>always on</em> }
                </button>
              }
            </div>
            <p class="fine"><i class="pi pi-info-circle"></i> In-app messages are delivered now. Email, SMS and WhatsApp messages are queued and recorded, but no provider is connected yet, so nothing is sent on those channels.</p>
          </section>
        </div>
      </div>

      <div class="foot">
        <button type="button" class="pf-btn" (click)="runChecks()" [disabled]="running()">
          @if (running()) { <i class="pi pi-spin pi-spinner"></i> Checking… } @else { <i class="pi pi-refresh"></i> Run billing checks now }
        </button>
        <button type="button" class="pf-btn pf-btn--primary" (click)="save()" [disabled]="saving() || !dirty()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> Saving… } @else { <i class="pi pi-check"></i> Save settings }
        </button>
      </div>
      @if (result(); as r) {
        <div class="result" role="status">
          <strong>{{ r.changes.length ? r.changes.length + ' change(s) made' : 'Nothing needed changing' }}</strong> across {{ r.checked }} subscriptions.
          @if (r.changes.length) { <ul>@for (c of r.changes; track c) { <li>{{ c }}</li> }</ul> }
        </div>
      }
      <p class="fine center">Checks also run automatically every 15 minutes.</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .grid {
        display: grid;
        margin: 0; /* PrimeFlex's global .grid has negative side margins */
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        align-items: start;
      }
      /* Each column stacks its own cards independently (no shared row
         height with the other column), so a short card never leaves a
         block of empty space under it just because its neighbour is tall. */
      .col {
        display: flex;
        flex-direction: column;
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        min-width: 0;
      }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .lead {
        margin: 0 0 1rem;
        font-size: 0.875rem;
        line-height: 1.55;
        color: var(--tx-64748b);
      }
      .fine {
        margin: 0.875rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .fine.inline {
        margin: 0;
        color: var(--tx-94a3b8);
      }
      .fine.center {
        text-align: center;
      }
      .fine i {
        margin-right: 0.25rem;
      }
      .timeline {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .timeline li {
        display: flex;
        gap: 0.875rem;
      }
      .tl {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.875rem;
        height: 1.875rem;
        border-radius: 50%;
        font-size: 0.8125rem;
        font-weight: 800;
        color: #fff;
      }
      .tl--warn {
        background: #f59e0b;
      }
      .tl--bad {
        background: #ef4444;
      }
      .tl--dark {
        background: #0f172a;
      }
      .tl__body {
        min-width: 0;
      }
      .tl__body strong {
        color: var(--tx-0f172a);
      }
      .tl__body p {
        margin: 0.125rem 0 0.5rem;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.5rem;
      }
      .num {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--tx-334155);
      }
      .num input {
        width: 5rem;
        padding: 0.5rem 0.625rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 10px;
        background: var(--bg-f8fafc);
        font: inherit;
        font-size: 1rem;
        text-align: center;
        outline: none;
      }
      .num input:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
      }
      .channels {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr));
        gap: 0.625rem;
      }
      .channel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.875rem 0.5rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 14px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--tx-64748b);
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .channel i {
        font-size: 1.25rem;
      }
      .channel em {
        font-style: normal;
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--tx-94a3b8);
      }
      .channel.is-on {
        border-color: var(--p-primary-500);
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }
      .channel:disabled {
        cursor: default;
      }
      .foot {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1.25rem;
      }
      .result {
        margin-top: 1rem;
        padding: 0.875rem 1rem;
        border-radius: 14px;
        background: var(--bg-f0fdf4);
        border: 1px solid var(--bd-bbf7d0);
        font-size: 0.875rem;
        color: var(--tx-166534);
      }
      .result ul {
        margin: 0.5rem 0 0;
        padding-left: 1.25rem;
        color: var(--tx-15803d);
      }
    `,
  ],
})
export class SubSettingsComponent implements OnInit {
  readonly channels = CHANNEL_META;

  loading = signal(true);
  saving = signal(false);
  running = signal(false);
  result = signal<{ checked: number; changes: string[] } | null>(null);
  form: Form = { graceDays: 5, suspendAfterPastDueDays: 7, retryAttempts: 3, retryIntervalDays: 1, renewalReminderDays: 3, defaultChannels: ['IN_APP'] };
  private saved = '';

  constructor(
    private readonly billing: BillingService,
    private readonly messages: MessageService,
  ) {}

  ngOnInit(): void {
    this.billing.settings().subscribe({
      next: (s) => {
        this.apply(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private apply(s: BillingSettings): void {
    this.form = {
      graceDays: s.graceDays,
      suspendAfterPastDueDays: s.suspendAfterPastDueDays,
      retryAttempts: s.retryAttempts,
      retryIntervalDays: s.retryIntervalDays,
      renewalReminderDays: s.renewalReminderDays,
      defaultChannels: [...s.defaultChannels],
    };
    this.saved = JSON.stringify(this.form);
  }

  dirty(): boolean {
    return JSON.stringify(this.form) !== this.saved;
  }

  has(c: BillingChannel): boolean {
    return this.form.defaultChannels.includes(c);
  }

  toggle(c: BillingChannel): void {
    const list = this.form.defaultChannels;
    this.form.defaultChannels = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
  }

  save(): void {
    const f = this.form;
    const ints = [f.graceDays, f.suspendAfterPastDueDays, f.retryAttempts, f.retryIntervalDays, f.renewalReminderDays];
    if (ints.some((n) => n === null || n === undefined || !Number.isInteger(Number(n)) || Number(n) < 0) || Number(f.retryIntervalDays) < 1) {
      this.messages.add({ severity: 'warn', summary: 'Check the numbers', detail: 'Use whole numbers; the retry interval must be at least 1 day.' });
      return;
    }
    this.saving.set(true);
    this.billing
      .updateSettings({
        graceDays: Number(f.graceDays),
        suspendAfterPastDueDays: Number(f.suspendAfterPastDueDays),
        retryAttempts: Number(f.retryAttempts),
        retryIntervalDays: Number(f.retryIntervalDays),
        renewalReminderDays: Number(f.renewalReminderDays),
        defaultChannels: f.defaultChannels,
      })
      .subscribe({
        next: (s) => {
          this.apply(s);
          this.saving.set(false);
          this.messages.add({ severity: 'success', summary: 'Billing settings saved' });
        },
        error: () => this.saving.set(false),
      });
  }

  runChecks(): void {
    this.running.set(true);
    this.billing.runChecks().subscribe({
      next: (r) => {
        this.result.set(r);
        this.running.set(false);
      },
      error: () => this.running.set(false),
    });
  }
}
