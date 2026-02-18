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
        if (currentUser.role === 'owner') return true;
        
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
  setLanguage: (lang: 'en' | 'ur') => void;
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
  updateStats: (stats: DashboardStats) => void;
  addExpiryAlert: (alert: ExpiryAlert) => void;
  addLowStockAlert: (alert: LowStockAlert) => void;
  resolveExpiryAlert: (id: string) => void;
  resolveLowStockAlert: (id: string) => void;
}

const defaultStats: DashboardStats = {
  todaySales: 0,
  todayTransactions: 0,
  monthSales: 0,
  yearSales: 0,
  lowStockCount: 0,
  expiryAlertsCount: 0,
  pendingPurchases: 0,
  supplierPayables: 0,
};

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: defaultStats,
  recentSales: [],
  expiryAlerts: [],
  lowStockAlerts: [],
  updateStats: (stats) => set({ stats }),
  addExpiryAlert: (alert) =>
    set((state) => ({ expiryAlerts: [...state.expiryAlerts, alert] })),
  addLowStockAlert: (alert) =>
    set((state) => ({ lowStockAlerts: [...state.lowStockAlerts, alert] })),
  resolveExpiryAlert: (id) =>
    set((state) => ({
      expiryAlerts: state.expiryAlerts.map((a) =>
        a.id === id ? { ...a, isResolved: true } : a
      ),
    })),
  resolveLowStockAlert: (id) =>
    set((state) => ({
      lowStockAlerts: state.lowStockAlerts.map((a) =>
        a.id === id ? { ...a, isResolved: true } : a
      ),
    })),
}));

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
  searchMedicines: (query: string) => Medicine[];
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
}));

// POS Store
interface POSState {
  cart: CartItem[];
  customer: Customer | null;
  discountAmount: number;
  taxAmount: number;
  subtotal: number;
  total: number;
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
  mrp: number;
  discountPercent: number;
  taxPercent: number;
  total: number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  customer: null,
  discountAmount: 0,
  taxAmount: 0,
  subtotal: 0,
  total: 0,
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
    }),
  calculateTotals: () => {
    const { cart } = get();
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = cart.reduce(
      (sum, item) =>
        sum + (item.total * item.discountPercent) / 100,
      0
    );
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = cart.reduce(
      (sum, item) =>
        sum + (item.total * item.taxPercent) / 100,
      0
    );
    const total = taxableAmount + taxAmount;
    set({ subtotal, discountAmount, taxAmount, total });
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
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  getLogsByUser: (userId) =>
    get().logs.filter((l) => l.userId === userId),
  getLogsByModule: (module) =>
    get().logs.filter((l) => l.module === module),
}));
