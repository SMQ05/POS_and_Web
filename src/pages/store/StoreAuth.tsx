import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useWebAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import {
  Pill,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';

// Simple Google icon SVG as component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

type AuthMode = 'login' | 'signup';

export function StoreAuth() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/store';
  const navigate = useNavigate();
  const { login, signup, googleLogin } = useWebAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (mode === 'signup' && !form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 6) errs.password = 'Minimum 6 characters';
    if (mode === 'signup' && form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (mode === 'login') {
      const ok = login(form.email.trim(), form.password);
      if (ok) {
        toast.success('Welcome back!');
        navigate(redirectTo);
      } else {
        setErrors({ email: 'No account found with this email. Please sign up.' });
      }
    } else {
      const ok = signup(form.name.trim(), form.email.trim(), form.password, form.phone.trim() || undefined);
      if (ok) {
        toast.success('Account created successfully!');
        navigate(redirectTo);
      } else {
        setErrors({ email: 'An account with this email already exists.' });
      }
    }
  };

  const handleGoogleLogin = () => {
    // Simulate Google OAuth — in production this would open Google's OAuth flow
    const mockName = 'Google User';
    const mockEmail = 'user@gmail.com';
    googleLogin(mockName, mockEmail);
    toast.success('Signed in with Google!');
    navigate(redirectTo);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top strip */}
      <div className="bg-emerald-700 text-white text-sm py-2">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <Link to="/store" className="flex items-center gap-2 hover:text-emerald-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Store
          </Link>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <Link to="/store" className="inline-flex items-center gap-2.5">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <Pill className="w-6 h-6 text-white" />
              </div>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">
              {mode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {mode === 'login' ? 'Sign in to your account to continue' : 'Join to track orders and checkout faster'}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            {/* Google Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              <GoogleIcon className="w-5 h-5" />
              Continue with Google
            </button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-gray-400">or continue with email</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={cn(
                        'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                        errors.name ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
                      )}
                      placeholder="Muhammad Ahmed"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={cn(
                      'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                      errors.email ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
                    )}
                    placeholder="email@example.com"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-colors"
                      placeholder="03XX-XXXXXXX"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={cn(
                      'w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                      errors.password ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
                    )}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      className={cn(
                        'w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition-colors',
                        errors.confirmPassword ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
                      )}
                      placeholder="••••••••"
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm"
              >
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            {/* Toggle mode */}
            <p className="text-center text-sm text-gray-500 mt-6">
              {mode === 'login' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setErrors({}); }}
                    className="text-emerald-600 font-medium hover:text-emerald-700"
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrors({}); }}
                    className="text-emerald-600 font-medium hover:text-emerald-700"
                  >
                    Sign In
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Guest notice */}
          <p className="text-center text-xs text-gray-400 mt-4">
            You can also <Link to="/store/checkout" className="text-emerald-600 hover:underline">checkout as guest</Link> without signing in.
          </p>
        </div>
      </div>
    </div>
  );
}
