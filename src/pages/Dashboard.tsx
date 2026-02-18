import { useNavigate } from 'react-router-dom';
import { useSettingsStore, useDashboardStore, useSalesStore, useInventoryStore, useSupplierStore } from '@/store';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const { expiryAlerts, lowStockAlerts } = useDashboardStore();
  const { getTodaySales } = useSalesStore();
  const { medicines } = useInventoryStore();
  const { suppliers } = useSupplierStore();

  const todaySales = getTodaySales();
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);

  const statCards = [
    {
      title: "Today's Sales",
      value: `Rs. ${todayRevenue.toLocaleString()}`,
      change: '+12%',
      trend: 'up',
      icon: ShoppingCart,
      color: 'emerald',
      onClick: () => navigate('/sales'),
    },
    {
      title: 'Total Medicines',
      value: medicines.length.toString(),
      change: '+5',
      trend: 'up',
      icon: Package,
      color: 'blue',
      onClick: () => navigate('/medicines'),
    },
    {
      title: 'Low Stock Items',
      value: lowStockAlerts.filter(a => !a.isResolved).length.toString(),
      change: 'Action needed',
      trend: 'down',
      icon: AlertTriangle,
      color: 'red',
      onClick: () => navigate('/alerts'),
    },
    {
      title: 'Supplier Payables',
      value: `Rs. ${suppliers.reduce((sum, s) => sum + s.currentBalance, 0).toLocaleString()}`,
      change: 'Due soon',
      trend: 'neutral',
      icon: Truck,
      color: 'amber',
      onClick: () => navigate('/suppliers'),
    },
  ];

  const quickActions = [
    { label: 'New Sale', icon: ShoppingCart, path: '/pos', color: 'bg-emerald-500' },
    { label: 'Add Medicine', icon: Package, path: '/medicines', color: 'bg-blue-500' },
    { label: 'Create PO', icon: Receipt, path: '/suppliers', color: 'bg-amber-500' },
    { label: 'View Reports', icon: TrendingUp, path: '/reports', color: 'bg-purple-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            Dashboard
          </h1>
          <p className={cn(
            'text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Welcome back! Here's what's happening today.
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader>
            <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
              Weekly Sales Trend
            </CardTitle>
            <CardDescription>
              Sales performance over the last 7 days
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
              Sales by Category
            </CardTitle>
            <CardDescription>
              Distribution of sales across medicine categories
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

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiry Alerts */}
        <Card className={cn(
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>
                Expiry Alerts
              </CardTitle>
              <CardDescription>
                Medicines nearing expiration
              </CardDescription>
            </div>
            <Badge variant="destructive">
              {expiryAlerts.filter(a => !a.isResolved).length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {expiryAlerts.filter(a => !a.isResolved).slice(0, 3).map((alert) => (
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
                        Batch: {alert.batchNumber}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-sm font-medium',
                      alert.daysUntilExpiry <= 30 ? 'text-red-600' : 'text-amber-600'
                    )}>
                      {alert.daysUntilExpiry} days
                    </p>
                    <p className="text-xs text-gray-500">until expiry</p>
                  </div>
                </div>
              ))}
              {expiryAlerts.filter(a => !a.isResolved).length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  No expiry alerts
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-4 gap-2"
              onClick={() => navigate('/alerts')}
            >
              View All Alerts
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
                Low Stock Alerts
              </CardTitle>
              <CardDescription>
                Items below reorder level
              </CardDescription>
            </div>
            <Badge variant="destructive">
              {lowStockAlerts.filter(a => !a.isResolved).length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockAlerts.filter(a => !a.isResolved).slice(0, 3).map((alert) => (
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
                        Reorder level: {alert.reorderLevel}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-600">
                      {alert.currentStock} left
                    </p>
                    <p className="text-xs text-gray-500">
                      Suggested: {alert.reorderQuantity}
                    </p>
                  </div>
                </div>
              ))}
              {lowStockAlerts.filter(a => !a.isResolved).length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  No low stock alerts
                </p>
              )}
            </div>
            <Button 
              variant="ghost" 
              className="w-full mt-4 gap-2"
              onClick={() => navigate('/inventory')}
            >
              View Inventory
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
