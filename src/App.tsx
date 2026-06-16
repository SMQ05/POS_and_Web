import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useInventoryStore, useSupplierStore, useCustomerStore, useSalesStore, useExpenseStore, useLedgerStore, useSettingsStore, useNotificationStore, useNetworkStore, usePromiseOrderStore } from '@/store';
import { getBootstrapData } from '@/lib/backend';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { POS } from '@/pages/POS';
import { Sales } from '@/pages/Sales';
import { Inventory } from '@/pages/Inventory';
import { Medicines } from '@/pages/Medicines';
import { Suppliers } from '@/pages/Suppliers';
import { Customers } from '@/pages/Customers';
import { Alerts } from '@/pages/Alerts';
import { Reports } from '@/pages/Reports';
import { Users } from '@/pages/Users';
import { Settings } from '@/pages/Settings';
import { MyProfile } from '@/pages/MyProfile';
import { Ledger } from '@/pages/Ledger';
import { Audit } from '@/pages/Audit';
import { Reconcile } from '@/pages/Reconcile';
import { DayClosePage } from '@/pages/DayClose';
import { PromiseOrders } from '@/pages/PromiseOrders';
import { Collect } from '@/pages/Collect';
import { Partners } from '@/pages/Partners';
import { Inbox } from '@/pages/Inbox';
import { Network } from '@/pages/Network';
import { Expenses } from '@/pages/Expenses';
import { Billing } from '@/pages/Billing';
import { Branches } from '@/pages/Branches';
import { PurchaseOrders } from '@/pages/PurchaseOrders';
import { SuperAdmin } from '@/pages/SuperAdmin';
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import Landing from '@/pages/Landing';
import Signup from '@/pages/Signup';
import SetupPassword from '@/pages/SetupPassword';
import { DemoLogin } from '@/pages/DemoLogin';
import { Toaster } from '@/components/ui/sonner';
import type { AppSettings } from '@/types';

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Initialize Data Component
function DataInitializer() {
  const { isAuthenticated } = useAuthStore();
  const { updateSettings } = useSettingsStore();

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    getBootstrapData()
      .then((data) => {
        if (cancelled) return;
        useAuthStore.getState().setBranches(data.branches);
        useInventoryStore.setState({ medicines: data.medicines, batches: data.batches });
        useSupplierStore.setState({
          suppliers: data.suppliers,
          purchases: data.purchases,
          medicineSuppliers: data.medicineSuppliers ?? [],
          purchaseInvoices: data.purchaseInvoices ?? [],
          purchaseReturns: data.purchaseReturns ?? [],
        });
        useCustomerStore.setState({ customers: data.customers });
        useSalesStore.setState({ sales: data.sales, saleReturns: data.saleReturns });
        useExpenseStore.setState({ expenses: data.expenses });
        useLedgerStore.setState({ entries: data.ledgerEntries });
        usePromiseOrderStore.setState({ promiseOrders: data.promiseOrders ?? [] });
        if (data.tenant.settings) updateSettings(data.tenant.settings as Partial<AppSettings>);
      })
      .catch((error) => {
        console.warn('Backend database not detected. Activating pure client-side offline demo mock seed.', error);
        // Dynamic import to keep main bundle light
        import('@/lib/mockSeed').then(({ getMockBootstrapData }) => {
          if (cancelled) return;
          const data = getMockBootstrapData();
          useAuthStore.getState().setBranches(data.branches);
          useInventoryStore.setState({ medicines: data.medicines, batches: data.batches });
          useSupplierStore.setState({ suppliers: data.suppliers, purchases: data.purchases });
          useCustomerStore.setState({ customers: data.customers });
          useSalesStore.setState({ sales: data.sales, saleReturns: data.saleReturns });
          useExpenseStore.setState({ expenses: data.expenses });
          useLedgerStore.setState({ entries: data.ledgerEntries });
        }).catch(err => {
          console.error('Failed to load mock fallback', err);
          useAuthStore.getState().logout();
        });
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, updateSettings]);

  // M5 — Poll persisted notifications every 30s while authenticated. Refresh
  // also fires on tab refocus so the user sees fresh entries when they come
  // back to the tab without waiting for the next tick.
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () => {
      useNotificationStore.getState().refresh();
      useNetworkStore.getState().refresh();
    };
    refresh();
    const tick = window.setInterval(refresh, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isAuthenticated]);

  // M5.1 — Re-register the web-push subscription on each auth load if the
  // user already granted permission in a previous session. Browser endpoints
  // can rotate; re-subscribing keeps the server's row fresh.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void useNotificationStore.getState().requestBrowserPermission();
  }, [isAuthenticated]);

  // M5.1 — Service worker → client navigation. When the user clicks an OS
  // notification while the tab is alive, the SW posts { type: 'NAV', link }.
  // Push that through React Router (instead of letting the SW do
  // window.location.assign, which would reload the bundle and wipe state).
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; link?: string } | null;
      if (data?.type === 'NAV' && typeof data.link === 'string') {
        navigate(data.link);
        // Bring the notification to the foreground too — bell pulse + refresh.
        useNotificationStore.getState().refresh();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}

import { useIsMobile } from '@/hooks/use-mobile';
import { MobileApp } from '@/mobile/MobileApp';

function App() {
  const { settings } = useSettingsStore();
  const isMobile = useIsMobile();

  // Add the theme application logic here
  useEffect(() => {
    const isDark = settings.theme === 'dark' || 
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [settings.theme]);

  if (isMobile) {
    return (
      <BrowserRouter>
        <DataInitializer />
        <MobileApp />
        <Toaster />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <DataInitializer />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/setup-password" element={<SetupPassword />} />
        <Route path="/setup-password/:token" element={<SetupPassword />} />
        <Route path="/login" element={<Login />} />
        <Route path="/demo" element={<DemoLogin />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />
        <Route path="/saas-admin/login" element={<SuperAdminLogin />} />

        {/* Super Admin dashboard (separate from regular admin layout) */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute>
              <Layout>
                <SuperAdmin />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/saas-admin"
          element={
            <ProtectedRoute>
              <Layout>
                <SuperAdmin />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Admin / POS routes (auth required) */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  {settings.posEnabled && <Route path="/pos" element={<POS />} />}
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/medicines" element={<Medicines />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/purchase-orders" element={<PurchaseOrders />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/branches" element={<Branches />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/my-profile" element={<MyProfile />} />
                  <Route path="/ledger" element={<Ledger />} />
                  <Route path="/audit" element={<Audit />} />
                  <Route path="/reconcile" element={<Reconcile />} />
                  <Route path="/day-close" element={<DayClosePage />} />
                  <Route path="/promise-orders" element={<PromiseOrders />} />
                  <Route path="/collect/:invoiceNumber" element={<Collect />} />
                  <Route path="/partners" element={<Partners />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/network" element={<Network />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
