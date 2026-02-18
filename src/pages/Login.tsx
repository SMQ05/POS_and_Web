import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useSettingsStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Pill, Eye, EyeOff, Lock, Mail, Moon, Sun, Globe } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const { settings, toggleTheme, setLanguage } = useSettingsStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate('/');
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = (role: string) => {
    const emails: Record<string, string> = {
      owner: 'owner@pharmapos.pk',
      manager: 'manager@pharmapos.pk',
      cashier: 'cashier@pharmapos.pk',
    };
    setEmail(emails[role] || '');
    setPassword('password');
  };

  return (
    <div className={cn(
      'min-h-screen flex items-center justify-center p-4 transition-colors duration-300',
      settings.theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-emerald-50 to-teal-100'
    )}>
      {/* Theme & Language Toggles */}
      <div className="absolute top-4 right-4 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className={settings.theme === 'dark' ? 'text-white' : ''}
        >
          {settings.theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLanguage(settings.language === 'en' ? 'ur' : 'en')}
          className={settings.theme === 'dark' ? 'text-white' : ''}
        >
          <Globe className="w-5 h-5" />
        </Button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 mb-4 shadow-lg">
            <Pill className="w-8 h-8 text-white" />
          </div>
          <h1 className={cn(
            'text-3xl font-bold',
            settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
          )}>
            PharmaPOS
          </h1>
          <p className={cn(
            'mt-2',
            settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
          )}>
            Pharmacy Management System for Pakistan
          </p>
        </div>

        <Card className={cn(
          'shadow-xl border-0',
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@pharmapos.pk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      'pl-10',
                      settings.theme === 'dark' && 'bg-gray-700 border-gray-600'
                    )}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'pl-10 pr-10',
                      settings.theme === 'dark' && 'bg-gray-700 border-gray-600'
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

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal">
                    Remember me
                  </Label>
                </div>
                <Button variant="link" className="text-sm p-0 h-auto">
                  Forgot password?
                </Button>
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Quick Login (Demo)</span>
              </div>
            </div>
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('owner')}
                className="flex-1"
              >
                Owner
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('manager')}
                className="flex-1"
              >
                Manager
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('cashier')}
                className="flex-1"
              >
                Cashier
              </Button>
            </div>
          </CardFooter>
        </Card>

        <p className={cn(
          'text-center text-sm mt-6',
          settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
        )}>
          © 2024 PharmaPOS Pakistan. All rights reserved.
        </p>
      </div>
    </div>
  );
}
