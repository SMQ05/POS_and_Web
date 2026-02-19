import { useSettingsStore, useWebStore, useAuthStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart,
  Monitor,
  Globe,
  Shield,
  Package,
  ToggleLeft,
  ToggleRight,
  Users,
  Clock,
  CreditCard,
  MapPin,
  Phone,
  TrendingUp,
  DollarSign,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const paymentLabels: Record<string, string> = {
  cod: 'COD',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  card: 'Card',
};

export function SuperAdmin() {
  const { settings, updateSettings } = useSettingsStore();
  const { currentUser } = useAuthStore();
  const orders = useWebStore((s) => s.orders);
  const { t } = useTranslation();

  const isSuperAdmin = currentUser?.role === 'superadmin';

  const toggleModule = (key: 'posEnabled' | 'managementEnabled' | 'webStoreEnabled') => {
    updateSettings({ [key]: !settings[key] });
  };

  const modules = [
    {
      key: 'posEnabled' as const,
      label: 'POS System',
      desc: 'Point of Sale — billing, receipts, cash register',
      icon: ShoppingCart,
      color: 'from-blue-500 to-blue-600',
      enabled: settings.posEnabled,
    },
    {
      key: 'managementEnabled' as const,
      label: 'Management Panel',
      desc: 'Inventory, reports, suppliers, staff, expenses',
      icon: Monitor,
      color: 'from-violet-500 to-violet-600',
      enabled: settings.managementEnabled,
    },
    {
      key: 'webStoreEnabled' as const,
      label: 'Web Store',
      desc: 'Customer-facing online pharmacy storefront',
      icon: Globe,
      color: 'from-emerald-500 to-emerald-600',
      enabled: settings.webStoreEnabled,
    },
  ];

  // Web orders stats
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const pendingOrders = orders.filter((o) => o.orderStatus === 'pending').length;
  const codOrders = orders.filter((o) => o.paymentMethod === 'cod').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className={cn(
            'text-2xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            {t('nav.superAdmin') || 'Super Admin Panel'}
          </h1>
          <p className="text-sm text-gray-500">
            Software platform control — manage modules and web orders
          </p>
        </div>
      </div>

      {/* Module Control */}
      <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>Module Control</CardTitle>
          <CardDescription>Enable or disable system modules for this pharmacy</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.key}
                  className={cn(
                    'relative rounded-xl border-2 p-5 transition-all cursor-pointer',
                    mod.enabled
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900 opacity-60'
                  )}
                  onClick={() => isSuperAdmin && toggleModule(mod.key)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'w-11 h-11 rounded-lg bg-gradient-to-br flex items-center justify-center',
                      mod.color
                    )}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <button
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSuperAdmin) toggleModule(mod.key);
                      }}
                    >
                      {mod.enabled ? (
                        <ToggleRight className="w-8 h-8 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <h3 className={cn(
                    'font-semibold mb-1',
                    settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                  )}>
                    {mod.label}
                  </h3>
                  <p className="text-sm text-gray-500">{mod.desc}</p>
                  <Badge
                    className={cn(
                      'mt-3',
                      mod.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                    )}
                  >
                    {mod.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              );
            })}
          </div>
          {!isSuperAdmin && (
            <p className="text-sm text-amber-600 mt-4 bg-amber-50 p-3 rounded-lg">
              Only the Super Admin can enable or disable platform modules.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Web Orders Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Web Orders', value: totalOrders, icon: Package, color: 'text-blue-600 bg-blue-100' },
          { label: 'Total Revenue', value: `Rs. ${totalRevenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-100' },
          { label: 'Pending Orders', value: pendingOrders, icon: Clock, color: 'text-amber-600 bg-amber-100' },
          { label: 'COD Orders', value: codOrders, icon: CreditCard, color: 'text-purple-600 bg-purple-100' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', stat.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className={cn('text-xl font-bold', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                      {stat.value}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Web Orders Table */}
      <Card className={cn(settings.theme === 'dark' && 'bg-gray-800 border-gray-700')}>
        <CardHeader>
          <CardTitle className={settings.theme === 'dark' ? 'text-white' : ''}>Web Store Orders</CardTitle>
          <CardDescription>All customer orders from the online store</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No web orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Orders from the online store will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn(
                    'border-b',
                    settings.theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
                  )}>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Order ID</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Customer</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Phone</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">City</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Items</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Total</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Payment</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {[...orders].reverse().map((order) => (
                    <tr key={order.id} className={cn(
                      'border-b hover:bg-gray-50/50 transition-colors',
                      settings.theme === 'dark' ? 'border-gray-700 hover:bg-gray-700/50' : ''
                    )}>
                      <td className={cn('py-3 px-2 font-medium', settings.theme === 'dark' ? 'text-white' : 'text-gray-900')}>{order.id}</td>
                      <td className={cn('py-3 px-2', settings.theme === 'dark' ? 'text-gray-300' : '')}>{order.customerName}</td>
                      <td className="py-3 px-2 text-gray-500">{order.customerPhone}</td>
                      <td className="py-3 px-2 text-gray-500">{order.customerCity}</td>
                      <td className="py-3 px-2 text-gray-500">{order.items.length}</td>
                      <td className={cn('py-3 px-2 font-semibold', settings.theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')}>
                        Rs. {order.total.toLocaleString()}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="secondary" className="text-xs">
                          {paymentLabels[order.paymentMethod] ?? order.paymentMethod}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', statusColors[order.orderStatus])}>
                          {order.orderStatus}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-500 text-xs">
                        {new Date(order.createdAt).toLocaleDateString('en-PK', { dateStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
