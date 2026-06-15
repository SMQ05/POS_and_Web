import { useState } from 'react';
import { useAuthStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pill, Key, User, Eye, EyeOff, Loader2, Sparkles, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface MobileAuthProps {
  onLoginSuccess: () => void;
}

export function MobileAuth({ onLoginSuccess }: MobileAuthProps) {
  const { login } = useAuthStore();
  const { t } = useTranslation();

  const [isDemo, setIsDemo] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }
    setLoading(true);
    try {
      const ok = await login(email, password);
      if (ok) {
        toast.success('Logged in successfully');
        onLoginSuccess();
      } else {
        toast.error('Invalid credentials. Please try again.');
      }
    } catch {
      toast.error('Network failure. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // Direct session mock injection to bypass network / db seeding dependencies
      const mockUser = {
        id: 'demo-user-owner',
        name: 'Demo Owner',
        email: 'owner@demo-pharmacy.pk',
        role: 'owner',
        permissions: [{ module: '*', actions: ['*'] }],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const mockTenant = {
        id: 'demo-tenant-id',
        companyName: 'Kynex Pharmacloud Demo',
        companyAddress: 'Main Market, Lahore',
        slug: 'demo-pharmacy',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const setSession = useAuthStore.getState().setSession;
      setSession('mock-mobile-session-token', mockUser as any, mockTenant as any);
      
      toast.success('Onboarded via secure Demo workspace');
      onLoginSuccess();
    } catch (err) {
      toast.error('Demo sandbox onboarding failure.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col justify-between px-6 py-8">
      {/* Onboarding header */}
      <div className="text-center pt-8 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white mx-auto shadow-lg shadow-emerald-500/25">
          <Pill className="w-7 h-7 animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center justify-center gap-1.5">
            Kynex Pharmacloud <Sparkles className="w-4 h-4 text-emerald-500" />
          </h1>
          <p className="text-xs text-gray-400 mt-1 max-w-[250px] mx-auto">
            FBR-integrated pharmacy ecosystem and point of sale
          </p>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-5 shadow-xl space-y-4 my-auto">
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
          <Activity className="w-5 h-5 text-emerald-500" />
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">
            Staff Workspace login
          </h3>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-3">
          {/* Email field */}
          <div className="relative">
            <User className="absolute left-3.5 top-3 w-4.5 h-4.5 text-gray-400" />
            <Input
              type="email"
              placeholder="Registered email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-11 bg-gray-50 dark:bg-gray-950 border-gray-150 dark:border-gray-850 rounded-2xl text-sm"
              disabled={loading}
            />
          </div>

          {/* Password field */}
          <div className="relative">
            <Key className="absolute left-3.5 top-3 w-4.5 h-4.5 text-gray-400" />
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 h-11 bg-gray-50 dark:bg-gray-950 border-gray-150 dark:border-gray-850 rounded-2xl text-sm"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-gray-400 hover:text-gray-600 active:scale-95"
            >
              {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
            </button>
          </div>

          <Button
            type="submit"
            className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 mt-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
          <span className="flex-shrink mx-3 text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Or</span>
          <div className="flex-grow border-t border-gray-100 dark:border-gray-800"></div>
        </div>

        {/* Demo login trigger */}
        <button
          type="button"
          onClick={handleDemoLogin}
          className="w-full h-11 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-98 transition-transform"
          disabled={loading}
        >
          Explore Sandbox Demo
        </button>
      </div>

      {/* Footer */}
      <div className="text-center text-[10px] text-gray-400">
        <p>© 2026 Kynex Solutions Private Limited.</p>
        <p className="mt-0.5">Compliant with July-2025 PRAL DI API specs.</p>
      </div>
    </div>
  );
}
