import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useDashboardStore, useSalesStore, useInventoryStore, useSupplierStore, useAuthStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn, formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { UnpaidBillsSlider } from '@/components/UnpaidBillsSlider';
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Truck,
  Receipt,
  ArrowRight,
  Calendar,
  DollarSign,
  Activity,
  Flame,
  BarChart3,
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
  Cell,
} from 'recharts';

const salesData = [
  { name: 'Mon', sales: 45000 },
  { name: 'Tue', sales: 52000 },
  { name: 'Wed', sales: 48000 },
  { name: 'Thu', sales: 61000 },
  { name: 'Fri', sales: 55000 },
  { name: 'Sat', sales: 67000 },
  { name: 'Sun', sales: 42000 },
];

const categoryData = [
  { name: 'Tablets', value: 35 },
  { name: 'Syrups', value: 25 },
  { name: 'Injections', value: 15 },
  { name: 'Creams', value: 10 },
  { name: 'Others', value: 15 },
];

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function Dashboard() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const { dismissedExpiryAlertIds, dismissedLowStockAlertIds } = useDashboardStore();
  const { getTodaySales, getTodayProfit, getTotalProfit, computeKPIs } = useSalesStore();
  const { medicines, batches, getExpiryRiskReport, getLiveExpiryAlerts, getLiveLowStockAlerts } = useInventoryStore();
  const { suppliers } = useSupplierStore();
  const { currentUser } = useAuthStore();
  const { t, isRTL } = useTranslation();

  const role = currentUser?.role ?? 'cashier';
  const isOwnerOrManager = role === 'owner' || role === 'manager';
  const canSeeProfit = role === 'owner' || (role === 'manager' && settings.managerCanSeeProfit);

  const todaySales = getTodaySales();
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);
  const todayProfit = getTodayProfit();
  const totalProfit = getTotalProfit();
  const kpis = computeKPIs(batches);
  const expiryRiskReport = getExpiryRiskReport().slice(0, 5);

  // Live computed alerts
  const expiryAlerts = getLiveExpiryAlerts().filter(a => !dismissedExpiryAlertIds.includes(a.id));
  const lowStockAlerts = getLiveLowStockAlerts().filter(a => !dismissedLowStockAlertIds.includes(a.id));

  const criticalExpiry = expiryAlerts.filter(a => a.alertLevel === 'critical').length;
  const totalPayables = suppliers.reduce((sum, s) => sum + s.currentBalance, 0);

  // Business health score (0–100)
  const healthScore = Math.max(0, Math.min(100,
    50
    + (kpis.grossProfitMarginPercent > 20 ? 20 : kpis.grossProfitMarginPercent)
    - (criticalExpiry * 5)
    - (lowStockAlerts.length * 2)
  ));
  const healthColor = healthScore >= 70 ? 'text-emerald-500' : healthScore >= 40 ? 'text-amber-500' : 'text-red-500';
  const healthBg = healthScore >= 70 ? 'bg-emerald-100' : healthScore >= 40 ? 'bg-amber-100' : 'bg-red-100';

  // ─── Stat cards: cashier sees only sales/stock-relevant cards ───
  const allStatCards = [
    {
      title: t('dashboard.todaySales'),
      value: formatCurrency(todayRevenue, settings.currency),
      change: t('dashboard.transactions', todaySales.length),
      trend: 'up',
      icon: ShoppingCart,
      color: 'emerald',
      onClick: () => navigate('/sales'),
      roles: ['owner', 'manager', 'cashier', 'salesman', 'pharmacist', 'accountant'],
    },
    {
      title: t('dashboard.todayProfit'),
      value: formatCurrency(todayProfit, settings.currency),
      change: todayRevenue > 0 ? t('dashboard.margin', ((todayProfit / todayRevenue) * 100).toFixed(1)) : '--',
      trend: todayProfit > 0 ? 'up' : 'neutral',
      icon: DollarSign,
      color: 'emerald',
      onClick: () => navigate('/reports'),
      roles: ['owner', ...(settings.managerCanSeeProfit ? ['manager'] : []), 'accountant'],
    },
    {
      title: t('dashboard.totalMedicines'),
      value: medicines.length.toString(),
      change: t('dashboard.activeBatches', batches.filter(b => b.isActive && b.quantity > 0).length),
      trend: 'up',
      icon: Package,
      color: 'blue',
      onClick: () => navigate('/medicines'),
      roles: ['owner', 'manager', 'pharmacist'],
    },
    {
      title: t('dashboard.expiryAlerts'),
      value: expiryAlerts.length.toString(),
      change: criticalExpiry > 0 ? t('dashboard.critical', criticalExpiry) : t('dashboard.allClear'),
      trend: criticalExpiry > 0 ? 'down' : 'up',
      icon: AlertTriangle,
      color: criticalExpiry > 0 ? 'red' : 'emerald',
      onClick: () => navigate('/alerts'),
      roles: ['owner', 'manager', 'pharmacist'],
    },
    {
      title: t('dashboard.lowStockItems'),
      value: lowStockAlerts.length.toString(),
      change: t('dashboard.actionNeeded'),
      trend: 'down',
      icon: TrendingDown,
      color: 'red',
      onClick: () => navigate('/alerts'),
      roles: ['owner', 'manager', 'pharmacist'],
    },
    {
      title: t('dashboard.supplierPayables'),
      value: formatCurrency(totalPayables, settings.currency),
      change: t('dashboard.dueSoon'),
      trend: 'neutral',
      icon: Truck,
      color: 'amber',
      onClick: () => navigate('/suppliers'),
      roles: ['owner', 'manager', 'accountant'],
    },
    {
      title: t('dashboard.grossProfitMargin'),
      value: `${kpis.grossProfitMarginPercent.toFixed(1)}%`,
      change: t('dashboard.totalProfit', formatCurrency(totalProfit, settings.currency)),
      trend: kpis.grossProfitMarginPercent > 15 ? 'up' : 'down',
      icon: TrendingUp,
      color: kpis.grossProfitMarginPercent > 15 ? 'emerald' : 'red',
      onClick: () => navigate('/reports'),
      roles: ['owner', ...(settings.managerCanSeeProfit ? ['manager'] : [])],
    },
    {
      title: t('dashboard.inventoryTurnover'),
      value: `${kpis.inventoryTurnoverRate.toFixed(1)}x`,
      change: t('dashboard.rate60d'),
      trend: kpis.inventoryTurnoverRate > 1 ? 'up' : 'neutral',
      icon: BarChart3,
      color: 'blue',
      onClick: () => navigate('/reports'),
      roles: ['owner', 'manager'],
    },
  ];

  const statCards = allStatCards.filter(c => c.roles.includes(role));

  // ─── Quick actions: role-gated ───
  const allQuickActions = [
    { label: t('dashboard.quickActions.newSale'), icon: ShoppingCart, path: '/pos', color: 'bg-emerald-500', roles: ['owner', 'manager', 'cashier', 'salesman'] },
    { label: t('dashboard.quickActions.addMedicine'), icon: Package, path: '/medicines', color: 'bg-blue-500', roles: ['owner', 'manager', 'pharmacist'] },
    { label: t('dashboard.quickActions.createPO'), icon: Receipt, path: '/suppliers', color: 'bg-amber-500', roles: ['owner', 'manager'] },
    { label: t('dashboard.quickActions.viewReports'), icon: TrendingUp, path: '/reports', color: 'bg-purple-500', roles: ['owner', 'manager', 'accountant'] },
  ];

  const quickActions = allQuickActions.filter(a => a.roles.includes(role));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('dashboard.title')}
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            {isOwnerOrManager
              ? t('dashboard.welcomeOwner')
              : t('dashboard.welcomeStaff', currentUser?.name ?? 'User')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Calendar className="w-3 h-3" />
            {new Date().toLocaleDateString('en-PK', { 
              weekday: 'short', 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </Badge>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className={cn(
              'h-auto py-4 flex flex-col items-center gap-2 hover:bg-gray-50',
              settings.theme === 'dark' && 'hover:bg-gray-800'
            )}
            onClick={() => navigate(action.path)}
          >
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', action.color)}>
              <action.icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-sm font-medium">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Unpaid Bills Slider — cashier & salesman */}
      {(role === 'cashier' || role === 'salesman') && (
        <UnpaidBillsSlider />
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card 
            key={stat.title} 
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
            )}
            onClick={stat.onClick}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className={cn(
                    'text-sm font-medium',
                    settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  )}>
                    {stat.title}
                  </p>
                  <p className={cn(
                    'text-2xl font-bold mt-1',
                    settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                  )}>
                    {stat.value}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    {stat.trend === 'up' ? (
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                    ) : stat.trend === 'down' ? (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    ) : null}
                    <span className={cn(
                      'text-xs',
                      stat.trend === 'up' ? 'text-emerald-500' : 
                      stat.trend === 'down' ? 'text-red-500' : 'text-gray-500'
                    )}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center',
                  stat.color === 'emerald' && 'bg-emerald-100',
                  stat.color === 'blue' && 'bg-blue-100',
                  stat.color === 'red' && 'bg-red-100',
                  stat.color === 'amber' && 'bg-amber-100',
                )}>
                  <stat.icon className={cn(
                    'w-6 h-6',
                    stat.color === 'emerald' && 'text-emerald-600',
                    stat.color === 'blue' && 'text-blue-600',
                    stat.color === 'red' && 'text-red-600',
                    stat.color === 'amber' && 'text-amber-600',
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Business Health Score + Expiry Risk Row — owner/manager only */}
      {isOwnerOrManager && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Business Health Score */}
        <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
              {t('dashboard.healthScore')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className={cn('w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0', healthBg)}>
                <span className={healthColor}>{healthScore}</span>
              </div>
              <div className="flex-1 space-y-3">
                {canSeeProfit && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{t('dashboard.profitMargin')}</span>
                    <span className="font-medium">{kpis.grossProfitMarginPercent.toFixed(1)}%</span>
                  </div>
                  <Progress value={Math.min(100, kpis.grossProfitMarginPercent * 3)} className="h-2" />
                </div>
                )}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{t('dashboard.stockHealth')}</span>
                    <span className="font-medium">{Math.max(0, 100 - lowStockAlerts.length * 10)}%</span>
                  </div>
                  <Progress value={Math.max(0, 100 - lowStockAlerts.length * 10)} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>{t('dashboard.expiryRisk')}</span>
                    <span className="font-medium text-red-500">{t('dashboard.critical', criticalExpiry)}</span>
                  </div>
                  <Progress value={Math.max(0, 100 - criticalExpiry * 15)} className="h-2" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expiry Risk Dashboard */}
        <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-500" />
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                {t('dashboard.expiryRiskDashboard')}
              </CardTitle>
            </div>
            <Badge variant="destructive">{t('dashboard.batchesAtRisk', expiryRiskReport.length)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiryRiskReport.length === 0 ? (
                <p className="text-center text-gray-500 py-4">{t('dashboard.noExpiryRisk')}</p>
              ) : (
                expiryRiskReport.map((r) => (
                  <div key={r.batchId} className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2',
                    settings.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                  )}>
                    <div>
                      <p className={cn('font-medium text-sm', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                        {r.medicineName}
                      </p>
                      <p className="text-xs text-gray-500">{t('dashboard.batch')}: {r.batchNumber} · {t('dashboard.qty')}: {r.quantity}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="flex items-center gap-2">
                        <Progress value={r.riskPercent} className="h-1.5 w-16" />
                        <span className={cn(
                          'text-xs font-medium',
                          r.riskPercent >= 80 ? 'text-red-600' : r.riskPercent >= 50 ? 'text-amber-600' : 'text-blue-600'
                        )}>
                          {r.riskPercent}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{r.daysUntilExpiry}d · Loss: Rs.{r.potentialLoss.toFixed(0)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Button variant="ghost" className="w-full mt-3 gap-2" onClick={() => navigate('/alerts')}>
              {t('dashboard.viewFullReport')} <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Charts Row — owner/manager only */}
      {isOwnerOrManager && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader>
            <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
              {t('dashboard.weeklySalesTrend')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.salesPerformance')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={settings.theme === 'dark' ? '#374151' : '#e5e7eb'} />
                  <XAxis 
                    dataKey="name" 
                    stroke={settings.theme === 'dark' ? '#9ca3af' : '#6b7280'}
                  />
                  <YAxis 
                    stroke={settings.theme === 'dark' ? '#9ca3af' : '#6b7280'}
                    tickFormatter={(value) => `Rs.${value/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: settings.theme === 'dark' ? '#1f2937' : '#fff',
                      border: `1px solid ${settings.theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                    }}
                    formatter={(value: number) => [`Rs. ${value.toLocaleString()}`, 'Sales']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader>
            <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
              {t('dashboard.salesByCategory')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.salesByCategoryDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: settings.theme === 'dark' ? '#1f2937' : '#fff',
                      border: `1px solid ${settings.theme === 'dark' ? '#374151' : '#e5e7eb'}`,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {categoryData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className={cn(
                    'text-sm',
                    settings.theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
                  )}>
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiry Alerts */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                {t('dashboard.expiryAlertsTitle')}
              </CardTitle>
              <CardDescription>
                {t('dashboard.medicinesNearingExpiry')}
              </CardDescription>
            </div>
            <Badge variant="destructive">
              {expiryAlerts.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiryAlerts.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id} 
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    settings.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      alert.daysUntilExpiry <= 30 ? 'bg-red-100' : 'bg-amber-100'
                    )}>
                      <AlertTriangle className={cn(
                        'w-5 h-5',
                        alert.daysUntilExpiry <= 30 ? 'text-red-600' : 'text-amber-600'
                      )} />
                    </div>
                    <div>
                      <p className={cn(
                        'font-medium',
                        settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                      )}>
                        {alert.medicineName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {t('dashboard.batch')}: {alert.batchNumber}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-sm font-medium',
                      alert.daysUntilExpiry <= 30 ? 'text-red-600' : 'text-amber-600'
                    )}>
                      {t('dashboard.days', alert.daysUntilExpiry)}
                    </p>
                    <p className="text-xs text-gray-500">{t('dashboard.untilExpiry')}</p>
                  </div>
                </div>
              ))}
              {expiryAlerts.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  {t('dashboard.noExpiryAlerts')}
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-4 gap-2"
              onClick={() => navigate('/alerts')}
            >
              {t('dashboard.viewAllAlerts')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                {t('dashboard.lowStockAlertsTitle')}
              </CardTitle>
              <CardDescription>
                {t('dashboard.itemsBelowReorder')}
              </CardDescription>
            </div>
            <Badge variant="destructive">
              {lowStockAlerts.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockAlerts.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id} 
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    settings.theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                      <Package className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className={cn(
                        'font-medium',
                        settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                      )}>
                        {alert.medicineName}
                      </p>
                      <p className="text-sm text-gray-500">
                        {t('dashboard.reorderLevel', alert.reorderLevel)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">
                      {t('dashboard.left', alert.currentStock)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t('dashboard.suggested', alert.reorderQuantity)}
                    </p>
                  </div>
                </div>
              ))}
              {lowStockAlerts.length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  {t('dashboard.noLowStockAlerts')}
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-4 gap-2"
              onClick={() => navigate('/inventory')}
            >
              {t('dashboard.viewInventory')}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
