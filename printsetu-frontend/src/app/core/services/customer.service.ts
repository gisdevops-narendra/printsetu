import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ColorMode, ConfirmJobResponse, DocumentInfo, PaperSize, PrintJobRow, QuoteResponse, SideMode, UploadResponse } from '../models/models';

const BASE = environment.apiBaseUrl;

export interface QuoteRequest {
  documentId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies: number;
}

/**
 * Client for the no-login customer flow (SRS §5.2/§8). Every call after
 * upload must carry the short-lived status token the previous step
 * returned — there is no session cookie or account backing this.
 */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  constructor(private readonly http: HttpClient) {}

  resolveShop(publicCode: string) {
    return this.http.get<{ shopCode: string; shopName: string; city: string }>(
      `${BASE}/public/shops/${publicCode}`,
    );
  }

  upload(shopCode: string, file: File) {
    const form = new FormData();
    form.append('shopCode', shopCode);
    form.append('file', file);
    return this.http.post<UploadResponse>(`${BASE}/documents`, form);
  }

  documentDetails(documentId: string, statusToken: string) {
    return this.http.get<DocumentInfo>(`${BASE}/documents/${documentId}`, { headers: this.tokenHeader(statusToken) });
  }

  quote(dto: QuoteRequest, statusToken: string) {
    return this.http.post<QuoteResponse>(`${BASE}/print/quote`, dto, { headers: this.tokenHeader(statusToken) });
  }

  confirm(quoteId: string, statusToken: string) {
    return this.http.post<ConfirmJobResponse>(
      `${BASE}/print-jobs`,
      { quoteId },
      { headers: this.tokenHeader(statusToken) },
    );
  }

  status(jobId: string, statusToken: string) {
    return this.http.get<PrintJobRow & { events: { status: string; createdAt: string; message?: string }[] }>(
      `${BASE}/print-jobs/${jobId}`,
      { headers: this.tokenHeader(statusToken) },
    );
  }

  private tokenHeader(statusToken: string) {
    return { 'x-status-token': statusToken };
  }
}
