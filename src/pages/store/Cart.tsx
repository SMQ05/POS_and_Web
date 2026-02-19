import { Link, useNavigate } from 'react-router-dom';
import { useWebStore } from '@/store';
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  ArrowLeft,
  ArrowRight,
  Package,
  Truck,
} from 'lucide-react';

export function Cart() {
  const navigate = useNavigate();
  const cart = useWebStore((s) => s.cart);
  const removeFromCart = useWebStore((s) => s.removeFromCart);
  const updateCartQuantity = useWebStore((s) => s.updateCartQuantity);
  const getCartTotal = useWebStore((s) => s.getCartTotal);

  const { subtotal, deliveryFee, total } = getCartTotal();

  if (cart.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <ShoppingCart className="w-20 h-20 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Your cart is empty</h2>
        <p className="text-gray-500 mt-2">Browse our products and add items to your cart.</p>
        <Link
          to="/store"
          className="inline-flex items-center gap-2 mt-6 bg-emerald-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Shopping Cart ({cart.length} items)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div
              key={item.medicineId}
              className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
            >
              {/* Icon */}
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0">
                <Package className="w-8 h-8 text-white/50" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                <p className="text-sm text-gray-500">{item.strength}</p>
                <p className="text-emerald-600 font-bold mt-1">Rs. {item.price.toLocaleString()}</p>
              </div>

              {/* Quantity */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => updateCartQuantity(item.medicineId, Math.max(1, item.quantity - 1))}
                  className="p-2 hover:bg-gray-50 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateCartQuantity(item.medicineId, Math.min(item.maxQuantity, item.quantity + 1))}
                  className="p-2 hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Total & Delete */}
              <div className="text-right">
                <p className="font-bold text-gray-900">Rs. {(item.price * item.quantity).toLocaleString()}</p>
                <button
                  onClick={() => removeFromCart(item.medicineId)}
                  className="text-sm text-red-500 hover:text-red-600 mt-1 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium">Rs. {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Delivery Fee</span>
                <span className="font-medium">
                  {deliveryFee === 0 ? (
                    <span className="text-emerald-600">FREE</span>
                  ) : (
                    `Rs. ${deliveryFee.toLocaleString()}`
                  )}
                </span>
              </div>
              {deliveryFee > 0 && (
                <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg p-2">
                  <Truck className="w-3.5 h-3.5 inline mr-1" />
                  Add Rs. {(5000 - subtotal).toLocaleString()} more for free delivery
                </p>
              )}
              <div className="border-t pt-3 flex justify-between text-base">
                <span className="font-bold">Total</span>
                <span className="font-bold text-emerald-600">Rs. {total.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/store/checkout')}
              className="w-full mt-6 flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
            >
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </button>

            <Link
              to="/store"
              className="block text-center text-sm text-emerald-600 font-medium mt-3 hover:text-emerald-700"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
