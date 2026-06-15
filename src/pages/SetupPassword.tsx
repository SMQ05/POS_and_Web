import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams, Link } from 'react-router-dom';
import { Pill, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store';
import { apiRequest } from '@/lib/backend';

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ['', 'bg-red-400', 'bg-amber-400', 'bg-yellow-400', 'bg-emerald-500'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= score ? colors[score] : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className={`text-xs ${score <= 1 ? 'text-red-500' : score <= 2 ? 'text-amber-500' : 'text-emerald-600'}`}>
        {labels[score]} password
      </p>
    </div>
  );
}

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const pathParams = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  // Accept token from path (/setup-password/:token) OR query (?token=...) for backward compat
  const token = pathParams.token ?? searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Invalid or missing setup token. Please use the link from your email.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: any; tenant: any }>('/auth/setup-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setSession(data.token, data.user, data.tenant);
      navigate('/pos', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-xl">Kynex Pharmacloud</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Set up your password</h1>
          <p className="text-gray-500">Create a secure password to access your account.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-8">
          {error && !token ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-red-600 font-medium mb-2">Invalid Setup Link</p>
              <p className="text-gray-500 text-sm mb-6">{error}</p>
              <Link to="/signup">
                <Button variant="outline" className="w-full">Sign Up Again</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <Label htmlFor="password" className="text-sm font-medium text-gray-700 mb-1.5 block">
                  New Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <StrengthBar password={password} />
              </div>

              <div>
                <Label htmlFor="confirm" className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Confirm Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="confirm"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-11"
                  required
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
                {confirm && password === confirm && confirm.length >= 8 && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Passwords match
                  </p>
                )}
              </div>

              {error && token && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !token}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base rounded-xl"
              >
                {loading ? 'Setting up…' : 'Set Password & Log In'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Having trouble?{' '}
          <a href="mailto:support@kynexsolutions.com" className="text-emerald-600 hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}
