// Pharmacy POS System Types — FEFO-first, SaaS-ready, Pakistan market

// ─── Tenant / SaaS Layer ────────────────────────────────────────────────────
export type SubscriptionPlan = 'basic' | 'pro' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  subscriptionPlan: SubscriptionPlan;
  isActive: boolean;
  createdAt: Date;
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
  barcode?: string;
  qrCode?: string;
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
  reorderLevel: number;
  reorderQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MedicineCategory = 
  | 'tablets'
  | 'capsules'
  | 'syrups'
  | 'injections'
  | 'drops'
  | 'creams'
  | 'ointments'
  | 'inhalers'
  | 'powders'
  | 'suspensions'
  | 'solutions'
  | 'medical_devices'
  | 'supplements'
  | 'personal_care'
  | 'baby_care'
  | 'otc';

export type DosageForm = 
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'drop'
  | 'cream'
  | 'ointment'
  | 'inhaler'
  | 'powder'
  | 'suspension'
  | 'solution'
  | 'gel'
  | 'lotion'
  | 'spray'
  | 'patch';

export interface Batch {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: Date;
  manufacturingDate?: Date;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  mrp: number;
  supplierId: string;
  purchaseId: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
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
}

export interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  branchId: string;
  purchaseDate: Date;
  dueDate?: Date;
  items: PurchaseItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: PurchaseStatus;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
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
  customerName?: string;
  customerPhone?: string;
  customerCnic?: string;
  doctorName?: string;
  prescriptionNumber?: string;
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
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleItem {
  id: string;
  medicineId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  /** Gross profit = (unitPrice - purchasePrice) * quantity */
  profit: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
  expiryDate: Date;
  /** Whether cashier overrode FEFO suggestion */
  fefoOverride?: boolean;
}

export type SaleStatus = 'pending' | 'completed' | 'returned' | 'cancelled';

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
  createdBy: string;
  createdAt: Date;
}

export interface SaleReturnItem {
  id: string;
  saleItemId: string;
  medicineId: string;
  batchId: string;
  quantity: number;
  unitPrice: number;
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
  defaultTaxRate: number;
  currency: string;
  language: 'en' | 'ar' | 'ur';
  dateFormat: string;
  timeFormat: string;
  receiptPrinter?: string;
  barcodePrinter?: string;
  enableLoyalty: boolean;
  loyaltyPointsPerRupee: number;
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
