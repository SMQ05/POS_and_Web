import { useState } from 'react';
import { useAuthStore } from '@/store';
import { MobileHeader } from './components/MobileHeader';
import { BottomNav } from './components/BottomNav';
import { MobileDashboard } from './pages/MobileDashboard';
import { MobilePOS } from './pages/MobilePOS';
import { MobileInventory } from './pages/MobileInventory';
import { MobileSales } from './pages/MobileSales';
import { MobileMore } from './pages/MobileMore';
import { MobileAuth } from './pages/MobileAuth';

export function MobileApp() {
  const { isAuthenticated, setSession } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pos' | 'inventory' | 'sales' | 'more'>('dashboard');

  if (!isAuthenticated) {
    return <MobileAuth onLoginSuccess={() => setActiveTab('dashboard')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans">
      {/* Mobile Sticky Header */}
      <MobileHeader />

      {/* Main Tab Render Container */}
      <main className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === 'dashboard' && <MobileDashboard onSetActiveTab={setActiveTab} />}
        {activeTab === 'pos' && <MobilePOS onSetActiveTab={setActiveTab} />}
        {activeTab === 'inventory' && <MobileInventory />}
        {activeTab === 'sales' && <MobileSales onSetActiveTab={setActiveTab} />}
        {activeTab === 'more' && <MobileMore />}
      </main>

      {/* Mobile Floating Bottom Nav */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
export default MobileApp;
