import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWebStore, useSettingsStore, useWebAuthStore } from '@/store';
import type { WebOrder } from '@/types';
import {
  CreditCard,
  Banknote,
  Smartphone,
  ArrowLeft,
  ShieldCheck,
  Lock,
  Package,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function Checkout() {
  const navigate = useNavigate();
  const cart = useWebStore((s) => s.cart);
  const getCartTotal = useWebStore((s) => s.getCartTotal);
  const placeOrder = useWebStore((s) => s.placeOrder);
  const { settings } = useSettingsStore();
  const { customer, isLoggedIn } = useWebAuthStore();

  const { subtotal, deliveryFee, total } = getCartTotal();

  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    city: customer?.city || 'Lahore',
    notes: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'jazzcash' | 'easypaisa' | 'card'>('cod');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (cart.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Package className="w-20 h-20 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Your cart is empty</h2>
        <Link to="/store" className="inline-flex items-center gap-2 mt-6 text-emerald-600 font-medium hover:text-emerald-700">
          <ArrowLeft className="w-4 h-4" /> Back to Shop
        </Link>
      </div>
    );
  }

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Full name is required';
    if (!form.phone.trim()) errs.phone = 'Phone number is required';
    else if (!/^(\+92|0)?3\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) errs.phone = 'Enter a valid Pakistani phone number';
    if (!form.address.trim()) errs.address = 'Delivery address is required';
    if (!form.city.trim()) errs.city = 'City is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise((r) => setTimeout(r, 1500));

    const order: WebOrder = {
      id: `WEB-${Date.now().toString(36).toUpperCase()}`,
      customerName: form.name.trim(),
      customerPhone: form.phone.trim(),
      customerEmail: form.email.trim() || undefined,
      customerAddress: form.address.trim(),
      customerCity: form.city.trim(),
      items: cart.map((c) => ({
        medicineId: c.medicineId,
        name: c.name,
        quantity: c.quantity,
        price: c.price,
        total: c.price * c.quantity,
      })),
      subtotal,
      deliveryFee,
      total,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'paid',
      orderStatus: 'pending',
      notes: form.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    placeOrder(order);
    toast.success('Order placed successfully!');
    navigate(`/store/order-confirmation/${order.id}`);
    setIsSubmitting(false);
  };

  const paymentOptions = [
    { id: 'cod' as const, label: 'Cash on Delivery', desc: 'Pay when you receive', icon: Banknote, color: 'text-green-600 bg-green-50' },
    ...(settings.enableJazzCash ? [{ id: 'jazzcash' as const, label: 'JazzCash', desc: 'Mobile wallet', icon: Smartphone, color: 'text-red-600 bg-red-50' }] : []),
    ...(settings.enableEasyPaisa ? [{ id: 'easypaisa' as const, label: 'EasyPaisa', desc: 'Mobile wallet', icon: Smartphone, color: 'text-emerald-600 bg-emerald-50' }] : []),
    ...(settings.enableCardPayments ? [{ id: 'card' as const, label: 'Credit/Debit Card', desc: 'Visa, Mastercard', icon: CreditCard, color: 'text-blue-600 bg-blue-50' }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link to="/store/cart" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-emerald-600 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Cart
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-8">Checkout</h1>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Form */}
          <div className="lg:col-span-2 space-y-8">
            {/* Login suggestion for guest users */}
            {!isLoggedIn && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-800">Have an account?</p>
                    <p className="text-xs text-emerald-600">Sign in for faster checkout and order tracking</p>
                  </div>
                </div>
                <Link
                  to="/store/login?redirect=/store/checkout"
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shrink-0"
                >
                  Sign In
                </Link>
              </div>
            )}

            {/* Delivery Info */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Delivery Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-100 outline-none transition-colors',
                      errors.name ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400'
                    )}
                    placeholder="Muhammad Ahmed"
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-100 outline-none transition-colors',
                      errors.phone ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400'
                    )}
                    placeholder="03XX-XXXXXXX"
                  />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-colors"
                    placeholder="email@example.com"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address *</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className={cn(
                      'w-full px-4 py-2.5 rounded-xl border text-sm focus:ring-2 focus:ring-emerald-100 outline-none transition-colors',
                      errors.address ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400'
                    )}
                    placeholder="House #, Street, Area"
                  />
                  {errors.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none bg-white"
                  >
                    {['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala'].map(
                      (c) => <option key={c} value={c}>{c}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-colors"
                    placeholder="Any special instructions..."
                  />
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-5">Payment Method</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {paymentOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id)}
                      className={cn(
                        'flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all',
                        paymentMethod === opt.id
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                          : 'border-gray-100 hover:border-gray-200'
                      )}
                    >
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', opt.color)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                      {paymentMethod === opt.id && (
                        <div className="ml-auto w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm sticky top-24">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>

              <div className="space-y-3 max-h-60 overflow-y-auto mb-4">
                {cart.map((item) => (
                  <div key={item.medicineId} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                    </div>
                    <span className="font-medium text-gray-700 shrink-0 ml-4">
                      Rs. {(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">Rs. {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Delivery</span>
                  <span className="font-medium">
                    {deliveryFee === 0 ? <span className="text-emerald-600">FREE</span> : `Rs. ${deliveryFee}`}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between text-base">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-emerald-600">Rs. {total.toLocaleString()}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-6 flex items-center justify-center gap-2 bg-emerald-600 text-white font-semibold py-3.5 rounded-xl hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-lg shadow-emerald-200"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Place Order — Rs. {total.toLocaleString()}
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-gray-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Secure checkout — your data is protected
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
