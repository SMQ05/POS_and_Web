import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useSalesStore, useInventoryStore, useSupplierStore, useAuthStore, useDashboardStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Flame,
  Plus,
  ArrowRight,
  TrendingUp as TrendUpIcon,
  Receipt,
  Truck
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface MobileDashboardProps {
  onSetActiveTab: (tab: 'dashboard' | 'pos' | 'inventory' | 'sales' | 'more') => void;
}

export function MobileDashboard({ onSetActiveTab }: MobileDashboardProps) {
  const { settings } = useSettingsStore();
  const { sales, getTodaySales, getTodayProfit, getTotalProfit, computeKPIs } = useSalesStore();
  const { medicines, batches, getExpiryRiskReport, getLiveExpiryAlerts, getLiveLowStockAlerts } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  const { currentUser } = useAuthStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds } = useDashboardStore();
  const { t } = useTranslation();

  const role = currentUser?.role ?? 'cashier';
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const canSeeProfit = role === 'owner' || (role === 'manager' && settings.managerCanSeeProfit);

  const todaySales = getTodaySales();
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const todayProfit = getTodayProfit();
  const totalProfit = getTotalProfit();
  const kpis = computeKPIs(batches);
  const expiryRiskReport = getExpiryRiskReport().slice(0, 3);

  // Live computed alerts
  const expiryAlerts = getLiveExpiryAlerts().filter(a => !dismissedExpiryAlertIds.includes(a.id));
  const lowStockAlerts = getLiveLowStockAlerts().filter(a => !dismissedLowStockAlertIds.includes(a.id));
  const criticalExpiry = expiryAlerts.filter(a => a.alertLevel === 'critical').length;
  const totalPayables = suppliers.reduce((sum, s) => sum + s.currentBalance, 0);

  // Business health score
  const healthScore = Math.max(0, Math.min(100,
    50
    + (kpis.grossProfitMarginPercent > 20 ? 20 : kpis.grossProfitMarginPercent)
    - (criticalExpiry * 5)
    - (lowStockAlerts.length * 2)
  ));
  const healthColor = healthScore >= 70 ? 'text-emerald-500' : healthScore >= 40 ? 'text-amber-500' : 'text-red-500';
  const healthBg = healthScore >= 70 ? 'bg-emerald-500/10' : healthScore >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10';

  // Weekly Sales Trend (Last 5 Days to fit nicely on mobile screens)
  const salesData = (() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const s of sales) {
      const key = new Date(s.saleDate).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + s.totalAmount);
    }
    return Array.from(buckets.entries()).map(([key, total]) => ({
      name: DAY_NAMES[new Date(key).getDay()],
      sales: total,
    }));
  })();

  // Sales by Category
  const categoryData = (() => {
    const totals = new Map<string, number>();
    for (const s of sales) {
      for (const it of s.items as Array<{ medicineId: string; total?: number; quantity?: number; unitPrice?: number }>) {
        const med = medicines.find((m) => m.id === it.medicineId);
        const cat = med?.category ?? 'Other';
        const value = it.total ?? (it.quantity ?? 0) * (it.unitPrice ?? 0);
        totals.set(cat, (totals.get(cat) ?? 0) + value);
      }
    }
    const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    if (sum === 0) return [{ name: 'No sales', value: 1 }];
    return Array.from(totals.entries())
      .map(([name, total]) => ({ name, value: Math.round((total / sum) * 100) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  })();

  return (
    <div className="space-y-6 pb-20">
      {/* Greetings */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t('dashboard.title')}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isOwnerOrManager
            ? t('dashboard.welcomeOwner')
            : t('dashboard.welcomeStaff', currentUser?.name ?? 'User')}
        </p>
      </div>

      {/* Quick Action Pills */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onSetActiveTab('pos')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mt-2">New Sale</span>
        </button>

        <button
          onClick={() => onSetActiveTab('inventory')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Package className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 mt-2">Check Stock</span>
        </button>

        <button
          onClick={() => onSetActiveTab('sales')}
          className="flex flex-col items-center justify-center p-3 rounded-2xl bg-purple-500/10 dark:bg-purple-500/20 border border-purple-500/20 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
            <Receipt className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 mt-2">Invoices</span>
        </button>
      </div>

      {/* KPI Cards Carousel/Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today's Sales */}
        <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Sales Today</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {formatCurrency(todayRevenue, settings.currency)}
              </p>
              <span className="text-[10px] text-emerald-600 font-semibold">{todaySales.length} bills</span>
            </div>
          </CardContent>
        </Card>

        {/* Today's Profit or Meds Count */}
        {canSeeProfit ? (
          <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-28">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Today Profit</span>
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(todayProfit, settings.currency)}
                </p>
                <span className="text-[10px] text-gray-400">
                  Margin: {todayRevenue > 0 ? ((todayProfit / todayRevenue) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm">
            <CardContent className="p-4 flex flex-col justify-between h-28">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Active Stock</span>
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                  {medicines.length}
                </p>
                <span className="text-[10px] text-gray-400">
                  {batches.filter(b => b.isActive && b.quantity > 0).length} batches
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Low Stock Alerts */}
        <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Low Stock</span>
              <div className="w-7 h-7 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {lowStockAlerts.length}
              </p>
              <span className="text-[10px] text-red-500 font-semibold">Needs order</span>
            </div>
          </CardContent>
        </Card>

        {/* Expiry Alerts */}
        <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm">
          <CardContent className="p-4 flex flex-col justify-between h-28">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Expiry Alert</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {expiryAlerts.length}
              </p>
              <span className="text-[10px] text-amber-500 font-semibold">{criticalExpiry} critical</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Health Score Card */}
      {isOwnerOrManager && (
        <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className={cn('w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0', healthBg)}>
              <span className={healthColor}>{healthScore}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Health Index</span>
                <span className="text-gray-400">Auto-eval</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                {healthScore >= 70 ? 'Excellent. Operations, expirations and stock are highly efficient.' : 
                 healthScore >= 40 ? 'Healthy. Some low stock and expiry risks need manager action.' : 
                 'Attention required. Severe stockouts or critical expirations resolved urgently.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Sales Charts */}
      {isOwnerOrManager && (
        <Card className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Sales Performance</h3>
            <span className="text-[10px] text-gray-400 font-medium">Last 5 Days</span>
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData} margin={{ left: -10, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-800" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={10} tickLine={false} />
                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} tickFormatter={(v) => `Rs.${v/1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                  formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Revenue']}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={{ fill: '#10b981', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Live Alerts Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">Active Alerts</h3>
          <button
            onClick={() => onSetActiveTab('more')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
          >
            All Alerts <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {expiryAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">{alert.medicineName}</h4>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Batch {alert.batchNumber} • Qty {alert.quantity}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 rounded-full">
                  {alert.daysUntilExpiry}d left
                </span>
              </div>
            </div>
          ))}

          {lowStockAlerts.slice(0, 2).map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-rose-50 dark:bg-rose-500/5 border border-rose-200/50 dark:border-rose-500/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900 dark:text-white">{alert.medicineName}</h4>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Current stock: {alert.currentStock}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-500/20 px-2 py-0.5 rounded-full">
                  Min: {alert.reorderLevel}
                </span>
              </div>
            </div>
          ))}

          {expiryAlerts.length === 0 && lowStockAlerts.length === 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-6">
              All clear! No pending inventory alerts.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
