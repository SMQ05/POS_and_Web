import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useSettingsStore } from '@/store';
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
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', module: 'dashboard' },
  { icon: ShoppingCart, label: 'POS Billing', path: '/pos', module: 'pos' },
  { icon: Receipt, label: 'Sales', path: '/sales', module: 'sales' },
  { icon: Package, label: 'Inventory', path: '/inventory', module: 'inventory' },
  { icon: Pill, label: 'Medicines', path: '/medicines', module: 'medicines' },
  { icon: Truck, label: 'Suppliers', path: '/suppliers', module: 'suppliers' },
  { icon: Users, label: 'Customers', path: '/customers', module: 'customers' },
  { icon: AlertTriangle, label: 'Alerts', path: '/alerts', module: 'alerts' },
  { icon: BarChart3, label: 'Reports', path: '/reports', module: 'reports' },
  { icon: UserCog, label: 'Users', path: '/users', module: 'users' },
  { icon: Settings, label: 'Settings', path: '/settings', module: 'settings' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, hasPermission } = useAuthStore();
  const { settings } = useSettingsStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredMenuItems = menuItems.filter(item => 
    hasPermission(item.module, 'read') || item.module === 'dashboard'
  );

  return (
    <div className={cn(
      'fixed left-0 top-0 z-40 h-screen transition-all duration-300 border-r',
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
              <h1 className="font-bold text-lg text-emerald-600">PharmaPOS</h1>
              {!collapsed && <p className="text-xs text-gray-500">Pakistan</p>}
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
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 absolute -right-4 top-5 bg-white border shadow-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <TooltipProvider delayDuration={0}>
          <nav className="p-2 space-y-1">
            {filteredMenuItems.map((item) => {
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
                      {!collapsed && <span className="font-medium">{item.label}</span>}
                    </button>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" className="font-medium">
                      {item.label}
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
                {!collapsed && <span className="font-medium">Logout</span>}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" className="font-medium">
                Logout
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
