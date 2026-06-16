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
  CreditCard,
  Building2,
  BookOpen,
  ClipboardCheck,
  Server,
  Inbox as InboxIcon,
  Share2,
  HandCoins,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/dashboard', module: 'dashboard', group: 'management' },
  { icon: ShoppingCart, labelKey: 'nav.pos', path: '/pos', module: 'pos', group: 'pos' },
  { icon: Receipt, labelKey: 'nav.sales', path: '/sales', module: 'sales', group: 'management' },
  { icon: Package, labelKey: 'nav.inventory', path: '/inventory', module: 'inventory', group: 'management' },
  { icon: Pill, labelKey: 'nav.medicines', path: '/medicines', module: 'medicines', group: 'management' },
  { icon: Truck, labelKey: 'nav.suppliers', path: '/suppliers', module: 'suppliers', group: 'management' },
  { icon: ClipboardList, labelKey: 'nav.purchaseOrders', path: '/purchase-orders', module: 'suppliers', group: 'management' },
  { icon: HandCoins, labelKey: 'nav.promiseOrders', path: '/promise-orders', module: 'customers', group: 'management' },
  { icon: Users, labelKey: 'nav.customers', path: '/customers', module: 'customers', group: 'management' },
  { icon: Share2, labelKey: 'nav.network', path: '/network', module: 'suppliers', group: 'management', ownerManagerOnly: true },
  { icon: AlertTriangle, labelKey: 'nav.alerts', path: '/alerts', module: 'alerts', group: 'management' },
  { icon: BarChart3, labelKey: 'nav.reports', path: '/reports', module: 'reports', group: 'management' },
  { icon: BookOpen, labelKey: 'nav.ledger', path: '/ledger', module: 'reports', group: 'management' },
  { icon: ClipboardList, labelKey: 'nav.audit', path: '/audit', module: 'reports', group: 'management', ownerManagerOnly: true },
  { icon: ClipboardCheck, labelKey: 'nav.reconcile', path: '/reconcile', module: 'inventory', group: 'management' },
  { icon: ClipboardCheck, labelKey: 'nav.dayClose', path: '/day-close', module: 'reports', group: 'management', ownerManagerOnly: true },
  { icon: InboxIcon, labelKey: 'nav.inbox', path: '/inbox', module: 'reports', group: 'management' },
  { icon: Server, labelKey: 'nav.partners', path: '/partners', module: 'settings', group: 'management', ownerManagerOnly: true },
  { icon: Wallet, labelKey: 'nav.expenses', path: '/expenses', module: 'expenses', group: 'management' },
  { icon: UserCog, labelKey: 'nav.users', path: '/users', module: 'users', group: 'management' },
  { icon: Building2, labelKey: 'nav.branches', path: '/branches', module: 'branches', group: 'management', ownerManagerOnly: true },
  { icon: CreditCard, labelKey: 'nav.billing', path: '/billing', module: 'billing', group: 'management', ownerManagerOnly: true },
  { icon: Settings, labelKey: 'nav.settings', path: '/settings', module: 'settings', group: 'management' },
];

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
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

  const isOwnerOrManager = currentUser?.role === 'owner' || currentUser?.role === 'manager';
  const filteredMenuItems = isSuperAdmin
    ? []
    : menuItems.filter(item => {
        if ((item as { ownerManagerOnly?: boolean }).ownerManagerOnly && !isOwnerOrManager) return false;
        if (item.module === 'billing' || item.module === 'branches') return isOwnerOrManager;
        if (!(hasPermission(item.module, 'read') || item.module === 'dashboard')) return false;
        if (item.group === 'pos' && !settings.posEnabled) return false;
        if (item.group === 'management' && !settings.managementEnabled) {
          if (item.path === '/dashboard') return true;
          return false;
        }
        return true;
      });

  const superAdminItem = isSuperAdmin ? [{
    icon: Shield,
    labelKey: 'nav.superAdmin',
    path: '/super-admin',
    module: 'superadmin',
    group: 'superadmin',
  }] : [];

  const allMenuItems = [...superAdminItem, ...filteredMenuItems];

  return (
    <div className={cn(
      'fixed top-0 z-40 h-screen transition-all duration-300 border-r',
      // Mobile: always full width 64. Desktop respects collapsed state.
      'w-64',
      collapsed ? 'md:w-20' : 'md:w-64',
      // Side & slide-in:
      // - Desktop (md+): always pinned at left/right
      // - Mobile: hidden by default, slides in when mobileOpen
      isRTL
        ? cn('right-0 border-l border-r-0', mobileOpen ? 'translate-x-0' : 'translate-x-full', 'md:translate-x-0')
        : cn('left-0', mobileOpen ? 'translate-x-0' : '-translate-x-full', 'md:translate-x-0'),
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
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-base text-emerald-600 whitespace-nowrap truncate">
              {t('common.brand')}
            </h1>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center mx-auto">
            <Pill className="w-5 h-5 text-white" />
          </div>
        )}
        {!collapsed && (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 hidden md:inline-flex"
            >
              {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            {onMobileClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onMobileClose}
                className="h-8 w-8 md:hidden"
                aria-label="Close menu"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </>
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
