import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { forkJoin } from 'rxjs';
import { BillingService } from '../../core/services/billing.service';
import {
  BillingChannel,
  BillingCycle,
  InvoiceRecord,
  PaymentMethod,
  SubscriptionDetail,
  SubscriptionPlan,
} from '../../core/models/billing.models';
import { BillingPillComponent } from '../../shared/billing/billing-pill.component';
import { InvoiceTableComponent } from '../../shared/billing/invoice-table.component';
import {
  BILLING_CYCLES,
  CHANNEL_META,
  EVENT_META,
  PAYMENT_METHODS,
  STATE_META,
  cycleLabel,
  cyclePrice,
  downloadBlob,
  limit,
  money,
  monthlyEquivalent,
  printBlob,
} from '../../shared/billing/billing.util';
import { RefundDialogComponent } from './refund-dialog.component';
import { t, intlLocale } from '../../core/i18n/i18n';
import { AppDatePipe, AppNumberPipe } from '../../core/i18n/i18n-format.pipes';

export type ActionKind =
  | 'assign'
  | 'change'
  | 'extend'
  | 'grace'
  | 'cancel'
  | 'resume'
  | 'markPaid'
  | 'forceSuspend'
  | 'forceReactivate'
  | 'release';

const ACTION_META: Record<ActionKind, { title: string; cta: string; icon: string; danger?: boolean }> = {
  assign: { get title() { return t('subscriptions.assign_a_plan'); }, get cta() { return t('subscriptions.assign_plan'); }, icon: 'pi-plus' },
  change: { get title() { return t('subscriptions.change_plan'); }, get cta() { return t('subscriptions.change_plan'); }, icon: 'pi-arrows-h' },
  extend: { get title() { return t('subscriptions.extend_subscription'); }, get cta() { return t('subscriptions.extend'); }, icon: 'pi-clock' },
  grace: { get title() { return t('subscriptions.give_extra_days_to_pay'); }, get cta() { return t('subscriptions.give_extra_days'); }, icon: 'pi-hourglass' },
  cancel: { get title() { return t('subscriptions.cancel_subscription'); }, get cta() { return t('subscriptions.cancel_subscription'); }, icon: 'pi-ban', danger: true },
  resume: { get title() { return t('subscriptions.withdraw_cancellation'); }, get cta() { return t('subscriptions.keep_subscription'); }, icon: 'pi-replay' },
  markPaid: { get title() { return t('subscriptions.mark_payment_as_received'); }, get cta() { return t('subscriptions.mark_as_paid'); }, icon: 'pi-check' },
  forceSuspend: { get title() { return t('subscriptions.pause_this_shop_now'); }, get cta() { return t('subscriptions.suspend_shop'); }, icon: 'pi-lock', danger: true },
  forceReactivate: { get title() { return t('subscriptions.turn_this_shop_back_on'); }, get cta() { return t('subscriptions.reactivate_shop'); }, icon: 'pi-lock-open' },
  release: { get title() { return t('subscriptions.return_to_automatic_rules'); }, get cta() { return t('subscriptions.return_to_automatic_rules'); }, icon: 'pi-unlock' },
};

const monthlyEq = (p: SubscriptionPlan, c: BillingCycle) => monthlyEquivalent(p, c);
const price = (p: SubscriptionPlan, c: BillingCycle) => Number(cyclePrice(p, c));
const DAY = 86_400_000;

@Component({
  selector: 'app-shop-billing-drawer',
  standalone: true,
  imports: [AppDatePipe, AppNumberPipe, TranslatePipe, CommonModule, FormsModule, DrawerModule, DialogModule, ToggleSwitchModule, BillingPillComponent, InvoiceTableComponent, RefundDialogComponent],
  template: `
    <p-drawer
      [visible]="visible"
      (visibleChange)="onVisible($event)"
      (onShow)="load()"
      position="right"
      [modal]="true"
      [dismissible]="true"
      [style]="{ width: 'min(52rem, 100vw)' }"
      [showCloseIcon]="true"
    >
      <ng-template #header>
        <div class="dh">
          @if (d(); as d) {
            <span class="dh__title">{{ d.shop.name }}</span>
            <span class="dh__sub">{{ d.shop.shopCode }} &middot; {{ d.shop.city }}</span>
          } @else { <span class="dh__title">{{ 'common.billing' | translate }}</span> }
        </div>
      </ng-template>

      @if (loading() && !d()) {
        <div class="pf-skeleton" style="height: 8rem"></div>
        <div class="pf-skeleton" style="height: 14rem; margin-top: 1rem"></div>
      } @else if (error()) {
        <div class="pf-empty">
          <span class="pf-empty__icon"><i class="pi pi-exclamation-circle"></i></span>
          <strong>{{ 'subscriptions.couldnt_load_this_shops_billing' | translate }}</strong>
          <button type="button" class="pf-btn" (click)="load()"><i class="pi pi-refresh"></i> {{ 'common.try_again' | translate }}</button>
        </div>
      } @else if (d(); as d) {
        <!-- ---------- Summary ---------- -->
        <section class="sum">
          <div class="sum__top">
            <app-billing-pill [state]="d.access.state" />
            @if (d.subscription?.automationPaused) { <span class="tag tag--lock"><i class="pi pi-lock"></i> {{ d.subscription!.pausedUntil ? ('subscriptions.manually_controlled_until' | translate: { date: (d.subscription!.pausedUntil | appDate: 'd MMM') }) : ('subscriptions.manually_controlled' | translate) }}</span> }
            @if (d.subscription?.cancelAtPeriodEnd) { <span class="tag tag--warn">{{ 'subscriptions.ends' | translate: { currentPeriodEnd: (d.subscription!.currentPeriodEnd | appDate: 'd MMM y') } }}</span> }
            @if (d.pendingPlan) { <span class="tag tag--info"><i class="pi pi-calendar"></i> {{ 'subscriptions.moves_to_on' | translate: { name: d.pendingPlan.name, currentPeriodEnd: (d.subscription!.currentPeriodEnd | appDate: 'd MMM') } }}</span> }
          </div>
          @if (d.subscription; as s) {
            <div class="facts">
              <div><span>{{ 'common.plan' | translate }}</span><strong>{{ s.plan.name }}</strong><em>{{ cycleLabel(s.cycle) }} · {{ money(cyclePrice(s.plan, s.cycle)) }}</em></div>
              <div><span>{{ 'common.started' | translate }}</span><strong>{{ s.startDate | appDate: 'd MMM y' }}</strong></div>
              <div>
                <span>{{ s.status === 'TRIAL' ? ('subscriptions.trial_ends' | translate) : ('subscriptions.next_billing' | translate) }}</span>
                <strong>{{ s.currentPeriodEnd | appDate: 'd MMM y' }}</strong>
                <em>{{ s.autoRenew ? ('subscriptions.auto_renew_on' | translate) : ('subscriptions.auto_renew_off' | translate) }}</em>
              </div>
              @if (s.graceEndsAt && (s.status === 'PAYMENT_PENDING')) { <div><span>{{ 'subscriptions.grace_ends' | translate }}</span><strong>{{ s.graceEndsAt | appDate: 'd MMM, h:mm a' }}</strong></div> }
              @if (s.pastDueSince && s.status === 'PAST_DUE') { <div><span>{{ 'subscriptions.past_due_since' | translate }}</span><strong>{{ s.pastDueSince | appDate: 'd MMM y' }}</strong></div> }
            </div>
          }
          <p class="access" [ngClass]="'access--' + d.access.level.toLowerCase()">
            <i class="pi" [ngClass]="d.access.level === 'FULL' ? 'pi-check-circle' : d.access.level === 'READ_ONLY' ? 'pi-eye' : 'pi-lock'"></i>
            <span>{{ accessText(d) }}</span>
          </p>
        </section>

        <!-- ---------- Actions ---------- -->
        <section class="actions" [attr.aria-label]="'subscriptions.manual_actions' | translate">
          @if (!d.subscription) {
            <button type="button" class="act act--primary" (click)="open('assign')"><i class="pi pi-plus"></i> {{ 'subscriptions.assign_a_plan' | translate }}</button>
          } @else {
            @if (unpaid(d); as inv) { <button type="button" class="act act--primary" (click)="open('markPaid', inv)"><i class="pi pi-check"></i> {{ 'subscriptions.mark_paid' | translate: { amount: money(inv.amount, inv.currency) } }}</button> }
            @if (canChange(d)) { <button type="button" class="act" (click)="open('change')"><i class="pi pi-arrows-h"></i> {{ 'subscriptions.change_plan' | translate }}</button> }
            @if (canExtend(d)) { <button type="button" class="act" (click)="open('extend')"><i class="pi pi-clock"></i> {{ 'subscriptions.extend' | translate }}</button> }
            @if (d.subscription.status === 'PAYMENT_PENDING' || d.subscription.status === 'PAST_DUE') { <button type="button" class="act" (click)="open('grace')"><i class="pi pi-hourglass"></i> {{ 'subscriptions.extend_grace' | translate }}</button> }
            @if (d.subscription.cancelAtPeriodEnd) { <button type="button" class="act" (click)="open('resume')"><i class="pi pi-replay"></i> {{ 'subscriptions.keep_subscription' | translate }}</button> }
            @if (d.subscription.status !== 'CANCELLED') { <button type="button" class="act act--danger" (click)="open('cancel')"><i class="pi pi-ban"></i> {{ 'common.cancel' | translate }}</button> }
            @if (d.subscription.status !== 'SUSPENDED') { <button type="button" class="act act--danger" (click)="open('forceSuspend')"><i class="pi pi-lock"></i> {{ 'subscriptions.pause_shop_now' | translate }}</button> }
            @if (d.subscription.status !== 'ACTIVE' && d.subscription.status !== 'TRIAL') { <button type="button" class="act" (click)="open('forceReactivate')"><i class="pi pi-lock-open"></i> {{ 'subscriptions.turn_shop_back_on' | translate }}</button> }
            @if (d.subscription.automationPaused) { <button type="button" class="act" (click)="open('release')"><i class="pi pi-unlock"></i> {{ 'subscriptions.return_to_automatic_rules' | translate }}</button> }
          }
        </section>

        <!-- ---------- Tabs ---------- -->
        <nav class="tabs" role="tablist">
          @for (t of tabs; track t.key) {
            <button type="button" role="tab" class="tab" [class.is-on]="tab() === t.key" [attr.aria-selected]="tab() === t.key" (click)="tab.set(t.key)">
              <i class="pi" [ngClass]="t.icon"></i> {{ t.label }}
              @if (t.key === 'invoices') { <span class="n">{{ d.invoices.length }}</span> }
              @if (t.key === 'history') { <span class="n">{{ d.events.length }}</span> }
            </button>
          }
        </nav>

        @switch (tab()) {
          @case ('details') {
            @if (d.subscription; as s) {
              <div class="block">
                <h4>{{ 'subscriptions.plan_limits_usage' | translate }}</h4>
                <div class="usage">
                  <div class="bar">
                    <div class="bar__row"><span>{{ 'subscriptions.prints_this_month' | translate }}</span><strong>{{ d.usage.printsThisMonth | appNumber }} / {{ limit(s.plan.maxPrintsPerMonth) }}</strong></div>
                    <div class="track"><span [style.width.%]="pct(d.usage.printsThisMonth, s.plan.maxPrintsPerMonth)" [class.hot]="pct(d.usage.printsThisMonth, s.plan.maxPrintsPerMonth) >= 90"></span></div>
                  </div>
                  <div class="bar">
                    <div class="bar__row"><span>{{ 'subscriptions.orders_today' | translate }}</span><strong>{{ d.usage.tokensToday | appNumber }} / {{ limit(s.plan.maxTokensPerDay) }}</strong></div>
                    <div class="track"><span [style.width.%]="pct(d.usage.tokensToday, s.plan.maxTokensPerDay)" [class.hot]="pct(d.usage.tokensToday, s.plan.maxTokensPerDay) >= 90"></span></div>
                  </div>
                  <div class="bar">
                    <div class="bar__row"><span>{{ 'subscriptions.computers_connected_to_a_printer' | translate }}</span><strong>{{ d.usage.printers }} / {{ limit(s.plan.maxPrinters) }}</strong></div>
                    <div class="track"><span [style.width.%]="pct(d.usage.printers, s.plan.maxPrinters)" [class.hot]="pct(d.usage.printers, s.plan.maxPrinters) >= 100"></span></div>
                  </div>
                </div>
                <ul class="feat">
                  <li [class.off]="!s.plan.analyticsAccess"><i class="pi" [ngClass]="s.plan.analyticsAccess ? 'pi-check' : 'pi-times'"></i> {{ 'subscriptions.sales_reports' | translate }}</li>
                  <li [class.off]="!s.plan.prioritySupport"><i class="pi" [ngClass]="s.plan.prioritySupport ? 'pi-check' : 'pi-times'"></i> {{ 'subscriptions.priority_support' | translate }}</li>
                </ul>
              </div>

              <div class="block">
                <h4>{{ 'subscriptions.billing_preferences' | translate }}</h4>
                <div class="pref">
                  <div><strong>{{ 'subscriptions.renew_automatically' | translate }}</strong><p>{{ s.autoRenew ? ('subscriptions.a_renewal_invoice_is_created_on' | translate) : ('subscriptions.the_subscription_expires_at_the_end' | translate) }}</p></div>
                  <p-toggleswitch [ngModel]="s.autoRenew" (ngModelChange)="setAutoRenew($event)" [ngModelOptions]="{ standalone: true }" [attr.aria-label]="'subscriptions.renew_automatically' | translate" />
                </div>
                <div class="pref pref--col">
                  <div>
                    <strong>{{ 'subscriptions.how_to_send_reminders' | translate }}</strong>
                    <p>{{ s.notificationChannels ? ('subscriptions.this_shop_uses_its_own_channels' | translate) : ('subscriptions.using_the_platform_default_channels' | translate) }}</p>
                  </div>
                  <div class="chans">
                    @for (c of channelMeta; track c.value) {
                      <button type="button" class="chan" [class.is-on]="d.channels.includes(c.value)" [disabled]="c.locked" (click)="toggleChannel(c.value)"><i class="pi" [ngClass]="c.icon"></i> {{ c.label }}</button>
                    }
                    @if (s.notificationChannels) { <button type="button" class="link" (click)="resetChannels()">{{ 'subscriptions.use_default' | translate }}</button> }
                  </div>
                </div>
                <div class="pref">
                  <div><strong>{{ 'subscriptions.payment_method' | translate }}</strong><p>{{ s.gateway === 'MANUAL' ? ('subscriptions.manual_an_admin_records_offline_payments' | translate) : ('subscriptions.automatic_via' | translate: { gateway: s.gateway }) }}</p></div>
                </div>
              </div>
              @if (s.cancelReason && (s.status === 'CANCELLED' || s.cancelAtPeriodEnd)) { <p class="quote"><b>{{ 'subscriptions.cancellation_reason' | translate }}</b> {{ s.cancelReason }}</p> }
            } @else {
              <div class="pf-empty">
                <span class="pf-empty__icon"><i class="pi pi-tag"></i></span>
                <strong>{{ 'subscriptions.no_plan_assigned' | translate }}</strong>
                <p>{{ 'subscriptions.this_shop_has_full_access_assign' | translate }}</p>
                <button type="button" class="pf-btn pf-btn--primary" (click)="open('assign')"><i class="pi pi-plus"></i> {{ 'subscriptions.assign_a_plan' | translate }}</button>
              </div>
            }
          }
          @case ('invoices') {
            <app-invoice-table
              [invoices]="d.invoices"
              [canMarkPaid]="true"
              [canRefund]="true"
              [emptyText]="'subscriptions.no_invoices_for_this_shop_yet' | translate"
              (pdf)="pdf($event)"
              (print)="print($event)"
              (markPaid)="open('markPaid', $event)"
              (refund)="refunding.set($event); refundOpen = true"
            />
          }
          @case ('history') {
            <div class="hist-tools">
              <label class="chk"><input type="checkbox" [ngModel]="manualOnly()" (ngModelChange)="manualOnly.set($event)" /> {{ 'subscriptions.admin_actions_only' | translate }}</label>
            </div>
            @if (events().length === 0) {
              <div class="pf-empty"><span class="pf-empty__icon"><i class="pi pi-history"></i></span><strong>{{ 'subscriptions.no_history_yet' | translate }}</strong></div>
            } @else {
              <ol class="timeline">
                @for (e of events(); track e.id) {
                  <li>
                    <span class="tl" [ngClass]="'tl--' + meta(e.type).tone"><i class="pi" [ngClass]="meta(e.type).icon"></i></span>
                    <div class="tl__body">
                      <div class="tl__head"><strong>{{ meta(e.type).label }}</strong><time>{{ e.createdAt | appDate: 'd MMM y, h:mm a' }}</time></div>
                      @if (e.fromValue || e.toValue) {
                        <p class="tl__change">@if (e.fromValue) { <span>{{ pretty(e.fromValue) }}</span> <i class="pi pi-arrow-right"></i> }<b>{{ pretty(e.toValue) }}</b></p>
                      }
                      @if (e.reason) { <p class="tl__reason">&ldquo;{{ e.reason }}&rdquo;</p> }
                      <p class="tl__by"><i class="pi" [ngClass]="e.actorName ? 'pi-user' : 'pi-cog'"></i> {{ e.actorName ?? ('subscriptions.system_automatic' | translate) }}</p>
                    </div>
                  </li>
                }
              </ol>
            }
          }
        }
      }
    </p-drawer>

    <!-- ================= Action dialog ================= -->
    <p-dialog
      [header]="meta_().title"
      [visible]="!!action()"
      (visibleChange)="!$event && closeAction()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: 'min(34rem, calc(100vw - 1.5rem))' }"
      [contentStyle]="{ 'max-height': '70dvh' }"
      appendTo="body"
    >
      @if (action(); as a) {
        <form class="form" (ngSubmit)="submit()" novalidate>
          @switch (a) {
            @case ('assign') {
              <div class="field">
                <label for="a-plan">{{ 'common.plan' | translate }}</label>
                <select id="a-plan" name="plan" [(ngModel)]="f.planId">
                  @for (p of activePlans(); track p.id) { <option [value]="p.id">{{ 'subscriptions.mo' | translate: { name: p.name, monthlyPrice: money(p.monthlyPrice) } }}</option> }
                </select>
              </div>
              <div class="field">
                <label>{{ 'subscriptions.billing_period' | translate }}</label>
                <div class="pf-seg">@for (c of cycles; track c.value) {<button type="button" [class.is-on]="f.cycle === c.value" (click)="f.cycle = c.value">{{ c.label }}</button>}</div>
              </div>
              @if (selectedPlan()?.trialDays) {
                <label class="chk"><input type="checkbox" name="trial" [(ngModel)]="f.startTrial" /> {{ 'subscriptions.start_with_the_day_free_trial' | translate: { trialDays: selectedPlan()!.trialDays } }}</label>
              }
              @if (!f.startTrial) {
                <label class="chk"><input type="checkbox" name="paid" [(ngModel)]="f.markPaid" /> {{ 'subscriptions.first_payment_already_received_offline' | translate }}</label>
                @if (f.markPaid) { <ng-container *ngTemplateOutlet="payFields" /> }
              }
              <label class="chk"><input type="checkbox" name="renew" [(ngModel)]="f.autoRenew" /> {{ 'subscriptions.renew_automatically' | translate }}</label>
            }
            @case ('change') {
              <p class="from">{{ 'subscriptions.currently_on_plan' | translate: { plan: d()?.subscription?.plan?.name, cycle: d()?.subscription ? cycleLabel(d()!.subscription!.cycle).toLowerCase() : '' } }}</p>
              <div class="field">
                <label for="c-plan">{{ 'subscriptions.new_plan' | translate }}</label>
                <select id="c-plan" name="cplan" [(ngModel)]="f.planId">
                  @for (p of activePlans(); track p.id) { <option [value]="p.id">{{ 'subscriptions.mo' | translate: { name: p.name, monthlyPrice: money(p.monthlyPrice) } }}</option> }
                </select>
              </div>
              <div class="field">
                <label>{{ 'subscriptions.billing_period' | translate }}</label>
                <div class="pf-seg">@for (c of cycles; track c.value) {<button type="button" [class.is-on]="f.cycle === c.value" (click)="f.cycle = c.value">{{ c.label }}</button>}</div>
              </div>
              @if (changePreview(); as pv) {
                <div class="preview" [ngClass]="'preview--' + pv.kind">
                  <strong><i class="pi" [ngClass]="pv.kind === 'up' ? 'pi-arrow-up-right' : pv.kind === 'down' ? 'pi-arrow-down-right' : 'pi-arrows-h'"></i> {{ pv.title }}</strong>
                  <p>{{ pv.text }}</p>
                </div>
                @if (pv.kind !== 'same') {
                  <div class="field">
                    <label>{{ 'subscriptions.when_should_it_take_effect' | translate }}</label>
                    <div class="pf-seg">
                      <button type="button" [class.is-on]="f.when === 'rule'" (click)="f.when = 'rule'">{{ 'subscriptions.follow_the_rule' | translate }}</button>
                      <button type="button" [class.is-on]="f.when === 'now'" (click)="f.when = 'now'">{{ 'subscriptions.apply_now' | translate }}</button>
                    </div>
                  </div>
                }
              }
            }
            @case ('extend') {
              <ng-container *ngTemplateOutlet="daysField; context: { label: 'subscriptions.extend_by_days', help: 'subscriptions.extend_by_days_help' }" />
            }
            @case ('grace') {
              <ng-container *ngTemplateOutlet="daysField; context: { label: 'subscriptions.extra_days_to_pay', help: 'subscriptions.extra_days_to_pay_help' }" />
            }
            @case ('cancel') {
              <div class="field">
                <label>{{ 'subscriptions.when' | translate }}</label>
                <div class="radios">
                  <label class="radio"><input type="radio" name="mode" value="PERIOD_END" [(ngModel)]="f.mode" /><span><b>{{ 'subscriptions.at_the_end_of_the_paid' | translate }}</b><small>{{ 'subscriptions.full_access_until_then_it_stops' | translate: { currentPeriodEnd: (d()?.subscription?.currentPeriodEnd | appDate: 'd MMM y') } }}</small></span></label>
                  <label class="radio"><input type="radio" name="mode" value="IMMEDIATE" [(ngModel)]="f.mode" /><span><b>{{ 'subscriptions.immediately' | translate }}</b><small>{{ 'subscriptions.new_print_requests_stop_now_and' | translate }}</small></span></label>
                </div>
              </div>
            }
            @case ('markPaid') {
              @if (unpaidList().length > 1) {
                <div class="field">
                  <label for="m-inv">{{ 'common.invoice' | translate }}</label>
                  <select id="m-inv" name="inv" [(ngModel)]="f.invoiceId">
                    @for (i of unpaidList(); track i.id) { <option [value]="i.id">{{ i.number }} — {{ money(i.amount, i.currency) }}</option> }
                  </select>
                </div>
              } @else if (unpaidList()[0]; as i) {
                <p class="from">{{ 'subscriptions.invoice_for_amount' | translate: { number: i.number, amount: money(i.amount, i.currency) } }}</p>
              }
              <ng-container *ngTemplateOutlet="payFields" />
              <p class="fine">{{ 'subscriptions.the_shop_is_reactivated_immediately' | translate }}</p>
            }
            @case ('forceSuspend') {
              <p class="fine warn">{{ 'subscriptions.the_shop_portal_is_locked_except' | translate }}</p>
              <ng-container *ngTemplateOutlet="holdField" />
            }
            @case ('forceReactivate') {
              <p class="fine">{{ 'subscriptions.restores_full_access_whatever_the_payment' | translate }}</p>
              <ng-container *ngTemplateOutlet="holdField" />
            }
            @case ('release') { <p class="fine">{{ 'subscriptions.automatic_billing_rules_apply_to_this' | translate }}</p> }
            @case ('resume') { <p class="fine">{{ 'subscriptions.the_subscription_will_keep_renewing_as' | translate }}</p> }
          }

          <div class="field" [class.has-error]="touched() && reason.trim().length < 3">
            <label for="a-reason">{{ 'common.reason' | translate }} <small>{{ 'subscriptions.required_kept_in_the_activity_log' | translate }}</small></label>
            <textarea id="a-reason" name="reason" rows="2" maxlength="300" [(ngModel)]="reason" [placeholder]="'subscriptions.e_g_paid_cash_at_the' | translate"></textarea>
            @if (touched() && reason.trim().length < 3) { <span class="err">{{ 'subscriptions.please_give_a_short_reason' | translate }}</span> }
          </div>
          @if (formError()) { <p class="err" role="alert">{{ formError() }}</p> }
        </form>

        <ng-template #payFields>
          <div class="pair">
            <div class="field">
              <label for="p-method">{{ 'subscriptions.payment_method' | translate }}</label>
              <select id="p-method" name="method" [(ngModel)]="f.method">@for (m of methods; track m.value) { <option [value]="m.value">{{ m.label }}</option> }</select>
            </div>
            <div class="field">
              <label for="p-ref">{{ 'subscriptions.reference' | translate }} <small>{{ 'subscriptions.optional' | translate }}</small></label>
              <input id="p-ref" name="ref" type="text" maxlength="120" [(ngModel)]="f.reference" [placeholder]="'subscriptions.receipt_utr_no' | translate" />
            </div>
          </div>
        </ng-template>
        <ng-template #daysField let-label="label" let-help="help">
          <div class="field">
            <label for="d-days">{{ label | translate }}</label>
            <div class="days">
              @for (n of [3, 7, 14, 30]; track n) { <button type="button" class="chip" [class.is-on]="f.days === n" (click)="f.days = n">{{ n }}</button> }
              <input id="d-days" name="days" type="number" min="1" max="366" [(ngModel)]="f.days" />
            </div>
            <span class="fine">{{ help | translate }}</span>
          </div>
        </ng-template>
        <ng-template #holdField>
          <div class="field">
            <label for="h-days">{{ 'subscriptions.hold_for' | translate }} <small>{{ 'subscriptions.days_leave_empty_until_released' | translate }}</small></label>
            <input id="h-days" name="hold" type="number" min="1" max="365" [(ngModel)]="f.hold" [placeholder]="'subscriptions.until_released' | translate" />
          </div>
        </ng-template>
      }
      <ng-template #footer>
        <button type="button" class="pf-btn" (click)="closeAction()" [disabled]="saving()">{{ 'common.back' | translate }}</button>
        <button type="button" class="pf-btn" [ngClass]="meta_().danger ? 'pf-btn--danger' : 'pf-btn--primary'" (click)="submit()" [disabled]="saving()">
          @if (saving()) { <i class="pi pi-spin pi-spinner"></i> {{ 'common.working' | translate }} } @else { <i class="pi" [ngClass]="meta_().icon"></i> {{ meta_().cta }} }
        </button>
      </ng-template>
    </p-dialog>

    <app-refund-dialog [invoice]="refunding()" [(visible)]="refundOpen" (done)="reload()" />
  `,
  styles: [
    `
      .dh {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .dh__title {
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--tx-0f172a);
      }
      .dh__sub {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .sum {
        padding: 1rem 1.125rem;
        border: 1px solid var(--bd-e6eaf2);
        border-radius: 18px;
        background: var(--bg-ffffff);
      }
      .sum__top {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .tag {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.2rem 0.65rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
      }
      .tag--lock {
        background: #0f172a;
        color: #fff;
      }
      .tag--warn {
        background: var(--bg-fef3c7);
        color: var(--tx-92400e);
      }
      .tag--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
        gap: 0.875rem 1.25rem;
        margin-top: 1rem;
      }
      .facts div {
        display: flex;
        flex-direction: column;
        gap: 0.0625rem;
        min-width: 0;
      }
      .facts span {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .facts strong {
        font-size: 1rem;
        color: var(--tx-0f172a);
      }
      .facts em {
        font-style: normal;
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .access {
        display: flex;
        gap: 0.625rem;
        align-items: flex-start;
        margin: 1rem 0 0;
        padding: 0.75rem 0.875rem;
        border-radius: 12px;
        font-size: 0.8125rem;
        line-height: 1.5;
      }
      .access i {
        margin-top: 0.15rem;
      }
      .access--full {
        background: var(--bg-f0fdf4);
        color: var(--tx-166534);
      }
      .access--read_only {
        background: var(--bg-fef2f2);
        color: var(--tx-991b1b);
      }
      .access--suspended {
        background: #0f172a;
        color: #e2e8f0;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 1rem 0;
      }
      .act {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 2.5rem;
        padding: 0 0.875rem;
        border: 1px solid var(--bd-e2e8f0);
        border-radius: 12px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-334155);
        cursor: pointer;
      }
      .act:hover {
        border-color: var(--p-primary-300);
        background: var(--p-primary-50);
        color: var(--accent-text-700);
      }
      .act--primary {
        border-color: var(--p-primary-600);
        background: var(--p-primary-600);
        color: #fff;
      }
      .act--primary:hover {
        background: var(--p-primary-700);
        color: #fff;
      }
      .act--danger {
        color: var(--tx-b91c1c);
      }
      .act--danger:hover {
        border-color: var(--bd-fca5a5);
        background: var(--bg-fef2f2);
        color: var(--tx-b91c1c);
      }
      .tabs {
        display: flex;
        gap: 0.25rem;
        overflow-x: auto;
        padding: 0.25rem;
        border-radius: 14px;
        background: var(--bg-eef1f7);
        scrollbar-width: none;
      }
      .tab {
        flex: 1 1 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.5rem;
        padding: 0 0.875rem;
        border: none;
        border-radius: 10px;
        background: transparent;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-475569);
        white-space: nowrap;
        cursor: pointer;
      }
      .tab.is-on {
        background: var(--bg-ffffff);
        color: var(--accent-text-700);
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
      }
      .n {
        padding: 0 0.4rem;
        border-radius: 999px;
        background: var(--bg-e2e8f0);
        font-size: 0.6875rem;
        font-weight: 700;
      }
      .block {
        margin-top: 1.25rem;
      }
      .block h4 {
        margin: 0 0 0.75rem;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--tx-64748b);
      }
      .usage {
        display: flex;
        flex-direction: column;
        gap: 0.875rem;
      }
      .bar__row {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.375rem;
        font-size: 0.875rem;
        color: var(--tx-475569);
      }
      .bar__row strong {
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
        transition: width 0.3s ease;
      }
      .track span.hot {
        background: #ef4444;
      }
      .feat {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.25rem;
        margin: 1rem 0 0;
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
        color: var(--tx-64748b);
      }
      .feat li.off i {
        color: #cbd5e1;
      }
      .pref {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--bd-eef1f7);
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
        color: var(--tx-64748b);
      }
      .chans {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
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
      .quote {
        margin: 1rem 0 0;
        padding: 0.75rem 0.875rem;
        border-radius: 12px;
        background: var(--bg-f8fafc);
        font-size: 0.875rem;
        color: var(--tx-475569);
      }
      .hist-tools {
        margin: 1rem 0 0.5rem;
      }
      .chk {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        color: var(--tx-334155);
        cursor: pointer;
      }
      .timeline {
        display: flex;
        flex-direction: column;
        margin: 0.5rem 0 0;
        padding: 0;
        list-style: none;
      }
      .timeline li {
        position: relative;
        display: flex;
        gap: 0.875rem;
        padding-bottom: 1.25rem;
      }
      .timeline li:not(:last-child)::before {
        content: '';
        position: absolute;
        left: 0.9375rem;
        top: 2rem;
        bottom: 0;
        width: 2px;
        background: var(--bg-eef1f7);
      }
      .tl {
        flex: none;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border-radius: 50%;
        font-size: 0.8125rem;
      }
      .tl--ok {
        background: var(--bg-dcfce7);
        color: var(--tx-15803d);
      }
      .tl--info {
        background: var(--bg-e0e7ff);
        color: var(--tx-4338ca);
      }
      .tl--warn {
        background: var(--bg-fef3c7);
        color: var(--tx-b45309);
      }
      .tl--bad {
        background: var(--bg-fee2e2);
        color: var(--tx-b91c1c);
      }
      .tl--muted {
        background: var(--bg-f1f5f9);
        color: var(--tx-64748b);
      }
      .tl__body {
        min-width: 0;
        flex: 1;
      }
      .tl__head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.25rem 0.75rem;
      }
      .tl__head strong {
        color: var(--tx-0f172a);
      }
      .tl__head time {
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .tl__change {
        margin: 0.25rem 0 0;
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .tl__change i {
        margin: 0 0.25rem;
        font-size: 0.6875rem;
      }
      .tl__change b {
        color: var(--tx-334155);
      }
      .tl__reason {
        margin: 0.25rem 0 0;
        font-size: 0.875rem;
        font-style: italic;
        color: var(--tx-475569);
      }
      .tl__by {
        margin: 0.25rem 0 0;
        font-size: 0.75rem;
        color: var(--tx-64748b);
      }
      .tl__by i {
        margin-right: 0.25rem;
      }

      /* action dialog */
      .form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        min-width: 0;
      }
      .field > label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--tx-334155);
      }
      label small {
        font-weight: 500;
        color: var(--tx-64748b);
      }
      .field input:not([type='radio']):not([type='checkbox']),
      .field textarea,
      .field select {
        width: 100%;
        padding: 0.625rem 0.8rem;
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
      .field textarea:focus,
      .field select:focus {
        border-color: var(--p-primary-500);
        background: var(--bg-ffffff);
        box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.14);
      }
      .field.has-error textarea {
        border-color: var(--bd-f0a3a3);
        background: var(--bg-fffafa);
      }
      .err {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--tx-b42318);
      }
      .fine {
        margin: 0;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: var(--tx-64748b);
      }
      .fine.warn {
        padding: 0.625rem 0.75rem;
        border-radius: 10px;
        background: var(--bg-fef2f2);
        color: var(--tx-991b1b);
      }
      .from {
        margin: 0;
        font-size: 0.9375rem;
        color: var(--tx-475569);
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
        gap: 0.875rem;
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .days input {
        width: 6rem !important;
      }
      .chip {
        min-width: 2.75rem;
        padding: 0.45rem 0.75rem;
        border: 1px solid var(--bd-e2e8f0);
        border-radius: 999px;
        background: var(--bg-ffffff);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--tx-64748b);
        cursor: pointer;
      }
      .chip.is-on {
        border-color: var(--p-primary-600);
        background: var(--p-primary-600);
        color: #fff;
      }
      .radios {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .radio {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        padding: 0.75rem;
        border: 1.5px solid var(--bd-e2e8f0);
        border-radius: 12px;
        cursor: pointer;
      }
      .radio span {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
      .radio small {
        font-size: 0.8125rem;
        color: var(--tx-64748b);
      }
      .preview {
        padding: 0.75rem 0.875rem;
        border-radius: 12px;
        font-size: 0.875rem;
      }
      .preview p {
        margin: 0.25rem 0 0;
        line-height: 1.5;
      }
      .preview--up {
        background: var(--bg-f0fdf4);
        color: var(--tx-166534);
      }
      .preview--down {
        background: var(--bg-fffbeb);
        color: var(--tx-92400e);
      }
      .preview--same {
        background: var(--bg-f8fafc);
        color: var(--tx-475569);
      }
      .pf-btn--danger {
        border-color: #dc2626;
        background: #dc2626;
        color: #fff;
      }
      .pf-btn--danger:hover:not(:disabled) {
        background: #b91c1c;
      }
    `,
  ],
})
export class ShopBillingDrawerComponent {
  @Input() shopId: string | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() changed = new EventEmitter<void>();

  readonly money = money;
  readonly cycles = BILLING_CYCLES;
  readonly cycleLabel = cycleLabel;
  readonly cyclePrice = cyclePrice;
  readonly limit = limit;
  readonly methods = PAYMENT_METHODS;
  readonly channelMeta = CHANNEL_META;
  readonly tabs = [
    { key: 'details', get label() { return t('common.details'); }, icon: 'pi-id-card' },
    { key: 'invoices', get label() { return t('common.invoices'); }, icon: 'pi-receipt' },
    { key: 'history', get label() { return t('common.history'); }, icon: 'pi-history' },
  ] as const;

  loading = signal(false);
  error = signal(false);
  d = signal<SubscriptionDetail | null>(null);
  plans = signal<SubscriptionPlan[]>([]);
  tab = signal<'details' | 'invoices' | 'history'>('details');
  manualOnly = signal(false);

  action = signal<ActionKind | null>(null);
  saving = signal(false);
  touched = signal(false);
  formError = signal('');
  reason = '';
  refunding = signal<InvoiceRecord | null>(null);
  refundOpen = false;
  f = this.blank();

  constructor(
    private readonly billing: BillingService,
    private readonly messages: MessageService,
  ) {}

  private blank() {
    return {
      planId: '',
      cycle: 'MONTHLY' as BillingCycle,
      startTrial: false,
      markPaid: false,
      autoRenew: true,
      method: 'CASH' as PaymentMethod,
      reference: '',
      days: 7 as number | null,
      mode: 'PERIOD_END' as 'PERIOD_END' | 'IMMEDIATE',
      invoiceId: '',
      hold: null as number | null,
      when: 'rule' as 'rule' | 'now',
    };
  }

  onVisible(v: boolean): void {
    this.visibleChange.emit(v);
    if (!v) this.tab.set('details');
  }

  load(): void {
    if (!this.shopId) return;
    this.loading.set(true);
    this.error.set(false);
    forkJoin({ detail: this.billing.shopDetail(this.shopId), plans: this.billing.plans() }).subscribe({
      next: ({ detail, plans }) => {
        this.d.set(detail);
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Refresh after an action, and tell the list behind the drawer. */
  reload(): void {
    this.load();
    this.changed.emit();
  }

  // ---------------------------------------------------------- view helpers

  meta(type: string) {
    return EVENT_META[type] ?? { label: type, icon: 'pi-circle', tone: 'muted' as const };
  }

  /** Stored states (PAYMENT_PENDING) read as their label (Payment pending); everything else is shown as written. */
  pretty(v: string | null): string {
    return v ? (STATE_META as Record<string, { label: string }>)[v]?.label ?? v : '';
  }

  events() {
    const all = this.d()?.events ?? [];
    return this.manualOnly() ? all.filter((e) => !!e.actorUserId) : all;
  }

  pct(value: number, max: number | null): number {
    if (max === null) return 0;
    return Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  }

  unpaidList(): InvoiceRecord[] {
    return (this.d()?.invoices ?? []).filter((i) => i.status === 'OPEN' || i.status === 'FAILED').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  unpaid(d: SubscriptionDetail): InvoiceRecord | null {
    return this.unpaidList()[0] ?? null;
  }

  canChange(d: SubscriptionDetail): boolean {
    return d.subscription?.status === 'ACTIVE' || d.subscription?.status === 'TRIAL';
  }

  canExtend(d: SubscriptionDetail): boolean {
    return ['ACTIVE', 'TRIAL', 'EXPIRED'].includes(d.subscription?.status ?? '');
  }

  accessText(d: SubscriptionDetail): string {
    const level = d.access.level;
    if (d.access.state === 'NONE') return t('subscriptions.no_plan_assigned_so_this_shop');
    if (level === 'FULL') {
      return d.access.state === 'PAYMENT_PENDING'
        ? t('subscriptions.full_access_with_a_warning_banner', { daysLeft: d.access.daysLeft ?? 0 })
        : t('subscriptions.full_access_customers_can_order');
    }
    if (level === 'READ_ONLY') return t('subscriptions.read_only_the_shop_can_view');
    return t('subscriptions.locked_only_the_billing_page_is');
  }

  activePlans(): SubscriptionPlan[] {
    const current = this.d()?.subscription?.planId;
    return this.plans().filter((p) => p.isActive || p.id === current);
  }

  selectedPlan(): SubscriptionPlan | undefined {
    return this.plans().find((p) => p.id === this.f.planId);
  }

  changePreview(): { kind: 'up' | 'down' | 'same'; title: string; text: string } | null {
    const sub = this.d()?.subscription;
    const next = this.selectedPlan();
    const settings = this.d()?.settings;
    if (!sub || !next || !settings) return null;
    if (next.id === sub.planId && this.f.cycle === sub.cycle) return { kind: 'same', get title() { return t('subscriptions.no_change'); }, get text() { return t('subscriptions.pick_a_different_plan_or_billing'); } };
    const diff = monthlyEq(next, this.f.cycle) - monthlyEq(sub.plan, sub.cycle);
    if (sub.status === 'TRIAL') return { kind: 'same', get title() { return t('subscriptions.during_the_trial'); }, get text() { return t('subscriptions.the_new_plan_starts_immediately_and'); } };
    if (diff > 0.005) {
      const total = new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime();
      const left = Math.max(new Date(sub.currentPeriodEnd).getTime() - Date.now(), 0);
      const frac = total > 0 ? left / total : 0;
      const est = this.f.cycle === sub.cycle ? Math.max(price(next, this.f.cycle) * frac - price(sub.plan, sub.cycle) * frac, 0) : Math.max(price(next, this.f.cycle) - price(sub.plan, sub.cycle) * frac, 0);
      const days = Math.ceil(left / DAY);
      return settings.upgradeTiming === 'IMMEDIATE_PRORATED'
        ? { kind: 'up', get title() { return t('subscriptions.upgrade_takes_effect_now'); }, get text() { return t('subscriptions.an_invoice_of_about_is_created', { est: money(Math.round(est * 100) / 100), days }); } }
        : { kind: 'up', get title() { return t('subscriptions.upgrade_starts_at_the_next_renewal'); }, get text() { return t('subscriptions.the_shop_stays_on_until_choose', { name: sub.plan.name, short: new Date(sub.currentPeriodEnd).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }) }); } };
    }
    if (diff < -0.005) {
      return settings.downgradeTiming === 'END_OF_CYCLE' || this.f.cycle !== sub.cycle
        ? { kind: 'down', get title() { return t('subscriptions.downgrade_at_the_end_of_the'); }, get text() { return t('subscriptions.the_shop_keeps_until_then_moves', { name: sub.plan.name, short: new Date(sub.currentPeriodEnd).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' }), name2: next.name }); } }
        : { kind: 'down', get title() { return t('subscriptions.downgrade_takes_effect_now'); }, get text() { return t('subscriptions.the_cheaper_plan_starts_immediately_with'); } };
    }
    return { kind: 'same', get title() { return t('subscriptions.same_price'); }, get text() { return t('subscriptions.the_plan_switches_immediately_at_no'); } };
  }

  meta_() {
    const a = this.action();
    return a ? ACTION_META[a] : { title: '', cta: '', icon: '', danger: false };
  }

  // -------------------------------------------------------------- actions

  open(kind: ActionKind, invoice?: InvoiceRecord): void {
    const d = this.d();
    this.f = this.blank();
    this.reason = '';
    this.touched.set(false);
    this.formError.set('');
    const sub = d?.subscription;
    if (kind === 'assign') {
      const first = this.plans().find((p) => p.isActive);
      this.f.planId = first?.id ?? '';
      this.f.startTrial = !!first?.trialDays;
    }
    if (kind === 'change' && sub) {
      this.f.planId = this.plans().find((p) => p.isActive && p.id !== sub.planId)?.id ?? sub.planId;
      this.f.cycle = sub.cycle;
    }
    if (kind === 'markPaid') this.f.invoiceId = invoice?.id ?? this.unpaidList()[0]?.id ?? '';
    this.action.set(kind);
  }

  closeAction(): void {
    if (!this.saving()) this.action.set(null);
  }

  submit(): void {
    const kind = this.action();
    const shopId = this.shopId;
    if (!kind || !shopId) return;
    this.touched.set(true);
    this.formError.set('');
    const reason = this.reason.trim();
    if (reason.length < 3) return;
    const f = this.f;
    const days = Number(f.days);
    if ((kind === 'extend' || kind === 'grace') && (!Number.isInteger(days) || days < 1 || days > 366)) {
      this.formError.set(t('subscriptions.enter_a_number_of_days_between'));
      return;
    }
    const hold = f.hold ? Number(f.hold) : undefined;
    let call;
    switch (kind) {
      case 'assign':
        if (!f.planId) return this.formError.set(t('subscriptions.choose_a_plan'));
        call = this.billing.assign(shopId, {
          planId: f.planId,
          cycle: f.cycle,
          startTrial: f.startTrial,
          markPaid: !f.startTrial && f.markPaid,
          paymentMethod: f.method,
          paymentReference: f.reference || undefined,
          autoRenew: f.autoRenew,
          reason,
        });
        break;
      case 'change':
        if (!f.planId) return this.formError.set(t('subscriptions.choose_a_plan'));
        call = this.billing.changePlan(shopId, { planId: f.planId, cycle: f.cycle, applyNow: f.when === 'now' ? true : undefined, reason });
        break;
      case 'extend':
        call = this.billing.extend(shopId, days, reason);
        break;
      case 'grace':
        call = this.billing.extendGrace(shopId, days, reason);
        break;
      case 'cancel':
        call = this.billing.cancel(shopId, f.mode, reason);
        break;
      case 'resume':
        call = this.billing.resume(shopId, reason);
        break;
      case 'markPaid':
        call = this.billing.markPaid(shopId, { invoiceId: f.invoiceId || undefined, method: f.method, reference: f.reference || undefined, reason });
        break;
      case 'forceSuspend':
        call = this.billing.forceSuspend(shopId, reason, hold);
        break;
      case 'forceReactivate':
        call = this.billing.forceReactivate(shopId, reason, hold);
        break;
      default:
        call = this.billing.releaseOverride(shopId, reason);
    }
    this.saving.set(true);
    (call as import('rxjs').Observable<unknown>).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.action.set(null);
        const held = (res as { heldByOverride?: boolean } | null)?.heldByOverride;
        this.messages.add({
          severity: held ? 'warn' : 'success',
          summary: held ? t('subscriptions.payment_recorded_but_the_shop_is') : ACTION_META[kind].cta + ' — done',
          detail: held ? t('subscriptions.return_it_to_automatic_rules_to') : undefined,
        });
        this.reload();
      },
      error: () => this.saving.set(false),
    });
  }

  // ---------------------------------------------------------- preferences

  setAutoRenew(v: boolean): void {
    if (!this.shopId) return;
    this.billing.adminPreferences(this.shopId, { autoRenew: v }).subscribe(() => this.reload());
  }

  toggleChannel(c: BillingChannel): void {
    const d = this.d();
    if (!d || !this.shopId) return;
    const next = d.channels.includes(c) ? d.channels.filter((x) => x !== c) : [...d.channels, c];
    this.billing.adminPreferences(this.shopId, { channels: next }).subscribe(() => this.reload());
  }

  resetChannels(): void {
    if (!this.shopId) return;
    this.billing.adminPreferences(this.shopId, { channels: null }).subscribe(() => this.reload());
  }

  pdf(i: InvoiceRecord): void {
    this.billing.invoicePdf(i.id).subscribe((b) => downloadBlob(b, `${i.number}.pdf`));
  }

  print(i: InvoiceRecord): void {
    this.billing.invoicePdf(i.id).subscribe((b) => printBlob(b));
  }
}
