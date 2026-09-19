import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EditState,
  NotificationRow,
  PaperSize,
  ColorMode,
  SideMode,
  PricingRate,
  PrinterRow,
  PrintJobRow,
  NotificationPrefs,
  OpeningHours,
  ShopProfileResponse,
  ShopStats,
} from '../models/models';

export interface UpdateItemSettingsRequest {
  paperSize?: PaperSize;
  colorMode?: ColorMode;
  sideMode?: SideMode;
  copies?: number;
}

export interface EditItemRequest {
  rotation?: 0 | 90 | 180 | 270;
  crop?: { x: number; y: number; width: number; height: number } | null;
  brightness?: number;
  contrast?: number;
  sharpness?: number;
}

export interface SetPricingDto {
  paperSize: string;
  colorMode: string;
  sideMode: string;
  pricePerPage: number;
}

const BASE = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class ShopkeeperService {
  /**
   * Emits every profile/settings payload the API returns, so the portal header
   * (shop name, logo, Online switch) follows edits made on other pages without
   * each of those pages knowing about it.
   */
  readonly profileChanged = new Subject<ShopProfileResponse>();

  constructor(private readonly http: HttpClient) {}

  private publish = tap<ShopProfileResponse>((res) => this.profileChanged.next(res));

  profile() {
    return this.http.get<ShopProfileResponse>(`${BASE}/shop/profile`).pipe(this.publish);
  }

  updateProfile(dto: { description?: string; mobile?: string; address?: string; city?: string; openingHours?: OpeningHours }) {
    return this.http.patch<ShopProfileResponse>(`${BASE}/shop/profile`, dto).pipe(this.publish);
  }

  uploadProfileImage(kind: 'logo' | 'banner', file: Blob) {
    const form = new FormData();
    form.append('file', file, `${kind}.webp`);
    return this.http.post<ShopProfileResponse>(`${BASE}/shop/profile/${kind}`, form).pipe(this.publish);
  }

  removeProfileImage(kind: 'logo' | 'banner') {
    return this.http.delete<ShopProfileResponse>(`${BASE}/shop/profile/${kind}`).pipe(this.publish);
  }

  updateSettings(dto: { autoAcceptOrders?: boolean; acceptingOrders?: boolean; notificationPrefs?: Partial<NotificationPrefs>; defaultPrinterId?: string }) {
    return this.http.patch<ShopProfileResponse>(`${BASE}/shop/settings`, dto).pipe(this.publish);
  }

  stats() {
    return this.http.get<ShopStats>(`${BASE}/shop/stats`);
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

  clearHistory() {
    return this.http.delete<{ cleared: number }>(`${BASE}/shop/print-jobs/history`);
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

  // ---- Document viewer/editor (dedicated full-page workspace) ----
  getJob(jobId: string) {
    return this.http.get<PrintJobRow>(`${BASE}/shop/print-jobs/${jobId}`);
  }

  reorderItems(jobId: string, itemIds: string[]) {
    return this.http.patch<PrintJobRow>(`${BASE}/shop/print-jobs/${jobId}/items/reorder`, { itemIds });
  }

  deleteItem(jobId: string, itemId: string) {
    return this.http.delete<PrintJobRow>(`${BASE}/shop/print-jobs/${jobId}/items/${itemId}`);
  }

  updateItemSettings(jobId: string, itemId: string, dto: UpdateItemSettingsRequest) {
    return this.http.patch<PrintJobRow>(`${BASE}/shop/print-jobs/${jobId}/items/${itemId}/settings`, dto);
  }

  editItem(jobId: string, itemId: string, dto: EditItemRequest) {
    return this.http.patch<{ itemId: string; editState: EditState; renderedS3Key: string; renderedAt: string }>(
      `${BASE}/shop/print-jobs/${jobId}/items/${itemId}/edit`,
      dto,
    );
  }

  resetItemEdit(jobId: string, itemId: string) {
    return this.http.post<{ itemId: string }>(
      `${BASE}/shop/print-jobs/${jobId}/items/${itemId}/edit/reset`,
      {},
    );
  }

  /** Image documents only: uploads the canvas editor's final composited export as the print-ready file. */
  uploadRenderedImage(
    jobId: string,
    itemId: string,
    blob: Blob,
    paperSize: string,
    dpi: number,
    format: 'jpeg' | 'png' = 'jpeg',
    quality = 92,
  ) {
    const form = new FormData();
    form.append('file', blob, format === 'png' ? 'edit.png' : 'edit.jpg');
    form.append('paperSize', paperSize);
    form.append('dpi', String(Math.round(dpi)));
    form.append('format', format);
    form.append('quality', String(Math.round(quality)));
    return this.http.post<{ itemId: string; editState: EditState; renderedS3Key: string; renderedAt: string }>(
      `${BASE}/shop/print-jobs/${jobId}/items/${itemId}/edit/render`,
      form,
    );
  }

  /** `original: true` returns the untouched upload rather than the edited render. */
  itemPreviewUrl(jobId: string, itemId: string, original = false) {
    return this.http.get<{ url: string; expiresInSeconds: number }>(
      `${BASE}/shop/print-jobs/${jobId}/items/${itemId}/preview-url`,
      { params: original ? { original: 'true' } : {} },
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

  clearNotifications() {
    return this.http.delete<{ cleared: number }>(`${BASE}/shop/notifications`);
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

  // ---- Print Agent (self-serve download so the shop can connect its own printer) ----
  listPrinters() {
    return this.http.get<PrinterRow[]>(`${BASE}/shop/printers`);
  }

  downloadAgentPackage() {
    return this.http.post(`${BASE}/shop/printers/agent-package`, {}, { responseType: 'blob' });
  }
}
