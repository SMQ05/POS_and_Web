import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useSettingsStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Users,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Pill,
  AlertTriangle,
  Receipt,
  UserCog,
  Wallet,
  ClipboardList,
  Shield,
  Globe,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/', module: 'dashboard', group: 'management' },
  { icon: ShoppingCart, labelKey: 'nav.pos', path: '/pos', module: 'pos', group: 'pos' },
  { icon: Receipt, labelKey: 'nav.sales', path: '/sales', module: 'sales', group: 'management' },
  { icon: Package, labelKey: 'nav.inventory', path: '/inventory', module: 'inventory', group: 'management' },
  { icon: Pill, labelKey: 'nav.medicines', path: '/medicines', module: 'medicines', group: 'management' },
  { icon: Truck, labelKey: 'nav.suppliers', path: '/suppliers', module: 'suppliers', group: 'management' },
  { icon: ClipboardList, labelKey: 'nav.purchaseOrders', path: '/purchase-orders', module: 'suppliers', group: 'management' },
  { icon: Users, labelKey: 'nav.customers', path: '/customers', module: 'customers', group: 'management' },
  { icon: AlertTriangle, labelKey: 'nav.alerts', path: '/alerts', module: 'alerts', group: 'management' },
  { icon: BarChart3, labelKey: 'nav.reports', path: '/reports', module: 'reports', group: 'management' },
  { icon: Wallet, labelKey: 'nav.expenses', path: '/expenses', module: 'expenses', group: 'management' },
  { icon: UserCog, labelKey: 'nav.users', path: '/users', module: 'users', group: 'management' },
  { icon: Settings, labelKey: 'nav.settings', path: '/settings', module: 'settings', group: 'management' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, hasPermission, currentUser } = useAuthStore();
  const { settings } = useSettingsStore();
  const { t, isRTL } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isSuperAdmin = currentUser?.role === 'superadmin';

  const filteredMenuItems = menuItems.filter(item => {
    // Permission check
    if (!(hasPermission(item.module, 'read') || item.module === 'dashboard')) return false;
    // Module toggle check
    if (item.group === 'pos' && !settings.posEnabled && !isSuperAdmin) return false;
    if (item.group === 'management' && !settings.managementEnabled && !isSuperAdmin) {
      // Always show dashboard
      if (item.path === '/') return true;
      return false;
    }
    return true;
  });

  // Add super admin item at top if superadmin or owner
  const superAdminItem = (isSuperAdmin || currentUser?.role === 'owner') ? [{
    icon: Shield,
    labelKey: 'nav.superAdmin',
    path: '/super-admin',
    module: 'superadmin',
    group: 'superadmin',
  }] : [];

  // Add web store link if enabled
  const webStoreItem = settings.webStoreEnabled ? [{
    icon: Globe,
    labelKey: 'nav.webStore',
    path: '/store',
    module: 'webstore',
    group: 'web',
  }] : [];

  const allMenuItems = [...superAdminItem, ...filteredMenuItems, ...webStoreItem];

  return (
    <div className={cn(
      'fixed top-0 z-40 h-screen transition-all duration-300 border-r',
      isRTL ? 'right-0 border-l border-r-0' : 'left-0',
      collapsed ? 'w-20' : 'w-64',
      settings.theme === 'dark' 
        ? 'bg-gray-900 border-gray-800' 
        : 'bg-white border-gray-200'
    )}>
      {/* Logo Area */}
      <div className={cn(
        'flex items-center justify-between h-16 px-4 border-b',
        settings.theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-emerald-600">{t('common.brand')}</h1>
              {!collapsed && <p className="text-xs text-gray-500">{t('common.brandCountry')}</p>}
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center mx-auto">
            <Pill className="w-5 h-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8"
          >
            {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              'h-8 w-8 absolute top-5 bg-white border shadow-sm',
              isRTL ? '-left-4' : '-right-4'
            )}
          >
            {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <TooltipProvider delayDuration={0}>
          <nav className="p-2 space-y-1">
            {allMenuItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate(item.path)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                        isActive
                          ? 'bg-emerald-500 text-white shadow-md'
                          : settings.theme === 'dark'
                          ? 'text-gray-400 hover:bg-gray-800 hover:text-white'
                          : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-600',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <Icon className={cn('w-5 h-5', collapsed && 'w-6 h-6')} />
                      {!collapsed && <span className="font-medium">{t(item.labelKey)}</span>}
                    </button>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side={isRTL ? 'left' : 'right'} className="font-medium">
                      {t(item.labelKey)}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      {/* Logout */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 p-4 border-t',
        settings.theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
      )}>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleLogout}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                  settings.theme === 'dark'
                    ? 'text-red-400 hover:bg-red-900/20'
                    : 'text-red-600 hover:bg-red-50',
                  collapsed && 'justify-center'
                )}
              >
                <LogOut className="w-5 h-5" />
                {!collapsed && <span className="font-medium">{t('common.logout')}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side={isRTL ? 'left' : 'right'} className="font-medium">
                {t('common.logout')}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
