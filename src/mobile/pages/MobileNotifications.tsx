import { useEffect } from 'react';
import { useNotificationStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Bell, Receipt, Wallet, ClipboardCheck, RotateCw, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onClose: () => void;
}

// M5 — Mobile notifications screen. Tap the bell-row in MobileMore to land
// here. Fullscreen list of persisted notifications with dismiss + dismiss-all.
export function MobileNotifications({ onClose }: Props) {
  const notifications = useNotificationStore((s) => s.notifications);
  const loading = useNotificationStore((s) => s.loading);
  const refresh = useNotificationStore((s) => s.refresh);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const dismissAll = useNotificationStore((s) => s.dismissAll);
  const markAllSeen = useNotificationStore((s) => s.markAllSeen);

  useEffect(() => {
    refresh();
    markAllSeen();
  }, [refresh, markAllSeen]);

  const kindIcon = (kind: string) => {
    if (kind === 'sale_return') return <Receipt className="w-4 h-4 text-amber-600" />;
    if (kind === 'payment') return <Wallet className="w-4 h-4 text-blue-600" />;
    if (kind === 'reconcile') return <ClipboardCheck className="w-4 h-4 text-purple-600" />;
    if (kind === 'purchase_return') return <RotateCw className="w-4 h-4 text-red-600" />;
    if (kind === 'wholesale') return <MessageSquare className="w-4 h-4 text-emerald-600" />;
    return <Bell className="w-4 h-4 text-gray-500" />;
  };

  const sevBg = (sev: string) => {
    if (sev === 'critical') return 'bg-red-50 border-red-200 dark:bg-red-900/20';
    if (sev === 'warning') return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20';
    if (sev === 'success') return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20';
    return 'bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800';
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-sm">Notifications</h2>
          <p className="text-[10px] text-gray-500">{notifications.length} active</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </Button>
        {notifications.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => dismissAll()}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">You&apos;re all caught up.</p>
          </div>
        ) : notifications.map((n) => (
          <div key={n.id} className={cn('rounded-2xl border p-3', sevBg(n.severity))}>
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{kindIcon(n.kind)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{n.title}</p>
                {n.body && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{n.body}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[9px] capitalize px-1.5 py-0">
                    {n.kind.replace('_', ' ')}
                  </Badge>
                  <span className="text-[10px] text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
