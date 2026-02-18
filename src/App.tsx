import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, useInventoryStore, useSupplierStore, useCustomerStore, useDashboardStore, useSalesStore } from '@/store';
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
  const { addExpiryAlert, addLowStockAlert } = useDashboardStore();
  const { addSale } = useSalesStore();

  useEffect(() => {
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
    
    // Initialize alerts
    data.expiryAlerts.forEach(alert => {
      addExpiryAlert(alert);
    });
    
    data.lowStockAlerts.forEach(alert => {
      addLowStockAlert(alert);
    });
    
    // Initialize sales
    data.sales.forEach(sale => {
      addSale(sale);
    });
  }, []);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <DataInitializer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/pos" element={<POS />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/medicines" element={<Medicines />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/customers" element={<Customers />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/reports" element={<Reports />} />
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
