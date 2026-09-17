import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  AuditLogRow,
  PricingRate,
  PrinterRow,
  PrintJobRow,
  PrintSettings,
  ReportSummary,
  Shop,
  UserRow,
} from '../models/models';

const BASE = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly http: HttpClient) {}

  // ---- Shops ----
  listShops(page = 1, pageSize = 100) {
    return this.http.get<{ items: Shop[]; total: number }>(`${BASE}/admin/shops`, {
      params: { page, pageSize },
    });
  }
  createShop(dto: Partial<Shop>) {
    return this.http.post<Shop>(`${BASE}/admin/shops`, dto);
  }
  updateShop(id: string, dto: Partial<Shop>) {
    return this.http.patch<Shop>(`${BASE}/admin/shops/${id}`, dto);
  }
  setShopStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return this.http.patch<Shop>(`${BASE}/admin/shops/${id}/status`, { status });
  }
  getShopSettings(shopId: string) {
    return this.http.get<PrintSettings>(`${BASE}/admin/shops/${shopId}/settings`);
  }
  updateShopSettings(
    shopId: string,
    dto: { retentionMinutes?: number; maxFileSizeBytes?: number },
  ) {
    return this.http.patch<PrintSettings>(`${BASE}/admin/shops/${shopId}/settings`, dto);
  }

  // ---- Users ----
  listUsers(shopId?: string) {
    return this.http.get<UserRow[]>(`${BASE}/admin/users`, { params: shopId ? { shopId } : {} });
  }
  createUser(dto: {
    name: string;
    email: string;
    mobile?: string;
    role: 'ADMIN' | 'SHOPKEEPER';
    shopId?: string;
  }) {
    return this.http.post<UserRow & { temporaryPassword: string }>(`${BASE}/admin/users`, dto);
  }
  setUserStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.http.patch<UserRow>(`${BASE}/admin/users/${id}/status`, { status });
  }

  // ---- Pricing ----
  listPricing(shopId: string) {
    return this.http.get<PricingRate[]>(`${BASE}/admin/shops/${shopId}/pricing`);
  }
  listPricingHistory(shopId: string) {
    return this.http.get<PricingRate[]>(`${BASE}/admin/shops/${shopId}/pricing/history`);
  }
  setPricing(
    shopId: string,
    dto: { paperSize: string; colorMode: string; sideMode: string; pricePerPage: number },
  ) {
    return this.http.post<PricingRate>(`${BASE}/admin/shops/${shopId}/pricing`, dto);
  }

  // ---- QR ----
  getQr(shopId: string) {
    return this.http.get<{ dataUrl: string; url: string; code: string }>(
      `${BASE}/admin/qr/${shopId}`,
    );
  }
  regenerateQr(shopId: string) {
    return this.http.post<{ dataUrl: string; url: string; code: string }>(
      `${BASE}/admin/qr/${shopId}/regenerate`,
      {},
    );
  }

  // ---- Printers ----
  listPrinters(shopId?: string) {
    return this.http.get<PrinterRow[]>(`${BASE}/admin/printers`, {
      params: shopId ? { shopId } : {},
    });
  }
  registerPrinter(dto: { shopId: string; printerName: string; driverName?: string }) {
    return this.http.post<{
      printerId: string;
      agentId: string;
      agentSecret: string;
      agentCredential: string;
    }>(`${BASE}/agent/register`, dto);
  }
  setDefaultPrinter(shopId: string, printerId: string) {
    return this.http.patch(`${BASE}/admin/printers/shops/${shopId}/default`, { printerId });
  }

  // ---- Reports ----
  summary() {
    return this.http.get<ReportSummary>(`${BASE}/admin/reports/summary`);
  }
  printHistory(shopId?: string, page = 1, pageSize = 50) {
    return this.http.get<{ items: PrintJobRow[]; total: number }>(`${BASE}/admin/print-history`, {
      params: { page, pageSize, ...(shopId ? { shopId } : {}) },
    });
  }
  failedJobs(page = 1, pageSize = 50) {
    return this.http.get<{ items: PrintJobRow[]; total: number }>(
      `${BASE}/admin/print-jobs/failed`,
      {
        params: { page, pageSize },
      },
    );
  }

  // ---- Audit ----
  auditLogs(shopId?: string, page = 1, pageSize = 50) {
    return this.http.get<{ items: AuditLogRow[]; total: number }>(`${BASE}/admin/audit-logs`, {
      params: { page, pageSize, ...(shopId ? { shopId } : {}) },
    });
  }
}
