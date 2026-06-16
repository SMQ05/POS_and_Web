import type {
  Batch,
  Branch,
  Customer,
  Expense,
  LedgerEntry,
  Medicine,
  MedicineSupplier,
  Purchase,
  PurchaseInvoice,
  PurchaseReturn,
  PromiseOrder,
  Sale,
  SaleReturn,
  Supplier,
  Tenant,
  User,
} from '@/types';

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
export const API_URL = env.VITE_API_URL ?? 'http://127.0.0.1:4000/api';
export const TENANT_SLUG = env.VITE_TENANT_SLUG ?? 'demo-pharmacy';

export interface LoginResponse {
  token: string;
  tenant: Tenant & { slug: string };
  user: User;
}

export interface BootstrapResponse {
  tenant: Tenant & { slug: string; settings?: Record<string, unknown> };
  branches: Branch[];
  medicines: Medicine[];
  batches: Batch[];
  suppliers: Supplier[];
  customers: Customer[];
  sales: Sale[];
  saleReturns: SaleReturn[];
  purchases: Purchase[];
  expenses: Expense[];
  ledgerEntries: LedgerEntry[];
  // M3 — distributor mapping + multi-invoice GRN + purchase returns
  medicineSuppliers?: MedicineSupplier[];
  purchaseInvoices?: PurchaseInvoice[];
  purchaseReturns?: PurchaseReturn[];
  promiseOrders?: PromiseOrder[];
}

function getToken(): string {
  try {
    const stored = localStorage.getItem('auth-storage');
    const parsed = stored ? JSON.parse(stored) : null;
    return parsed?.state?.token ?? '';
  } catch {
    return '';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Decrypt a KXV2 (.kxv envelope) export file via the server. The RSA private
 * key never ships to the client, so importing these files requires the backend.
 */
export async function decryptSecureExport(payload: string): Promise<string> {
  const { plaintext } = await apiRequest<{ plaintext: string }>('/secure/decrypt', {
    method: 'POST',
    body: JSON.stringify({ payload }),
  });
  return plaintext;
}

const dateKeys = new Set([
  'createdAt',
  'updatedAt',
  'lastLogin',
  'expiryDate',
  'manufacturingDate',
  'purchaseDate',
  'dueDate',
  'saleDate',
  'date',
  'dateOfBirth',
]);

function hydrateDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(hydrateDates) as T;
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (typeof item === 'string' && dateKeys.has(key)) {
      output[key] = new Date(item);
    } else {
      output[key] = hydrateDates(item);
    }
  });
  return output as T;
}

// ─── Phone Upload Sessions ──────────────────────────────────────────────────
// POS asks the server for a session; the QR points the phone at /u/<token>.
// While the phone is uploading, POS polls /api/upload-sessions/<token>.
export interface UploadSession {
  token: string;
  expiresAt: number;
}
export interface UploadSessionState {
  status: 'created' | 'uploading' | 'ready';
  dataUrl?: string;
  expiresAt: number;
}
export async function createUploadSession(purpose?: string): Promise<UploadSession> {
  return apiRequest<UploadSession>('/upload-sessions', {
    method: 'POST',
    body: JSON.stringify({ purpose }),
  });
}
export async function getUploadSession(token: string): Promise<UploadSessionState> {
  return apiRequest<UploadSessionState>(`/upload-sessions/${token}`);
}

/** Email a purchase order to a distributor (optionally with a base64 PDF). */
export async function sendPurchaseOrderEmail(payload: {
  to: string;
  subject?: string;
  html?: string;
  pdfBase64?: string;
  filename?: string;
}): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/purchase-orders/send-email', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
/** Build the public mobile-page URL from the API base.
 *
 * In production VITE_API_URL is "/api" (relative), so naive concatenation
 * yields "/u/<token>" — a path with no host that a phone scanner can't open.
 * We need an absolute https://… URL embedded in the QR. So: if API_URL
 * doesn't start with "http", fall back to the page's own origin. */
export function uploadPageUrl(token: string): string {
  let root: string;
  if (API_URL.startsWith('http')) {
    root = API_URL.replace(/\/api\/?$/, '');
  } else {
    // Same-origin deployment (Hostinger Passenger setup). The browser already
    // knows the absolute URL it's running on — use it.
    root = (typeof window !== 'undefined' ? window.location.origin : '').replace(/\/$/, '');
  }
  return `${root}/u/${token}`;
}

export async function loginWithPassword(email: string, password: string, tenantSlug?: string): Promise<LoginResponse> {
  const body: Record<string, string> = { email, password };
  // Use explicit slug if provided, else fall back to env var (single-tenant installs only)
  const slug = tenantSlug ?? (TENANT_SLUG !== 'demo-pharmacy' ? TENANT_SLUG : undefined);
  if (slug) body.tenantSlug = slug;
  const response = await apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return hydrateDates(response);
}

export async function getBootstrapData(): Promise<BootstrapResponse> {
  return hydrateDates(await apiRequest<BootstrapResponse>('/bootstrap'));
}

export async function createResource<T>(resource: string, data: unknown): Promise<T> {
  return hydrateDates(await apiRequest<T>(`/${resource}`, {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function updateResource<T>(resource: string, id: string, data: unknown): Promise<T> {
  return hydrateDates(await apiRequest<T>(`/${resource}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }));
}

export async function deleteResource(resource: string, id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/${resource}/${id}`, { method: 'DELETE' });
}

export async function createPublicWebOrder<T>(tenantSlug: string, data: unknown): Promise<T> {
  return hydrateDates(await apiRequest<T>(`/public/${tenantSlug}/web-orders`, {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

// ─── M4 — Audit log + Reconcile + Bulk batch import ───────────────────────

export interface AuditLogRow {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  ipAddress?: string;
  createdAt: Date;
}

export async function fetchAuditLogs(params: {
  from?: string;
  to?: string;
  userId?: string;
  module?: string;
  action?: string;
  q?: string;
  limit?: number;
} = {}): Promise<AuditLogRow[]> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') qs.set(k, String(v)); });
  const path = qs.toString() ? `/audit-logs?${qs}` : '/audit-logs';
  return hydrateDates(await apiRequest<AuditLogRow[]>(path));
}

export interface ReconcileRunDTO {
  id: string;
  scope: 'all' | 'category' | 'shelf' | 'medicine' | 'supplier';
  scopeValue?: string;
  status: 'open' | 'posted' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  notes?: string;
  createdBy: string;
  postedBy?: string;
}
export interface ReconcileEntryDTO {
  id: string;
  runId: string;
  medicineId: string;
  batchId?: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  notes?: string;
}

export async function fetchReconcileRuns(): Promise<ReconcileRunDTO[]> {
  return hydrateDates(await apiRequest<ReconcileRunDTO[]>('/reconcile-runs'));
}

export async function createReconcileRun(payload: { scope: ReconcileRunDTO['scope']; scopeValue?: string; notes?: string }): Promise<ReconcileRunDTO> {
  return hydrateDates(await apiRequest<ReconcileRunDTO>('/reconcile-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function fetchReconcileEntries(runId: string): Promise<ReconcileEntryDTO[]> {
  return hydrateDates(await apiRequest<ReconcileEntryDTO[]>(`/reconcile-runs/${runId}/entries`));
}

export async function upsertReconcileEntry(runId: string, payload: { medicineId: string; batchId?: string; systemQty: number; countedQty: number; notes?: string }): Promise<ReconcileEntryDTO> {
  return hydrateDates(await apiRequest<ReconcileEntryDTO>(`/reconcile-runs/${runId}/entries`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function postReconcileRun(runId: string): Promise<ReconcileRunDTO> {
  return hydrateDates(await apiRequest<ReconcileRunDTO>(`/reconcile-runs/${runId}/post`, {
    method: 'POST',
  }));
}

export async function cancelReconcileRun(runId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/reconcile-runs/${runId}`, { method: 'DELETE' });
}

export interface BulkBatchRow {
  medicineBarcode?: string;
  medicineId?: string;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate?: string;
  quantity: number;
  purchasePrice: number;
  tradePrice?: number;
  salePrice: number;
  mrp: number;
  supplierName?: string;
  supplierId?: string;
  location?: string;
}
export interface BulkBatchResult {
  totalRows: number;
  created: number;
  failed: number;
  results: { row: number; ok: boolean; id?: string; error?: string }[];
}

export interface BranchStock {
  branchId: string;
  branchName: string;
  city: string;
  quantity: number;
  batches: number;
}
export interface StockByBranch {
  medicineId: string;
  branches: BranchStock[];
  unassigned: number;
}
export interface CatalogProduct {
  id: string;
  brand: string;
  genericName?: string;
  strength?: string;
  unit?: string;
  dosageForm?: string;
  manufacturer?: string;
  atcCode?: string;
  routeOfAdmin?: string;
  drapRegNo?: string;
  packSizes?: Array<{ pack?: string; gtin?: string }>;
  composition?: Array<{ generic?: string; strength?: string; unit?: string; atcCode?: string }>;
  extra?: Record<string, string>;
  source: string;
  verified: boolean;
  gtins: string[];
}

/** Look up a product in the central shared catalog by GTIN. */
export async function fetchCatalogByGtin(gtin: string): Promise<CatalogProduct | null> {
  return apiRequest<CatalogProduct | null>(`/catalog/by-gtin?gtin=${encodeURIComponent(gtin)}`);
}

/** Fetch a product from DRAP by registration number (caches into the catalog). */
export async function fetchDrapProduct(regNo: string): Promise<CatalogProduct | null> {
  return apiRequest<CatalogProduct | null>(`/drap/product?regNo=${encodeURIComponent(regNo)}`);
}

/** A lightweight DRAP search candidate (full detail fetched on pick). */
export interface DrapCandidate { drapRegNo: string; brand: string }

export interface DrapImportStatus {
  status: 'idle' | 'running' | 'paused' | 'done';
  cursor: number;
  prefixTotal: number;
  queued: number;
  processed: number;
  failed: number;
  pending: number;
  lastPrefix?: string | null;
  lastError?: string | null;
  startedAt?: string | null;
}
/** Superadmin: browse the central master catalog (what's been imported). */
export async function fetchAdminCatalog(params: { q?: string; limit?: number; offset?: number } = {}): Promise<{ total: number; items: CatalogProduct[] }> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  return apiRequest<{ total: number; items: CatalogProduct[] }>(`/admin/catalog?${qs}`);
}

/** Superadmin: control the DRAP → master-catalog bulk importer. */
export const drapImport = {
  status: () => apiRequest<DrapImportStatus>('/admin/drap/import/status'),
  start: (reset: boolean) => apiRequest<DrapImportStatus>('/admin/drap/import/start', { method: 'POST', body: JSON.stringify({ reset }) }),
  pause: () => apiRequest<DrapImportStatus>('/admin/drap/import/pause', { method: 'POST' }),
  resume: () => apiRequest<DrapImportStatus>('/admin/drap/import/resume', { method: 'POST' }),
};

/** Search DRAP by brand name (or reg no) → fast candidate list. */
export async function searchDrap(params: { regNo?: string; brand?: string }): Promise<DrapCandidate[]> {
  const qs = new URLSearchParams();
  if (params.regNo) qs.set('regNo', params.regNo);
  if (params.brand) qs.set('brand', params.brand);
  return apiRequest<DrapCandidate[]>(`/drap/search?${qs}`);
}

/** Search the central shared catalog by brand / generic / DRAP reg no. */
export async function searchCatalog(params: { brand?: string; generic?: string; regNo?: string }): Promise<CatalogProduct[]> {
  const qs = new URLSearchParams();
  if (params.brand) qs.set('brand', params.brand);
  if (params.generic) qs.set('generic', params.generic);
  if (params.regNo) qs.set('regNo', params.regNo);
  return apiRequest<CatalogProduct[]>(`/catalog/search?${qs}`);
}

/** Per-branch stock for a medicine — powers the cross-branch availability search. */
export async function fetchStockByBranch(medicineId: string): Promise<StockByBranch> {
  return apiRequest<StockByBranch>(`/stock/by-branch?medicineId=${encodeURIComponent(medicineId)}`);
}

export async function bulkImportBatches(rows: BulkBatchRow[], branchId?: string): Promise<BulkBatchResult> {
  return apiRequest<BulkBatchResult>('/batches/bulk', {
    method: 'POST',
    body: JSON.stringify({ rows, branchId }),
  });
}

export interface BulkSupplierRow {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  ntn?: string;
  gstNumber?: string;
  creditLimit?: number;
  currentBalance?: number;
  paymentTerms?: number;
}
export interface BulkSupplierResult {
  totalRows: number;
  created: number;
  failed: number;
  results: { row: number; ok: boolean; id?: string; error?: string }[];
}

export async function bulkImportSuppliers(rows: BulkSupplierRow[]): Promise<BulkSupplierResult> {
  return apiRequest<BulkSupplierResult>('/suppliers/bulk', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
}

// ─── M7 — Partners, outbox, inbox, auto-PO ─────────────────────────────────
import type { Partner, OutboxEvent, InboxThread, InboxMessage } from '@/types';

export interface PartnerCreatePayload {
  type: 'wholesale' | 'hospital' | 'clinic';
  name: string;
  baseUrl?: string;
  apiKey?: string;
  inboundSecret?: string;
  isActive?: boolean;
  notes?: string;
}

export async function fetchPartners(): Promise<Partner[]> {
  return hydrateDates(await apiRequest<Partner[]>('/partners'));
}
export async function createPartner(data: PartnerCreatePayload): Promise<Partner> {
  return hydrateDates(await apiRequest<Partner>('/partners', { method: 'POST', body: JSON.stringify(data) }));
}
export async function updatePartner(id: string, data: Partial<PartnerCreatePayload>): Promise<Partner> {
  return hydrateDates(await apiRequest<Partner>(`/partners/${id}`, { method: 'PATCH', body: JSON.stringify(data) }));
}
export async function deletePartner(id: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/partners/${id}`, { method: 'DELETE' });
}

// ─── B2B Network ─────────────────────────────────────────────────────────────
import type { NetworkConnection, NetworkMessage, NetworkOrder, NetworkPeer } from '@/types';

export async function updateNetworkProfile(data: { handle?: string; businessType?: string }): Promise<{ id: string; handle: string; name: string; businessType: string }> {
  return apiRequest('/network/profile', { method: 'PATCH', body: JSON.stringify(data) });
}
export async function lookupHandle(handle: string): Promise<NetworkPeer & { connectionStatus: string | null }> {
  return apiRequest(`/network/lookup?handle=${encodeURIComponent(handle)}`);
}
export async function fetchConnections(): Promise<NetworkConnection[]> {
  return hydrateDates(await apiRequest<NetworkConnection[]>('/network/connections'));
}
export async function requestConnection(handle: string): Promise<NetworkConnection> {
  return hydrateDates(await apiRequest<NetworkConnection>('/network/connections', { method: 'POST', body: JSON.stringify({ handle }) }));
}
export async function connectionAction(id: string, action: 'accept' | 'decline' | 'disconnect' | 'block'): Promise<NetworkConnection> {
  return hydrateDates(await apiRequest<NetworkConnection>(`/network/connections/${id}/${action}`, { method: 'POST' }));
}
export async function fetchConnectionMessages(id: string): Promise<NetworkMessage[]> {
  return hydrateDates(await apiRequest<NetworkMessage[]>(`/network/connections/${id}/messages`));
}
export async function sendConnectionMessage(id: string, body: string): Promise<NetworkMessage> {
  return hydrateDates(await apiRequest<NetworkMessage>(`/network/connections/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }));
}
export async function createNetworkOrder(payload: { connectionId: string; items: { productName: string; strength?: string; packSize?: string; quantity: number; buyerMedicineId?: string }[]; notes?: string; sourcePurchaseId?: string }): Promise<NetworkOrder> {
  return hydrateDates(await apiRequest<NetworkOrder>('/network/orders', { method: 'POST', body: JSON.stringify(payload) }));
}
export async function fetchNetworkOrders(params?: { role?: 'buyer' | 'seller'; status?: string }): Promise<NetworkOrder[]> {
  const q = new URLSearchParams();
  if (params?.role) q.set('role', params.role);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString();
  return hydrateDates(await apiRequest<NetworkOrder[]>(`/network/orders${qs ? '?' + qs : ''}`));
}
export async function networkOrderAction(id: string, action: 'accept' | 'decline' | 'ship' | 'cancel' | 'receive'): Promise<NetworkOrder> {
  return hydrateDates(await apiRequest<NetworkOrder>(`/network/orders/${id}/${action}`, { method: 'POST' }));
}

export async function fetchOutbox(status?: string): Promise<OutboxEvent[]> {
  const path = status ? `/outbox?status=${encodeURIComponent(status)}` : '/outbox';
  return hydrateDates(await apiRequest<OutboxEvent[]>(path));
}
export async function processOutbox(): Promise<{ ok: boolean; processed: number }> {
  return apiRequest<{ ok: boolean; processed: number }>('/outbox/process', { method: 'POST' });
}

export async function fetchThreads(): Promise<InboxThread[]> {
  return hydrateDates(await apiRequest<InboxThread[]>('/threads'));
}
export async function createThread(data: { partnerId?: string; subject: string; body: string; attachmentUrl?: string }): Promise<{ thread: InboxThread; message: InboxMessage }> {
  return hydrateDates(await apiRequest<{ thread: InboxThread; message: InboxMessage }>('/threads', {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}
export async function fetchThreadMessages(threadId: string): Promise<InboxMessage[]> {
  return hydrateDates(await apiRequest<InboxMessage[]>(`/threads/${threadId}/messages`));
}
export async function postThreadMessage(threadId: string, data: { body: string; attachmentUrl?: string }): Promise<InboxMessage> {
  return hydrateDates(await apiRequest<InboxMessage>(`/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  }));
}

export async function runAutoPo(force = false): Promise<{ ok: boolean; draftsCreated: number; medicinesEvaluated: number; skippedNoSupplier: number; drafts: { purchaseId: string; supplierId: string; itemsCount: number }[] }> {
  return apiRequest<{ ok: boolean; draftsCreated: number; medicinesEvaluated: number; skippedNoSupplier: number; drafts: { purchaseId: string; supplierId: string; itemsCount: number }[] }>(
    `/auto-po/run${force ? '?force=1' : ''}`,
    { method: 'POST' },
  );
}

// ─── M6 — Shift sessions + day close ──────────────────────────────────────
import type { ShiftSession, DayClose } from '@/types';

export async function fetchOpenShift(): Promise<ShiftSession | null> {
  return hydrateDates(await apiRequest<ShiftSession | null>('/shift-sessions/current'));
}

export async function listShiftSessions(params: { status?: string; branchId?: string } = {}): Promise<ShiftSession[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.branchId) qs.set('branchId', params.branchId);
  return hydrateDates(await apiRequest<ShiftSession[]>(`/shift-sessions${qs.toString() ? '?' + qs : ''}`));
}

export interface DayCashSummary {
  openingCash: number | null;
  closingCash: number | null;
  shiftCount: number;
  openShiftCount: number;
}
/** Opening/closing cash for a business date, derived from that day's shifts. */
export async function fetchDayCash(branchId: string, date: string): Promise<DayCashSummary> {
  const qs = new URLSearchParams({ branchId, date });
  return apiRequest<DayCashSummary>(`/shift-sessions/day-cash?${qs}`);
}

export async function openShift(payload: { branchId: string; openingCash: number; notes?: string }): Promise<ShiftSession> {
  return hydrateDates(await apiRequest<ShiftSession>('/shift-sessions/open', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

export async function closeShift(id: string, payload: { closingCash: number; notes?: string }): Promise<ShiftSession> {
  return hydrateDates(await apiRequest<ShiftSession>(`/shift-sessions/${id}/close`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

/** Shifts attributed to a business day (post-close rollover applied server-side). */
export async function fetchShiftsByBusinessDay(branchId: string, date: string): Promise<ShiftSession[]> {
  const qs = new URLSearchParams({ branchId, date });
  return hydrateDates(await apiRequest<ShiftSession[]>(`/shift-sessions/by-business-day?${qs}`));
}

export async function updateShiftSession(
  id: string,
  patch: { openingCash?: number; closingCash?: number; notes?: string },
): Promise<ShiftSession> {
  return hydrateDates(await apiRequest<ShiftSession>(`/shift-sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }));
}

export async function fetchDayCloses(branchId?: string): Promise<DayClose[]> {
  const path = branchId ? `/day-closes?branchId=${encodeURIComponent(branchId)}` : '/day-closes';
  return hydrateDates(await apiRequest<DayClose[]>(path));
}

export async function postDayClose(payload: {
  branchId: string;
  businessDate: string;
  openingCash?: number;
  closingCash?: number;
  notes?: string;
}): Promise<DayClose> {
  return hydrateDates(await apiRequest<DayClose>('/day-closes', {
    method: 'POST',
    body: JSON.stringify(payload),
  }));
}

// ─── M5.1 — Web Push subscriptions ────────────────────────────────────────

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await apiRequest<{ publicKey: string }>('/push/vapid-key');
    return res.publicKey;
  } catch {
    return null; // push disabled on server
  }
}

export async function registerPushSubscription(sub: PushSubscription, userAgent: string): Promise<void> {
  const json = sub.toJSON();
  await apiRequest<{ ok: boolean }>('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      authKey: json.keys?.auth ?? '',
      userAgent: userAgent.slice(0, 300),
    }),
  });
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  await apiRequest<{ ok: boolean }>('/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendTestPush(): Promise<{ sent: number; failed: number; total: number }> {
  return apiRequest<{ ok: boolean; sent: number; failed: number; total: number }>('/push/test', { method: 'POST' });
}

// ─── M5 — Notifications ────────────────────────────────────────────────────
import type { NotificationRow } from '@/types';

export async function fetchNotifications(includeDismissed = false): Promise<NotificationRow[]> {
  const path = includeDismissed ? '/notifications?includeDismissed=1' : '/notifications';
  return hydrateDates(await apiRequest<NotificationRow[]>(path));
}

export async function dismissNotification(id: string): Promise<NotificationRow> {
  return hydrateDates(await apiRequest<NotificationRow>(`/notifications/${id}/dismiss`, { method: 'POST' }));
}

export async function dismissAllNotifications(): Promise<{ dismissed: number }> {
  return apiRequest<{ ok: true; dismissed: number }>('/notifications/dismiss-all', { method: 'POST' });
}

// ─── Sales PIN (POS receipt-time authentication) ────────────────────────────

export interface VerifiedSalesperson {
  userId: string;
  name: string;
  role: string;
}

export async function setOwnSalesPin(params: {
  username: string;
  pin: string;
  currentPassword?: string;
  currentPin?: string;
}): Promise<User> {
  return hydrateDates(await apiRequest<User>('/users/me/sales-pin', {
    method: 'PATCH',
    body: JSON.stringify(params),
  }));
}

export interface PerformanceBucket {
  salesCount: number;
  salesTotal: number;
  returnsTotal: number;
  netTotal: number;
  itemsSold: number;
}
export interface MyPerformance {
  today: PerformanceBucket;
  month: PerformanceBucket;
  allTime: PerformanceBucket;
}

/** Signed-in user's own POS sales performance (sales minus returns). */
export async function fetchMyPerformance(): Promise<MyPerformance> {
  return apiRequest<MyPerformance>('/me/performance');
}

export async function adminResetSalesPin(userId: string, username: string, pin: string): Promise<User> {
  return hydrateDates(await apiRequest<User>(`/users/${userId}/sales-pin/reset`, {
    method: 'PATCH',
    body: JSON.stringify({ username, pin }),
  }));
}

export async function adminClearSalesPin(userId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/users/${userId}/sales-pin`, { method: 'DELETE' });
}

export async function verifySalesPin(pin: string, username?: string): Promise<VerifiedSalesperson> {
  return apiRequest<VerifiedSalesperson>('/sales/verify-pin', {
    method: 'POST',
    body: JSON.stringify(username ? { username, pin } : { pin }),
  });
}

// ─── FBR reference data + diagnostics (server proxies the PRAL API) ─────────

export interface FbrProvince { stateProvinceCode: number; stateProvinceDesc: string }
export interface FbrUom { uoM_ID: number; description: string }
export interface FbrItemCode { hS_CODE: string; description: string }
export interface FbrSaleTypeRate { ratE_ID: number; ratE_DESC: string; ratE_VALUE: number }
export interface FbrRegistrationTypeResult { statuscode: string; REGISTRATION_NO: string; REGISTRATION_TYPE: string }
export interface FbrStatlResult { 'status code'?: string; status?: string; statuscode?: string }

export const fbrApi = {
  provinces: () => apiRequest<FbrProvince[]>('/fbr/reference/provinces'),
  uoms: () => apiRequest<FbrUom[]>('/fbr/reference/uoms'),
  itemCodes: () => apiRequest<FbrItemCode[]>('/fbr/reference/item-codes'),
  saleTypeRates: (params: { date?: string; transTypeId?: number; originationSupplier?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.date) q.set('date', params.date);
    if (params.transTypeId != null) q.set('transTypeId', String(params.transTypeId));
    if (params.originationSupplier != null) q.set('originationSupplier', String(params.originationSupplier));
    return apiRequest<FbrSaleTypeRate[]>(`/fbr/reference/sale-type-rates?${q}`);
  },
  hsUom: (hsCode: string, annexureId = 3) =>
    apiRequest<FbrUom[]>(`/fbr/reference/hs-uom?hsCode=${encodeURIComponent(hsCode)}&annexureId=${annexureId}`),
  statl: (regno: string, date?: string) =>
    apiRequest<FbrStatlResult>('/fbr/statl', {
      method: 'POST',
      body: JSON.stringify({ regno, date: date ?? new Date().toISOString().slice(0, 10) }),
    }),
  registrationType: (registrationNo: string) =>
    apiRequest<FbrRegistrationTypeResult>('/fbr/registration-type', {
      method: 'POST',
      body: JSON.stringify({ registrationNo }),
    }),
  validateSale: (saleId: string) =>
    apiRequest<{ payload: unknown; result: unknown }>(`/fbr/validate-sale/${saleId}`, { method: 'POST' }),
};

/** Static §9 catalogue — duplicated here so the UI doesn't need a round-trip
 *  to render dropdowns. Kept in sync with server/fbr.ts ALL_SCENARIOS. */
export const FBR_SCENARIOS: Record<string, { description: string; saleType: string }> = {
  SN001: { description: 'Goods at standard rate to registered buyers', saleType: 'Goods at Standard Rate (default)' },
  SN002: { description: 'Goods at standard rate to unregistered buyers', saleType: 'Goods at Standard Rate (default)' },
  SN005: { description: 'Reduced rate sale', saleType: 'Goods at Reduced Rate' },
  SN006: { description: 'Exempt goods sale', saleType: 'Exempt Goods' },
  SN007: { description: 'Zero rated sale', saleType: 'Goods at zero-rate' },
  SN008: { description: 'Sale of 3rd schedule goods', saleType: '3rd Schedule Goods' },
  SN015: { description: 'Sale of mobile phones', saleType: 'Mobile Phones' },
  SN016: { description: 'Processing / Conversion of Goods', saleType: 'Processing/ Conversion of Goods' },
  SN017: { description: 'Sale of Goods where FED is charged in ST mode', saleType: 'Goods (FED in ST Mode)' },
  SN018: { description: 'Services rendered or provided where FED is charged in ST mode', saleType: 'Services (FED in ST Mode)' },
  SN019: { description: 'Services rendered or provided', saleType: 'Services' },
  SN021: { description: 'Sale of Cement / Concrete Block', saleType: 'Cement /Concrete Block' },
  SN022: { description: 'Sale of Potassium Chlorate', saleType: 'Potassium Chlorate' },
  SN024: { description: 'Goods sold that are listed in SRO 297(1)/2023', saleType: 'Goods as per SRO.297(|)/2023' },
  SN025: { description: 'Drugs sold at fixed ST rate under serial 81 of Eighth Schedule Table 1', saleType: 'Non-Adjustable Supplies' },
  SN026: { description: 'Sale to End Consumer by retailers (standard rate)', saleType: 'Goods at Standard Rate (default)' },
  SN027: { description: 'Sale to End Consumer by retailers (3rd schedule)', saleType: '3rd Schedule Goods' },
  SN028: { description: 'Sale to End Consumer by retailers (reduced rate)', saleType: 'Goods at Reduced Rate' },
};

/** §10 — scenarios applicable to each (businessActivity, sector) combination.
 *  Pharmacy pharmacies almost always fall under (Retailer, Pharmaceuticals). */
export const FBR_APPLICABLE_SCENARIOS: Record<string, Record<string, string[]>> = {
  Manufacturer:    { Pharmaceuticals: ['SN001','SN002','SN005','SN006','SN007','SN015','SN016','SN017','SN021','SN022','SN024'] },
  Importer:        { Pharmaceuticals: ['SN001','SN002','SN005','SN006','SN007','SN015','SN016','SN017','SN021','SN022','SN024','SN025'] },
  Distributor:     { Pharmaceuticals: ['SN025','SN026','SN027','SN028','SN008'] },
  Wholesaler:      { Pharmaceuticals: ['SN025','SN026','SN027','SN028','SN008'] },
  Retailer:        { Pharmaceuticals: ['SN025','SN026','SN027','SN028','SN008'] },
  'Service Provider': { Pharmaceuticals: ['SN025','SN018','SN019'] },
  Exporter:        { Pharmaceuticals: ['SN001','SN002','SN005','SN006','SN007','SN015','SN016','SN017','SN021','SN022','SN024','SN025'] },
  Other:           { Pharmaceuticals: ['SN001','SN002','SN005','SN006','SN007','SN015','SN016','SN017','SN021','SN022','SN024','SN025'] },
};

export const FBR_SALE_TYPE_LABELS = [
  'Goods at Standard Rate (default)',
  'Goods at Reduced Rate',
  '3rd Schedule Goods',
  'Exempt Goods',
  'Goods at zero-rate',
  'Non-Adjustable Supplies',
  'Goods (FED in ST Mode)',
  'Services',
  'Services (FED in ST Mode)',
  'Processing/ Conversion of Goods',
  'Goods as per SRO.297(|)/2023',
];

