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
import { Pill, Eye, EyeOff, Lock, Mail, Moon, Sun, Globe, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/backend';

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
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  const handleForgotPassword = async () => {
    setForgotMessage('');
    setForgotSending(true);
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setForgotMessage('If an account exists for that email, a reset link has been sent. Check your inbox.');
    } catch (e) {
      setForgotMessage('Failed to send reset link. Please try again.');
    } finally {
      setForgotSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        const user = useAuthStore.getState().currentUser;
        if (user?.role === 'superadmin') {
          // Superadmin should use the dedicated super admin login
          navigate('/super-admin');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(t('login.invalidCredentials'));
      }
    } catch (err) {
      setError(t('login.errorOccurred'));
    } finally {
      setIsLoading(false);
    }
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
            Kynex Pharmacloud
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
                    placeholder="name@pharmacloud.pk"
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
                <Button
                  type="button"
                  variant="link"
                  className="text-sm p-0 h-auto"
                  onClick={() => { setForgotEmail(email); setShowForgot(true); setForgotMessage(''); }}
                >
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
          <CardFooter className="flex flex-col gap-2 text-center text-sm">
            <p className={settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}>
              Don't have an account?{' '}
              <a href="/signup" className="text-emerald-600 hover:underline font-medium">
                Start free trial
              </a>
            </p>
          </CardFooter>
        </Card>

        <p className={cn(
          'text-center text-sm mt-6',
          settings.theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
        )}>
          © {new Date().getFullYear()} Kynex Solutions · Kynex Pharmacloud
        </p>
      </div>

      {showForgot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForgot(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reset your password</h3>
            <p className="text-sm text-gray-500 mb-5">Enter your email and we'll send you a reset link valid for 1 hour.</p>
            <Label htmlFor="forgot-email" className="text-sm">Email address</Label>
            <Input
              id="forgot-email"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 mb-4"
            />
            {forgotMessage && (
              <div className={cn('text-sm rounded-lg p-3 mb-3', forgotMessage.startsWith('If') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                {forgotMessage}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowForgot(false)}>Close</Button>
              <Button
                onClick={handleForgotPassword}
                disabled={forgotSending || !forgotEmail.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {forgotSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending</> : 'Send reset link'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
