// Pharmacy POS System Types

export type UserRole = 'owner' | 'manager' | 'cashier' | 'pharmacist' | 'accountant';

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
  isActive: boolean;
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
  discountPercent: number;
  taxPercent: number;
  total: number;
  expiryDate: Date;
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
  monthSales: number;
  yearSales: number;
  lowStockCount: number;
  expiryAlertsCount: number;
  pendingPurchases: number;
  supplierPayables: number;
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
  language: 'en' | 'ur';
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
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: string;
  ipAddress?: string;
  createdAt: Date;
}
