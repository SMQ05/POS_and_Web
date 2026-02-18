import { useState } from 'react';
import { useAuthStore, useSettingsStore } from '@/store';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { settings } = useSettingsStore();
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className={cn(
      'min-h-screen transition-colors duration-300',
      settings.theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'
    )}>
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      <div className={cn(
        'transition-all duration-300',
        sidebarCollapsed ? 'ml-20' : 'ml-64'
      )}>
        <Header />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
