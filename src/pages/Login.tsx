import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useSettingsStore } from '@/store';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t, isRTL, dir } = useTranslation();
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
        setError(t('login.invalidCredentials'));
      }
    } catch (err) {
      setError(t('login.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = (role: string) => {
    const emails: Record<string, string> = {
      superadmin: 'superadmin@pharmapos.pk',
      owner: 'owner@pharmapos.pk',
      manager: 'manager@pharmapos.pk',
      cashier: 'cashier@pharmapos.pk',
      salesman: 'salesman@pharmapos.pk',
    };
    setEmail(emails[role] || '');
    setPassword('password');
  };

  return (
    <div dir={dir} className={cn(
      'min-h-screen flex items-center justify-center p-4 transition-colors duration-300',
      settings.theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-emerald-50 to-teal-100'
    )}>
      {/* Theme & Language Toggles */}
      <div className={cn('absolute top-4 flex gap-2', isRTL ? 'left-4' : 'right-4')}>
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
          onClick={() => {
            const cycle: Record<string, 'en' | 'ar' | 'ur'> = { en: 'ur', ur: 'en', ar: 'en' };
            setLanguage(cycle[settings.language] || 'en');
          }}
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
            {t('login.subtitle')}
          </p>
        </div>

        <Card className={cn(
          'shadow-xl border-0',
          settings.theme === 'dark' && 'bg-gray-800 border-gray-700'
        )}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">{t('login.welcomeBack')}</CardTitle>
            <CardDescription className="text-center">
              {t('login.enterCredentials')}
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
                <Label htmlFor="email">{t('login.email')}</Label>
                <div className="relative">
                  <Mail className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@pharmapos.pk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      isRTL ? 'pr-10' : 'pl-10',
                      settings.theme === 'dark' && 'bg-gray-700 border-gray-600'
                    )}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('login.password')}</Label>
                <div className="relative">
                  <Lock className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('login.enterPassword')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10',
                      settings.theme === 'dark' && 'bg-gray-700 border-gray-600'
                    )}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={cn('absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600', isRTL ? 'left-3' : 'right-3')}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className={cn('flex items-center', isRTL ? 'space-x-reverse space-x-2' : 'space-x-2')}>
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal">
                    {t('login.rememberMe')}
                  </Label>
                </div>
                <Button variant="link" className="text-sm p-0 h-auto">
                  {t('login.forgotPassword')}
                </Button>
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600"
                disabled={isLoading}
              >
                {isLoading ? t('login.signingIn') : t('login.signIn')}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">{t('login.quickLogin')}</span>
              </div>
            </div>
            <div className="flex gap-2 w-full flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('superadmin')}
                className="flex-1 border-gray-900 text-gray-900"
              >
                Super Admin
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('owner')}
                className="flex-1"
              >
                {t('roles.owner')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('manager')}
                className="flex-1"
              >
                {t('roles.manager')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('cashier')}
                className="flex-1"
              >
                {t('roles.cashier')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => quickLogin('salesman')}
                className="flex-1"
              >
                {t('roles.salesman')}
              </Button>
            </div>
          </CardFooter>
        </Card>

        <p className={cn(
          'text-center text-sm mt-6',
          settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
        )}>
          © 2024 PharmaPOS Pakistan. {t('login.allRightsReserved')}
        </p>
      </div>
    </div>
  );
}
