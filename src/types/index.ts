// Pharmacy POS System Types — FEFO-first, SaaS-ready, Pakistan market

// ─── Tenant / SaaS Layer ────────────────────────────────────────────────────
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  subscriptionPlan: SubscriptionPlan;
  isActive: boolean;
  createdAt: Date;
  /** B2B network username (editable, unique). */
  handle?: string;
  businessType?: 'pharmacy' | 'distributor' | 'wholesaler';
}

// ─── B2B Network ─────────────────────────────────────────────────────────────
export interface NetworkPeer { id: string; handle?: string; name: string; businessType: string; }
export interface NetworkConnection {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked' | 'disconnected';
  direction: 'incoming' | 'outgoing';
  requestedByMe: boolean;
  blockedByMe: boolean;
  peer?: NetworkPeer;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface NetworkMessage {
  id: string;
  connectionId: string;
  body: string;
  mine: boolean;
  senderName?: string;
  readAt?: Date;
  createdAt: Date;
}
export interface NetworkOrderItem {
  id: string;
  productName: string;
  strength?: string;
  packSize?: string;
  quantity: number;
  buyerMedicineId?: string;
}
export interface NetworkOrder {
  id: string;
  connectionId: string;
  orderNumber: string;
  status: 'placed' | 'accepted' | 'declined' | 'shipped' | 'received' | 'cancelled';
  role: 'buyer' | 'seller';
  notes?: string;
  totalQty: number;
  buyerPurchaseId?: string;
  peer?: NetworkPeer;
  items: NetworkOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── RBAC ──────────────────────────────────────────────────────────────────
export type UserRole = 'superadmin' | 'owner' | 'manager' | 'cashier' | 'salesman' | 'pharmacist' | 'accountant';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  branchId?: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  /** Short handle used at POS receipt time alongside the 4-digit PIN. */
  salesUsername?: string;
  /** True when the user has a PIN configured. Hash itself never crosses the wire. */
  salesPinSet?: boolean;
  /** M6 — Per-branch access entries. When undefined, falls back to legacy
   *  single-branch + role rules in the helper (see getBranchAccess). */
  branchAccess?: UserBranchAccess[];
}

// M6 — A single branch-access grant for a user. `access: 'read'` means the
// user can browse data scoped to that branch but cannot create / update /
// delete. 'full' means they can do everything their role allows on that branch.
export interface UserBranchAccess {
  branchId: string;
  access: 'read' | 'full';
}

// M6 — Shift session at the POS terminal.
// Per-operator cash reconciliation captured when a shift is closed.
// `difference` = counted closing cash − expected cash (positive = drawer over,
// negative = short). `byMethod` is gross sales split by payment method.
export interface ShiftSummary {
  byMethod: Record<string, number>;
  cashCollected: number;
  expectedCash: number;
  difference: number;
  salesCount: number;
  returnsCount: number;
}

export interface ShiftSession {
  id: string;
  branchId: string;
  userId: string;
  userName?: string;
  openedAt: Date;
  openingCash: number;
  closedAt?: Date;
  closingCash?: number;
  salesTotal: number;
  returnsTotal: number;
  summary?: ShiftSummary;
  status: 'open' | 'closed';
  notes?: string;
}

// Feature 4 — customer promise / advance order (layaway).
export interface PromiseOrder {
  id: string;
  branchId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  itemName: string;
  medicineId?: string;
  quantity: number;
  advanceAmount: number;
  purchaseCost?: number;
  finalPrice?: number;
  status: 'pending' | 'purchased' | 'settled' | 'cancelled';
  notes?: string;
  createdBy: string;
  purchasedAt?: Date;
  settledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// M6 — End-of-day close summary (Z-report style).
export interface DayCloseSummary {
  byMethod: Record<string, number>;
  taxTotal: number;
  discountTotal: number;
  salesCount: number;
  fbrSubmitted?: number;
  fbrFailed?: number;
}
export interface DayClose {
  id: string;
  branchId: string;
  closedBy: string;
  closedByName?: string;
  closedAt: Date;
  businessDate: Date;
  openingCash?: number;
  closingCash?: number;
  salesTotal: number;
  returnsTotal: number;
  expensesTotal: number;
  summary: DayCloseSummary;
  notes?: string;
}

export interface Permission {
  module: string;
  actions: ('create' | 'read' | 'update' | 'delete')[];
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  isActive: boolean;
  /** Who pays the branch subscription — main pharmacy or the branch itself. */
  billingPaidBy?: 'main' | 'self';
  /** Discount % off the standard sub-branch fee when self-billing. */
  subscriptionDiscount?: number;
  createdAt: Date;
}

// ─── OTC / Prescription / Controlled classification ───────────────────────
export type DrugClassification = 'otc' | 'prescription' | 'controlled';

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brandName?: string;
  category: MedicineCategory;
  subCategory?: string;
  description?: string;
  dosageForm: DosageForm;
  strength: string;
  unit: string;
  units?: MedicineUnit[];
  barcode?: string;
  qrCode?: string;
  /** Link to the shared catalog row this medicine came from. */
  masterProductId?: string;
  /** DRAP registration number, when known. */
  drapRegNo?: string;
  isPrescriptionRequired: boolean;
  /** OTC, Prescription, or Controlled drug */
  classification: DrugClassification;
  /** Generic substitutes (medicine IDs) */
  substituteIds?: string[];
  /** Controlled drug schedule (e.g. Schedule-III) */
  controlledSchedule?: string;
  isActive: boolean;
  /** Whether this medicine is listed on the customer-facing web store */
  webLive: boolean;
  taxRate?: number;
  reorderLevel: number;
  reorderQuantity: number;
  hsCode?: string;
  fbrUom?: string;
  fbrSaleType?: string;
  fbrScenarioId?: string;
  /** Optional SRO mapping for medicines listed under a specific SRO schedule. */
  fbrSroScheduleNo?: string;
  fbrSroItemSerialNo?: string;
  /** Fixed/notified retail price for 3rd-schedule drugs (per spec §4 item field). */
  fbrFixedNotifiedValueOrRetailPrice?: number;
  drapRegistration?: string;
  manufacturer?: string;
  countryOfOrigin?: string;
  packSize?: string;
  storageInstructions?: string;
  taxRatePercent?: number;
  shelfLocation?: string;
  rackNumber?: string;
  mrp?: number;
  purchaseRate?: number;
  /** Default trade price floor for discounting on POS. Batches can override. */
  tradePrice?: number;
  maxStock?: number;
  allowLooseSale?: boolean;
  schedule?: string;
  composition?: string;
  /** Default true. When false, excluded from low-stock alerts + auto-PO. */
  reorderActive?: boolean;
  /** Scanned/photographed barcode image (data URL). */
  barcodeImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicineUnit {
  id: string;
  name: string;
  abbreviation: string;
  multiplier: number;
  salePrice?: number;
  barcode?: string;
  isBaseUnit: boolean;
  isActive: boolean;
}

export interface TaxRule {
  id: string;
  name: string;
  type: 'sales_tax' | 'further_tax' | 'extra_tax' | 'fed' | 'withholding' | 'service_tax' | 'custom';
  ratePercent: number;
  appliesTo: 'goods' | 'services' | 'both';
  province?: string;
  fbrRateLabel?: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ServiceCharge {
  id: string;
  name: string;
  type: 'fixed' | 'percent';
  amount: number;
  taxable: boolean;
  isFbrPosFee?: boolean;
  isActive: boolean;
}

export interface DiscountRule {
  id: string;
  name: string;
  type: 'line_percent' | 'line_fixed' | 'invoice_percent' | 'invoice_fixed';
  value: number;
  requiresApproval: boolean;
  isActive: boolean;
}

export type FbrBusinessActivity =
  | 'Manufacturer'
  | 'Importer'
  | 'Distributor'
  | 'Wholesaler'
  | 'Retailer'
  | 'Exporter'
  | 'Service Provider'
  | 'Other';

export type FbrSector =
  | 'All Other Sectors'
  | 'Pharmaceuticals'
  | 'FMCG'
  | 'Steel'
  | 'Textile'
  | 'Telecom'
  | 'Petroleum'
  | 'Electricity Distribution'
  | 'Gas Distribution'
  | 'Services'
  | 'Automobile'
  | 'CNG Stations'
  | 'Wholesale / Retails';

export interface FbrProfile {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  integrationType: 'pos' | 'digital_invoicing';
  apiBaseUrl: string;
  validateEndpoint?: string;
  postEndpoint?: string;
  posId?: string;
  merchantId?: string;
  sellerNTNCNIC: string;
  sellerBusinessName: string;
  sellerProvince: string;
  sellerAddress: string;
  bearerToken?: string;
  includeServiceCharge: boolean;
  lastVerifiedAt?: string;
  /** §10 — business activity + sector drive which §9 scenarios are allowed. */
  businessActivity?: FbrBusinessActivity;
  sector?: FbrSector;
  /** §9 scenario sent in sandbox payloads (omitted in production). */
  defaultScenarioId?: string;
  /** Hit /validateinvoicedata before /postinvoicedata. Default ON in sandbox. */
  validateBeforePost?: boolean;
}

export type MedicineCategory =
  | 'tablets'
  | 'capsules'
  | 'caplets'
  | 'syrups'
  | 'injections'
  | 'ampoules'
  | 'infusions'
  | 'drops'
  | 'creams'
  | 'ointments'
  | 'inhalers'
  | 'powders'
  | 'granules'
  | 'suspensions'
  | 'solutions'
  | 'surgical'
  | 'medical_instruments'
  | 'medical_devices'
  | 'supplements'
  | 'personal_care'
  | 'baby_care'
  | 'shampoo'
  | 'soap'
  | 'cosmetics'
  | 'beauty_products'
  | 'groceries'
  | 'food_beverages'
  | 'packaged_foods'
  | 'otc';

export type DosageForm =
  | 'tablet'
  | 'caplet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'ampoule'
  | 'infusion'
  | 'drop'
  | 'cream'
  | 'ointment'
  | 'inhaler'
  | 'powder'
  | 'granules'
  | 'suspension'
  | 'solution'
  | 'gel'
  | 'lotion'
  | 'spray'
  | 'patch'
  | 'surgical'
  | 'medical_instrument'
  | 'shampoo'
  | 'soap'
  // Non-medicine retail lines a pharmacy also sells.
  | 'cosmetics'
  | 'beauty_products'
  | 'groceries'
  | 'food_beverages'
  | 'packaged_foods';

export interface Batch {
  id: string;
  medicineId: string;
  /** The branch this physical stock lives in. Each branch holds its own batches. */
  branchId?: string;
  batchNumber: string;
  expiryDate: Date;
  manufacturingDate?: Date;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  /** Per-batch trade price override; falls back to medicine.tradePrice, then salePrice. */
  tradePrice?: number;
  mrp: number;
  supplierId: string;
  purchaseId: string;
  location?: string;
  isActive: boolean;
  /** Expiry-alert disposition: 'active' | 'pending_return' | 'returned' | 'disposed'. */
  disposition?: 'active' | 'pending_return' | 'returned' | 'disposed';
  /** Why returned/written off: expiry | damage | waste (null/legacy = expiry). */
  dispositionReason?: 'expiry' | 'damage' | 'waste';
  /** Value credited (return) or written off (dispose) when actioned. */
  dispositionValue?: number;
  dispositionNote?: string;
  dispositionAt?: Date;
  createdAt: Date;
  webLive?: boolean;
  /** FEFO: days until expiry (computed helper) */
  daysUntilExpiry?: number;
  /** Expiry risk percentage 0–100 (computed helper) */
  expiryRiskPercent?: number;
  /** Profit per unit (salePrice - purchasePrice) */
  profitPerUnit?: number;
}

export interface Stock {
  medicineId: string;
  totalQuantity: number;
  batches: Batch[];
  lastUpdated: Date;
}

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  ntn?: string;
  gstNumber?: string;
  creditLimit: number;
  currentBalance: number;
  paymentTerms: number;
  isActive: boolean;
  createdAt: Date;
  webLive?: boolean;
  /** Optional weekly visit schedule. Empty/undefined = "no schedule". */
  visitDays?: WeekDay[];
}

// M3 — Medicine ↔ distributor mapping. Powers the supplier-scoped medicine
// picker on PO creation and the multi-distributor grouping on POS.
export interface MedicineSupplier {
  id: string;
  medicineId: string;
  supplierId: string;
  lastTradePrice?: number;
  lastReceivedAt?: Date;
  isPrimary: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// M3 — A single supplier invoice attached to a PO. Multiple invoices per PO
// model partial deliveries that each carry their own invoice number.
export interface PurchaseInvoice {
  id: string;
  purchaseId: string;
  supplierInvoiceNumber: string;
  imageUrl?: string;
  totalAmount: number;
  receivedAt: Date;
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

// M7 — External integration partner (wholesale ERP, hospital, clinic).
export type PartnerType = 'wholesale' | 'hospital' | 'clinic';
export interface Partner {
  id: string;
  type: PartnerType;
  name: string;
  baseUrl?: string;
  /** True when an API key is configured. The plaintext key never crosses the wire. */
  apiKeySet?: boolean;
  /** True when an inbound webhook signature secret is configured. */
  inboundSecretSet?: boolean;
  isActive: boolean;
  notes?: string;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// M7 — Single outbox row representing one outbound event.
export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'skipped';
export interface OutboxEvent {
  id: string;
  partnerId?: string;
  event: string;
  status: OutboxStatus;
  retries: number;
  lastError?: string;
  nextAttemptAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// M7 — Inbox thread + messages.
export type MessageSenderType = 'tenant' | 'wholesale' | 'hospital' | 'clinic' | 'system';
export interface InboxMessage {
  id: string;
  threadId: string;
  senderType: MessageSenderType;
  senderName?: string;
  body: string;
  attachmentUrl?: string;
  readAt?: Date;
  createdAt: Date;
}
export interface InboxThread {
  id: string;
  partnerId?: string;
  subject: string;
  lastMessageAt: Date;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// M5 — Persisted in-app notification.
export type NotificationScope = 'tenant' | 'user' | 'role';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationKind =
  | 'sale_return'
  | 'payment'
  | 'reconcile'
  | 'purchase_return'
  | 'wholesale'
  | 'system';
export interface NotificationRow {
  id: string;
  scope: NotificationScope;
  userId?: string;
  role?: string;
  title: string;
  body?: string;
  severity: NotificationSeverity;
  kind: NotificationKind;
  link?: string;
  dismissedAt?: Date;
  createdAt: Date;
}

// M4 — Stock-take session and per-batch counted-vs-system snapshot.
export type ReconcileScope = 'all' | 'category' | 'shelf' | 'medicine' | 'supplier';
export type ReconcileStatus = 'open' | 'posted' | 'cancelled';
export interface ReconcileRun {
  id: string;
  scope: ReconcileScope;
  scopeValue?: string;
  status: ReconcileStatus;
  startedAt: Date;
  completedAt?: Date;
  notes?: string;
  createdBy: string;
  postedBy?: string;
}
export interface ReconcileEntry {
  id: string;
  runId: string;
  medicineId: string;
  batchId?: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// M3 — Stock returned upstream to the distributor (damaged, expired, wrong
// shipment, etc.). items is per-batch with a reason.
export interface PurchaseReturnItem {
  medicineId: string;
  medicineName?: string;
  batchId: string;
  batchNumber?: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
}
export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  supplierId: string;
  purchaseId?: string;
  returnDate: Date;
  items: PurchaseReturnItem[];
  totalAmount: number;
  reason: string;
  stockAdjusted: boolean;
  status: 'posted' | 'pending' | 'rejected';
  notes?: string;
  createdBy: string;
  createdAt: Date;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  branchId: string;
  purchaseDate: Date;
  /** Calendar due date. Computed at GRN time as receiveDate + paymentTermsDays.
   *  May be undefined for PO-stage drafts before goods arrive. */
  dueDate?: Date;
  /** Payment terms in days, stored at PO creation (e.g. 30, 60). The actual
   *  calendar due date is derived from this at GRN. */
  paymentTermsDays?: number;
  items: PurchaseItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  /** Supplier-issued invoice / DC number (from the printed bill they handed us) */
  supplierInvoiceNumber?: string;
  /** Scan/photo of the supplier's printed invoice (data URL) — uploaded at GRN time. */
  supplierInvoiceImageUrl?: string;
  /** Payments recorded against this PO (partial or full, any method) */
  payments?: PurchasePayment[];
  /** True for "loose / local purchase" — a one-step off-supplier buy used when
   *  a customer urgently needs an out-of-stock medicine. Tracked separately so
   *  reports can filter and supplier credit isn't affected. */
  isLoose?: boolean;
  /** Free-text source for loose purchases ("Khan Pharmacy", "Adjacent Medical Store"). */
  looseSource?: string;
  status: PurchaseStatus;
  /** Buyer closed a partially-received PO (status becomes 'received', still flagged Partial). */
  closedPartial?: boolean;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchasePayment {
  id: string;
  amount: number;
  method: 'cash' | 'card' | 'bank_transfer' | 'cheque' | 'jazzcash' | 'easypaisa' | 'other';
  reference?: string;
  notes?: string;
  /** Scan/photo proof of the payment (data URL) — cheque pic, bank receipt, etc. */
  proofImageUrl?: string;
  paidAt: Date;
  recordedBy: string;
}

export interface PurchaseItem {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  mrp: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
}

export type PurchaseStatus = 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

export interface Sale {
  id: string;
  invoiceNumber: string;
  branchId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerCnic?: string;
  /** Loyalty: points granted by this sale. */
  loyaltyPointsEarned?: number;
  /** Loyalty: points spent on this sale. */
  loyaltyPointsRedeemed?: number;
  /** Loyalty: Rs discount from redeemed points. */
  loyaltyDiscount?: number;
  doctorName?: string;
  prescriptionNumber?: string;
  /** Uploaded prescription image (data URL) — kept for legal/audit access on controlled drugs */
  prescriptionImageUrl?: string;
  saleDate: Date;
  items: SaleItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMethods: PaymentMethod[];
  status: SaleStatus;
  isPrescription: boolean;
  notes?: string;
  fbrStatus?: 'not_integrated' | 'pending' | 'submitted' | 'failed';
  fbrInvoiceNumber?: string;
  fbrBarcode?: string;
  fbrQrPayload?: string;
  fbrResponse?: Record<string, unknown>;
  createdBy: string;
  /** User id of the salesperson who entered the PIN at receipt time. */
  salesPersonId?: string;
  /** Name snapshot — preserved on the sale even if the user is deleted later. */
  salesPersonName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleItem {
  id: string;
  medicineId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitName?: string;
  unitMultiplier?: number;
  unitPrice: number;
  purchasePrice: number;
  /** Gross profit = (unitPrice - purchasePrice) * quantity */
  profit: number;
  discountPercent: number;
  taxRuleId?: string;
  taxPercent: number;
  total: number;
  expiryDate: Date;
  /** Whether cashier overrode FEFO suggestion */
  fefoOverride?: boolean;
}

export type SaleStatus = 'pending' | 'completed' | 'partial_returned' | 'returned' | 'cancelled';

export interface PaymentMethod {
  method: 'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer';
  amount: number;
  reference?: string;
}

export interface SaleReturn {
  id: string;
  saleId: string;
  returnNumber: string;
  returnDate: Date;
  items: SaleReturnItem[];
  totalAmount: number;
  refundMethod: PaymentMethod;
  reason: string;
  restockInventory: boolean;
  fbrStatus?: 'not_required' | 'pending' | 'submitted' | 'failed';
  fbrReference?: string;
  fbrResponse?: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
}

export interface SaleReturnItem {
  id: string;
  saleItemId: string;
  medicineId: string;
  batchId: string;
  batchNumber?: string;
  medicineName?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  total: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  cnic?: string;
  address?: string;
  dateOfBirth?: Date;
  allergies?: string[];
  medicalHistory?: string;
  isActive: boolean;
  createdAt: Date;
  totalPurchases: number;
  loyaltyPoints: number;
  registrationType?: 'registered' | 'unregistered';
  buyerNtn?: string;
  webLive?: boolean;
}

// ─── Prescription ───────────────────────────────────────────────────────────
export interface PrescriptionItem {
  medicineId: string;
  medicineName: string;
  quantity: number;
  dosageInstructions?: string;
  unitPrice: number;
}

export interface Prescription {
  id: string;
  customerId: string;
  customerName: string;
  doctorName: string;
  prescriptionNumber?: string;
  /** Uploaded prescription image (data URL) — kept for legal access on controlled drugs */
  prescriptionImageUrl?: string;
  items: PrescriptionItem[];
  /** Sale IDs linked to this prescription */
  saleIds: string[];
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpiryAlert {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  quantity: number;
  alertLevel: 'critical' | 'warning' | 'notice';
  isResolved: boolean;
  createdAt: Date;
}

export interface LowStockAlert {
  id: string;
  medicineId: string;
  medicineName: string;
  currentStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  isResolved: boolean;
  createdAt: Date;
}

export interface DashboardStats {
  todaySales: number;
  todayTransactions: number;
  todayProfit: number;
  monthSales: number;
  monthProfit: number;
  yearSales: number;
  lowStockCount: number;
  expiryAlertsCount: number;
  pendingPurchases: number;
  supplierPayables: number;
  /** Stock accuracy % (resolved alerts / total alerts) */
  stockAccuracyPercent: number;
  /** Dead stock value (items not sold in 90 days) */
  deadStockValue: number;
  /** Inventory turnover rate */
  inventoryTurnoverRate: number;
}

export interface SalesReport {
  date: Date;
  totalSales: number;
  totalTransactions: number;
  averageTicket: number;
  totalItems: number;
  totalProfit: number;
}

export interface InventoryReport {
  medicineId: string;
  medicineName: string;
  category: string;
  totalQuantity: number;
  stockValue: number;
  batches: number;
  nearestExpiry?: Date;
}

export interface ProfitReport {
  date: Date;
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
}

// ─── Financial Intelligence Types ──────────────────────────────────────────
export type LedgerEntryType = 'income' | 'expense' | 'payable' | 'receivable';

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  referenceId: string;
  referenceType: 'sale' | 'purchase' | 'expense' | 'payment';
  amount: number;
  description: string;
  createdBy: string;
  createdAt: Date;
}

export interface BatchProfitReport {
  batchId: string;
  batchNumber: string;
  medicineId: string;
  medicineName: string;
  supplierId: string;
  supplierName: string;
  totalSold: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  expiryDate: Date;
}

export interface SupplierProfitReport {
  supplierId: string;
  supplierName: string;
  totalPurchases: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
}

export interface Expense {
  id: string;
  category: 'rent' | 'salary' | 'utilities' | 'marketing' | 'other';
  description: string;
  amount: number;
  date: Date;
  createdBy: string;
  createdAt: Date;
}

// ─── FEFO / Expiry Intelligence ────────────────────────────────────────────
export interface ExpiryRiskReport {
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  /** 0–100: 100 = expires today */
  riskPercent: number;
  quantity: number;
  potentialLoss: number;
  recommendation: 'sell_urgently' | 'promote' | 'return_to_supplier' | 'write_off';
}

export interface SlowMovingItem {
  medicineId: string;
  medicineName: string;
  lastSoldDate?: Date;
  daysSinceLastSale: number;
  stockQuantity: number;
  stockValue: number;
  reorderSuggested: boolean;
}

// ─── KPI Framework ─────────────────────────────────────────────────────────
export interface PharmacyKPIs {
  /** % reduction in expiry loss vs previous period */
  expiryLossReductionPercent: number;
  /** Current stock accuracy % */
  stockAccuracyPercent: number;
  /** Sales growth % vs previous period */
  salesGrowthPercent: number;
  /** Inventory turnover rate (times/year) */
  inventoryTurnoverRate: number;
  /** Dead stock ratio (dead_value / total_stock_value) */
  deadStockRatio: number;
  /** Gross profit margin % */
  grossProfitMarginPercent: number;
  /** Average transaction value */
  avgTransactionValue: number;
  /** Cash vs Credit sales ratio */
  cashCreditRatio: number;
}

export interface TaxReport {
  date: Date;
  totalSales: number;
  taxableAmount: number;
  taxAmount: number;
  taxRate: number;
}

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyNtn: string;
  companyGst: string;
  /** Company logo as a data URL; printed on receipts when printCompanyLogo=true. */
  companyLogoUrl?: string;
  /** Default profit margin % applied at GRN to auto-compute MRP from purchase price.
   *  Industry-standard ~15 % for generics. Editable per-line at GRN. */
  defaultMarginPercent?: number;
  defaultTaxRate: number;
  currency: string;
  language: 'en' | 'ar' | 'ur';
  dateFormat: string;
  timeFormat: string;
  receiptPrinter?: string;
  barcodePrinter?: string;
  enableLoyalty: boolean;
  /** @deprecated superseded by loyaltyRupeesPerPoint; kept for back-compat. */
  loyaltyPointsPerRupee: number;
  /** Earn: rupees of spend that grant 1 point (default 100 → 1 pt / Rs 100). */
  loyaltyRupeesPerPoint: number;
  /** Redeem: rupees of discount a single point is worth (default 2). */
  loyaltyPointValue: number;
  /** Minimum points a customer must hold before they can redeem (default 50). */
  loyaltyMinRedeemPoints: number;
  /** Max share of a bill that loyalty redemption can cover, % (default 50). */
  loyaltyMaxRedeemPercent: number;
  enableSms: boolean;
  smsApiKey?: string;
  fbrIntegration: boolean;
  fbrApiKey?: string;
  theme: 'light' | 'dark' | 'system';
  /** FEFO enforcement: 'strict' (force nearest expiry) | 'suggest' (warn but allow override) */
  fefoMode: 'strict' | 'suggest';
  /** Expiry alert thresholds in days */
  expiryAlertDays: { critical: number; warning: number; notice: number };
  /** Offline mode: sync queued writes when back online */
  offlineModeEnabled: boolean;
  /** Owner-controlled: whether managers can see profit details */
  managerCanSeeProfit: boolean;
  /** Receipt footer text */
  receiptFooterText: string;
  /** Auto-print receipt after sale */
  autoPrintReceipt: boolean;
  /** Show profit margin on POS */
  showProfitOnPOS: boolean;
  // ── POS price visibility (M2) ──
  // Each flag has a role allow-list. Owner is always allowed regardless.
  // Default behaviour: purchase price hidden from non-owners, TP + sale price
  // visible to everyone on POS.
  showPurchasePriceOnPOS?: boolean;
  showPurchasePriceRoles?: UserRole[];
  showTradePriceOnPOS?: boolean;
  showTradePriceRoles?: UserRole[];
  showSalePriceOnPOS?: boolean;
  showSalePriceRoles?: UserRole[];
  // ── Per-payment-method defaults (M2) ──
  // Auto-applied when the cashier selects that method on the payment dialog.
  // feePercent adds a surcharge; discountPercent subtracts. Cashier can override.
  paymentMethodDefaults?: Partial<Record<'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank_transfer', { feePercent?: number; discountPercent?: number }>>;
  // ── Distributor visit schedule (M3) ──
  // When true, show visit-day chips on Suppliers list + a "Today's expected
  // suppliers" widget on Dashboard.
  supplierVisitDaysEnabled?: boolean;
  // ── Shift / day-end close (M6) ──
  // When true, the POS won't complete a sale until the cashier opens a shift.
  shiftCloseEnabled?: boolean;
  // When true, expose the /day-close page so a manager can run a Z-report
  // close at end of business.
  dayCloseEnabled?: boolean;
  // Item 8 — when false, the "collect by cashier" (deferred) option is hidden;
  // sales are marked paid as soon as the receipt prints (seller collected at POS).
  // Defaults to enabled (undefined === true) to preserve existing behaviour.
  cashierCollectionEnabled?: boolean;
  // When false (default), the pharmacy runs as a single branch: the header
  // branch switcher, the Branches page, and per-branch user access are all
  // hidden. Turn on to manage multiple branches.
  multiBranchEnabled?: boolean;
  // ── Auto-PO (M7) ──
  // When true, the auto-PO worker is allowed to draft purchase orders from
  // low-stock medicines. Owner reviews + confirms before sending.
  autoPoEnabled?: boolean;
  // Multiplier applied to reorderLevel. 1.0 = exactly at reorderLevel; 1.5 =
  // trigger 50% earlier than reorderLevel.
  autoPoTriggerPercent?: number;
  /** Enable expiry alerts */
  enableExpiryAlerts: boolean;
  /** Enable low-stock alerts */
  enableLowStockAlerts: boolean;
  /** Payment method toggles */
  enableJazzCash: boolean;
  enableEasyPaisa: boolean;
  enableCardPayments: boolean;
  /** Print company logo on receipt */
  printCompanyLogo: boolean;
  /** Automatic backup */
  autoBackup: boolean;
  /** Backup time */
  backupTime: string;
  /** Platform module toggles (super-admin controlled) */
  posEnabled: boolean;
  managementEnabled: boolean;
  webStoreEnabled: boolean;
  taxRules: TaxRule[];
  serviceCharges: ServiceCharge[];
  discountRules: DiscountRule[];
  fbrProfile: FbrProfile;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  /** Structured entity snapshot for tamper-evidence */
  entitySnapshot?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

// ─── Offline Sync Queue ────────────────────────────────────────────────────
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entity: string;
  payload: Record<string, unknown>;
  retries: number;
  status: SyncStatus;
  createdAt: Date;
}

// ─── Web Store (Customer-facing) ───────────────────────────────────────────
export type WebPaymentMethod = 'cod' | 'jazzcash' | 'easypaisa' | 'card';
export type WebOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';

export interface WebOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress: string;
  customerCity: string;
  items: WebOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: WebPaymentMethod;
  paymentStatus: 'pending' | 'paid' | 'failed';
  orderStatus: WebOrderStatus;
  notes?: string;
  createdAt: string;
}

export interface WebOrderItem {
  medicineId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface WebCartItem {
  medicineId: string;
  name: string;
  category: string;
  strength: string;
  price: number;
  quantity: number;
  maxQuantity: number;
}

// ─── Web Customer Auth ────────────────────────────────────────────────────
export interface WebCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  authProvider: 'email' | 'google';
  createdAt: string;
}
