'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Home,
  CreditCard,
  TrendingUp,
  Store,
  Users,
  FileText,
  Shield,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const adminNavItems: NavItem[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  { id: 'admin-credit', label: 'Credit Posting', icon: <CreditCard className="h-5 w-5" /> },
  { id: 'admin-recovery', label: 'Recovery Report', icon: <TrendingUp className="h-5 w-5" /> },
  { id: 'admin-shops', label: 'Manage Shops', icon: <Store className="h-5 w-5" /> },
  { id: 'admin-orderbookers', label: 'Manage Orderbookers', icon: <Users className="h-5 w-5" /> },
  { id: 'admin-reconciliation', label: 'Reconciliation', icon: <FileText className="h-5 w-5" /> },
  { id: 'admin-audit', label: 'Audit Log', icon: <Shield className="h-5 w-5" /> },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, currentView, setCurrentView, logout } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [miniStats, setMiniStats] = useState<{ totalShops: number; totalOBs: number }>({ totalShops: 0, totalOBs: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const obRes = await fetch('/api/orderbookers');
        const shopRes = await fetch('/api/shops');
        const obs = obRes.ok ? await obRes.json() : [];
        const shops = shopRes.ok ? await shopRes.json() : [];
        setMiniStats({ totalShops: Array.isArray(shops) ? shops.length : 0, totalOBs: Array.isArray(obs) ? obs.length : 0 });
      } catch { /* silent */ }
      finally { setStatsLoading(false); }
    }
    loadStats();
  }, []);

  if (!user) return null;

  const handleNavClick = (viewId: string) => {
    setSidebarOpen(false);
    setCurrentView(viewId);
  };

  const handleLogout = () => {
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Header */}
      <header className="alfalah-header sticky top-0 z-50 h-16 flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Building2 className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-white leading-tight">Al-Falah Traders</h1>
              <p className="text-[10px] text-blue-200 leading-tight">Credit Management System</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-blue-100">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-white leading-tight">{user.name}</p>
              <p className="text-[10px] text-blue-200 leading-tight">Administrator</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-8 bg-white/20 hidden sm:block" />
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-100 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Overlay (mobile) */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:static inset-y-0 left-0 z-40 w-64 sidebar-navy-gradient transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:top-16 pt-16 lg:pt-0 border-r border-white/10 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <ScrollArea className="h-[calc(100vh-4rem)] sidebar-scroll">
            {/* Branded Section */}
            <div className="px-4 pt-5 pb-3">
              <div className="flex items-center gap-3 px-2">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                  <Building2 className="h-5 w-5 text-blue-200" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Al-Falah Traders</p>
                  <p className="text-[10px] text-blue-300/70 leading-tight">Management Portal</p>
                </div>
              </div>
            </div>

            <Separator className="bg-white/10 mx-3" />

            {/* Navigation */}
            <nav className="p-3 space-y-1">
              {adminNavItems.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-white/15 text-white shadow-sm border border-white/10'
                        : 'nav-item-inactive'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : ''}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
                  </button>
                );
              })}
            </nav>

            {/* Mini Stats at Bottom */}
            <div className="px-3 pb-4 mt-2">
              <Separator className="bg-white/10 mb-3" />
              {statsLoading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-300/50" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white/8 border border-white/10 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Store className="h-3 w-3 text-blue-300/70" />
                      <span className="text-[10px] text-blue-300/70 font-medium">Total Shops</span>
                    </div>
                    <p className="text-base font-bold text-white">{miniStats.totalShops}</p>
                  </div>
                  <div className="rounded-lg bg-white/8 border border-white/10 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users className="h-3 w-3 text-blue-300/70" />
                      <span className="text-[10px] text-blue-300/70 font-medium">Total OBs</span>
                    </div>
                    <p className="text-base font-bold text-white">{miniStats.totalOBs}</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 animate-fade-in" key={currentView}>
            {children}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 flex items-center justify-between text-xs text-muted-foreground bg-card/50 mt-auto">
        <span>&copy; {new Date().getFullYear()} Al-Falah Traders. All rights reserved.</span>
        <span>Smart Credit &amp; Route Management v1.0</span>
      </footer>
    </div>
  );
}
