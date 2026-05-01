'use client';

import { useState, useEffect, useRef } from 'react';
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
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Loader2,
  Search,
  Settings,
  KeyRound,
  CalendarDays,
  Activity,
  Banknote,
  ArrowDownRight,
  Receipt,
  ShieldCheck,
  Target,
  AlertTriangle,
  Navigation,
  Clock,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { ThemeToggle } from './ThemeToggle';
import NotificationPanel from './NotificationPanel';
import GlobalSearch from './GlobalSearch';
import SettingsPanel from './SettingsPanel';
import KeyboardShortcuts from './KeyboardShortcuts';
import SessionTimeoutDialog from './SessionTimeoutDialog';
import ShareMenu from './ShareMenu';
import ChangePasswordDialog from './ChangePasswordDialog';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const adminNavItems: NavItem[] = [
  { id: 'admin-dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  { id: 'admin-credit', label: 'Credit Posting', icon: <CreditCard className="h-5 w-5" /> },
  { id: 'admin-recovery', label: 'Recovery Report', icon: <TrendingUp className="h-5 w-5" /> },
  { id: 'admin-approve-recovery', label: 'Approve Recovery', icon: <ShieldCheck className="h-5 w-5" /> },
  { id: 'admin-transactions', label: 'Transactions', icon: <Receipt className="h-5 w-5" /> },
  { id: 'admin-shops', label: 'Manage Shops', icon: <Store className="h-5 w-5" /> },
  { id: 'admin-orderbookers', label: 'Manage Orderbookers', icon: <Users className="h-5 w-5" /> },
  { id: 'admin-reconciliation', label: 'Reconciliation', icon: <FileText className="h-5 w-5" /> },
  { id: 'admin-audit', label: 'Audit Log', icon: <Shield className="h-5 w-5" /> },
  { id: 'admin-ob-analytics', label: 'OB Analytics', icon: <BarChart3 className="h-5 w-5" /> },
  { id: 'admin-monthly-summary', label: 'Monthly Summary', icon: <CalendarDays className="h-5 w-5" /> },
  { id: 'admin-activity', label: 'Activity', icon: <Activity className="h-5 w-5" /> },
  { id: 'admin-daily-targets', label: 'Recovery Targets', icon: <Target className="h-5 w-5" /> },
  { id: 'admin-overdue-shops', label: 'Overdue Shops', icon: <AlertTriangle className="h-5 w-5" /> },
  { id: 'admin-visit-tracking', label: 'Visit Tracking', icon: <Navigation className="h-5 w-5" /> },
  { id: 'admin-pending-credits', label: 'Pending Credits', icon: <Clock className="h-5 w-5" /> },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, currentView, setCurrentView, logout } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [miniStats, setMiniStats] = useState<{ totalShops: number; totalOBs: number }>({ totalShops: 0, totalOBs: 0 });
  const [todayRecovery, setTodayRecovery] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useRef(async () => {
    try {
      const obRes = await apiFetch('/api/orderbookers');
      const shopRes = await apiFetch('/api/shops');
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const txnRes = await apiFetch(`/api/transactions?date=${todayStr}&limit=500&type=recovery`);
      const obs = obRes.ok ? await obRes.json() : [];
      const shops = shopRes.ok ? await shopRes.json() : [];
      const txnData = txnRes.ok ? await txnRes.json() : { transactions: [] };
      setMiniStats({ totalShops: Array.isArray(shops) ? shops.length : 0, totalOBs: Array.isArray(obs) ? obs.filter((o: { status: string }) => o.status === 'active').length : 0 });
      setTodayRecovery((txnData.transactions || []).reduce((s: number, t: { amount: number }) => s + t.amount, 0));
    } catch { /* silent */ }
    finally { setStatsLoading(false); }
  });

  useEffect(() => {
    loadStats.current();
    const interval = setInterval(() => loadStats.current(), 30000);
    return () => clearInterval(interval);
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
      <header className="alfalah-header animate-header-gradient sticky top-0 z-50 h-16 flex items-center justify-between px-4 lg:px-6 md:backdrop-blur-md md:bg-opacity-95">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className={`text-white hover:bg-white/10 lg:hidden min-w-[44px] min-h-[44px] hamburger-animate ${sidebarOpen ? 'is-open' : ''}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Separator orientation="vertical" className="h-8 bg-white/10 lg:hidden" />
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
          {/* Global Search Button */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-blue-100 hover:text-white text-xs font-medium transition-all duration-150 hover-glow-primary"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-flex h-4 items-center rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px] leading-none">
              ⌘K
            </kbd>
          </button>
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="md:hidden min-h-[44px] min-w-[44px] h-11 w-11 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-blue-100 hover:text-white flex items-center justify-center transition-all duration-150"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="hidden sm:flex items-center gap-2 text-sm text-blue-100 hover:text-white cursor-pointer transition-colors focus-glow rounded-lg p-1"
            aria-label="Open settings"
          >
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-white leading-tight">{user.name}</p>
              <p className="text-[10px] text-blue-200 leading-tight">Administrator</p>
            </div>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden text-blue-100 hover:bg-white/10 hover:text-white min-h-[44px] min-w-[44px]"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-8 bg-white/20 hidden sm:block" />
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-blue-100 hover:text-white text-xs font-medium transition-all duration-150"
            aria-label="Change password"
            title="Change Password"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Change Password</span>
          </button>
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="sm:hidden text-blue-100 hover:bg-white/10 hover:text-white min-h-[44px] min-w-[44px] h-9 w-9 rounded-lg flex items-center justify-center"
            aria-label="Change password"
          >
            <KeyRound className="h-4 w-4" />
          </button>
          <ThemeToggle />
          <Separator orientation="vertical" className="h-8 bg-white/20 hidden sm:block" />
          <NotificationPanel />
          <Separator orientation="vertical" className="h-8 bg-white/20 hidden sm:block" />
          <ShareMenu
            title="Share"
            text="Al-Falah Traders - Smart Credit Management System"
            className="h-9 w-9 text-blue-100 hover:bg-white/10 hover:text-white border-0 p-0"
          />
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
          {/* Subtle pattern overlay */}
          <div className="sidebar-pattern-overlay" />
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
            <nav className="p-3 space-y-1 nav-stagger">
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
              {/* Live Recovery Ticker */}
              <div className="mb-3 rounded-lg bg-green-500/15 border border-green-400/30 px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] text-green-300/80 font-medium">Today&apos;s Recovery</span>
                </div>
                <p className="text-base font-bold text-green-300 tabular-nums flex items-center gap-1.5">
                  <ArrowDownRight className="h-4 w-4" />
                  Rs. {todayRecovery.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                </p>
              </div>
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
      <footer className="glass-strong dark:bg-slate-800/90 dark:border-slate-600/50 border-t border-border/50 px-6 py-3 flex items-center justify-between text-xs text-muted-foreground dark:text-slate-300 mt-auto">
        <span>&copy; {new Date().getFullYear()} Al-Falah Traders. All rights reserved.</span>
        <span>Smart Credit &amp; Route Management v1.0</span>
      </footer>

      {/* Global Search Overlay */}
      <GlobalSearch />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcuts />

      {/* Change Password Dialog */}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      {/* Settings Panel */}
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Session Timeout Dialog */}
      <SessionTimeoutDialog />
    </div>
  );
}
