import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ConfirmJobResponse,
  DocumentInfo,
  PrintJobRow,
  QuoteItemRequest,
  QuoteResponse,
  UploadResponse,
} from '../models/models';

const BASE = environment.apiBaseUrl;

/**
 * Client for the no-login customer flow (SRS §5.2/§8). Every call after
 * the first upload must carry the short-lived, session-scoped status
 * token that upload returned — there is no session cookie or account
 * backing this.
 */
@Injectable({ providedIn: 'root' })
export class CustomerService {
  constructor(private readonly http: HttpClient) {}

  resolveShop(publicCode: string) {
    return this.http.get<{
      shopCode: string;
      shopName: string;
      city: string;
      /** false when the shop is suspended, overdue or over its plan limit. */
      available: boolean;
      unavailableMessage: string | null;
    }>(
      `${BASE}/public/shops/${publicCode}`,
    );
  }

  /** `sessionId` omitted for the first file of a visit; pass it back in for every file after that (SRS extension: multi-document upload). */
  upload(shopCode: string, file: File, sessionId?: string) {
    const form = new FormData();
    form.append('shopCode', shopCode);
    form.append('file', file);
    if (sessionId) form.append('sessionId', sessionId);
    return this.http.post<UploadResponse>(`${BASE}/documents`, form);
  }

  documentDetails(documentId: string, sessionToken: string) {
    return this.http.get<DocumentInfo>(`${BASE}/documents/${documentId}`, { headers: this.tokenHeader(sessionToken) });
  }

  /** Every document already uploaded in this session — rebuilds the upload list after a page reload. */
  sessionDocuments(sessionId: string, sessionToken: string) {
    return this.http.get<DocumentInfo[]>(`${BASE}/documents/session/${sessionId}`, {
      headers: this.tokenHeader(sessionToken),
    });
  }

  quote(items: QuoteItemRequest[], sessionToken: string) {
    return this.http.post<QuoteResponse>(`${BASE}/print/quote`, { items }, { headers: this.tokenHeader(sessionToken) });
  }

  confirm(quoteId: string, sessionToken: string) {
    return this.http.post<ConfirmJobResponse>(
      `${BASE}/print-jobs`,
      { quoteId },
      { headers: this.tokenHeader(sessionToken) },
    );
  }

  status(jobId: string, statusToken: string) {
    return this.http.get<PrintJobRow & { events: { status: string; createdAt: string; message?: string }[] }>(
      `${BASE}/print-jobs/${jobId}`,
      { headers: this.tokenHeader(statusToken) },
    );
  }

  private tokenHeader(token: string) {
    return { 'x-status-token': token };
  }
}
