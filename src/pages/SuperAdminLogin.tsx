import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useSettingsStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Lock, Mail, Moon, Sun } from 'lucide-react';

export function SuperAdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { settings, toggleTheme } = useSettingsStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        // Verify the logged-in user is actually superadmin
        const user = useAuthStore.getState().currentUser;
        if (user?.role !== 'superadmin') {
          useAuthStore.getState().logout();
          setError('Access denied. This login is for the Super Admin only.');
          setIsLoading(false);
          return;
        }
        navigate('/super-admin');
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      'min-h-screen flex items-center justify-center p-4 transition-colors duration-300',
      settings.theme === 'dark' ? 'bg-gray-950' : 'bg-gradient-to-br from-gray-100 to-gray-200'
    )}>
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className={settings.theme === 'dark' ? 'text-white' : ''}
        >
          {settings.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 mb-4 shadow-lg">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className={cn(
            'text-3xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            Super Admin
          </h1>
          <p className={cn(
            'mt-2 text-sm',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Software Platform Control Panel
          </p>
        </div>

        <Card className={cn(
          'shadow-xl border-0',
          settings.theme === 'dark' && 'bg-gray-900 border-gray-800'
        )}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-center">Platform Access</CardTitle>
            <CardDescription className="text-center">
              Enter your Super Admin credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center dark:bg-red-900/30 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="sa-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="sa-email"
                    type="email"
                    placeholder="superadmin@pharmapos.pk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      'pl-10',
                      settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
                    )}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sa-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="sa-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'pl-10 pr-10',
                      settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
                    )}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In as Super Admin'}
              </Button>
            </form>

            {/* Dev quick-fill */}
            <div className="mt-4 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => { setEmail('superadmin@pharmapos.pk'); setPassword('password'); }}
              >
                Quick Fill (Dev)
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className={cn(
          'text-center text-xs mt-6',
          settings.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
        )}>
          This area is restricted to authorized personnel only.
        </p>
      </div>
    </div>
  );
}
