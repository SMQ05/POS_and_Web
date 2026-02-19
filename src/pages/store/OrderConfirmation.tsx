import { useParams, Link } from 'react-router-dom';
import { useWebStore } from '@/store';
import {
  CheckCircle,
  Package,
  MapPin,
  Phone,
  CreditCard,
  ArrowRight,
  Printer,
} from 'lucide-react';

const paymentLabels: Record<string, string> = {
  cod: 'Cash on Delivery',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  card: 'Credit/Debit Card',
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  preparing: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function OrderConfirmation() {
  const { orderId } = useParams<{ orderId: string }>();
  const orders = useWebStore((s) => s.orders);
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Package className="w-20 h-20 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Order not found</h2>
        <p className="text-gray-500 mt-2">The order you're looking for doesn't exist.</p>
        <Link to="/store" className="inline-flex items-center gap-2 mt-6 text-emerald-600 font-medium hover:text-emerald-700">
          Back to Shop <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      {/* Success Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-5">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Order Placed Successfully!</h1>
        <p className="text-gray-500 mt-2">Thank you for your order. We'll send you updates via SMS.</p>
        <div className="inline-flex items-center gap-2 mt-4 bg-gray-100 rounded-full px-5 py-2">
          <span className="text-sm text-gray-500">Order ID:</span>
          <span className="font-bold text-gray-900">{order.id}</span>
        </div>
      </div>

      {/* Order Details Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Status */}
        <div className="p-6 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Order Status</p>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold capitalize ${statusColors[order.orderStatus]}`}>
                {order.orderStatus}
              </span>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Payment</p>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold capitalize ${
                order.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {order.paymentStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="p-6 border-b">
          <h3 className="font-semibold text-gray-900 mb-4">Items Ordered</h3>
          <div className="space-y-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <div>
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-gray-500">Qty: {item.quantity} × Rs. {item.price.toLocaleString()}</p>
                </div>
                <span className="font-semibold">Rs. {item.total.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="border-t mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>Rs. {order.subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Delivery</span>
              <span>{order.deliveryFee === 0 ? 'FREE' : `Rs. ${order.deliveryFee}`}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2">
              <span>Total</span>
              <span className="text-emerald-600">Rs. {order.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Delivery & Payment Info */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" /> Delivery Details
            </h3>
            <div className="text-sm space-y-1 text-gray-600">
              <p className="font-medium text-gray-900">{order.customerName}</p>
              <p>{order.customerAddress}</p>
              <p>{order.customerCity}</p>
              <p className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {order.customerPhone}
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" /> Payment Method
            </h3>
            <p className="text-sm text-gray-600">{paymentLabels[order.paymentMethod] ?? order.paymentMethod}</p>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(order.createdAt).toLocaleString('en-PK', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          </div>
        </div>

        {/* Estimated Delivery */}
        <div className="p-6 bg-emerald-50 border-t">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">Estimated Delivery</p>
              <p className="text-sm text-emerald-600">
                {order.customerCity === 'Lahore'
                  ? 'Same day or next business day'
                  : '2-3 business days'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <Link
          to="/store"
          className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Continue Shopping <ArrowRight className="w-4 h-4" />
        </Link>
        <button
          onClick={() => window.print()}
          className="flex-1 inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition-colors"
        >
          <Printer className="w-4 h-4" /> Print Order
        </button>
      </div>
    </div>
  );
}
