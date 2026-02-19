import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWebStore } from '@/store';
import { Search, Package, ArrowLeft, Clock, CheckCircle, Truck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusSteps = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered'] as const;
const statusIcons: Record<string, typeof Clock> = {
  pending: Clock,
  confirmed: CheckCircle,
  preparing: Package,
  shipped: Truck,
  delivered: CheckCircle,
  cancelled: XCircle,
};
const statusLabels: Record<string, string> = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function TrackOrder() {
  const orders = useWebStore((s) => s.orders);
  const [query, setQuery] = useState('');
  const [foundOrder, setFoundOrder] = useState<typeof orders[0] | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toUpperCase();
    const order = orders.find((o) => o.id.toUpperCase() === q || o.customerPhone.includes(q));
    if (order) {
      setFoundOrder(order);
      setNotFound(false);
    } else {
      setFoundOrder(null);
      setNotFound(true);
    }
  };

  const currentStepIndex = foundOrder
    ? foundOrder.orderStatus === 'cancelled'
      ? -1
      : statusSteps.indexOf(foundOrder.orderStatus as any)
    : -1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link to="/store" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-emerald-600 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Shop
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Track Your Order</h1>
      <p className="text-gray-500 mb-8">Enter your order ID or phone number to check order status.</p>

      <form onSubmit={handleSearch} className="flex gap-3 mb-10">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Order ID (e.g. WEB-XXXXX) or phone number"
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Track
        </button>
      </form>

      {notFound && (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700">Order not found</h3>
          <p className="text-sm text-gray-500 mt-1">Please check your order ID and try again.</p>
        </div>
      )}

      {foundOrder && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Order ID</p>
              <p className="font-bold text-gray-900">{foundOrder.id}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Placed on</p>
              <p className="font-medium text-gray-900">
                {new Date(foundOrder.createdAt).toLocaleDateString('en-PK', { dateStyle: 'medium' })}
              </p>
            </div>
          </div>

          {/* Status Timeline */}
          {foundOrder.orderStatus !== 'cancelled' ? (
            <div className="p-6">
              <div className="flex items-center justify-between">
                {statusSteps.map((step, i) => {
                  const Icon = statusIcons[step];
                  const isActive = i <= currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  return (
                    <div key={step} className="flex flex-col items-center flex-1 relative">
                      {i > 0 && (
                        <div className={cn(
                          'absolute top-5 h-0.5 -left-1/2 right-1/2',
                          i <= currentStepIndex ? 'bg-emerald-500' : 'bg-gray-200'
                        )} />
                      )}
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center z-10 border-2',
                        isActive ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-gray-200 text-gray-400',
                        isCurrent && 'ring-4 ring-emerald-100'
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={cn(
                        'text-xs mt-2 font-medium',
                        isActive ? 'text-emerald-700' : 'text-gray-400'
                      )}>
                        {statusLabels[step]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
              <p className="font-semibold text-red-600">Order Cancelled</p>
            </div>
          )}

          {/* Items */}
          <div className="p-6 border-t">
            <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
            {foundOrder.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm py-2">
                <span className="text-gray-700">{item.name} × {item.quantity}</span>
                <span className="font-medium">Rs. {item.total.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-emerald-600">Rs. {foundOrder.total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
