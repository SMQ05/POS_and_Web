import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  User,
  Branch,
  Medicine,
  Batch,
  Supplier,
  Purchase,
  Sale,
  Customer,
  ExpiryAlert,
  LowStockAlert,
  AppSettings,
  DashboardStats,
  AuditLog,
  UserRole,
  Permission,
  LedgerEntry,
  Expense,
  Prescription,
  PrescriptionItem,
  SyncQueueItem,
  ExpiryRiskReport,
  SlowMovingItem,
  PharmacyKPIs,
  WebOrder,
  WebCartItem,
  WebCustomer,
} from '@/types';

// Auth Store
interface AuthState {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (module: string, action: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        // Mock login - in real app, this would call an API
        const mockUsers: User[] = [
          {
            id: '0',
            name: 'Super Admin',
            email: 'superadmin@pharmapos.pk',
            role: 'superadmin',
            permissions: [{ module: '*', actions: ['create', 'read', 'update', 'delete'] }],
            isActive: true,
            createdAt: new Date(),
          },
          {
            id: '1',
            name: 'Admin Owner',
            email: 'owner@pharmapos.pk',
            role: 'owner',
            permissions: [{ module: '*', actions: ['create', 'read', 'update', 'delete'] }],
            isActive: true,
            createdAt: new Date(),
          },
          {
            id: '2',
            name: 'Manager User',
            email: 'manager@pharmapos.pk',
            role: 'manager',
            permissions: [
              { module: 'pos', actions: ['create', 'read', 'update'] },
              { module: 'inventory', actions: ['create', 'read', 'update'] },
              { module: 'reports', actions: ['read'] },
            ],
            isActive: true,
            createdAt: new Date(),
          },
          {
            id: '3',
            name: 'Cashier User',
            email: 'cashier@pharmapos.pk',
            role: 'cashier',
            permissions: [
              { module: 'pos', actions: ['create', 'read'] },
              { module: 'sales', actions: ['read'] },
            ],
            isActive: true,
            createdAt: new Date(),
          },
          {
            id: '4',
            name: 'Sales User',
            email: 'salesman@pharmapos.pk',
            role: 'salesman',
            permissions: [
              { module: 'pos', actions: ['create', 'read'] },
            ],
            isActive: true,
            createdAt: new Date(),
          },
        ];
        
        const user = mockUsers.find(u => u.email === email);
        if (user) {
          set({ currentUser: user, isAuthenticated: true });
          return true;
        }
        return false;
      },
      logout: () => {
        set({ currentUser: null, isAuthenticated: false });
      },
      hasPermission: (module: string, action: string) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        if (currentUser.role === 'owner' || currentUser.role === 'superadmin') return true;
        
        return currentUser.permissions.some(
          p => (p.module === module || p.module === '*') && p.actions.includes(action as any)
        );
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

// App Settings Store
interface SettingsState {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  toggleTheme: () => void;
  setLanguage: (lang: 'en' | 'ar' | 'ur') => void;
}

const defaultSettings: AppSettings = {
  companyName: 'PharmaPOS Pakistan',
  companyAddress: 'Main Market, Lahore',
  companyPhone: '+92-300-1234567',
  companyEmail: 'info@pharmapos.pk',
  companyNtn: '1234567-8',
  companyGst: '12-34-5678-901-23',
  defaultTaxRate: 18,
  currency: 'PKR',
  language: 'en',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  enableLoyalty: true,
  loyaltyPointsPerRupee: 1,
  enableSms: false,
  fbrIntegration: false,
  theme: 'light',
  fefoMode: 'suggest',
  expiryAlertDays: { critical: 30, warning: 60, notice: 90 },
  offlineModeEnabled: true,
  managerCanSeeProfit: false,
  receiptFooterText: 'Thank you for your purchase!',
  autoPrintReceipt: false,
  showProfitOnPOS: true,
  enableExpiryAlerts: true,
  enableLowStockAlerts: true,
  enableJazzCash: true,
  enableEasyPaisa: true,
  enableCardPayments: true,
  printCompanyLogo: true,
  autoBackup: true,
  backupTime: '02:00',
  posEnabled: true,
  managementEnabled: true,
  webStoreEnabled: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),
      toggleTheme: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            theme: state.settings.theme === 'light' ? 'dark' : 'light',
          },
        })),
      setLanguage: (lang) =>
        set((state) => ({ settings: { ...state.settings, language: lang } })),
    }),
    {
      name: 'settings-storage',
    }
  )
);

// Dashboard Store
interface DashboardState {
  stats: DashboardStats;
  recentSales: Sale[];
  expiryAlerts: ExpiryAlert[];
  lowStockAlerts: LowStockAlert[];
  /** IDs of alerts the user has dismissed (live alerts use these to hide items) */
  dismissedExpiryAlertIds: string[];
  dismissedLowStockAlertIds: string[];
  updateStats: (stats: DashboardStats) => void;
  addExpiryAlert: (alert: ExpiryAlert) => void;
  addLowStockAlert: (alert: LowStockAlert) => void;
  resolveExpiryAlert: (id: string) => void;
  resolveLowStockAlert: (id: string) => void;
}

const defaultStats: DashboardStats = {
  todaySales: 0,
  todayTransactions: 0,
  todayProfit: 0,
  monthSales: 0,
  monthProfit: 0,
  yearSales: 0,
  lowStockCount: 0,
  expiryAlertsCount: 0,
  pendingPurchases: 0,
  supplierPayables: 0,
  stockAccuracyPercent: 100,
  deadStockValue: 0,
  inventoryTurnoverRate: 0,
};

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: defaultStats,
  recentSales: [],
  expiryAlerts: [],
  lowStockAlerts: [],
  dismissedExpiryAlertIds: [],
  dismissedLowStockAlertIds: [],
  updateStats: (stats) => set({ stats }),
  addExpiryAlert: (alert) =>
    set((state) => ({ expiryAlerts: [...state.expiryAlerts, alert] })),
  addLowStockAlert: (alert) =>
    set((state) => ({ lowStockAlerts: [...state.lowStockAlerts, alert] })),
  resolveExpiryAlert: (id) =>
    set((state) => ({
      dismissedExpiryAlertIds: [...new Set([...state.dismissedExpiryAlertIds, id])],
      expiryAlerts: state.expiryAlerts.map((a) =>
        a.id === id ? { ...a, isResolved: true } : a
      ),
    })),
  resolveLowStockAlert: (id) =>
    set((state) => ({
      dismissedLowStockAlertIds: [...new Set([...state.dismissedLowStockAlertIds, id])],
      lowStockAlerts: state.lowStockAlerts.map((a) =>
        a.id === id ? { ...a, isResolved: true } : a
      ),
    })),
}));

// ─── FEFO Helper ─────────────────────────────────────────────────────────────
/** Returns batches sorted by expiry date ASC (First Expiry First Out). */
function sortFEFO(batches: Batch[]): Batch[] {
  return [...batches].sort(
    (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
  );
}

/** Compute expiry risk % for a batch: 0 = far future, 100 = expires today. */
function calcExpiryRisk(expiryDate: Date, totalShelfDays = 730): number {
  const today = new Date();
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(expiryDate).getTime() - today.getTime()) / 86_400_000)
  );
  return Math.min(100, Math.round(((totalShelfDays - daysLeft) / totalShelfDays) * 100));
}

// Inventory Store
interface InventoryState {
  medicines: Medicine[];
  batches: Batch[];
  addMedicine: (medicine: Medicine) => void;
  updateMedicine: (id: string, medicine: Partial<Medicine>) => void;
  deleteMedicine: (id: string) => void;
  addBatch: (batch: Batch) => void;
  updateBatch: (id: string, batch: Partial<Batch>) => void;
  getMedicineStock: (medicineId: string) => number;
  getBatchesByMedicine: (medicineId: string) => Batch[];
  /** FEFO-sorted batches — nearest expiry first. */
  getFEFOBatchesByMedicine: (medicineId: string) => Batch[];
  /** Suggest the single best batch for checkout (FEFO). */
  getFEFOSuggestedBatch: (medicineId: string) => Batch | undefined;
  searchMedicines: (query: string) => Medicine[];
  /** Medicines nearing expiry within `days`. */
  getExpiringBatches: (days: number) => Batch[];
  /** Items not sold in last `days` days (slow-moving). */
  getSlowMovingItems: (soldMedicineIds: string[], days?: number) => SlowMovingItem[];
  /** Expiry risk report for all active batches. */
  getExpiryRiskReport: () => ExpiryRiskReport[];
  /** Live expiry alerts computed from current batch data. */
  getLiveExpiryAlerts: () => ExpiryAlert[];
  /** Live low-stock alerts computed from current inventory. */
  getLiveLowStockAlerts: () => LowStockAlert[];
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  medicines: [],
  batches: [],
  addMedicine: (medicine) =>
    set((state) => ({ medicines: [...state.medicines, medicine] })),
  updateMedicine: (id, medicine) =>
    set((state) => ({
      medicines: state.medicines.map((m) =>
        m.id === id ? { ...m, ...medicine, updatedAt: new Date() } : m
      ),
    })),
  deleteMedicine: (id) =>
    set((state) => ({
      medicines: state.medicines.map((m) =>
        m.id === id ? { ...m, isActive: false } : m
      ),
    })),
  addBatch: (batch) =>
    set((state) => ({ batches: [...state.batches, batch] })),
  updateBatch: (id, batch) =>
    set((state) => ({
      batches: state.batches.map((b) => (b.id === id ? { ...b, ...batch } : b)),
    })),
  getMedicineStock: (medicineId) => {
    const batches = get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0
    );
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  },
  getBatchesByMedicine: (medicineId) => {
    return get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0
    );
  },
  getFEFOBatchesByMedicine: (medicineId) => {
    const activeBatches = get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0
    );
    return sortFEFO(activeBatches);
  },
  getFEFOSuggestedBatch: (medicineId) => {
    const sorted = sortFEFO(
      get().batches.filter(
        (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0
      )
    );
    return sorted[0];
  },
  searchMedicines: (query) => {
    const lowerQuery = query.toLowerCase();
    return get().medicines.filter(
      (m) =>
        m.isActive &&
        (m.name.toLowerCase().includes(lowerQuery) ||
          m.genericName.toLowerCase().includes(lowerQuery) ||
          m.barcode?.includes(query))
    );
  },
  getExpiringBatches: (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return get().batches.filter(
      (b) => b.isActive && b.quantity > 0 && new Date(b.expiryDate) <= cutoff
    );
  },
  getSlowMovingItems: (soldMedicineIds, days = 90) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const { medicines, batches } = get();
    return medicines
      .filter((m) => m.isActive && !soldMedicineIds.includes(m.id))
      .map((m) => {
        const qty = batches
          .filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0)
          .reduce((s, b) => s + b.quantity, 0);
        const val = batches
          .filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0)
          .reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
        return {
          medicineId: m.id,
          medicineName: m.name,
          daysSinceLastSale: days,
          stockQuantity: qty,
          stockValue: val,
          reorderSuggested: false,
        } as SlowMovingItem;
      })
      .filter((i) => i.stockQuantity > 0);
  },
  getExpiryRiskReport: () => {
    const { batches, medicines } = get();
    const today = new Date();
    const { expiryAlertDays } = useSettingsStore.getState().settings;
    return batches
      .filter((b) => b.isActive && b.quantity > 0)
      .map((b) => {
        const med = medicines.find((m) => m.id === b.medicineId);
        const daysLeft = Math.ceil(
          (new Date(b.expiryDate).getTime() - today.getTime()) / 86_400_000
        );
        const risk = calcExpiryRisk(b.expiryDate);
        const potentialLoss = b.quantity * b.purchasePrice;
        let recommendation: ExpiryRiskReport['recommendation'] = 'promote';
        if (daysLeft <= 0) recommendation = 'write_off';
        else if (daysLeft <= expiryAlertDays.critical) recommendation = 'sell_urgently';
        else if (daysLeft <= expiryAlertDays.warning) recommendation = 'return_to_supplier';
        else if (daysLeft <= expiryAlertDays.notice) recommendation = 'promote';
        return {
          medicineId: b.medicineId,
          medicineName: med?.name ?? 'Unknown',
          batchId: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          daysUntilExpiry: daysLeft,
          riskPercent: risk,
          quantity: b.quantity,
          potentialLoss,
          recommendation,
        } as ExpiryRiskReport;
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  },

  /* ── Live Expiry Alerts ─────────────────────────────────────────────── */
  getLiveExpiryAlerts: () => {
    const { batches, medicines } = get();
    const today = new Date();
    const { expiryAlertDays } = useSettingsStore.getState().settings;
    const noticeDays = expiryAlertDays.notice; // widest window

    return batches
      .filter((b) => b.isActive && b.quantity > 0)
      .map((b) => {
        const med = medicines.find((m) => m.id === b.medicineId);
        const daysLeft = Math.ceil(
          (new Date(b.expiryDate).getTime() - today.getTime()) / 86_400_000
        );
        if (daysLeft > noticeDays) return null; // outside alert window

        let alertLevel: ExpiryAlert['alertLevel'] = 'notice';
        if (daysLeft <= expiryAlertDays.critical) alertLevel = 'critical';
        else if (daysLeft <= expiryAlertDays.warning) alertLevel = 'warning';

        return {
          id: `exp-${b.id}`,
          batchId: b.id,
          medicineId: b.medicineId,
          medicineName: med?.name ?? 'Unknown',
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          daysUntilExpiry: daysLeft,
          quantity: b.quantity,
          alertLevel,
          isResolved: false,
          createdAt: new Date().toISOString(),
        } as ExpiryAlert;
      })
      .filter(Boolean) as ExpiryAlert[];
  },

  /* ── Live Low-Stock Alerts ──────────────────────────────────────────── */
  getLiveLowStockAlerts: () => {
    const { medicines, batches } = get();

    return medicines
      .filter((m) => m.isActive && m.reorderLevel > 0)
      .map((m) => {
        const currentStock = batches
          .filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0)
          .reduce((s, b) => s + b.quantity, 0);

        if (currentStock > m.reorderLevel) return null; // stock is fine

        return {
          id: `low-${m.id}`,
          medicineId: m.id,
          medicineName: m.name,
          currentStock,
          reorderLevel: m.reorderLevel,
          reorderQuantity: m.reorderQuantity ?? 0,
          isResolved: false,
          createdAt: new Date().toISOString(),
        } as LowStockAlert;
      })
      .filter(Boolean) as LowStockAlert[];
  },
}));

// POS Store
interface POSState {
  cart: CartItem[];
  customer: Customer | null;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  total: number;
  grossProfit: number;
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  setCustomer: (customer: Customer | null) => void;
  clearCart: () => void;
  calculateTotals: () => void;
}

export interface CartItem {
  medicineId: string;
  medicineName: string;
  batchId: string;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  unitPrice: number;
  purchasePrice: number;
  mrp: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
  /** Set to true if cashier picked a non-FEFO batch */
  fefoOverride?: boolean;
  /** Profit for this line = (unitPrice - purchasePrice) * quantity */
  lineProfit: number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  customer: null,
  discountAmount: 0,
  taxAmount: 0,
  subtotal: 0,
  total: 0,
  grossProfit: 0,
  addToCart: (item) => {
    set((state) => {
      const existingIndex = state.cart.findIndex(
        (i) => i.medicineId === item.medicineId && i.batchId === item.batchId
      );
      if (existingIndex >= 0) {
        const newCart = [...state.cart];
        newCart[existingIndex].quantity += item.quantity;
        newCart[existingIndex].total =
          newCart[existingIndex].quantity * newCart[existingIndex].unitPrice;
        newCart[existingIndex].lineProfit =
          (newCart[existingIndex].unitPrice - newCart[existingIndex].purchasePrice) *
          newCart[existingIndex].quantity;
        return { cart: newCart };
      }
      return { cart: [...state.cart, item] };
    });
    get().calculateTotals();
  },
  removeFromCart: (index) => {
    set((state) => ({
      cart: state.cart.filter((_, i) => i !== index),
    }));
    get().calculateTotals();
  },
  updateQuantity: (index, quantity) => {
    set((state) => {
      const newCart = [...state.cart];
      newCart[index].quantity = quantity;
      newCart[index].total = quantity * newCart[index].unitPrice;
      newCart[index].lineProfit =
        (newCart[index].unitPrice - newCart[index].purchasePrice) * quantity;
      return { cart: newCart };
    });
    get().calculateTotals();
  },
  setCustomer: (customer) => set({ customer }),
  clearCart: () =>
    set({
      cart: [],
      customer: null,
      discountAmount: 0,
      taxAmount: 0,
      subtotal: 0,
      total: 0,
      grossProfit: 0,
    }),
  calculateTotals: () => {
    const { cart } = get();
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = cart.reduce(
      (sum, item) => sum + (item.total * item.discountPercent) / 100,
      0
    );
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = cart.reduce(
      (sum, item) => sum + (item.total * item.taxPercent) / 100,
      0
    );
    const total = taxableAmount + taxAmount;
    const grossProfit = cart.reduce((sum, item) => sum + item.lineProfit, 0);
    set({ subtotal, discountAmount, taxAmount, total, grossProfit });
  },
}));

// Sales Store
interface SalesState {
  sales: Sale[];
  currentSale: Sale | null;
  addSale: (sale: Sale) => void;
  updateSale: (id: string, sale: Partial<Sale>) => void;
  getSaleById: (id: string) => Sale | undefined;
  getSalesByDate: (date: Date) => Sale[];
  getTodaySales: () => Sale[];
  /** Total gross profit across all completed sales. */
  getTotalProfit: () => number;
  /** Today's gross profit. */
  getTodayProfit: () => number;
  /** Medicine IDs sold in the last `days` days (for slow-moving detection). */
  getRecentlySoldMedicineIds: (days?: number) => string[];
  /** KPI: compute pharmacy KPIs from sales data. */
  computeKPIs: (batches: Batch[]) => PharmacyKPIs;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],
  currentSale: null,
  addSale: (sale) =>
    set((state) => ({ sales: [...state.sales, sale] })),
  updateSale: (id, sale) =>
    set((state) => ({
      sales: state.sales.map((s) =>
        s.id === id ? { ...s, ...sale, updatedAt: new Date() } : s
      ),
    })),
  getSaleById: (id) => get().sales.find((s) => s.id === id),
  getSalesByDate: (date) =>
    get().sales.filter(
      (s) =>
        s.saleDate.toDateString() === date.toDateString() &&
        s.status === 'completed'
    ),
  getTodaySales: () =>
    get().sales.filter(
      (s) =>
        s.saleDate.toDateString() === new Date().toDateString() &&
        s.status === 'completed'
    ),
  getTotalProfit: () =>
    get()
      .sales.filter((s) => s.status === 'completed')
      .flatMap((s) => s.items)
      .reduce((sum, item) => sum + (item.profit ?? 0), 0),
  getTodayProfit: () => {
    const today = new Date().toDateString();
    return get()
      .sales.filter((s) => s.status === 'completed' && s.saleDate.toDateString() === today)
      .flatMap((s) => s.items)
      .reduce((sum, item) => sum + (item.profit ?? 0), 0);
  },
  getRecentlySoldMedicineIds: (days = 90) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return [
      ...new Set(
        get()
          .sales.filter((s) => s.status === 'completed' && new Date(s.saleDate) >= cutoff)
          .flatMap((s) => s.items.map((i) => i.medicineId))
      ),
    ];
  },
  computeKPIs: (batches: Batch[]) => {
    const sales = get().sales.filter((s) => s.status === 'completed');
    const prevCutoff = new Date();
    prevCutoff.setDate(prevCutoff.getDate() - 60);
    const thisPeriodSales = sales.filter((s) => new Date(s.saleDate) >= prevCutoff);
    const totalRevenue = thisPeriodSales.reduce((s, sale) => s + sale.totalAmount, 0);
    const totalProfit = thisPeriodSales
      .flatMap((s) => s.items)
      .reduce((s, i) => s + (i.profit ?? 0), 0);
    const avgTxValue = thisPeriodSales.length > 0 ? totalRevenue / thisPeriodSales.length : 0;
    const totalCost = totalRevenue - totalProfit;
    const grossMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const totalStockValue = batches.reduce((s, b) => s + b.quantity * b.purchasePrice, 0);
    const turnover = totalStockValue > 0 ? totalCost / totalStockValue : 0;
    const cashSales = thisPeriodSales
      .flatMap((s) => s.paymentMethods)
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amount, 0);
    const creditSales = totalRevenue - cashSales;
    return {
      expiryLossReductionPercent: 0,
      stockAccuracyPercent: 100,
      salesGrowthPercent: 0,
      inventoryTurnoverRate: parseFloat(turnover.toFixed(2)),
      deadStockRatio: 0,
      grossProfitMarginPercent: parseFloat(grossMargin.toFixed(2)),
      avgTransactionValue: parseFloat(avgTxValue.toFixed(2)),
      cashCreditRatio: creditSales > 0 ? parseFloat((cashSales / creditSales).toFixed(2)) : 0,
    } as PharmacyKPIs;
  },
}));

// Supplier Store
interface SupplierState {
  suppliers: Supplier[];
  purchases: Purchase[];
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  addPurchase: (purchase: Purchase) => void;
  updatePurchase: (id: string, purchase: Partial<Purchase>) => void;
  deletePurchase: (id: string) => void;
  getSupplierBalance: (supplierId: string) => number;
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  purchases: [],
  addSupplier: (supplier) =>
    set((state) => ({ suppliers: [...state.suppliers, supplier] })),
  updateSupplier: (id, supplier) =>
    set((state) => ({
      suppliers: state.suppliers.map((s) =>
        s.id === id ? { ...s, ...supplier } : s
      ),
    })),
  deleteSupplier: (id) =>
    set((state) => ({
      suppliers: state.suppliers.filter((s) => s.id !== id),
    })),
  addPurchase: (purchase) =>
    set((state) => ({ purchases: [...state.purchases, purchase] })),
  updatePurchase: (id, purchase) =>
    set((state) => ({
      purchases: state.purchases.map((p) =>
        p.id === id ? { ...p, ...purchase, updatedAt: new Date() } : p
      ),
    })),
  deletePurchase: (id) =>
    set((state) => ({
      purchases: state.purchases.filter((p) => p.id !== id),
    })),
  getSupplierBalance: (supplierId) => {
    const purchases = get().purchases.filter(
      (p) => p.supplierId === supplierId && p.status !== 'cancelled'
    );
    return purchases.reduce((sum, p) => sum + p.balanceAmount, 0);
  },
}));

// Customer Store
interface CustomerState {
  customers: Customer[];
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, customer: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  searchCustomers: (query: string) => Customer[];
  getCustomerByPhone: (phone: string) => Customer | undefined;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  addCustomer: (customer) =>
    set((state) => ({ customers: [...state.customers, customer] })),
  updateCustomer: (id, customer) =>
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id ? { ...c, ...customer } : c
      ),
    })),
  deleteCustomer: (id) =>
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id),
    })),
  searchCustomers: (query) => {
    const lowerQuery = query.toLowerCase();
    return get().customers.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQuery) ||
        c.phone.includes(query) ||
        c.cnic?.includes(query)
    );
  },
  getCustomerByPhone: (phone) =>
    get().customers.find((c) => c.phone === phone),
}));

// Audit Log Store
interface AuditLogState {
  logs: AuditLog[];
  addLog: (log: AuditLog) => void;
  getLogsByUser: (userId: string) => AuditLog[];
  getLogsByModule: (module: string) => AuditLog[];
}

export const useAuditLogStore = create<AuditLogState>((set, get) => ({
  logs: [],
  addLog: (log) => set((state) => ({ logs: [log, ...state.logs] })),
  getLogsByUser: (userId) =>
    get().logs.filter((l) => l.userId === userId),
  getLogsByModule: (module) =>
    get().logs.filter((l) => l.module === module),
}));

// ─── Ledger Store ───────────────────────────────────────────────────────────
interface LedgerState {
  entries: LedgerEntry[];
  addEntry: (entry: LedgerEntry) => void;
  getTotalIncome: () => number;
  getTotalExpenses: () => number;
  getNetBalance: () => number;
}

export const useLedgerStore = create<LedgerState>((set, get) => ({
  entries: [],
  addEntry: (entry) => set((state) => ({ entries: [entry, ...state.entries] })),
  getTotalIncome: () =>
    get()
      .entries.filter((e) => e.type === 'income')
      .reduce((s, e) => s + e.amount, 0),
  getTotalExpenses: () =>
    get()
      .entries.filter((e) => e.type === 'expense')
      .reduce((s, e) => s + e.amount, 0),
  getNetBalance: () => {
    const { entries } = get();
    return entries.reduce((s, e) => {
      if (e.type === 'income') return s + e.amount;
      if (e.type === 'expense' || e.type === 'payable') return s - e.amount;
      return s;
    }, 0);
  },
}));

// ─── Expense Store ──────────────────────────────────────────────────────────
interface ExpenseState {
  expenses: Expense[];
  addExpense: (expense: Expense) => void;
  updateExpense: (id: string, expense: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;
  getTotalByCategory: (category: Expense['category']) => number;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  addExpense: (expense) =>
    set((state) => ({ expenses: [expense, ...state.expenses] })),
  updateExpense: (id, expense) =>
    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...expense } : e)),
    })),
  deleteExpense: (id) =>
    set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) })),
  getTotalByCategory: (category) =>
    get()
      .expenses.filter((e) => e.category === category)
      .reduce((s, e) => s + e.amount, 0),
}));

// ─── Prescription Store ─────────────────────────────────────────────────────
interface PrescriptionState {
  prescriptions: Prescription[];
  addPrescription: (prescription: Prescription) => void;
  updatePrescription: (id: string, updates: Partial<Prescription>) => void;
  deletePrescription: (id: string) => void;
  getByCustomer: (customerId: string) => Prescription[];
  linkSale: (prescriptionId: string, saleId: string) => void;
}

export const usePrescriptionStore = create<PrescriptionState>((set, get) => ({
  prescriptions: [],
  addPrescription: (prescription) =>
    set((state) => ({ prescriptions: [prescription, ...state.prescriptions] })),
  updatePrescription: (id, updates) =>
    set((state) => ({
      prescriptions: state.prescriptions.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
      ),
    })),
  deletePrescription: (id) =>
    set((state) => ({
      prescriptions: state.prescriptions.filter((p) => p.id !== id),
    })),
  getByCustomer: (customerId) =>
    get().prescriptions.filter((p) => p.customerId === customerId),
  linkSale: (prescriptionId, saleId) =>
    set((state) => ({
      prescriptions: state.prescriptions.map((p) =>
        p.id === prescriptionId
          ? { ...p, saleIds: [...p.saleIds, saleId], updatedAt: new Date() }
          : p
      ),
    })),
}));

// ─── Offline Sync Queue Store ───────────────────────────────────────────────
interface SyncQueueState {
  queue: SyncQueueItem[];
  enqueue: (item: SyncQueueItem) => void;
  markSynced: (id: string) => void;
  markFailed: (id: string) => void;
  retryFailed: () => void;
  getPending: () => SyncQueueItem[];
}

export const useSyncQueueStore = create<SyncQueueState>((set, get) => ({
  queue: [],
  enqueue: (item) => set((state) => ({ queue: [...state.queue, item] })),
  markSynced: (id) =>
    set((state) => ({
      queue: state.queue.map((i) => (i.id === id ? { ...i, status: 'synced' } : i)),
    })),
  markFailed: (id) =>
    set((state) => ({
      queue: state.queue.map((i) =>
        i.id === id ? { ...i, status: 'failed', retries: i.retries + 1 } : i
      ),
    })),
  retryFailed: () =>
    set((state) => ({
      queue: state.queue.map((i) =>
        i.status === 'failed' ? { ...i, status: 'pending' } : i
      ),
    })),
  getPending: () => get().queue.filter((i) => i.status === 'pending'),
}));

// ─── Web Store (Customer-Facing Cart & Orders) ─────────────────────────────
interface WebStoreState {
  cart: WebCartItem[];
  orders: WebOrder[];
  addToCart: (item: WebCartItem) => void;
  removeFromCart: (medicineId: string) => void;
  updateCartQuantity: (medicineId: string, quantity: number) => void;
  clearCart: () => void;
  placeOrder: (order: WebOrder) => void;
  getCartTotal: () => { subtotal: number; deliveryFee: number; total: number };
  getCartItemCount: () => number;
}

export const useWebStore = create<WebStoreState>()(
  persist(
    (set, get) => ({
      cart: [],
      orders: [],
      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((c) => c.medicineId === item.medicineId);
          if (existing) {
            return {
              cart: state.cart.map((c) =>
                c.medicineId === item.medicineId
                  ? { ...c, quantity: Math.min(c.quantity + item.quantity, c.maxQuantity) }
                  : c
              ),
            };
          }
          return { cart: [...state.cart, item] };
        }),
      removeFromCart: (medicineId) =>
        set((state) => ({ cart: state.cart.filter((c) => c.medicineId !== medicineId) })),
      updateCartQuantity: (medicineId, quantity) =>
        set((state) => ({
          cart: state.cart.map((c) =>
            c.medicineId === medicineId ? { ...c, quantity: Math.min(quantity, c.maxQuantity) } : c
          ),
        })),
      clearCart: () => set({ cart: [] }),
      placeOrder: (order) =>
        set((state) => ({ orders: [...state.orders, order], cart: [] })),
      getCartTotal: () => {
        const { cart } = get();
        const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
        const deliveryFee = subtotal > 5000 ? 0 : 200;
        return { subtotal, deliveryFee, total: subtotal + deliveryFee };
      },
      getCartItemCount: () => get().cart.reduce((s, c) => s + c.quantity, 0),
    }),
    { name: 'web-store-storage' }
  )
);

// ─── Web Customer Auth Store ───────────────────────────────────────────────
interface WebAuthState {
  customer: WebCustomer | null;
  isLoggedIn: boolean;
  customers: WebCustomer[]; // registered customers DB
  login: (email: string, password: string) => boolean;
  signup: (name: string, email: string, password: string, phone?: string) => boolean;
  googleLogin: (name: string, email: string) => void;
  logout: () => void;
  updateProfile: (data: Partial<WebCustomer>) => void;
}

export const useWebAuthStore = create<WebAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      isLoggedIn: false,
      customers: [],
      login: (email: string, _password: string) => {
        const found = get().customers.find((c) => c.email === email);
        if (found) {
          set({ customer: found, isLoggedIn: true });
          return true;
        }
        return false;
      },
      signup: (name: string, email: string, _password: string, phone?: string) => {
        const { customers } = get();
        if (customers.find((c) => c.email === email)) return false;
        const newCustomer: WebCustomer = {
          id: `cust-${Date.now().toString(36)}`,
          name,
          email,
          phone,
          authProvider: 'email',
          createdAt: new Date().toISOString(),
        };
        set({ customers: [...customers, newCustomer], customer: newCustomer, isLoggedIn: true });
        return true;
      },
      googleLogin: (name: string, email: string) => {
        const { customers } = get();
        let existing = customers.find((c) => c.email === email);
        if (!existing) {
          existing = {
            id: `cust-${Date.now().toString(36)}`,
            name,
            email,
            authProvider: 'google',
            createdAt: new Date().toISOString(),
          };
          set({ customers: [...customers, existing] });
        }
        set({ customer: existing, isLoggedIn: true });
      },
      logout: () => set({ customer: null, isLoggedIn: false }),
      updateProfile: (data) =>
        set((state) => {
          if (!state.customer) return state;
          const updated = { ...state.customer, ...data };
          return {
            customer: updated,
            customers: state.customers.map((c) => (c.id === updated.id ? updated : c)),
          };
        }),
    }),
    { name: 'web-auth-storage' }
  )
);
