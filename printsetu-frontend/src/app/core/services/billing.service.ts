import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  BillingChannel,
  BillingCycle,
  BillingSettings,
  InvoiceRecord,
  InvoiceStatus,
  PaymentMethod,
  PlanInput,
  RevenueDashboard,
  ShopBillingOverview,
  ShopSubscriptionRecord,
  SubscriptionDetail,
  SubscriptionListRow,
  SubscriptionPlan,
  SubscriptionEventRecord,
} from '../models/billing.models';

const ADMIN = `${environment.apiBaseUrl}/admin/subscriptions`;
const SHOP = `${environment.apiBaseUrl}/shop/subscription`;

export interface ShopListQuery {
  search?: string;
  planId?: string;
  status?: string;
  expiringSoon?: boolean;
  page?: number;
  pageSize?: number;
}

/** Admin subscription management and the shop owner's own billing page. */
@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private readonly http: HttpClient) {}

  private params(obj: Record<string, string | number | boolean | undefined>): HttpParams {
    let p = new HttpParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== '' && v !== null) p = p.set(k, String(v));
    return p;
  }

  // ------------------------------------------------------------ admin

  dashboard() {
    return this.http.get<RevenueDashboard>(`${ADMIN}/dashboard`);
  }

  plans() {
    return this.http.get<SubscriptionPlan[]>(`${ADMIN}/plans`);
  }
  createPlan(dto: PlanInput) {
    return this.http.post<SubscriptionPlan>(`${ADMIN}/plans`, dto);
  }
  updatePlan(id: string, dto: PlanInput) {
    return this.http.patch<SubscriptionPlan>(`${ADMIN}/plans/${id}`, dto);
  }
  setPlanActive(id: string, isActive: boolean) {
    return this.http.patch<SubscriptionPlan>(`${ADMIN}/plans/${id}/active`, { isActive });
  }
  deletePlan(id: string) {
    return this.http.delete<{ deleted: boolean }>(`${ADMIN}/plans/${id}`);
  }

  settings() {
    return this.http.get<BillingSettings>(`${ADMIN}/settings`);
  }
  updateSettings(dto: Partial<BillingSettings>) {
    return this.http.patch<BillingSettings>(`${ADMIN}/settings`, dto);
  }
  runChecks() {
    return this.http.post<{ checked: number; changes: string[] }>(`${ADMIN}/run-checks`, {});
  }

  shops(q: ShopListQuery) {
    return this.http.get<{ items: SubscriptionListRow[]; total: number }>(`${ADMIN}/shops`, {
      params: this.params({ ...q }),
    });
  }
  shopDetail(shopId: string) {
    return this.http.get<SubscriptionDetail>(`${ADMIN}/shops/${shopId}`);
  }
  shopEvents(shopId: string) {
    return this.http.get<{ items: SubscriptionEventRecord[]; total: number }>(`${ADMIN}/shops/${shopId}/events`);
  }

  invoices(q: { status?: InvoiceStatus | ''; search?: string; page?: number; pageSize?: number }) {
    return this.http.get<{ items: InvoiceRecord[]; total: number }>(`${ADMIN}/invoices`, { params: this.params({ ...q }) });
  }
  invoicePdf(id: string) {
    return this.http.get(`${ADMIN}/invoices/${id}/pdf`, { responseType: 'blob' });
  }
  refund(invoiceId: string, dto: { amount: number; reason: string }) {
    return this.http.post<InvoiceRecord>(`${ADMIN}/invoices/${invoiceId}/refund`, dto);
  }

  assign(shopId: string, dto: { planId: string; cycle: BillingCycle; startTrial?: boolean; markPaid?: boolean; paymentMethod?: PaymentMethod; paymentReference?: string; autoRenew?: boolean; reason: string }) {
    return this.http.post<ShopSubscriptionRecord>(`${ADMIN}/shops/${shopId}/assign`, dto);
  }
  changePlan(shopId: string, dto: { planId: string; cycle?: BillingCycle; applyNow?: boolean; reason: string }) {
    return this.http.post<{ applied: boolean; effectiveOn: string; invoice: InvoiceRecord | null }>(`${ADMIN}/shops/${shopId}/change-plan`, dto);
  }
  cancelScheduledChange(shopId: string, reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/cancel-scheduled-change`, { reason });
  }
  extend(shopId: string, days: number, reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/extend`, { days, reason });
  }
  extendGrace(shopId: string, days: number, reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/extend-grace`, { days, reason });
  }
  cancel(shopId: string, mode: 'IMMEDIATE' | 'PERIOD_END', reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/cancel`, { mode, reason });
  }
  resume(shopId: string, reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/resume`, { reason });
  }
  markPaid(shopId: string, dto: { invoiceId?: string; method: PaymentMethod; reference?: string; reason: string }) {
    return this.http.post<{ heldByOverride: boolean }>(`${ADMIN}/shops/${shopId}/mark-paid`, dto);
  }
  forceSuspend(shopId: string, reason: string, days?: number) {
    return this.http.post(`${ADMIN}/shops/${shopId}/force-suspend`, { reason, days });
  }
  forceReactivate(shopId: string, reason: string, days?: number) {
    return this.http.post(`${ADMIN}/shops/${shopId}/force-reactivate`, { reason, days });
  }
  releaseOverride(shopId: string, reason: string) {
    return this.http.post(`${ADMIN}/shops/${shopId}/release-override`, { reason });
  }
  adminPreferences(shopId: string, dto: { autoRenew?: boolean; channels?: BillingChannel[] | null }) {
    return this.http.patch(`${ADMIN}/shops/${shopId}/preferences`, dto);
  }

  // ------------------------------------------------------- shop owner

  myBilling() {
    return this.http.get<ShopBillingOverview>(SHOP);
  }
  myInvoices() {
    return this.http.get<{ items: InvoiceRecord[]; total: number }>(`${SHOP}/invoices`);
  }
  myInvoicePdf(id: string) {
    return this.http.get(`${SHOP}/invoices/${id}/pdf`, { responseType: 'blob' });
  }
  myPreferences(dto: { autoRenew?: boolean; channels?: BillingChannel[] | null }) {
    return this.http.patch<ShopBillingOverview>(`${SHOP}/preferences`, dto);
  }
  myCancel(reason?: string) {
    return this.http.post<ShopBillingOverview>(`${SHOP}/cancel`, { reason });
  }
  myResume() {
    return this.http.post<ShopBillingOverview>(`${SHOP}/resume`, {});
  }
}
