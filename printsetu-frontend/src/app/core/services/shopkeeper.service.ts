import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { NotificationRow, PricingRate, PrintJobRow, Shop } from '../models/models';

export interface SetPricingDto {
  paperSize: string;
  colorMode: string;
  sideMode: string;
  pricePerPage: number;
}

const BASE = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class ShopkeeperService {
  constructor(private readonly http: HttpClient) {}

  profile() {
    return this.http.get<{ shop: Shop }>(`${BASE}/shop/profile`);
  }

  queue() {
    return this.http.get<PrintJobRow[]>(`${BASE}/shop/print-jobs`);
  }

  history(page = 1, pageSize = 50) {
    return this.http.get<{ items: PrintJobRow[]; total: number }>(
      `${BASE}/shop/print-jobs/history`,
      {
        params: { page, pageSize },
      },
    );
  }

  print(jobId: string) {
    return this.http.post<{ jobId: string; status: string; printerId: string; message: string }>(
      `${BASE}/shop/print-jobs/${jobId}/print`,
      {},
    );
  }

  reconcile(jobId: string, outcome: 'PRINTED' | 'PRINT_FAILED', message?: string) {
    return this.http.post<{ jobId: string; status: string }>(
      `${BASE}/shop/print-jobs/${jobId}/reconcile`,
      {
        outcome,
        message,
      },
    );
  }

  previewUrl(documentId: string) {
    return this.http.get<{ url: string; expiresInSeconds: number }>(
      `${BASE}/shop/documents/${documentId}/preview-url`,
    );
  }

  notifications(page = 1, pageSize = 50) {
    return this.http.get<{
      items: NotificationRow[];
      total: number;
      page: number;
      pageSize: number;
    }>(`${BASE}/shop/notifications`, { params: { page, pageSize } });
  }

  // ---- Pricing (SRS §10: the shop owns its own rates) ----
  listPricing() {
    return this.http.get<PricingRate[]>(`${BASE}/shop/pricing`);
  }
  listPricingHistory() {
    return this.http.get<PricingRate[]>(`${BASE}/shop/pricing/history`);
  }
  setPricing(dto: SetPricingDto) {
    return this.http.post<PricingRate>(`${BASE}/shop/pricing`, dto);
  }
  deletePricing(id: string) {
    return this.http.delete<void>(`${BASE}/shop/pricing/${id}`);
  }

  // ---- QR (SRS §12: view/download own QR; regenerating stays admin-only) ----
  getQr() {
    return this.http.get<{ dataUrl: string; url: string; code: string }>(`${BASE}/shop/qr`);
  }
}
