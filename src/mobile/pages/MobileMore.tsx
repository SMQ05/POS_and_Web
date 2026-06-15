import { useEffect, useState } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  User,
  LogOut,
  Building,
  AlertTriangle,
  Globe,
  Truck,
  CreditCard,
  Moon,
  Sun,
  Laptop,
  Check,
  ChevronRight,
  TrendingUp,
  MapPin,
  Flame,
  Languages,
  ClipboardCheck,
  Bell,
} from 'lucide-react';
import { MobileReconcile } from './MobileReconcile';
import { MobileNotifications } from './MobileNotifications';
import { MobileInbox } from './MobileInbox';
import { useNotificationStore, useSupplierStore } from '@/store';
import { fetchOpenShift, openShift, closeShift, fetchThreads } from '@/lib/backend';
import type { ShiftSession, Supplier } from '@/types';
import { Clock, MessageSquare, Truck as TruckIcon, X as XIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function MobileMore() {
  const { currentUser, logout, tenant, branches } = useAuthStore();
  const { settings, updateSettings } = useSettingsStore();
  const { t } = useTranslation();

  // M6 — open shift session (mobile mirror of POS chip).
  const [shift, setShift] = useState<ShiftSession | null>(null);
  useEffect(() => {
    if (!settings.shiftCloseEnabled) { setShift(null); return; }
    fetchOpenShift().then(setShift).catch(() => {/* tolerate */});
  }, [settings.shiftCloseEnabled]);
  const handleOpenShift = async () => {
    const branchId = branches[0]?.id || currentUser?.branchId || '1';
    const cashStr = prompt('Opening cash (Rs.)?', '0');
    if (cashStr == null) return;
    try {
      const opened = await openShift({ branchId, openingCash: parseFloat(cashStr) || 0 });
      setShift(opened);
      toast.success('Shift opened');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };
  const handleCloseShift = async () => {
    if (!shift) return;
    const cashStr = prompt('Closing cash (Rs.)?', '0');
    if (cashStr == null) return;
    try {
      const closed = await closeShift(shift.id, { closingCash: parseFloat(cashStr) || 0 });
      setShift(null);
      toast.success(`Shift closed — sales Rs. ${closed.salesTotal.toFixed(2)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  };

  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [showLangSheet, setShowLangSheet] = useState(false);
  // M4 — open the mobile reconcile sheet over the More page.
  const [showReconcile, setShowReconcile] = useState(false);
  // M5 — open the mobile notifications fullscreen over the More page.
  const [showNotifs, setShowNotifs] = useState(false);
  // M8 — mobile inbox + supplier quick-add over the More page.
  const [showInbox, setShowInbox] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [showSupplierSheet, setShowSupplierSheet] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supCity, setSupCity] = useState('');
  const [supTerms, setSupTerms] = useState('30');
  const { addSupplier } = useSupplierStore();

  // M8 — pull inbox unread counts so the row shows a red badge. Cheap poll on
  // mount + a refresh every 60s. The mobile inbox screen does its own polling.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchThreads()
        .then((ts) => { if (!cancelled) setUnreadInboxCount(ts.reduce((s, t) => s + (t.unreadCount ?? 0), 0)); })
        .catch(() => {/* tolerate */});
    };
    refresh();
    const tick = window.setInterval(refresh, 60_000);
    return () => { cancelled = true; window.clearInterval(tick); };
  }, []);

  // M5 — surface the unread count on the Notifications row.
  const notifications = useNotificationStore((s) => s.notifications);
  const lastSeenAt = useNotificationStore((s) => s.lastSeenAt);
  const unseenCount = notifications.filter((n) => new Date(n.createdAt).getTime() > lastSeenAt).length;

  const themeOptions = [
    { id: 'system', name: 'System default (same as phone)', icon: Laptop },
    { id: 'light', name: 'Light mode', icon: Sun },
    { id: 'dark', name: 'Dark mode', icon: Moon },
  ];

  const langOptions = [
    { id: 'en', name: 'English (US)' },
    { id: 'ur', name: 'Urdu (اردو)' },
    { id: 'ar', name: 'Arabic (العربية)' },
  ];

  const handleThemeSelect = (themeId: 'light' | 'dark' | 'system') => {
    updateSettings({ theme: themeId });
    setShowThemeSheet(false);
    toast.success(`Theme updated to ${themeId === 'system' ? 'System Default' : themeId}`);
  };

  const handleLangSelect = (langId: 'en' | 'ur' | 'ar') => {
    updateSettings({ language: langId });
    // Apply lang preferences
    document.documentElement.lang = langId;
    if (langId === 'ur') {
      document.documentElement.dir = 'rtl';
      document.documentElement.style.fontFamily = "'Noto Nastaliq Urdu', 'Segoe UI', sans-serif";
    } else if (langId === 'ar') {
      document.documentElement.dir = 'rtl';
      document.documentElement.style.fontFamily = "'Almarai', 'Segoe UI', sans-serif";
    } else {
      document.documentElement.dir = 'ltr';
      document.documentElement.style.fontFamily = '';
    }
    setShowLangSheet(false);
    toast.success(`Language set to ${langId.toUpperCase()}`);
  };

  const menuItems = [
    {
      title: 'Notifications',
      desc: unseenCount > 0 ? `${unseenCount} unread` : 'Recent activity',
      icon: Bell,
      color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
      badge: unseenCount > 0 ? unseenCount : undefined,
      action: () => setShowNotifs(true),
    },
    {
      title: 'Inbox',
      desc: unreadInboxCount > 0 ? `${unreadInboxCount} unread` : 'Partner conversations',
      icon: MessageSquare,
      color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
      badge: unreadInboxCount > 0 ? unreadInboxCount : undefined,
      action: () => setShowInbox(true),
    },
    {
      title: 'Add supplier',
      desc: 'Quick-register a distributor',
      icon: TruckIcon,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      action: () => setShowSupplierSheet(true),
    },
    {
      title: 'Stock-take / Reconcile',
      desc: 'Count batches and post variance',
      icon: ClipboardCheck,
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      action: () => setShowReconcile(true),
    },
    {
      title: 'Suppliers Management',
      desc: 'Track ledger and aged payables',
      icon: Truck,
      color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      action: () => toast.info('To manage suppliers in full detail, please use the desktop portal.')
    },
    {
      title: 'Branches list',
      desc: 'Manage pharmaceutical storage outlets',
      icon: Building,
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      action: () => toast.info('Branch configurations can be managed on the desktop dashboard Settings.')
    },
    {
      title: 'FBR DI compliance',
      desc: 'Digital Invoicing PRAL logs',
      icon: AlertTriangle,
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      action: () => toast.info('FBR submittal audits are accessible via the Sales → FBR module on desktop.')
    }
  ];

  if (showReconcile) {
    return <MobileReconcile onClose={() => setShowReconcile(false)} />;
  }
  if (showNotifs) {
    return <MobileNotifications onClose={() => setShowNotifs(false)} />;
  }
  if (showInbox) {
    return <MobileInbox onClose={() => setShowInbox(false)} />;
  }

  return (
    <div className="space-y-6 pb-20">
      {/* User Header Profile */}
      <Card className="border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-xl shadow-inner border border-emerald-500/20">
            {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('') : 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {currentUser?.name || 'User'}
              </h3>
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-600 text-[9px] font-bold py-0 h-4">
                {currentUser?.role.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{currentUser?.email}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1 font-semibold">
              <MapPin className="w-3 h-3 text-emerald-500" />
              {tenant?.name || 'Main Store branch'}
            </p>
          </div>
        </div>
      </Card>

      {/* Main Settings Quick Toggles */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">
          Preferences
        </h4>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden shadow-sm">
          {/* Theme Row */}
          <button
            onClick={() => setShowThemeSheet(true)}
            className="w-full p-4 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
                <Moon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">Appearance theme</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">
                  Active: {settings.theme === 'system' ? 'System matches phone' : settings.theme}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          {/* Lang Row */}
          <button
            onClick={() => setShowLangSheet(true)}
            className="w-full p-4 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <Languages className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">Language</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {settings.language === 'en' ? 'English (US)' : settings.language === 'ur' ? 'Urdu (اردو)' : 'Arabic (العربية)'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Admin actions list */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">
          Operations
        </h4>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden shadow-sm">
          {menuItems.map((item) => (
            <button
              key={item.title}
              onClick={item.action}
              className="w-full p-4 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', item.color)}>
                  <item.icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{item.title}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">{item.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(item as { badge?: number }).badge != null && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {(item as { badge?: number }).badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* M6 — Shift card. Mirrors the desktop POS chip. */}
      {settings.shiftCloseEnabled && (
        <div className="px-1">
          {shift ? (
            <button
              type="button"
              onClick={handleCloseShift}
              className="w-full p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-between active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-emerald-600" />
                <div className="text-left">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Shift open</p>
                  <p className="text-[10px] text-gray-500">since {new Date(shift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · tap to close</p>
                </div>
              </div>
              <span className="text-[10px] text-emerald-600 font-bold">Rs. {shift.openingCash.toFixed(2)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenShift}
              className="w-full p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-between active:scale-95 transition-transform"
            >
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-amber-600" />
                <div className="text-left">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">No open shift</p>
                  <p className="text-[10px] text-gray-500">Tap to open before taking sales</p>
                </div>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Logout button */}
      <button
        onClick={() => {
          logout();
          toast.success('Logged out successfully');
        }}
        className="w-full h-12 rounded-2xl bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-400 font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
      >
        <LogOut className="w-4.5 h-4.5" />
        Logout
      </button>

      {/* Theme Drawer Bottom Sheet */}
      {showThemeSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Appearance Settings
              </h3>
              <button
                onClick={() => setShowThemeSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {themeOptions.map((opt) => {
                const isSelected = settings.theme === opt.id;
                const OptIcon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleThemeSelect(opt.id as any)}
                    className={cn(
                      'w-full p-4 rounded-2xl border flex items-center justify-between text-left active:scale-98 transition-all',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <OptIcon className="w-5 h-5" />
                      <span className="text-xs">{opt.name}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Language Drawer Bottom Sheet */}
      {showLangSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-4 max-h-[50vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Choose Language
              </h3>
              <button
                onClick={() => setShowLangSheet(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {langOptions.map((opt) => {
                const isSelected = settings.language === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleLangSelect(opt.id as any)}
                    className={cn(
                      'w-full p-4 rounded-2xl border flex items-center justify-between text-left active:scale-98 transition-all',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <span className="text-xs">{opt.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* M8 — Quick-add supplier sheet (mobile). */}
      {showSupplierSheet && (
        <div className="fixed inset-0 z-50 flex flex-end bg-black/60 backdrop-blur-sm">
          <div className="w-full mt-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 rounded-t-3xl shadow-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Add supplier</h3>
              <button onClick={() => setShowSupplierSheet(false)} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 active:scale-90">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 -mt-1">Essential fields. Full credit/NTN/GST editing stays on desktop.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Name</label>
                <Input value={supName} onChange={(e) => setSupName(e.target.value)} className="h-10 rounded-xl" autoFocus />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Contact person</label>
                <Input value={supContact} onChange={(e) => setSupContact(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Phone</label>
                  <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value.replace(/[^0-9+\s-]/g, ''))} inputMode="tel" className="h-10 rounded-xl" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">City</label>
                  <Input value={supCity} onChange={(e) => setSupCity(e.target.value)} className="h-10 rounded-xl" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Payment terms (days)</label>
                <Input value={supTerms} onChange={(e) => setSupTerms(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="h-10 rounded-xl" />
              </div>
            </div>
            <button
              onClick={() => {
                const name = supName.trim();
                if (!name) { toast.error('Name required'); return; }
                const created: Supplier = {
                  id: `s-${Date.now()}`,
                  name,
                  contactPerson: supContact.trim() || name,
                  phone: supPhone.trim() || '—',
                  address: '—',
                  city: supCity.trim() || '—',
                  creditLimit: 0,
                  currentBalance: 0,
                  paymentTerms: parseInt(supTerms, 10) || 0,
                  isActive: true,
                  createdAt: new Date(),
                };
                addSupplier(created);
                toast.success(`Supplier "${name}" added`);
                setShowSupplierSheet(false);
                setSupName(''); setSupContact(''); setSupPhone(''); setSupCity(''); setSupTerms('30');
              }}
              className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-bold active:scale-95"
            >
              Add supplier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
