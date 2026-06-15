import { useState, useEffect } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocation, useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useSettingsStore();
  const { isAuthenticated } = useAuthStore();
  const { lang, dir, isRTL } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // Auto-close the mobile drawer when the route changes
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Global Ctrl-key shortcuts that work from any authenticated page.
  //   Ctrl+B  →  jump to POS for a new sale
  //   Ctrl+R  →  jump to Reports
  // These run only at the Layout level, so they're skipped on login / signup /
  // setup-password pages (those bypass <Layout>).
  //
  // (Ctrl+N is deliberately NOT used — Chrome reserves it for "new browser
  // window" and refuses to let JS intercept it.)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      // These shortcuts fire from anywhere (including text fields) since
      // they're navigation actions a pharmacist needs at any moment. Ctrl+B
      // in a plain input has no native meaning, so nothing is lost.
      if (key === 'b') {
        e.preventDefault();
        navigate('/pos');
      } else if (key === 'r') {
        e.preventDefault();
        navigate('/reports');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAuthenticated, navigate]);

  // Apply dir and lang to <html>, pick the right font for each script
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    if (lang === 'ur') {
      document.documentElement.style.fontFamily = "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'Segoe UI', Tahoma, sans-serif";
    } else if (lang === 'ar') {
      document.documentElement.style.fontFamily = "'Almarai', 'Segoe UI', Tahoma, sans-serif";
    } else {
      document.documentElement.style.fontFamily = '';
    }
  }, [dir, lang]);

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const desktopOffset = isRTL
    ? (sidebarCollapsed ? 'md:mr-20' : 'md:mr-64')
    : (sidebarCollapsed ? 'md:ml-20' : 'md:ml-64');

  return (
    <div dir={dir} className={cn(
      'min-h-screen transition-colors duration-300',
      settings.theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'
    )}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className={cn('transition-all duration-300', desktopOffset)}>
        <Header onMobileMenuClick={() => setMobileOpen(true)} />
        <main className="p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
