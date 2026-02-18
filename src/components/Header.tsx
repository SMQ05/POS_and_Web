import { useAuthStore, useSettingsStore, useDashboardStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  Bell,
  Moon,
  Sun,
  User,
  Globe,
  Store,
  AlertTriangle,
} from 'lucide-react';

export function Header() {
  const { currentUser } = useAuthStore();
  const { settings, toggleTheme, setLanguage } = useSettingsStore();
  const { expiryAlerts, lowStockAlerts } = useDashboardStore();

  const totalAlerts = expiryAlerts.filter(a => !a.isResolved).length + 
                      lowStockAlerts.filter(a => !a.isResolved).length;

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      owner: 'Owner',
      manager: 'Manager',
      cashier: 'Cashier',
      pharmacist: 'Pharmacist',
      accountant: 'Accountant',
    };
    return labels[role] || role;
  };

  return (
    <header className={cn(
      'h-16 border-b flex items-center justify-between px-6 sticky top-0 z-30',
      settings.theme === 'dark' 
        ? 'bg-gray-900 border-gray-800' 
        : 'bg-white border-gray-200'
    )}>
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search medicines, batches, invoices..."
            className={cn(
              'pl-10 w-full',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
          />
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-3">
        {/* Branch Selector */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
        >
          <Store className="w-4 h-4" />
          <span className="hidden sm:inline">Main Branch - Lahore</span>
        </Button>

        {/* Language Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLanguage(settings.language === 'en' ? 'ur' : 'en')}
          className="relative"
        >
          <Globe className="w-5 h-5" />
          <span className="absolute -bottom-1 -right-1 text-xs font-bold">
            {settings.language === 'en' ? 'EN' : 'UR'}
          </span>
        </Button>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
        >
          {settings.theme === 'dark' ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {totalAlerts > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {totalAlerts}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {totalAlerts === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No new notifications
              </div>
            ) : (
              <>
                {expiryAlerts.filter(a => !a.isResolved).map(alert => (
                  <DropdownMenuItem key={alert.id} className="flex items-start gap-2 p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.medicineName}</p>
                      <p className="text-xs text-gray-500">
                        Expires in {alert.daysUntilExpiry} days
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
                {lowStockAlerts.filter(a => !a.isResolved).map(alert => (
                  <DropdownMenuItem key={alert.id} className="flex items-start gap-2 p-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.medicineName}</p>
                      <p className="text-xs text-gray-500">
                        Low stock: {alert.currentStock} remaining
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                settings.theme === 'dark' ? 'bg-emerald-600' : 'bg-emerald-100'
              )}>
                <User className={cn(
                  'w-4 h-4',
                  settings.theme === 'dark' ? 'text-white' : 'text-emerald-600'
                )} />
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium">{currentUser?.name}</p>
                <p className="text-xs text-gray-500">{getRoleLabel(currentUser?.role || '')}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Change Password</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
