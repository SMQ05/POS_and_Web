import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type {
  User,
  Branch,
  Medicine,
  Batch,
  Supplier,
  Purchase,
  Sale,
  SaleReturn,
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
  PromiseOrder,
  Prescription,
  PrescriptionItem,
  SyncQueueItem,
  ExpiryRiskReport,
  SlowMovingItem,
  PharmacyKPIs,
  WebOrder,
  WebCartItem,
  WebCustomer,
  Tenant,
  MedicineSupplier,
  PurchaseInvoice,
  PurchaseReturn,
  NotificationRow,
} from '@/types';
import {
  apiRequest,
  createPublicWebOrder,
  createResource,
  deleteResource,
  loginWithPassword,
  TENANT_SLUG,
  updateResource,
} from '@/lib/backend';

function persistFailure(entity: string, operation: SyncQueueItem['operation'], payload: Record<string, unknown>) {
  useSyncQueueStore.getState().enqueue({
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entity,
    operation,
    payload,
    retries: 0,
    status: 'failed',
    createdAt: new Date(),
  });
}

function persistCreate<T extends { id: string }>(resource: string, item: T) {
  createResource<T>(resource, item).catch(() =>
    persistFailure(resource, 'create', item as Record<string, unknown>)
  );
}

function persistUpdate<T extends object>(resource: string, id: string, patch: T) {
  updateResource<T>(resource, id, patch).catch(() =>
    persistFailure(resource, 'update', { id, ...patch })
  );
}

function persistDelete(resource: string, id: string) {
  deleteResource(resource, id).catch(() => persistFailure(resource, 'delete', { id }));
}

// Auth Store
interface AuthState {
  currentUser: User | null;
  tenant: (Tenant & { slug?: string }) | null;
  branches: Branch[];
  /** The branch the owner/staff is currently working in. Drives POS sales,
   *  day-close, shifts and per-branch views. Persisted across reloads. */
  activeBranchId: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  setSession: (token: string, user: User, tenant: Tenant & { slug?: string }) => void;
  setBranches: (branches: Branch[]) => void;
  setActiveBranch: (branchId: string) => void;
  logout: () => void;
  hasPermission: (module: string, action: string) => boolean;
  /** M6 — Per-branch RBAC. Returns 'none' | 'read' | 'full' for the given
   *  branch. Mirrors the server's getBranchAccess so UI hides what the API
   *  would reject. */
  branchAccessFor: (branchId: string) => 'none' | 'read' | 'full';
  /** Convenience: shorthand for branchAccessFor(x) === 'full'. */
  canWriteBranch: (branchId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      tenant: null,
      branches: [],
      activeBranchId: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        try {
          const session = await loginWithPassword(email, password);
          set({
            currentUser: session.user,
            tenant: session.tenant,
            token: session.token,
            isAuthenticated: true,
          });
          return true;
        } catch {
          set({ currentUser: null, tenant: null, branches: [], token: null, isAuthenticated: false });
          return false;
        }
      },
      setSession: (token, user, tenant) => {
        set({ token, currentUser: user, tenant, isAuthenticated: true });
      },
      setBranches: (branches) => set((state) => {
        // Default the active branch to the user's home branch (or the first one)
        // once branches arrive, unless one was already chosen and still exists.
        const stillValid = state.activeBranchId && branches.some((b) => b.id === state.activeBranchId);
        const fallback = branches.find((b) => b.id === state.currentUser?.branchId)?.id ?? branches[0]?.id ?? null;
        return { branches, activeBranchId: stillValid ? state.activeBranchId : fallback };
      }),
      setActiveBranch: (branchId) => {
        set({ activeBranchId: branchId });
        // Branch-filtered selectors (stock, sales KPIs, purchases…) read
        // activeBranchId via getState(), which is NOT reactive — so a switch
        // wouldn't re-render Inventory/Sales/Dashboard/etc. on its own. Re-emit
        // each branch-scoped store's array (same data, new reference) to force
        // every subscriber to recompute for the newly-selected branch.
        useInventoryStore.setState({ batches: [...useInventoryStore.getState().batches] });
        useSalesStore.setState({ sales: [...useSalesStore.getState().sales] });
        useSupplierStore.setState({ purchases: [...useSupplierStore.getState().purchases] });
      },
      logout: () => {
        set({ currentUser: null, tenant: null, branches: [], activeBranchId: null, token: null, isAuthenticated: false });
      },
      hasPermission: (module: string, action: string) => {
        const { currentUser } = get();
        if (!currentUser) return false;
        if (currentUser.role === 'owner' || currentUser.role === 'superadmin') return true;

        return currentUser.permissions.some(
          p => (p.module === module || p.module === '*') && p.actions.includes(action as any)
        );
      },
      branchAccessFor: (branchId: string) => {
        const { currentUser } = get();
        if (!currentUser) return 'none';
        if (currentUser.role === 'superadmin') return 'full';
        const list = currentUser.branchAccess;
        if (Array.isArray(list) && list.length > 0) {
          const entry = list.find((e) => e.branchId === branchId);
          if (entry) return entry.access;
          return currentUser.role === 'owner' ? 'full' : 'none';
        }
        if (currentUser.role === 'owner') return 'full';
        if (currentUser.branchId && currentUser.branchId === branchId) return 'full';
        if (!currentUser.branchId) return 'full';
        return 'none';
      },
      canWriteBranch: (branchId: string) => get().branchAccessFor(branchId) === 'full',
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
  companyName: 'Kynex Pharmacloud',
  companyAddress: 'Main Market, Lahore',
  companyPhone: '+92-300-1234567',
  companyEmail: 'info@kynexsolutions.com',
  companyNtn: '1234567-8',
  companyGst: '12-34-5678-901-23',
  defaultTaxRate: 18,
  currency: 'PKR',
  language: 'en',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  enableLoyalty: true,
  loyaltyPointsPerRupee: 1,
  loyaltyRupeesPerPoint: 100,
  loyaltyPointValue: 2,
  loyaltyMinRedeemPoints: 50,
  loyaltyMaxRedeemPercent: 50,
  enableSms: false,
  fbrIntegration: false,
  theme: 'light',
  fefoMode: 'suggest',
  expiryAlertDays: { critical: 30, warning: 60, notice: 90 },
  defaultMarginPercent: 15,
  offlineModeEnabled: true,
  managerCanSeeProfit: false,
  receiptFooterText: 'Thank you for your purchase!',
  autoPrintReceipt: false,
  showProfitOnPOS: true,
  // M2 — POS price visibility. Conservative defaults: cost hidden from rank-
  // and-file, TP + sale price visible to all roles that can run the POS.
  showPurchasePriceOnPOS: false,
  showPurchasePriceRoles: ['owner', 'manager'],
  showTradePriceOnPOS: true,
  showTradePriceRoles: ['owner', 'manager', 'cashier', 'salesman', 'pharmacist'],
  showSalePriceOnPOS: true,
  showSalePriceRoles: ['owner', 'manager', 'cashier', 'salesman', 'pharmacist'],
  paymentMethodDefaults: {},
  // M3 — supplier visit-day schedule. Off by default so nothing changes for
  // existing tenants until the owner opts in.
  supplierVisitDaysEnabled: false,
  // M7 — auto-PO. Disabled by default — owner must opt in. 1.0 = trigger at
  // reorderLevel; higher values trigger earlier.
  autoPoEnabled: false,
  autoPoTriggerPercent: 1.0,
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
  webStoreEnabled: false,
  taxRules: [
    // FBR DI API v1.12 — Pakistan standard sales tax is 18% (FY23-24 onwards).
    { id: 'tax-standard-sales', name: 'Standard Sales Tax', type: 'sales_tax', ratePercent: 18, appliesTo: 'goods', fbrRateLabel: '18%', isDefault: true, isActive: true },
    // Sixth Schedule (exempt goods) = 0% sales tax. NOT FED.
    { id: 'tax-exempt', name: 'Exempt / Sixth Schedule', type: 'sales_tax', ratePercent: 0, appliesTo: 'goods', fbrRateLabel: 'Exempt', isDefault: false, isActive: true },
    // Provincial services tax — disabled by default. Pharmacies selling only goods should leave this OFF.
    // Re-enable manually if you provide services (consultations, etc.). Rate varies by province: Punjab 16%, Sindh 15%, KPK 15%, Balochistan 15%.
    { id: 'tax-services', name: 'Services Tax', type: 'service_tax', ratePercent: 16, appliesTo: 'services', province: 'Punjab', isDefault: false, isActive: false },
  ],
  // Service charges left empty — the legacy "FBR POS Service Charge" was a feature of
  // the old POS Real-Time Invoice (RTI) API and is NOT part of DI API v1.12.
  serviceCharges: [],
  discountRules: [
    { id: 'disc-line-percent', name: 'Line Discount %', type: 'line_percent', value: 0, requiresApproval: false, isActive: true },
    { id: 'disc-invoice-percent', name: 'Invoice Discount %', type: 'invoice_percent', value: 0, requiresApproval: true, isActive: true },
  ],
  fbrProfile: {
    enabled: false,
    mode: 'sandbox',
    integrationType: 'digital_invoicing',
    apiBaseUrl: 'https://gw.fbr.gov.pk/di_data/v1/di',
    validateEndpoint: '/validateinvoicedata_sb',
    postEndpoint: '/postinvoicedata_sb',
    sellerNTNCNIC: '',
    sellerBusinessName: 'Demo Pharmacy',
    sellerProvince: 'Punjab',
    sellerAddress: 'Lahore',
    includeServiceCharge: true,
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => {
          const settings = { ...state.settings, ...newSettings };
          apiRequest('/settings', {
            method: 'PATCH',
            body: JSON.stringify(newSettings),
          }).catch(() => persistFailure('settings', 'update', newSettings as Record<string, unknown>));
          return { settings };
        }),
      toggleTheme: () =>
        set((state) => {
          const settings = {
            ...state.settings,
            theme: state.settings.theme === 'light' ? 'dark' : 'light',
          } as AppSettings;
          apiRequest('/settings', {
            method: 'PATCH',
            body: JSON.stringify({ theme: settings.theme }),
          }).catch(() => persistFailure('settings', 'update', { theme: settings.theme }));
          return { settings };
        }),
      setLanguage: (lang) =>
        set((state) => {
          const settings = { ...state.settings, language: lang };
          apiRequest('/settings', {
            method: 'PATCH',
            body: JSON.stringify({ language: lang }),
          }).catch(() => persistFailure('settings', 'update', { language: lang }));
          return { settings };
        }),
    }),
    {
      name: 'settings-storage',
      // Bumped to v2 (May 2026): FBR v1.12 corrections — standard sales tax 18%,
      // exempt 0%, services tax inactive by default, legacy FBR POS service charge removed.
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted;
        const state = persisted as { settings?: AppSettings };
        if (!state.settings) return persisted;
        if (version < 2) {
          // Fix tax rules
          const rules = Array.isArray(state.settings.taxRules) ? [...state.settings.taxRules] : [];
          for (const rule of rules) {
            const name = String(rule.name ?? '').toLowerCase();
            if (name.includes('standard') && name.includes('sales tax')) {
              rule.type = 'sales_tax';
              rule.ratePercent = 18;
              rule.fbrRateLabel = '18%';
              rule.isActive = true;
            } else if (name.includes('exempt') || name.includes('sixth schedule')) {
              rule.type = 'sales_tax';
              rule.ratePercent = 0;
              rule.fbrRateLabel = 'Exempt';
              rule.isActive = true;
            } else if (name.includes('service') && name.includes('tax')) {
              // Deactivate by default — most pharmacies don't sell services.
              rule.isActive = false;
              rule.isDefault = false;
            }
          }
          state.settings.taxRules = rules;
          // Remove the legacy FBR POS Service Charge — not in DI v1.12.
          if (Array.isArray(state.settings.serviceCharges)) {
            state.settings.serviceCharges = state.settings.serviceCharges.filter((c) => {
              if (c?.isFbrPosFee === true) return false;
              const n = String(c?.name ?? '').toLowerCase();
              return !(n.includes('fbr') && n.includes('pos') && n.includes('service'));
            });
          }
        }
        return state;
      },
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

// Stock is per-branch: a batch counts toward the branch the user is currently
// working in. When no active branch is set (e.g. mid-load) everything is
// included so nothing flickers to zero.
function inActiveBranch(b: Batch): boolean {
  const active = useAuthStore.getState().activeBranchId;
  if (!active) return true;
  return b.branchId === active;
}

// Same branch gate for any record that carries a branchId (sales, purchases…).
// Keeps each branch's transactions/financials isolated to the selected branch.
function inActiveBranchId(branchId?: string | null): boolean {
  const active = useAuthStore.getState().activeBranchId;
  if (!active) return true;
  return branchId === active;
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

// ─── Medicine search index ───────────────────────────────────────────────────
// Pre-lowercases name/generic/brand once per medicines-array reference so we
// don't redo that work on every keystroke. Also keeps a name-sorted copy so
// prefix queries can binary-search and walk forward in O(log N + matches).
type MedSearchEntry = {
  m: Medicine;
  name: string;     // lowercased
  gen: string;      // lowercased
  brand: string;    // lowercased
  barcode: string;  // raw (barcode matches are case-insensitive on digits)
};
let searchIndexRef: Medicine[] | null = null;
let searchIndexAll: MedSearchEntry[] = [];      // active medicines, original order
let searchIndexByName: MedSearchEntry[] = [];   // active medicines, sorted by name asc

function rebuildSearchIndex(medicines: Medicine[]): void {
  const all: MedSearchEntry[] = [];
  for (const m of medicines) {
    if (!m.isActive) continue;
    all.push({
      m,
      name: m.name.toLowerCase(),
      gen: (m.genericName || '').toLowerCase(),
      brand: (m.brandName || '').toLowerCase(),
      barcode: m.barcode || '',
    });
  }
  searchIndexAll = all;
  searchIndexByName = [...all].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  searchIndexRef = medicines;
}

function ensureSearchIndex(medicines: Medicine[]): void {
  if (medicines !== searchIndexRef) rebuildSearchIndex(medicines);
}

/** Binary-search the first entry whose lowercase name is ≥ q. */
function lowerBoundByName(q: string): number {
  let lo = 0;
  let hi = searchIndexByName.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (searchIndexByName[mid].name < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  /** Mirror the server's sale stock movement in local batch quantities WITHOUT
   *  persisting (the server already draws stock down inside the sale
   *  transaction). 'consume' = a completed sale, 'restore' = rollback/return. */
  applySaleStock: (items: { batchId?: string; quantity: number }[], dir: 'consume' | 'restore') => void;
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
  addMedicine: (medicine) => {
    set((state) => ({ medicines: [...state.medicines, medicine] }));
    persistCreate('medicines', medicine);
  },
  updateMedicine: (id, medicine) => {
    set((state) => ({
      medicines: state.medicines.map((m) =>
        m.id === id ? { ...m, ...medicine, updatedAt: new Date() } : m
      ),
    }));
    persistUpdate('medicines', id, medicine);
  },
  deleteMedicine: (id) => {
    set((state) => ({
      medicines: state.medicines.map((m) =>
        m.id === id ? { ...m, isActive: false } : m
      ),
    }));
    persistDelete('medicines', id);
  },
  addBatch: (batch) => {
    // New stock lands in the branch the user is currently working in unless the
    // caller already set one.
    const withBranch = batch.branchId
      ? batch
      : { ...batch, branchId: useAuthStore.getState().activeBranchId ?? undefined };
    set((state) => ({ batches: [...state.batches, withBranch] }));
    persistCreate('batches', withBranch);
  },
  updateBatch: (id, batch) => {
    set((state) => ({
      batches: state.batches.map((b) => (b.id === id ? { ...b, ...batch } : b)),
    }));
    persistUpdate('batches', id, batch);
  },
  applySaleStock: (items, dir) => {
    const sign = dir === 'consume' ? -1 : 1;
    // Sum demand per batch so multiple lines on the same batch net correctly.
    const deltaByBatch = new Map<string, number>();
    for (const it of items) {
      if (!it.batchId) continue;
      deltaByBatch.set(it.batchId, (deltaByBatch.get(it.batchId) ?? 0) + it.quantity);
    }
    if (deltaByBatch.size === 0) return;
    set((state) => ({
      batches: state.batches.map((b) => {
        const d = deltaByBatch.get(b.id);
        if (!d) return b;
        return { ...b, quantity: Math.max(0, b.quantity + sign * d) };
      }),
    }));
  },
  getMedicineStock: (medicineId) => {
    const batches = get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0 && inActiveBranch(b)
    );
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  },
  getBatchesByMedicine: (medicineId) => {
    return get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0 && inActiveBranch(b)
    );
  },
  getFEFOBatchesByMedicine: (medicineId) => {
    const activeBatches = get().batches.filter(
      (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0 && inActiveBranch(b)
    );
    return sortFEFO(activeBatches);
  },
  getFEFOSuggestedBatch: (medicineId) => {
    const sorted = sortFEFO(
      get().batches.filter(
        (b) => b.medicineId === medicineId && b.isActive && b.quantity > 0 && inActiveBranch(b)
      )
    );
    return sorted[0];
  },
  searchMedicines: (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    ensureSearchIndex(get().medicines);

    // Cap results so a single-char query in a multi-thousand catalog doesn't
    // produce a 5,000-item dropdown. The POS slices to 50 anyway; pad a bit
    // here for downstream callers.
    const LIMIT = 200;
    const out: Medicine[] = [];
    const seen = new Set<string>();
    const push = (m: Medicine) => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      out.push(m);
    };

    // 1) Name prefix — binary-search the alphabetically sorted index and walk
    //    forward while the prefix matches. O(log N + k) for the common case.
    const start = lowerBoundByName(q);
    for (let i = start; i < searchIndexByName.length && out.length < LIMIT; i++) {
      const e = searchIndexByName[i];
      if (!e.name.startsWith(q)) break;
      push(e.m);
    }
    if (out.length >= LIMIT) return out;

    // 2) Generic / brand prefix, then substring matches, then barcode — all
    //    bounded by LIMIT and short-circuited via the `seen` set.
    const all = searchIndexAll;
    const tiers: ((e: MedSearchEntry) => boolean)[] = [
      (e) => e.gen.startsWith(q),
      (e) => !!e.brand && e.brand.startsWith(q),
      (e) => !seen.has(e.m.id) && e.name.includes(q),
      (e) => !seen.has(e.m.id) && e.gen.includes(q),
      (e) => !seen.has(e.m.id) && !!e.brand && e.brand.includes(q),
      (e) => !seen.has(e.m.id) && !!e.barcode && e.barcode.includes(query),
    ];
    for (const tier of tiers) {
      for (let i = 0; i < all.length && out.length < LIMIT; i++) {
        if (tier(all[i])) push(all[i].m);
      }
      if (out.length >= LIMIT) break;
    }
    return out;
  },
  getExpiringBatches: (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    return get().batches.filter(
      (b) => b.isActive && b.quantity > 0 && inActiveBranch(b) && new Date(b.expiryDate) <= cutoff
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
          createdAt: new Date(),
        } as ExpiryAlert;
      })
      .filter(Boolean) as ExpiryAlert[];
  },

  /* ── Live Low-Stock Alerts ──────────────────────────────────────────── */
  getLiveLowStockAlerts: () => {
    const { medicines, batches } = get();

    return medicines
      // reorderActive defaults true; only false explicitly silences alerts.
      .filter((m) => m.isActive && m.reorderLevel > 0 && (m.reorderActive ?? true))
      .map((m) => {
        const currentStock = batches
          .filter((b) => b.medicineId === m.id && b.isActive && b.quantity > 0 && inActiveBranch(b))
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
          createdAt: new Date(),
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
  updateCartItem: (index: number, patch: Partial<CartItem>) => void;
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
  unitName?: string;
  unitMultiplier?: number;
  taxRuleId?: string;
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
  updateCartItem: (index, patch) => {
    set((state) => {
      const newCart = [...state.cart];
      const item = { ...newCart[index], ...patch };
      item.total = item.quantity * item.unitPrice;
      item.lineProfit = (item.unitPrice - item.purchasePrice) * item.quantity;
      newCart[index] = item;
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
    const taxAmount = cart.reduce((sum, item) => {
      const lineDiscount = (item.total * item.discountPercent) / 100;
      return sum + (((item.total - lineDiscount) * item.taxPercent) / 100);
    }, 0);
    const activeServiceCharges = useSettingsStore
      .getState()
      .settings.serviceCharges.filter((charge) => charge.isActive);
    const serviceChargeAmount = activeServiceCharges.reduce((sum, charge) => {
      if (charge.type === 'percent') return sum + (taxableAmount * charge.amount) / 100;
      return sum + charge.amount;
    }, 0);
    const total = taxableAmount + taxAmount + serviceChargeAmount;
    const grossProfit = cart.reduce((sum, item) => sum + item.lineProfit, 0);
    set({ subtotal, discountAmount, taxAmount, total, grossProfit });
  },
}));

// Sales Store
interface SalesState {
  sales: Sale[];
  saleReturns: SaleReturn[];
  currentSale: Sale | null;
  addSale: (sale: Sale) => void;
  updateSale: (id: string, sale: Partial<Sale>) => void;
  addSaleReturn: (saleReturn: SaleReturn) => void;
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
  saleReturns: [],
  currentSale: null,
  addSale: (sale) => {
    // Optimistically record the sale and mirror its stock draw-down locally so
    // the inventory display, FEFO and the POS quantity clamp immediately reflect
    // reality (the server draws the same stock inside the sale transaction).
    set((state) => ({ sales: [...state.sales, sale] }));
    if (sale.status === 'completed') {
      useInventoryStore.getState().applySaleStock(sale.items, 'consume');
    }
    // Confirm with the server. A completed sale that the server REJECTS (e.g.
    // another terminal sold the last unit → oversell) must NOT linger as a
    // phantom sale or phantom stock movement, and must NOT be silently retried.
    createResource('sales', sale).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      const isStockReject = /insufficient stock|in stock,|oversell|salesperson/i.test(msg);
      if (isStockReject) {
        // Roll back the optimistic sale + stock, and tell the cashier exactly why.
        set((state) => ({ sales: state.sales.filter((s) => s.id !== sale.id) }));
        if (sale.status === 'completed') {
          useInventoryStore.getState().applySaleStock(sale.items, 'restore');
        }
        toast.error(msg || 'Sale rejected — insufficient stock. Please re-check the cart.');
      } else {
        // Network/server hiccup → keep the sale and queue it for offline sync.
        persistFailure('sales', 'create', sale as unknown as Record<string, unknown>);
        toast.warning('Saved offline — will sync when the connection is back.');
      }
    });
  },
  updateSale: (id, sale) => {
    const prev = get().sales.find((s) => s.id === id);
    set((state) => ({
      sales: state.sales.map((s) =>
        s.id === id ? { ...s, ...sale, updatedAt: new Date() } : s
      ),
    }));
    persistUpdate('sales', id, sale);
    // Collecting a pending bill completes it — the server draws stock down at
    // that point, so mirror it locally too.
    if (prev && prev.status !== 'completed' && sale.status === 'completed') {
      useInventoryStore.getState().applySaleStock(prev.items, 'consume');
    }
  },
  addSaleReturn: (saleReturn) =>
    set((state) => ({ saleReturns: [saleReturn, ...state.saleReturns] })),
  getSaleById: (id) => get().sales.find((s) => s.id === id),
  getSalesByDate: (date) =>
    get().sales.filter(
      (s) =>
        s.saleDate.toDateString() === date.toDateString() &&
        s.status === 'completed' &&
        inActiveBranchId(s.branchId)
    ),
  getTodaySales: () =>
    get().sales.filter(
      (s) =>
        s.saleDate.toDateString() === new Date().toDateString() &&
        s.status === 'completed' &&
        inActiveBranchId(s.branchId)
    ),
  getTotalProfit: () =>
    get()
      .sales.filter((s) => s.status === 'completed' && inActiveBranchId(s.branchId))
      .flatMap((s) => s.items)
      .reduce((sum, item) => sum + (item.profit ?? 0), 0),
  getTodayProfit: () => {
    const today = new Date().toDateString();
    return get()
      .sales.filter((s) => s.status === 'completed' && s.saleDate.toDateString() === today && inActiveBranchId(s.branchId))
      .flatMap((s) => s.items)
      .reduce((sum, item) => sum + (item.profit ?? 0), 0);
  },
  getRecentlySoldMedicineIds: (days = 90) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return [
      ...new Set(
        get()
          .sales.filter((s) => s.status === 'completed' && new Date(s.saleDate) >= cutoff && inActiveBranchId(s.branchId))
          .flatMap((s) => s.items.map((i) => i.medicineId))
      ),
    ];
  },
  computeKPIs: (batches: Batch[]) => {
    const sales = get().sales.filter((s) => s.status === 'completed' && inActiveBranchId(s.branchId));
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
  // M3 — distributor mapping + multi-invoice GRN + purchase returns
  medicineSuppliers: MedicineSupplier[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseReturns: PurchaseReturn[];
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;
  addPurchase: (purchase: Purchase) => void;
  updatePurchase: (id: string, purchase: Partial<Purchase>) => void;
  deletePurchase: (id: string) => void;
  getSupplierBalance: (supplierId: string) => number;
  // M3 — mapping & invoice & return mutators. Mirror the supplier pattern:
  // optimistic local set + persist via sync queue.
  addMedicineSupplier: (mapping: MedicineSupplier) => void;
  updateMedicineSupplier: (id: string, patch: Partial<MedicineSupplier>) => void;
  removeMedicineSupplier: (id: string) => void;
  addPurchaseInvoice: (invoice: PurchaseInvoice) => void;
  removePurchaseInvoice: (id: string) => void;
  addPurchaseReturn: (ret: PurchaseReturn) => void;
  // Read helpers
  suppliersForMedicine: (medicineId: string) => Supplier[];
  medicinesForSupplier: (supplierId: string) => string[];
  invoicesForPurchase: (purchaseId: string) => PurchaseInvoice[];
}

export const useSupplierStore = create<SupplierState>((set, get) => ({
  suppliers: [],
  purchases: [],
  medicineSuppliers: [],
  purchaseInvoices: [],
  purchaseReturns: [],
  addSupplier: (supplier) => {
    set((state) => ({ suppliers: [...state.suppliers, supplier] }));
    persistCreate('suppliers', supplier);
  },
  updateSupplier: (id, supplier) => {
    set((state) => ({
      suppliers: state.suppliers.map((s) =>
        s.id === id ? { ...s, ...supplier } : s
      ),
    }));
    persistUpdate('suppliers', id, supplier);
  },
  deleteSupplier: (id) => {
    set((state) => ({
      suppliers: state.suppliers.filter((s) => s.id !== id),
    }));
    persistDelete('suppliers', id);
  },
  addPurchase: (purchase) => {
    set((state) => ({ purchases: [...state.purchases, purchase] }));
    persistCreate('purchases', purchase);
  },
  updatePurchase: (id, purchase) => {
    set((state) => ({
      purchases: state.purchases.map((p) =>
        p.id === id ? { ...p, ...purchase, updatedAt: new Date() } : p
      ),
    }));
    persistUpdate('purchases', id, purchase);
  },
  deletePurchase: (id) => {
    set((state) => ({
      purchases: state.purchases.filter((p) => p.id !== id),
    }));
    persistDelete('purchases', id);
  },
  getSupplierBalance: (supplierId) => {
    const purchases = get().purchases.filter(
      (p) => p.supplierId === supplierId && p.status !== 'cancelled'
    );
    return purchases.reduce((sum, p) => sum + p.balanceAmount, 0);
  },
  addMedicineSupplier: (mapping) => {
    set((state) => ({ medicineSuppliers: [...state.medicineSuppliers, mapping] }));
    persistCreate('medicine-suppliers', mapping);
  },
  updateMedicineSupplier: (id, patch) => {
    set((state) => ({
      medicineSuppliers: state.medicineSuppliers.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: new Date() } : m)),
    }));
    persistUpdate('medicine-suppliers', id, patch);
  },
  removeMedicineSupplier: (id) => {
    set((state) => ({ medicineSuppliers: state.medicineSuppliers.filter((m) => m.id !== id) }));
    persistDelete('medicine-suppliers', id);
  },
  addPurchaseInvoice: (invoice) => {
    set((state) => ({ purchaseInvoices: [...state.purchaseInvoices, invoice] }));
    persistCreate('purchase-invoices', invoice);
  },
  removePurchaseInvoice: (id) => {
    set((state) => ({ purchaseInvoices: state.purchaseInvoices.filter((p) => p.id !== id) }));
    persistDelete('purchase-invoices', id);
  },
  addPurchaseReturn: (ret) => {
    set((state) => ({ purchaseReturns: [ret, ...state.purchaseReturns] }));
    persistCreate('purchase-returns', ret);
  },
  suppliersForMedicine: (medicineId) => {
    const ids = new Set(get().medicineSuppliers.filter((m) => m.medicineId === medicineId).map((m) => m.supplierId));
    return get().suppliers.filter((s) => ids.has(s.id));
  },
  medicinesForSupplier: (supplierId) =>
    get().medicineSuppliers.filter((m) => m.supplierId === supplierId).map((m) => m.medicineId),
  invoicesForPurchase: (purchaseId) =>
    get().purchaseInvoices.filter((p) => p.purchaseId === purchaseId),
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
  addCustomer: (customer) => {
    set((state) => ({ customers: [...state.customers, customer] }));
    persistCreate('customers', customer);
  },
  updateCustomer: (id, customer) => {
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id ? { ...c, ...customer } : c
      ),
    }));
    persistUpdate('customers', id, customer);
  },
  deleteCustomer: (id) => {
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id),
    }));
    persistDelete('customers', id);
  },
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
  addEntry: (entry) => {
    set((state) => ({ entries: [entry, ...state.entries] }));
    persistCreate('ledger-entries', entry);
  },
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
  addExpense: (expense) => {
    set((state) => ({ expenses: [expense, ...state.expenses] }));
    persistCreate('expenses', expense);
  },
  updateExpense: (id, expense) => {
    set((state) => ({
      expenses: state.expenses.map((e) => (e.id === id ? { ...e, ...expense } : e)),
    }));
    persistUpdate('expenses', id, expense);
  },
  deleteExpense: (id) => {
    set((state) => ({ expenses: state.expenses.filter((e) => e.id !== id) }));
    persistDelete('expenses', id);
  },
  getTotalByCategory: (category) =>
    get()
      .expenses.filter((e) => e.category === category)
      .reduce((s, e) => s + e.amount, 0),
}));

// ─── Promise / Advance Order Store (feature 4) ──────────────────────────────
interface PromiseOrderState {
  promiseOrders: PromiseOrder[];
  addPromiseOrder: (order: PromiseOrder) => void;
  updatePromiseOrder: (id: string, updates: Partial<PromiseOrder>) => void;
}

export const usePromiseOrderStore = create<PromiseOrderState>((set) => ({
  promiseOrders: [],
  addPromiseOrder: (order) => {
    set((state) => ({ promiseOrders: [order, ...state.promiseOrders] }));
    persistCreate('promise-orders', order);
  },
  updatePromiseOrder: (id, updates) => {
    set((state) => ({
      promiseOrders: state.promiseOrders.map((o) => (o.id === id ? { ...o, ...updates, updatedAt: new Date() } : o)),
    }));
    persistUpdate('promise-orders', id, updates);
  },
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
      placeOrder: (order) => {
        set((state) => ({ orders: [...state.orders, order], cart: [] }));
        createPublicWebOrder(TENANT_SLUG, order).catch(() =>
          persistFailure('web-orders', 'create', order as unknown as Record<string, unknown>)
        );
      },
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

// ─── M5 — Notifications store ──────────────────────────────────────────────
// Polled from /api/notifications. Tracks the highest seen id (persisted) so a
// browser refresh doesn't re-pulse the bell for already-seen items. UI flashes
// the bell whenever notifications.length increases.
interface NotificationStoreState {
  notifications: NotificationRow[];
  lastSeenAt: number;           // ms timestamp of the newest notification we've shown
  pulseAt: number;              // bumped when a new notification arrives
  loading: boolean;
  permission: NotificationPermission | 'unsupported';
  refresh: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  markAllSeen: () => void;
  requestBrowserPermission: () => Promise<void>;
  unregisterPush: () => Promise<void>;
}

import { fetchNotifications as apiFetchNotifications, dismissNotification as apiDismissNotification, dismissAllNotifications as apiDismissAllNotifications, fetchVapidPublicKey, registerPushSubscription, unregisterPushSubscription } from '@/lib/backend';

// M5.1 — Convert a base64-url-encoded VAPID public key into the Uint8Array
// the PushManager.subscribe applicationServerKey expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensurePushSubscription(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const existing = await reg.pushManager.getSubscription();
    let sub = existing;
    if (!sub) {
      const vapid = (import.meta as { env?: { VITE_VAPID_PUBLIC_KEY?: string } }).env?.VITE_VAPID_PUBLIC_KEY
        ?? (await fetchVapidPublicKey());
      if (!vapid) {
        console.warn('[push] no VAPID public key — push disabled');
        return;
      }
      // BufferSource cast — TS's narrowed Uint8Array<ArrayBufferLike> doesn't
      // line up with BufferSource by default, but the runtime accepts it fine.
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }
    await registerPushSubscription(sub, navigator.userAgent);
  } catch (err) {
    console.warn('[push] subscription failed:', err);
  }
}

export const useNotificationStore = create<NotificationStoreState>()(
  persist(
    (set, get) => ({
      notifications: [],
      lastSeenAt: 0,
      pulseAt: 0,
      loading: false,
      permission: typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission as NotificationPermission
        : 'unsupported',
      refresh: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
          const rows = await apiFetchNotifications(false);
          const prev = get().notifications;
          const prevIds = new Set(prev.map((n) => n.id));
          const newOnes = rows.filter((r) => !prevIds.has(r.id));
          // Only pulse + browser-notify when something *new* arrived (not on the
          // initial load — there may be a backlog the user already lived through).
          if (prev.length > 0 && newOnes.length > 0) {
            set({ pulseAt: Date.now() });
            const fresh = newOnes[0];
            if (typeof window !== 'undefined' && 'Notification' in window
                && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
              try {
                new Notification(fresh.title, { body: fresh.body ?? undefined, tag: fresh.id });
              } catch {/* ignore */}
            }
          }
          set({ notifications: rows, loading: false });
        } catch {
          set({ loading: false });
        }
      },
      dismiss: async (id) => {
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
        try { await apiDismissNotification(id); } catch {/* swallow — UI already updated */}
      },
      dismissAll: async () => {
        set({ notifications: [] });
        try { await apiDismissAllNotifications(); } catch {/* swallow */}
      },
      markAllSeen: () => {
        const newest = get().notifications.reduce((max, n) => Math.max(max, new Date(n.createdAt).getTime()), 0);
        set({ lastSeenAt: Math.max(get().lastSeenAt, newest) });
      },
      requestBrowserPermission: async () => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        try {
          const perm = await Notification.requestPermission();
          set({ permission: perm });
          // M5.1 — As soon as the user grants permission, register the
          // service worker and the push subscription with the backend.
          if (perm === 'granted') await ensurePushSubscription();
        } catch {/* ignore */}
      },
      unregisterPush: async () => {
        try {
          if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            await unregisterPushSubscription(sub.endpoint);
            await sub.unsubscribe();
          }
        } catch (err) {
          console.warn('[push] unregister failed:', err);
        }
      },
    }),
    {
      name: 'notifications-storage',
      partialize: (state) => ({ lastSeenAt: state.lastSeenAt }),
    },
  ),
);

// ─── B2B Network Store ───────────────────────────────────────────────────────
import { fetchConnections as apiFetchConnections, fetchNetworkOrders as apiFetchNetworkOrders } from '@/lib/backend';
import type { NetworkConnection as NetConn, NetworkOrder as NetOrder } from '@/types';

interface NetworkState {
  connections: NetConn[];
  incomingOrders: NetOrder[]; // I'm the seller
  outgoingOrders: NetOrder[]; // I'm the buyer
  unreadTotal: number;
  pendingIncoming: number; // incoming connection requests + new orders awaiting me
  loaded: boolean;
  refresh: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  connections: [],
  incomingOrders: [],
  outgoingOrders: [],
  unreadTotal: 0,
  pendingIncoming: 0,
  loaded: false,
  refresh: async () => {
    try {
      const [conns, incoming, outgoing] = await Promise.all([
        apiFetchConnections(),
        apiFetchNetworkOrders({ role: 'seller' }),
        apiFetchNetworkOrders({ role: 'buyer' }),
      ]);
      const unreadTotal = conns.reduce((s, c) => s + (c.unreadCount || 0), 0);
      const pendingIncoming =
        conns.filter((c) => c.status === 'pending' && c.direction === 'incoming').length +
        incoming.filter((o) => o.status === 'placed').length;
      set({ connections: conns, incomingOrders: incoming, outgoingOrders: outgoing, unreadTotal, pendingIncoming, loaded: true });
    } catch {
      // not permitted / offline — leave prior state
    }
  },
}));
