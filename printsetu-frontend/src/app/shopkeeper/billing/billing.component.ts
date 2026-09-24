import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmationService, MessageService } from 'primeng/api';
import { BillingService } from '../../core/services/billing.service';
import { SubscriptionStatusService } from '../../core/services/subscription-status.service';
import { BillingChannel, InvoiceRecord, ShopBillingOverview } from '../../core/models/billing.models';
import { BillingPillComponent } from '../../shared/billing/billing-pill.component';
import { InvoiceTableComponent } from '../../shared/billing/invoice-table.component';
import { CHANNEL_META, STATE_META, cyclePrice, cycleUnit, downloadBlob, limit, money, printBlob, yearlySaving } from '../../shared/billing/billing.util';

/** The shop owner's plan, usage, invoices and notification preferences. Never locked, even when the shop is suspended. */
@Component({
  selector: 'app-shop-billing',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ToggleSwitchModule, BillingPillComponent, InvoiceTableComponent],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Billing</h1>
        <p class="page-subtitle m-0">Your plan, usage and invoices.</p>
      </div>
    </div>

    @if (loading()) {
      <div class="pf-skeleton" style="height: 12rem"></div>
      <div class="pf-skeleton" style="height: 14rem; margin-top: 1rem"></div>
    } @else if (error()) {
      <div class="pf-card pf-empty">
        <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
        <strong>Couldn't load your billing details</strong>
        <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> Try again</button>
      </div>
    } @else if (o(); as o) {
      @if (o.access.level === 'SUSPENDED') {
        <div class="locked" role="alert">
          <i class="pi pi-lock"></i>
          <div>
            <strong>Your shop is suspended</strong>
            <p>Customers who scan your QR code see “This shop is temporarily unavailable”. Only this Billing page is open until your account is turned back on.@if (o.amountDue) { Pay {{ money(o.amountDue.amount, o.amountDue.currency) }} to your administrator and access returns as soon as they record it. }</p>
          </div>
        </div>
      }

      @if (!o.subscription || !o.plan) {
        <section class="pf-card pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-tag"></i></span>
          <strong>No plan assigned yet</strong>
          <p>Your shop has full access. Your administrator will set up a plan when billing starts.</p>
        </section>
      } @else {
        <section class="hero">
          <div class="hero__main">
            <div class="hero__top">
              <span class="eyebrow">Current plan</span>
              <app-billing-pill [state]="o.subscription.status" />
            </div>
            <h2>{{ o.plan.name }}</h2>
            <p class="price"><strong>{{ money(cyclePrice(o.plan, o.subscription.cycle), o.plan.currency) }}</strong> / {{ cycleUnit(o.subscription.cycle) }}
              @if (o.subscription.cycle === 'YEARLY' && saving(o); as s) { <span class="save">{{ s }}</span> }
            </p>
            <p class="hint">{{ hint(o) }}</p>
          </div>
          <dl class="hero__facts">
            <div><dt>Started</dt><dd>{{ o.subscription.startDate | date: 'd MMM y' }}</dd></div>
            <div>
              <dt>{{ o.subscription.status === 'TRIAL' ? 'Trial ends' : o.subscription.cancelAtPeriodEnd ? 'Ends on' : 'Next billing' }}</dt>
              <dd>{{ o.subscription.currentPeriodEnd | date: 'd MMM y' }}</dd>
            </div>
            @if (o.subscription.status === 'PAYMENT_PENDING' && o.subscription.graceEndsAt) {
              <div class="warn"><dt>Pay before</dt><dd>{{ o.subscription.graceEndsAt | date: 'd MMM y' }}</dd></div>
            }
            @if (o.pendingPlan) { <div><dt>Moving to</dt><dd>{{ o.pendingPlan.name }}</dd></div> }
          </dl>
        </section>

        @if (o.amountDue; as due) {
          <section class="due">
            <div>
              <span class="eyebrow">Amount due</span>
              <strong>{{ money(due.amount, due.currency) }}</strong>
              <span class="due__sub">Invoice {{ due.number }} · due {{ due.dueDate | date: 'd MMM y' }}</span>
            </div>
            <p>Pay your administrator by cash, UPI or bank transfer and quote the invoice number. Your account updates as soon as they record the payment.</p>
          </section>
        }

        <div class="grid">
          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Usage &amp; limits</h3></header>
            <div class="usage">
              <div>
                <div class="usage__row"><span>Prints this month</span><strong>{{ o.usage.printsThisMonth | number }} / {{ limit(o.plan.maxPrintsPerMonth) }}</strong></div>
                <div class="track"><span [style.width.%]="pct(o.usage.printsThisMonth, o.plan.maxPrintsPerMonth)" [class.hot]="pct(o.usage.printsThisMonth, o.plan.maxPrintsPerMonth) >= 90"></span></div>
              </div>
              <div>
                <div class="usage__row"><span>Orders today</span><strong>{{ o.usage.tokensToday | number }} / {{ limit(o.plan.maxTokensPerDay) }}</strong></div>
                <div class="track"><span [style.width.%]="pct(o.usage.tokensToday, o.plan.maxTokensPerDay)" [class.hot]="pct(o.usage.tokensToday, o.plan.maxTokensPerDay) >= 90"></span></div>
              </div>
              <div>
                <div class="usage__row"><span>Computers connected to a printer</span><strong>{{ o.usage.printers }} / {{ limit(o.plan.maxPrinters) }}</strong></div>
                <div class="track"><span [style.width.%]="pct(o.usage.printers, o.plan.maxPrinters)" [class.hot]="pct(o.usage.printers, o.plan.maxPrinters) >= 100"></span></div>
              </div>
            </div>
            <ul class="feat">
              <li [class.off]="!o.plan.analyticsAccess"><i class="pi" [ngClass]="o.plan.analyticsAccess ? 'pi-check' : 'pi-times'"></i> Sales reports</li>
              <li [class.off]="!o.plan.prioritySupport"><i class="pi" [ngClass]="o.plan.prioritySupport ? 'pi-check' : 'pi-times'"></i> Priority support</li>
              @for (h of o.plan.highlights; track h) { <li><i class="pi pi-check"></i> {{ h }}</li> }
            </ul>
            <p class="fine">To change your plan, contact your administrator.</p>
          </section>

          <section class="pf-card">
            <header class="pf-card__head"><h3 class="pf-eyebrow">Preferences</h3></header>
            <div class="pref">
              <div><strong>Renew automatically</strong><p>{{ o.subscription.autoRenew ? 'A renewal invoice is created when your period ends.' : 'Your plan expires at the end of the period.' }}</p></div>
              <p-toggleswitch [ngModel]="o.subscription.autoRenew" (ngModelChange)="setAutoRenew($event)" [ngModelOptions]="{ standalone: true }" aria-label="Renew automatically" [disabled]="o.access.state === 'CANCELLED'" />
            </div>
            <div class="pref pref--col">
              <div><strong>Reminders and billing alerts</strong><p>How we contact you about renewals and payments.</p></div>
              <div class="chans">
                @for (c of channelMeta; track c.value) {
                  <button type="button" class="chan" [class.is-on]="o.channels.includes(c.value)" [disabled]="c.locked" (click)="toggleChannel(c.value)" [attr.aria-pressed]="o.channels.includes(c.value)"><i class="pi" [ngClass]="c.icon"></i> {{ c.label }}</button>
                }
              </div>
              <p class="fine">In-app alerts are always on. Email, SMS and WhatsApp are saved as your preference.</p>
            </div>
            @if (o.subscription.status !== 'CANCELLED') {
              <div class="pref cancel">
                @if (o.subscription.cancelAtPeriodEnd) {
                  <div><strong>Your plan is set to end on {{ o.subscription.currentPeriodEnd | date: 'd MMM y' }}</strong><p>Changed your mind? You can keep it.</p></div>
                  <button type="button" class="pf-btn" (click)="resume()" [disabled]="busy()"><i class="pi pi-replay"></i> Keep my plan</button>
                } @else {
                  <div><strong>Cancel subscription</strong><p>You keep full access until the end of the period you've paid for.</p></div>
                  <button type="button" class="pf-btn danger" (click)="cancel()" [disabled]="busy()">Cancel plan</button>
                }
              </div>
            }
          </section>
        </div>
      }

      <section class="pf-card invoices">
        <header class="pf-card__head"><h3 class="pf-eyebrow">Invoices</h3></header>
        <app-invoice-table [invoices]="invoices()" emptyText="No invoices yet. They appear here once billing starts." (pdf)="pdf($event)" (print)="print($event)" />
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        /* Routed pages are pinned to the viewport height by a global rule; this one is taller
           than the screen and scrolls, so it must size to its content instead of shrinking. */
        height: auto !important;
      }
      .locked {
        display: flex;
        gap: 0.875rem;
        margin-bottom: 1.25rem;
        padding: 1rem 1.125rem;
        border-radius: 16px;
        background: #0f172a;
        color: #e2e8f0;
      }
      .locked > i {
        margin-top: 0.2rem;
        font-size: 1.25rem;
        color: #fca5a5;
      }
      .locked strong {
        color: #fff;
      }
      .locked p {
        margin: 0.25rem 0 0;
        font-size: 0.875rem;
        line-height: 1.55;
      }
      .eyebrow {
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--tx-94a3b8);
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
        gap: 1.25rem;
        padding: clamp(1.125rem, 2.4vw, 1.75rem);
        border-radius: 22px;
        background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 60%, #6366f1 100%);
        color: #e0e7ff;
      }
      @media (max-width: 760px) {
        .hero {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .hero .eyebrow {
        color: #a5b4fc;
      }
      .hero__top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .hero h2 {
        margin: 0.5rem 0 0;
        font-size: clamp(1.75rem, 3.4vw, 2.25rem);
        letter-spacing: -0.03em;
        color: #fff;
      }
      .price {
        margin: 0.25rem 0 0;
        color: #c7d2fe;
      }
      .price strong {
        font-size: 1.25rem;
        color: #fff;
      }
      .save {
        margin-left: 0.5rem;
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        font-size: 0.75rem;
        font-weight: 700;
        color: #fff;
      }
      .hint {
        margin: 0.75rem 0 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: #c7d2fe;
      }
      .hero__facts {
        display: grid;
        align-content: start;
        gap: 0.875rem;
        margin: 0;
        padding: 1rem 1.125rem;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.1);
      }
      .hero__facts div {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
      }
      .hero__facts dt {
        font-size: 0.8125rem;
        color: #a5b4fc;
      }
      .hero__facts dd {
        margin: 0;
        font-weight: 700;
        color: #fff;
        text-align: right;
      }
      .hero__facts .warn dd {
        color: #fde68a;
      }
      .due {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 0.75rem 1.5rem;
        margin-top: 1rem;
        padding: 1rem 1.25rem;
        border: 1px solid var(--bd-fde68a);
        border-radius: 16px;
        background: var(--bg-fffbeb);
      }
      @media (max-width: 640px) {
        .due {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .due > div {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .due strong {
        font-size: 1.75rem;
        line-height: 1.15;
        color: var(--tx-78350f);
      }
      .due__sub {
        font-size: 0.8125rem;
        color: var(--tx-92400e);
      }
      .due p {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.55;
        color: var(--tx-92400e);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: clamp(0.75rem, 1.6vw, 1.25rem);
        /* PrimeFlex ships a global .grid with negative side margins; this is a different grid. */
        margin: 1rem 0 0;
        align-items: start;
      }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .invoices {
        margin-top: 1rem;
      }
      .usage {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .usage__row {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.375rem;
        font-size: 0.875rem;
        color: var(--tx-475569);
      }
      .usage__row strong {
        color: var(--tx-0f172a);
      }
      .track {
        height: 8px;
        border-radius: 999px;
        background: var(--bg-eef1f7);
        overflow: hidden;
      }
      .track span {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: #6366f1;
      }
      .track span.hot {
        background: #ef4444;
      }
      .feat {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.25rem;
        margin: 1.25rem 0 0;
        padding: 0;
        list-style: none;
        font-size: 0.875rem;
        color: var(--tx-334155);
      }
      .feat i {
        margin-right: 0.375rem;
        color: var(--tx-6366f1);
      }
      .feat li.off {
        color: var(--tx-94a3b8);
      }
      .feat li.off i {
        color: #cbd5e1;
      }
      .fine {
        margin: 0.875rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .pref {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.875rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
      }
      .pref:last-child {
        border-bottom: none;
      }
      .pref--col {
        flex-direction: column;
        align-items: flex-start;
      }
      .pref strong {
        color: var(--tx-0f172a);
      }
      .pref p {
        margin: 0.125rem 0 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .pref--col .fine {
        margin: 0;
      }
      .chans {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .chan {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.4rem 0.75rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 999px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--tx-64748b);
        cursor: pointer;
      }
      .chan.is-on {
        border-color: var(--p-primary-500);
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }
      .chan:disabled {
        cursor: default;
      }
      .cancel {
        flex-wrap: wrap;
      }
      .danger {
        color: var(--tx-b91c1c);
        border-color: var(--bd-fecaca);
      }
    `,
  ],
})
export class ShopBillingComponent implements OnInit {
  readonly money = money;
  readonly cyclePrice = cyclePrice;
  readonly cycleUnit = cycleUnit;
  readonly limit = limit;
  readonly channelMeta = CHANNEL_META;

  loading = signal(true);
  error = signal(false);
  busy = signal(false);
  o = signal<ShopBillingOverview | null>(null);
  invoices = signal<InvoiceRecord[]>([]);

  constructor(
    private readonly billing: BillingService,
    private readonly status: SubscriptionStatusService,
    private readonly messages: MessageService,
    private readonly confirm: ConfirmationService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.billing.myBilling().subscribe({
      next: (o) => {
        this.apply(o);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
    this.billing.myInvoices().subscribe({ next: (r) => this.invoices.set(r.items), error: () => undefined });
  }

  private apply(o: ShopBillingOverview): void {
    this.o.set(o);
    this.status.setOverview(o);
  }

  saving(o: ShopBillingOverview): string | null {
    return o.plan ? yearlySaving(o.plan) : null;
  }

  hint(o: ShopBillingOverview): string {
    return o.subscription ? STATE_META[o.subscription.status].hint : '';
  }

  pct(value: number, max: number | null): number {
    return max === null ? 0 : Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  }

  setAutoRenew(v: boolean): void {
    this.billing.myPreferences({ autoRenew: v }).subscribe((o) => {
      this.apply(o);
      this.messages.add({ severity: 'success', summary: v ? 'Your plan will renew automatically' : 'Your plan will not renew automatically' });
    });
  }

  toggleChannel(c: BillingChannel): void {
    const o = this.o();
    if (!o) return;
    const next = o.channels.includes(c) ? o.channels.filter((x) => x !== c) : [...o.channels, c];
    this.billing.myPreferences({ channels: next }).subscribe((res) => this.apply(res));
  }

  cancel(): void {
    const end = this.o()?.subscription?.currentPeriodEnd;
    this.confirm.confirm({
      header: 'Cancel your subscription?',
      message: `You keep full access until ${end ? new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'the end of the period'}. After that new print requests stop and customers will see your shop as unavailable.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Yes, cancel at period end',
      rejectLabel: 'Keep my plan',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.busy.set(true);
        this.billing.myCancel().subscribe({
          next: (o) => {
            this.apply(o);
            this.busy.set(false);
            this.messages.add({ severity: 'info', summary: 'Your plan will end at the close of this period' });
          },
          error: () => this.busy.set(false),
        });
      },
    });
  }

  resume(): void {
    this.busy.set(true);
    this.billing.myResume().subscribe({
      next: (o) => {
        this.apply(o);
        this.busy.set(false);
        this.messages.add({ severity: 'success', summary: 'Your plan will keep renewing' });
      },
      error: () => this.busy.set(false),
    });
  }

  pdf(i: InvoiceRecord): void {
    this.billing.myInvoicePdf(i.id).subscribe((b) => downloadBlob(b, `${i.number}.pdf`));
  }

  print(i: InvoiceRecord): void {
    this.billing.myInvoicePdf(i.id).subscribe((b) => printBlob(b));
  }
}
