import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useInventoryStore, useSupplierStore, useCustomerStore, useSalesStore, useExpenseStore, useLedgerStore, useSettingsStore } from '@/store';
import { initializeMockData } from '@/data/mockData';
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
import { Expenses } from '@/pages/Expenses';
import { PurchaseOrders } from '@/pages/PurchaseOrders';
import { SuperAdmin } from '@/pages/SuperAdmin';
import { SuperAdminLogin } from '@/pages/SuperAdminLogin';
import { StoreLayout } from '@/pages/store/StoreLayout';
import { StoreFront } from '@/pages/store/StoreFront';
import { ProductDetail } from '@/pages/store/ProductDetail';
import { Cart } from '@/pages/store/Cart';
import { Checkout } from '@/pages/store/Checkout';
import { OrderConfirmation } from '@/pages/store/OrderConfirmation';
import { TrackOrder } from '@/pages/store/TrackOrder';
import { StoreAuth } from '@/pages/store/StoreAuth';
import { Toaster } from '@/components/ui/sonner';

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
  const { addMedicine } = useInventoryStore();
  const { addBatch } = useInventoryStore();
  const { addSupplier } = useSupplierStore();
  const { addCustomer } = useCustomerStore();
  const { addSale } = useSalesStore();
  const { addExpense } = useExpenseStore();
  const { addEntry } = useLedgerStore();

  useEffect(() => {
    // Guard: read STORE directly (not stale closure) to prevent duplicates in React 18 Strict Mode
    if (useInventoryStore.getState().medicines.length > 0) return;

    const data = initializeMockData();
    
    // Initialize medicines
    data.medicines.forEach(medicine => {
      addMedicine(medicine);
    });
    
    // Initialize batches
    data.batches.forEach(batch => {
      addBatch(batch);
    });
    
    // Initialize suppliers
    data.suppliers.forEach(supplier => {
      addSupplier(supplier);
    });
    
    // Initialize customers
    data.customers.forEach(customer => {
      addCustomer(customer);
    });
    
    // Initialize sales
    data.sales.forEach(sale => {
      addSale(sale);
    });

    // Initialize expenses
    data.expenses.forEach(expense => {
      addExpense(expense);
    });

    // Initialize ledger entries
    data.ledgerEntries.forEach(entry => {
      addEntry(entry);
    });
  }, []);

  return null;
}

function App() {
  const { settings } = useSettingsStore();

  return (
    <BrowserRouter>
      <DataInitializer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/super-admin/login" element={<SuperAdminLogin />} />

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

        {/* Customer-facing Web Store (public, no auth required) */}
        {settings.webStoreEnabled && (
          <Route path="/store" element={<StoreLayout />}>
            <Route index element={<StoreFront />} />
            <Route path="product/:id" element={<ProductDetail />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order-confirmation/:orderId" element={<OrderConfirmation />} />
            <Route path="track" element={<TrackOrder />} />
            <Route path="login" element={<StoreAuth />} />
          </Route>
        )}

        {/* Admin / POS routes (auth required) */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
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
                  <Route path="/settings" element={<Settings />} />
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
