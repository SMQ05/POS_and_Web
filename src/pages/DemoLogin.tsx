import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pill, Eye, EyeOff, Lock, Mail, FlaskConical } from 'lucide-react';
import { loginWithPassword } from '@/lib/backend';

const DEMO_SLUG = 'demo-pharmacy';

const DEMO_ROLES = [
  { role: 'Owner', email: 'owner@demo-pharmacy.pk', password: 'Demo1234!', color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-800' },
  { role: 'Manager', email: 'manager@demo-pharmacy.pk', password: 'Demo1234!', color: 'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-800' },
  { role: 'Cashier', email: 'cashier@demo-pharmacy.pk', password: 'Demo1234!', color: 'bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-800' },
  { role: 'Pharmacist', email: 'pharmacist@demo-pharmacy.pk', password: 'Demo1234!', color: 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-800' },
];

export function DemoLogin() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingRole, setLoadingRole] = useState('');
  const [error, setError] = useState('');

  const doLogin = async (e: string, p: string, role = '') => {
    setError('');
    setIsLoading(true);
    if (role) setLoadingRole(role);
    try {
      const session = await loginWithPassword(e, p, DEMO_SLUG);
      setSession(session.token, session.user, session.tenant);
      navigate('/dashboard');
    } catch {
      setError('Demo login failed. Make sure the demo tenant is set up.');
    } finally {
      setIsLoading(false);
      setLoadingRole('');
    }
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    doLogin(email, password);
  };

  const quickLogin = (r: typeof DEMO_ROLES[0]) => {
    setEmail(r.email);
    setPassword(r.password);
    doLogin(r.email, r.password, r.role);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-violet-50 to-indigo-100">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-600 mb-4 shadow-lg">
            <Pill className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Kynex Pharmacloud</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <Badge className="bg-violet-100 text-violet-700 border-violet-200 gap-1">
              <FlaskConical className="w-3 h-3" />
              Demo Environment
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Explore the full system — no real data, no commitment.
          </p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-center">Quick Access</CardTitle>
            <CardDescription className="text-center text-xs">
              Click a role to log in instantly with demo credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Quick role buttons */}
            <div className="grid grid-cols-2 gap-3">
              {DEMO_ROLES.map((r) => (
                <button
                  key={r.role}
                  onClick={() => quickLogin(r)}
                  disabled={isLoading}
                  className={cn(
                    'flex flex-col items-start p-3 rounded-xl border text-sm font-medium transition-all duration-150 disabled:opacity-50',
                    r.color
                  )}
                >
                  <span className="font-semibold">{r.role}</span>
                  <span className="text-xs font-normal opacity-70 truncate w-full">{r.email}</span>
                  {loadingRole === r.role && (
                    <span className="text-xs mt-0.5 opacity-60">Logging in…</span>
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">or enter manually</span>
              </div>
            </div>

            {/* Manual form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center">
                  {error}
                </div>
              )}
              <div>
                <Label htmlFor="d-email" className="text-xs mb-1 block">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="d-email"
                    type="email"
                    placeholder="owner@demo-pharmacy.pk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="d-pw" className="text-xs mb-1 block">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="d-pw"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Demo1234!"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {isLoading && !loadingRole ? 'Logging in…' : 'Log In to Demo'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-1 text-center text-xs text-gray-500 pt-0">
            <p>Demo data resets periodically. Not for real pharmacy use.</p>
            <p>
              Ready to go live?{' '}
              <Link to="/signup" className="text-emerald-600 hover:underline font-medium">
                Start your free trial
              </Link>
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-5">
          Real pharmacy login →{' '}
          <Link to="/login" className="text-gray-500 hover:underline">
            pos.kynexsolutions.com/login
          </Link>
        </p>
      </div>
    </div>
  );
}
