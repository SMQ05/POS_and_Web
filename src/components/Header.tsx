import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useSettingsStore, useDashboardStore, useInventoryStore, useNotificationStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
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
  BellRing,
  Moon,
  Sun,
  User,
  Globe,
  Store,
  AlertTriangle,
  Menu,
  RotateCw,
  Receipt,
  ClipboardCheck,
  Wallet,
  MessageSquare,
} from 'lucide-react';

interface HeaderProps {
  onMobileMenuClick?: () => void;
}

export function Header({ onMobileMenuClick }: HeaderProps = {}) {
  const navigate = useNavigate();
  const { currentUser, branches, logout, activeBranchId, setActiveBranch, branchAccessFor } = useAuthStore();
  const activeBranch = branches.find((b) => b.id === activeBranchId)
    ?? branches.find((b) => b.id === currentUser?.branchId)
    ?? branches[0];
  const { settings, toggleTheme, setLanguage } = useSettingsStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds } = useDashboardStore();
  const { getLiveExpiryAlerts, getLiveLowStockAlerts } = useInventoryStore();
  const notifications = useNotificationStore((s) => s.notifications);
  const pulseAt = useNotificationStore((s) => s.pulseAt);
  const lastSeenAt = useNotificationStore((s) => s.lastSeenAt);
  const dismissNotification = useNotificationStore((s) => s.dismiss);
  const dismissAllNotifications = useNotificationStore((s) => s.dismissAll);
  const markAllSeen = useNotificationStore((s) => s.markAllSeen);
  const permission = useNotificationStore((s) => s.permission);
  const requestBrowserPermission = useNotificationStore((s) => s.requestBrowserPermission);
  const { t, isRTL } = useTranslation();

  // Bell pulses for ~3s after a new notification arrives.
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (!pulseAt) return;
    setPulsing(true);
    const handle = window.setTimeout(() => setPulsing(false), 3000);
    return () => window.clearTimeout(handle);
  }, [pulseAt]);

  const liveExpiry = getLiveExpiryAlerts().filter(a => !dismissedExpiryAlertIds.includes(a.id));
  const liveLowStock = getLiveLowStockAlerts().filter(a => !dismissedLowStockAlertIds.includes(a.id));
  const unseenPersisted = notifications.filter((n) => new Date(n.createdAt).getTime() > lastSeenAt);
  const totalAlerts = liveExpiry.length + liveLowStock.length + unseenPersisted.length;

  const kindIcon = (kind: string) => {
    if (kind === 'sale_return') return <Receipt className="w-4 h-4 text-amber-600 mt-0.5" />;
    if (kind === 'payment') return <Wallet className="w-4 h-4 text-blue-600 mt-0.5" />;
    if (kind === 'reconcile') return <ClipboardCheck className="w-4 h-4 text-purple-600 mt-0.5" />;
    if (kind === 'purchase_return') return <RotateCw className="w-4 h-4 text-red-600 mt-0.5" />;
    if (kind === 'wholesale') return <MessageSquare className="w-4 h-4 text-emerald-600 mt-0.5" />;
    return <Bell className="w-4 h-4 text-gray-500 mt-0.5" />;
  };

  const getRoleLabel = (role: string) => {
    return t(`roles.${role}`) || role;
  };

  return (
    <header className={cn(
      'h-14 sm:h-16 border-b flex items-center justify-between gap-2 px-3 sm:px-6 sticky top-0 z-30',
      settings.theme === 'dark'
        ? 'bg-gray-900 border-gray-800'
        : 'bg-white border-gray-200'
    )}>
      {/* Hamburger — mobile only */}
      {onMobileMenuClick && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onMobileMenuClick}
          className="md:hidden h-9 w-9 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
      )}

      {/* Search */}
      <div className="flex-1 max-w-xl min-w-0">
        <div className="relative">
          <Search className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
          <Input
            placeholder={t('header.searchPlaceholder')}
            className={cn(
              'w-full h-9',
              isRTL ? 'pr-10' : 'pl-10',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
          />
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {/* Branch Selector — only a switcher when multi-branch is enabled in
            Settings; otherwise a plain label (single-branch pharmacy). */}
        {!settings.multiBranchEnabled ? (
          <span className="hidden sm:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 px-2">
            <Store className="w-4 h-4" />
            {activeBranch?.name ?? branches[0]?.name ?? t('header.mainBranch')}
          </span>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">{activeBranch?.name ?? t('header.mainBranch')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{t('header.switchBranch')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {branches.length === 0 ? (
              <DropdownMenuItem disabled>{t('header.noBranches')}</DropdownMenuItem>
            ) : branches.map((b) => {
              const access = branchAccessFor(b.id);
              return (
                <DropdownMenuItem
                  key={b.id}
                  disabled={access === 'none'}
                  onClick={() => setActiveBranch(b.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-gray-400" />
                    <span className="flex flex-col">
                      <span className="text-sm">{b.name}</span>
                      {b.city && <span className="text-[10px] text-gray-400">{b.city}</span>}
                    </span>
                  </span>
                  {b.id === activeBranch?.id
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px]">Active</Badge>
                    : access === 'none'
                      ? <Badge variant="outline" className="text-[10px] text-gray-400">No access</Badge>
                      : access === 'read'
                        ? <Badge variant="outline" className="text-[10px]">Read</Badge>
                        : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/branches')} className="text-xs text-gray-500">
              Manage branches…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}

        {/* Language Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            const cycle: Record<string, 'en' | 'ur'> = { en: 'ur', ur: 'en' };
            setLanguage(cycle[settings.language] || 'en');
          }}
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
        <DropdownMenu onOpenChange={(open) => { if (open) markAllSeen(); }}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              {/* M5 — pulsing BellRing for a few seconds after a new notification arrives. */}
              {pulsing ? (
                <BellRing className="w-5 h-5 text-emerald-600 animate-pulse" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
              {totalAlerts > 0 && (
                <Badge
                  variant="destructive"
                  className={cn(
                    'absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs',
                    pulsing && 'animate-bounce',
                  )}
                >
                  {totalAlerts}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="w-96">
            <div className="flex items-center justify-between px-2 pt-2 pb-1">
              <DropdownMenuLabel className="p-0">{t('common.notifications')}</DropdownMenuLabel>
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-emerald-600 hover:underline"
                  onClick={() => dismissAllNotifications()}
                >
                  Dismiss all
                </button>
              )}
            </div>
            <DropdownMenuSeparator />

            {/* M5 — Inline browser-Notification opt-in prompt. Only shows when
                the browser supports the API and we haven't asked yet. */}
            {permission === 'default' && (
              <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs flex items-center justify-between gap-2">
                <span className="text-blue-800">Get push alerts when this tab is in the background?</span>
                <button
                  type="button"
                  className="text-blue-700 font-medium hover:underline"
                  onClick={() => requestBrowserPermission()}
                >
                  Enable
                </button>
              </div>
            )}
            {/* M5.1 — Once granted, give the user a way to verify the round-trip. */}
            {permission === 'granted' && (
              <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 text-[11px] flex items-center justify-between gap-2">
                <span className="text-emerald-800">Push notifications enabled</span>
                <button
                  type="button"
                  className="text-emerald-700 font-medium hover:underline"
                  onClick={async () => {
                    try {
                      const { sendTestPush } = await import('@/lib/backend');
                      const r = await sendTestPush();
                      if (r.sent > 0) {
                        // Toast import is local — pull through the existing sonner instance.
                        const { toast } = await import('sonner');
                        toast.success(`Test push sent (${r.sent}/${r.total}). Check your system notification tray.`);
                      } else {
                        const { toast } = await import('sonner');
                        toast.error(r.total === 0 ? 'No active subscriptions for your user' : 'All deliveries failed — open browser DevTools → Application → Service Workers');
                      }
                    } catch {/* ignore */}
                  }}
                >
                  Send test
                </button>
              </div>
            )}

            {totalAlerts === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {t('common.noNotifications')}
              </div>
            ) : (
              <>
                {/* Persisted (event-driven) notifications first. */}
                {notifications.slice(0, 8).map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex items-start gap-2 p-3 cursor-pointer"
                    onClick={() => { if (n.link) navigate(n.link); }}
                  >
                    {kindIcon(n.kind)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 truncate">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                      className="text-gray-400 hover:text-gray-600 text-xs"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </DropdownMenuItem>
                ))}

                {/* Live (computed) inventory alerts second. */}
                {liveExpiry.slice(0, 5).map(alert => (
                  <DropdownMenuItem key={alert.id} className="flex items-start gap-2 p-3 cursor-pointer" onClick={() => navigate('/alerts')}>
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.medicineName}</p>
                      <p className="text-xs text-gray-500">
                        {t('header.expiresIn', alert.daysUntilExpiry)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
                {liveLowStock.slice(0, 5).map(alert => (
                  <DropdownMenuItem key={alert.id} className="flex items-start gap-2 p-3 cursor-pointer" onClick={() => navigate('/alerts')}>
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.medicineName}</p>
                      <p className="text-xs text-gray-500">
                        {t('header.lowStock', alert.currentStock)}
                      </p>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="justify-center text-emerald-600 font-medium cursor-pointer" onClick={() => navigate('/alerts')}>
                  {t('dashboard.viewAllAlerts')}
                </DropdownMenuItem>
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
          <DropdownMenuContent align={isRTL ? 'start' : 'end'}>
            <DropdownMenuLabel>{t('common.myAccount')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/my-profile')}>{t('common.profile')}</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>{t('common.changePassword')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 cursor-pointer" onClick={() => { logout(); navigate('/login'); }}>
              {t('common.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
