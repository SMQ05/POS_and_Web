import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useWebStore, useSettingsStore } from '@/store';
import {
  ShoppingCart,
  Search,
  Menu,
  X,
  Pill,
  Phone,
  Mail,
  MapPin,
  Truck,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function StoreLayout() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const getCartItemCount = useWebStore((s) => s.getCartItemCount);
  const cartCount = getCartItemCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/store?search=${encodeURIComponent(searchQuery.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top Bar */}
      <div className="bg-emerald-700 text-white text-sm py-2">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Free delivery on orders over Rs. 5,000
            </span>
            <span className="hidden md:flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Same-day delivery in Lahore
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <a href={`tel:${settings.companyPhone}`} className="flex items-center gap-1.5 hover:text-emerald-200 transition-colors">
              <Phone className="w-3.5 h-3.5" />
              {settings.companyPhone}
            </a>
            <a href={`mailto:${settings.companyEmail}`} className="flex items-center gap-1.5 hover:text-emerald-200 transition-colors">
              <Mail className="w-3.5 h-3.5" />
              {settings.companyEmail}
            </a>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link to="/store" className="flex items-center gap-2.5 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                <Pill className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-bold text-xl text-gray-900 leading-tight">{settings.companyName || 'PharmaPOS'}</h1>
                <p className="text-xs text-gray-500 -mt-0.5">Online Pharmacy</p>
              </div>
            </Link>

            {/* Search Bar (Desktop) */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search medicines, health products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none text-sm transition-all"
                />
              </div>
            </form>

            {/* Nav + Cart */}
            <div className="flex items-center gap-3">
              <nav className="hidden lg:flex items-center gap-1">
                <Link to="/store" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors">
                  Shop
                </Link>
                <Link to="/store/track" className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors">
                  Track Order
                </Link>
              </nav>

              <button
                onClick={() => navigate('/store/cart')}
                className="relative p-2.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <ShoppingCart className="w-5 h-5 text-gray-700" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-emerald-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              <Link
                to="/login"
                className="hidden lg:inline-flex px-4 py-2 text-sm font-medium text-emerald-700 border border-emerald-200 rounded-full hover:bg-emerald-50 transition-colors"
              >
                Admin Login
              </Link>

              {/* Mobile Menu Button */}
              <button
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="md:hidden pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search medicines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-full border border-gray-200 focus:border-emerald-400 outline-none text-sm"
              />
            </div>
          </form>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-white px-4 py-3 space-y-1">
            <Link to="/store" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50">Shop</Link>
            <Link to="/store/track" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50">Track Order</Link>
            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-emerald-600 rounded-lg hover:bg-emerald-50">Admin Login</Link>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300">
        {/* Trust Badges */}
        <div className="border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-900/50 rounded-xl flex items-center justify-center">
                <Truck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Fast Delivery</p>
                <p className="text-xs text-gray-400">Same-day in Lahore, 2-3 days nationwide</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-900/50 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">100% Genuine</p>
                <p className="text-xs text-gray-400">All products are verified authentic</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-900/50 rounded-xl flex items-center justify-center">
                <Phone className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">24/7 Support</p>
                <p className="text-xs text-gray-400">Pharmacist consultation available</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Content */}
        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
                <Pill className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-white">{settings.companyName || 'PharmaPOS'}</span>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Your trusted online pharmacy in Pakistan. We deliver genuine medicines right to your doorstep.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link to="/store" className="text-sm hover:text-emerald-400 transition-colors">Shop All</Link></li>
              <li><Link to="/store/cart" className="text-sm hover:text-emerald-400 transition-colors">My Cart</Link></li>
              <li><Link to="/store/track" className="text-sm hover:text-emerald-400 transition-colors">Track Order</Link></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wider">Categories</h3>
            <ul className="space-y-2">
              <li><Link to="/store?cat=tablets" className="text-sm hover:text-emerald-400 transition-colors">Tablets</Link></li>
              <li><Link to="/store?cat=syrups" className="text-sm hover:text-emerald-400 transition-colors">Syrups</Link></li>
              <li><Link to="/store?cat=creams" className="text-sm hover:text-emerald-400 transition-colors">Creams & Ointments</Link></li>
              <li><Link to="/store?cat=supplements" className="text-sm hover:text-emerald-400 transition-colors">Supplements</Link></li>
              <li><Link to="/store?cat=personal_care" className="text-sm hover:text-emerald-400 transition-colors">Personal Care</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-3 text-sm uppercase tracking-wider">Contact Us</h3>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                {settings.companyAddress || 'Main Market, Lahore'}
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                {settings.companyPhone}
              </li>
              <li className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                {settings.companyEmail}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
            <p>© {new Date().getFullYear()} {settings.companyName || 'PharmaPOS Pakistan'}. All rights reserved.</p>
            <p>Licensed Pharmacy — DRAP Registered</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
