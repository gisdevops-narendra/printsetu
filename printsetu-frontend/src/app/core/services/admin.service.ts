import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  AuditLogRow,
  PrinterRow,
  PrintJobRow,
  ReportSummary,
  ShopDashboard,
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
  updateShop(id: string, dto: Partial<Shop>) {
    return this.http.patch<Shop>(`${BASE}/admin/shops/${id}`, dto);
  }
  setShopStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
    return this.http.patch<Shop>(`${BASE}/admin/shops/${id}/status`, { status });
  }

  // ---- Users ----
  listUsers(shopId?: string) {
    return this.http.get<UserRow[]>(`${BASE}/admin/users`, { params: shopId ? { shopId } : {} });
  }
  setUserStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.http.patch<UserRow>(`${BASE}/admin/users/${id}/status`, { status });
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
  setDefaultPrinter(shopId: string, printerId: string) {
    return this.http.patch(`${BASE}/admin/printers/shops/${shopId}/default`, { printerId });
  }

  // ---- Reports ----
  summary() {
    return this.http.get<ReportSummary>(`${BASE}/admin/reports/summary`);
  }
  /** `from`/`to` are inclusive YYYY-MM-DD days; `shopId` narrows it to one shop. */
  shopDashboard(from: string, to: string, shopId?: string | null) {
    return this.http.get<ShopDashboard>(`${BASE}/admin/reports/shops`, {
      params: { from, to, ...(shopId ? { shopId } : {}) },
    });
  }
  printHistory(shopId?: string, page = 1, pageSize = 50) {
    return this.http.get<{ items: PrintJobRow[]; total: number }>(`${BASE}/admin/print-history`, {
      params: { page, pageSize, ...(shopId ? { shopId } : {}) },
    });
  }
  clearPrintHistory(shopId?: string) {
    return this.http.delete<{ cleared: number }>(`${BASE}/admin/print-history`, {
      params: { ...(shopId ? { shopId } : {}) },
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
  clearAuditLogs() {
    return this.http.delete<{ cleared: number }>(`${BASE}/admin/audit-logs`);
  }
}
