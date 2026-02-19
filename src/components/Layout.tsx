import { useState, useEffect } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { settings } = useSettingsStore();
  const { isAuthenticated } = useAuthStore();
  const { lang, dir, isRTL } = useTranslation();

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

  return (
    <div dir={dir} className={cn(
      'min-h-screen transition-colors duration-300',
      settings.theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'
    )}>
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      <div className={cn(
        'transition-all duration-300',
        isRTL
          ? (sidebarCollapsed ? 'mr-20' : 'mr-64')
          : (sidebarCollapsed ? 'ml-20' : 'ml-64')
      )}>
        <Header />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
