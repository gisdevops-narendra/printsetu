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
  UserRow, LeadInput, MapAreasResponse, MapCoverageResponse, MapLead, MapLeadsResponse, MapShopsResponse } from '../models/models';

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

  // ---- Business Map ----

  mapShops(from: string, to: string, inactiveDays: number) {
    return this.http.get<MapShopsResponse>(`${BASE}/admin/map/shops`, {
      params: { from, to, inactiveDays },
    });
  }

  mapAreas(from: string, to: string, groupBy: 'city' | 'district') {
    return this.http.get<MapAreasResponse>(`${BASE}/admin/map/areas`, { params: { from, to, groupBy } });
  }

  /** `bbox` = [west, south, east, north] in degrees; `radius` in metres. */
  mapCoverage(bbox: number[], radius: number) {
    return this.http.get<MapCoverageResponse>(`${BASE}/admin/map/coverage`, {
      params: { bbox: bbox.map((n) => n.toFixed(5)).join(','), radius },
    });
  }

  mapLeads() {
    return this.http.get<MapLeadsResponse>(`${BASE}/admin/map/leads`);
  }

  createLead(lead: LeadInput) {
    return this.http.post<MapLead>(`${BASE}/admin/map/leads`, lead);
  }

  updateLead(id: string, lead: LeadInput) {
    return this.http.patch<MapLead>(`${BASE}/admin/map/leads/${id}`, lead);
  }

  deleteLead(id: string) {
    return this.http.delete<{ deleted: true }>(`${BASE}/admin/map/leads/${id}`);
  }
}
