export type RoleName = 'ADMIN' | 'SHOPKEEPER';

export type PaperSize = 'A4' | 'A3' | 'LETTER' | 'LEGAL';
export type ColorMode = 'BW' | 'COLOR';
export type SideMode = 'SIMPLEX' | 'DUPLEX';

export type DocumentStatus =
  'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'ANALYSIS_FAILED' | 'PRINT_ELIGIBLE' | 'DELETED';

export type PrintJobStatus =
  | 'CREATED'
  | 'PRINT_ELIGIBLE'
  | 'QUEUED'
  | 'PRINTING'
  | 'PRINTED'
  | 'RETENTION_PENDING'
  | 'DELETED'
  | 'PRINT_FAILED'
  | 'AGENT_OFFLINE'
  | 'PRINT_UNKNOWN'
  | 'CANCELLED';

export interface PrintSettings {
  id: string;
  shopId: string;
  defaultPrinterId: string | null;
  retentionMinutes: number;
  maxFileSizeBytes: number;
  documentPreviewEnabled: boolean;
}

export interface Shop {
  id: string;
  shopCode: string;
  name: string;
  ownerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  printSettings?: PrintSettings | null;
}

export interface PricingRate {
  id: string;
  shopId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  pricePerPage: string;
  active: boolean;
  effectiveFrom: string;
}

export interface PrinterRow {
  id: string;
  shopId: string;
  agentId: string;
  printerName: string;
  driverName?: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastHeartbeatAt?: string;
  createdAt: string;
}

export interface DocumentInfo {
  id: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  pageCount: number | null;
  colorPages: number | null;
  colorDetectionConfidence: string | null;
  status: DocumentStatus;
}

export interface UploadResponse {
  documentId: string;
  // Groups every document uploaded in one visit into one eventual print
  // request — reused across uploads and persisted client-side so a page
  // reload can recover the whole batch instead of losing it.
  sessionId: string;
  sessionToken: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  pageCount: number | null;
  colorPages: number | null;
  colorDetectionConfidence: string | null;
  status: DocumentStatus;
}

// Per-document print options — each uploaded document gets its own
// paper size / color mode / sides / copies and its own line-item price.
export interface QuoteItemRequest {
  documentId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies: number;
}

export interface QuoteItemResponse {
  documentId: string;
  pageCount: number;
  billablePages: number;
  amount: string;
}

export interface QuoteResponse {
  quoteId: string;
  items: QuoteItemResponse[];
  amount: string;
  currency: string;
  expiresAt: string;
}

export interface ConfirmJobResponse {
  jobId: string;
  tokenNumber: number;
  status: PrintJobStatus;
  statusToken: string;
  amount: string;
  currency: string;
}

// Shop-side document editor: rotate/crop/brightness/contrast/sharpness
// state for one PrintJobItem. Null on an item = unedited (prints the
// original document). Coordinates in `crop` are 0..1, normalized against
// the document's native page/image size.
export interface EditState {
  rotation: 0 | 90 | 180 | 270;
  crop: { x: number; y: number; width: number; height: number } | null;
  brightness: number;
  contrast: number;
  sharpness: number;
}

export interface PrintJobItemRow {
  id: string;
  documentId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  copies: number;
  pageCount: number;
  billablePages: number;
  amount: string;
  printOrder: number;
  editState?: EditState | null;
  renderedS3Key?: string | null;
  document?: DocumentInfo;
}

export interface PrintJobRow {
  id: string;
  tokenNumber: number;
  shopId: string;
  printerId: string | null;
  amount: string;
  currency: string;
  status: PrintJobStatus;
  attemptCount: number;
  queuedAt: string | null;
  printedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  items: PrintJobItemRow[];
  printer?: PrinterRow;
  shop?: Shop;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  status: 'ACTIVE' | 'DISABLED';
  role: { name: RoleName };
  shop?: Shop | null;
  shopId?: string | null;
}

export type NotificationEventType =
  'UPLOAD_RECEIVED' | 'PRINT_QUEUED' | 'PRINT_COMPLETED' | 'PRINT_FAILED';

export interface NotificationRow {
  id: string;
  shopId: string;
  printJobId: string | null;
  eventType: NotificationEventType;
  channel: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP';
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: string;
}

export interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  shopId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
}

export interface ReportSummary {
  totalShops: number;
  activeShops: number;
  totalJobs: number;
  printedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  totalDocuments: number;
  totalRevenue: string;
}
