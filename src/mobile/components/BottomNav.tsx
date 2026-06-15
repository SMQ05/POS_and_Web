import { cn } from '@/lib/utils';
import { useInventoryStore, useDashboardStore, useNotificationStore } from '@/store';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  Receipt,
  MoreHorizontal
} from 'lucide-react';

interface BottomNavProps {
  activeTab: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more';
  onTabChange: (tab: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more') => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { getLiveExpiryAlerts, getLiveLowStockAlerts } = useInventoryStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds } = useDashboardStore();
  const notifications = useNotificationStore((s) => s.notifications);
  const lastSeenAt = useNotificationStore((s) => s.lastSeenAt);

  const expiryAlerts = getLiveExpiryAlerts().filter(a => !dismissedExpiryAlertIds.includes(a.id));
  const lowStockAlerts = getLiveLowStockAlerts().filter(a => !dismissedLowStockAlertIds.includes(a.id));
  const unseenPersisted = notifications.filter((n) => new Date(n.createdAt).getTime() > lastSeenAt);
  const alertCount = expiryAlerts.length + lowStockAlerts.length + unseenPersisted.length;

  const tabs = [
    { id: 'dashboard', label: 'Overview', icon: TrendingUp },
    { id: 'pos', label: 'POS Sale', icon: ShoppingCart },
    { id: 'inventory', label: 'Stock', icon: Package },
    { id: 'sales', label: 'Invoices', icon: Receipt },
    { id: 'more', label: 'More', icon: MoreHorizontal, badge: alertCount > 0 ? alertCount : undefined }
  ];

  return (
    <div className="fixed bottom-0 inset-x-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-t border-gray-100 dark:border-gray-800 px-6 py-2 pb-5 z-40 flex items-center justify-between shadow-[0_-4px_24px_rgba(0,0,0,0.04)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as any)}
            className="flex flex-col items-center justify-center relative active:scale-95 transition-transform flex-1"
          >
            <div className={cn(
              'w-11 h-7 rounded-xl flex items-center justify-center transition-all',
              isActive
                ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'text-gray-400 dark:text-gray-500'
            )}>
              <Icon className="w-5 h-5" />
            </div>
            
            <span className={cn(
              'text-[9px] font-bold mt-1 tracking-tight',
              isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
            )}>
              {tab.label}
            </span>

            {/* Red Alert badge */}
            {tab.badge && (
              <span className="absolute top-0.5 right-4 w-4 h-4 rounded-full bg-red-500 border border-white dark:border-gray-900 text-white text-[8px] font-black flex items-center justify-center shadow-sm">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
