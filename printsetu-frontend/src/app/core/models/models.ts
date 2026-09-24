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

/** Optional quantity-based rate: an order's page total in [minPages, maxPages] is charged pricePerPage for every page. */
export interface PricingTier {
  id: string;
  shopId: string;
  paperSize: PaperSize;
  colorMode: ColorMode;
  sideMode: SideMode;
  minPages: number;
  /** null = no upper bound */
  maxPages: number | null;
  pricePerPage: string;
  active: boolean;
  createdAt: string;
}

export type AgentOs = 'windows' | 'linux';

/** One OS printer installed on the Print Agent's computer, as the agent reported it. */
export interface DetectedPrinter {
  name: string;
  isDefault: boolean;
}

export interface AgentCapabilities {
  printers: DetectedPrinter[];
  platform?: string;
  hostname?: string;
  reportedAt: string;
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
  /** OS printer jobs are sent to; null = the agent computer's default printer. */
  osPrinterName?: string | null;
  /** Null until the agent has reported its printers at least once. */
  capabilitiesJson?: AgentCapabilities | null;
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

// Shop-side document editor state for one PrintJobItem. Null on an item =
// unedited (prints the original document). Two shapes share this field:
// - PDFs: params the server applies itself (pdf-lib) — rotation/crop below,
//   crop coordinates 0..1 normalized against the page size.
// - Images: `source: 'canvas'` means the client's Fabric.js editor already
//   composited the final pixels and uploaded them directly — this is just
//   display metadata (paperSize guide + measured dpi), not re-applied.
export interface EditState {
  rotation?: 0 | 90 | 180 | 270;
  crop?: { x: number; y: number; width: number; height: number } | null;
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  source?: 'canvas';
  paperSize?: string | null;
  dpi?: number | null;
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
  /** True until the user replaces their (admin-issued) temporary password. */
  mustChangePassword: boolean;
  /** Only populated while mustChangePassword is true — the password itself is forgotten once the user changes it. */
  currentPassword: string | null;
}

export type NotificationEventType =
  | 'UPLOAD_RECEIVED'
  | 'PRINT_QUEUED'
  | 'PRINT_COMPLETED'
  | 'PRINT_FAILED'
  | 'SUBSCRIPTION_RENEWAL_REMINDER'
  | 'SUBSCRIPTION_PAYMENT_FAILED'
  | 'SUBSCRIPTION_GRACE_REMINDER'
  | 'SUBSCRIPTION_FINAL_WARNING'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_PAID'
  | 'SUBSCRIPTION_REACTIVATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_TRIAL_ENDING';

export interface NotificationRow {
  id: string;
  shopId: string;
  printJobId: string | null;
  eventType: NotificationEventType;
  /** Billing messages carry their own text; print events do not. */
  message?: string | null;
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

// ---------- Shop profile (owner's own view) ----------

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface OpeningHoursDay {
  open: boolean;
  /** 24-hour "HH:MM" */
  from: string;
  to: string;
}
export type OpeningHours = Record<DayKey, OpeningHoursDay>;

export interface ShopProfileInfo {
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
  description: string | null;
  openingHours: OpeningHours | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

export interface NotificationPrefs {
  newOrderSound: boolean;
  desktopAlerts: boolean;
  failureAlerts: boolean;
}

export interface ShopAvailabilityInfo {
  /** MANUAL = the switch alone; SCHEDULE = the opening hours; OVERRIDE = a manual break/extension while scheduled. */
  source: 'MANUAL' | 'SCHEDULE' | 'OVERRIDE';
  /** When the status flips on its own (ISO), if it will. */
  nextChangeAt: string | null;
  timeZone: string;
}

export interface ShopSettingsInfo {
  autoAcceptOrders: boolean;
  /** Whether new customer orders are accepted right now (schedule and manual breaks applied). */
  acceptingOrders: boolean;
  /** Go Online / Offline automatically on the shop's opening hours. */
  autoSchedule: boolean;
  availability: ShopAvailabilityInfo;
  defaultPrinterId: string | null;
  notificationPrefs: NotificationPrefs;
}

export interface ShopProfileResponse {
  shop: ShopProfileInfo;
  settings: ShopSettingsInfo;
}

export interface ShopStats {
  currency: string;
  totals: { completed: number; pending: number; failed: number; cancelled: number; all: number; pagesPrinted: number; earnings: string };
  earnings: { today: string; week: string; month: string };
  jobs: { today: number; week: number; month: number };
  series: { date: string; earnings: number; jobs: number }[];
}
