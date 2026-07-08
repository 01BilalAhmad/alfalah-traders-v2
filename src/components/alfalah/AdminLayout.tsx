'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { isNavActive, getViewRoute } from '@/lib/route-map';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
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
  ChevronDown,
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
  MapPin,
  FileDown,
  FileSpreadsheet,
  Wallet,
  Route,
  UserCog,
  ClipboardList,
  Radio,
  ShieldAlert,
  MessageSquare,
  Clock,
  PieChart,
  TrendingDown,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useBusinessName } from '@/lib/use-business-name';
import { ThemeToggle } from './ThemeToggle';
import NotificationPanel from './NotificationPanel';
import ShareMenu from './ShareMenu';

const GlobalSearch = dynamic(() => import('./GlobalSearch'), { ssr: false });
const KeyboardShortcuts = dynamic(() => import('./KeyboardShortcuts'), { ssr: false });
const ChangePasswordDialog = dynamic(() => import('./ChangePasswordDialog'), { ssr: false });
const SessionTimeoutDialog = dynamic(() => import('./SessionTimeoutDialog'), { ssr: false });

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

const adminNavSections: NavSection[] = [
  {
    id: 'transactions',
    label: 'Transactions',
    icon: <Wallet className="h-4 w-4" />,
    items: [
      { id: 'admin-credit', label: 'Credit Posting', icon: <CreditCard className="h-4 w-4" /> },
      { id: 'admin-claims', label: 'Claim Posting', icon: <ShieldAlert className="h-4 w-4" /> },
      { id: 'admin-recovery', label: 'Recovery Report', icon: <TrendingUp className="h-4 w-4" /> },
      { id: 'admin-approve-recovery', label: 'Approve Recovery', icon: <ShieldCheck className="h-4 w-4" /> },
      { id: 'admin-transactions', label: 'Transactions', icon: <Receipt className="h-4 w-4" /> },
      { id: 'admin-reconciliation', label: 'Reconciliation', icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    id: 'route-tracking',
    label: 'Route & Tracking',
    icon: <Route className="h-4 w-4" />,
    items: [
      { id: 'admin-calendar', label: 'Route Calendar', icon: <CalendarDays className="h-4 w-4" /> },
      { id: 'admin-visit-tracking', label: 'Visit Tracking', icon: <Navigation className="h-4 w-4" /> },
      { id: 'admin-map-view', label: 'Map View', icon: <MapPin className="h-4 w-4" /> },
      { id: 'admin-route-tracker', label: 'Route Tracking', icon: <Route className="h-4 w-4" /> },
    ],
  },
  {
    id: 'management',
    label: 'Management',
    icon: <UserCog className="h-4 w-4" />,
    items: [
      { id: 'admin-shops', label: 'Manage Shops', icon: <Store className="h-4 w-4" /> },
      { id: 'admin-orderbookers', label: 'Manage Orderbookers', icon: <Users className="h-4 w-4" /> },
      { id: 'admin-companies', label: 'Manage Companies', icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <ClipboardList className="h-4 w-4" />,
    items: [
      { id: 'admin-monthly-summary', label: 'Monthly Summary', icon: <CalendarDays className="h-4 w-4" /> },
      { id: 'admin-ob-analytics', label: 'OB Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { id: 'admin-ob-recovery-report', label: 'OB Recovery Report', icon: <FileText className="h-4 w-4" /> },
      { id: 'admin-balance-report', label: 'Balance Report', icon: <Banknote className="h-4 w-4" /> },
      { id: 'admin-company-report', label: 'Company Report', icon: <FileSpreadsheet className="h-4 w-4" /> },
      { id: 'admin-activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
      { id: 'admin-sms-tracking', label: 'SMS Tracking', icon: <MessageSquare className="h-4 w-4" /> },
      { id: 'admin-aging-report', label: 'Aging Report', icon: <Clock className="h-4 w-4" /> },
      { id: 'admin-area-distribution', label: 'Area Distribution', icon: <MapPin className="h-4 w-4" /> },
      { id: 'admin-shop-ratio', label: 'Credit Recovery Ratio', icon: <PieChart className="h-4 w-4" /> },
      { id: 'admin-daily-targets', label: 'Recovery Targets', icon: <Target className="h-4 w-4" /> },
      { id: 'admin-credit-targets', label: 'Credit Targets', icon: <TrendingDown className="h-4 w-4" /> },
      { id: 'admin-overdue-shops', label: 'Overdue Shops', icon: <AlertTriangle className="h-4 w-4" /> },
      { id: 'admin-export-data', label: 'Export & Reports', icon: <FileDown className="h-4 w-4" /> },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: <Shield className="h-4 w-4" />,
    items: [
      { id: 'admin-audit', label: 'Audit Log', icon: <Shield className="h-4 w-4" /> },
      { id: 'admin-settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
    ],
  },
];

const dashboardItem: NavItem = { id: 'admin-dashboard', label: 'Dashboard', icon: <Home className="h-4 w-4" /> };

interface AdminLayoutProps {
  children: React.ReactNode;
}

/** Shared sidebar content — rendered inside both mobile and desktop sidebars */
function SidebarContent({
  pathname,
  collapsedSections,
  setCollapsedSections,
  handleNavClick,
  todayRecovery,
  miniStats,
  statsLoading,
}: {
  pathname: string;
  collapsedSections: Record<string, boolean>;
  setCollapsedSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleNavClick: (viewId: string) => void;
  todayRecovery: number;
  miniStats: { totalShops: number; totalOBs: number };
  statsLoading: boolean;
}) {
  return (
    <>
      {/* Logo section in sidebar */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5 px-1">
          <Image src="/finexa-icon.png" alt="Finexa" width={32} height={32} className="rounded-lg" />
          <div>
            <p className="text-sm font-bold text-foreground leading-tight">Finexa</p>
            <p className="text-[10px] text-muted-foreground leading-tight dark:text-muted-foreground/90">Management Portal</p>
          </div>
        </div>
      </div>

      <Separator className="mx-4" />

      {/* Navigation */}
      <nav className="p-3 space-y-0.5">
        {/* Dashboard */}
        <button
          onClick={() => handleNavClick(dashboardItem.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            isNavActive(dashboardItem.id, pathname)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary font-medium'
              : 'text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <span className="shrink-0">{dashboardItem.icon}</span>
          <span className="flex-1 text-left">{dashboardItem.label}</span>
        </button>

        <Separator className="my-2" />

        {/* Collapsible Sections */}
        {adminNavSections.map((section) => {
          const isCollapsed = collapsedSections[section.id] !== false;
          const hasActiveItem = section.items.some((item) => isNavActive(item.id, pathname));
          const effectivelyCollapsed = hasActiveItem ? false : isCollapsed;

          return (
            <div key={section.id}>
              <button
                onClick={() => setCollapsedSections((prev) => ({ ...prev, [section.id]: prev[section.id] === false }))}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="shrink-0">{section.icon}</span>
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-150 ${effectivelyCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
              <div
                className={`space-y-0.5 overflow-hidden transition-all duration-150 ${
                  effectivelyCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                }`}
              >
                {section.items.map((item) => {
                  const isActive = isNavActive(item.id, pathname);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-primary'
                          : 'text-sidebar-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Mini Stats at Bottom */}
      <div className="px-3 pb-4 mt-2">
        <Separator className="mb-3" />
        <div className="mb-3 rounded-md border border-border px-3 py-2">
          <div className="flex items-center gap-1.5 mb-0.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-live-pulse" />
            <span className="text-[10px] text-muted-foreground font-medium">Today&apos;s Recovery</span>
          </div>
          <p className="text-sm font-bold text-foreground tabular-nums">
            Rs. {todayRecovery.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
          </p>
        </div>
        {statsLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border px-3 py-2">
              <span className="text-[10px] text-muted-foreground font-medium">Shops</span>
              <p className="text-sm font-bold text-foreground">{miniStats.totalShops}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <span className="text-[10px] text-muted-foreground font-medium">OBs</span>
              <p className="text-sm font-bold text-foreground">{miniStats.totalOBs}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAppStore();
  const { businessName, businessPhone } = useBusinessName();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // Settings is now a full page (admin-settings view), not a side sheet
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [miniStats, setMiniStats] = useState<{ totalShops: number; totalOBs: number }>({ totalShops: 0, totalOBs: 0 });
  const [todayRecovery, setTodayRecovery] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useRef(async () => {
    try {
      // Try lightweight stats API first, fallback to individual calls
      const res = await apiFetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setMiniStats({ totalShops: data.totalShops || 0, totalOBs: data.totalOBs || 0 });
        setTodayRecovery(data.todayRecovery || 0);
      } else {
        // Fallback: use individual API calls
        const obRes = await apiFetch('/api/orderbookers');
        const shopRes = await apiFetch('/api/shops');
        const obs = obRes.ok ? await obRes.json() : [];
        const shops = shopRes.ok ? await shopRes.json() : [];
        setMiniStats({ totalShops: Array.isArray(shops) ? shops.length : 0, totalOBs: Array.isArray(obs) ? obs.filter((o: { status: string }) => o.status === 'active').length : 0 });
      }
    } catch { /* silent */ }
    finally { setStatsLoading(false); }
  });

  useEffect(() => {
    // Defer stats loading to avoid competing with dashboard API calls
    const timer = setTimeout(() => {
      loadStats.current();
    }, 2000);
    const interval = setInterval(() => loadStats.current(), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Scroll to top when pathname changes
  useEffect(() => {
    const el = document.getElementById('main-scroll-container');
    if (el) el.scrollTop = 0;
  }, [pathname]);

  if (!user) return null;

  const handleNavClick = (viewId: string) => {
    setSidebarOpen(false);
    router.push(getViewRoute(viewId));
  };

  const handleLogout = () => {
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
  };

  const sidebarProps = {
    pathname,
    collapsedSections,
    setCollapsedSections,
    handleNavClick,
    todayRecovery,
    miniStats,
    statsLoading,
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Top Header — Clean, flat, Mercury-style */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 lg:px-6 bg-sidebar border-b border-border print:hidden">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 text-foreground hover:bg-muted"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Separator orientation="vertical" className="h-6 lg:hidden" />
          {/* Logo in header */}
          <div className="flex items-center gap-2">
            <Image src="/finexa-flat-icon.png" alt="Finexa" width={28} height={28} className="rounded" />
            <span className="text-sm font-bold text-foreground hidden sm:inline">Finexa</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background hover:bg-muted text-foreground hover:text-foreground text-xs transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="ml-1.5 h-4 rounded border border-border bg-muted px-1 font-mono text-[10px] leading-none text-muted-foreground">
              ⌘K
            </kbd>
          </button>
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="md:hidden h-9 w-9 rounded-md border border-border hover:bg-muted text-foreground hover:text-foreground flex items-center justify-center transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <ThemeToggle />
          <NotificationPanel />
          <ShareMenu
            title="Share"
            text="Finexa - Smart Credit Management"
            className="h-8 w-8 text-foreground hover:text-foreground border-0 p-0"
          />
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          {/* Change Password */}
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border hover:bg-muted text-foreground hover:text-foreground text-xs font-medium transition-colors"
            title="Change Password"
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Password</span>
          </button>
          {/* User Avatar */}
          <button
            onClick={() => router.push('/settings')}
            className="flex items-center gap-2 text-sm text-foreground hover:bg-muted rounded-md px-2 py-1 transition-colors"
            aria-label="Open settings"
          >
            <div className="h-7 w-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-accent-foreground">
              {businessName.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-medium text-foreground leading-tight">{businessName}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{businessPhone || 'Admin'}</p>
            </div>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-foreground hover:text-foreground h-8 px-2"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline text-xs">Logout</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ═══════ Mobile Sidebar — only in DOM when open, fixed overlay ═══════ */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {sidebarOpen && (
          <aside className="fixed inset-y-0 left-0 z-40 w-60 bg-sidebar border-r border-border pt-14 print:hidden overflow-hidden lg:hidden">
            <ScrollArea className="h-[calc(100dvh-3.5rem)] sidebar-scroll">
              <SidebarContent {...sidebarProps} />
            </ScrollArea>
          </aside>
        )}

        {/* ═══════ Desktop Sidebar — always in DOM, static flex child ═══════ */}
        <aside className="hidden lg:flex w-60 bg-sidebar border-r border-border print:hidden shrink-0 flex-col">
          <ScrollArea className="h-[calc(100dvh-3.5rem)] sidebar-scroll">
            <SidebarContent {...sidebarProps} />
          </ScrollArea>
        </aside>

        {/* ═══════ Main Content ═══════ */}
        <main className="flex-1 overflow-y-auto print:overflow-visible print:p-0" id="main-scroll-container">
          <div className="p-4 lg:p-6 animate-fade-in print:p-0 print:m-0" key={pathname}>
            {children}
          </div>
        </main>
      </div>

      {/* Footer — minimal */}
      <footer className="border-t border-border px-6 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground print:hidden">
        <span>&copy; 2026 Finexa. All rights reserved. Unauthorized copying, reverse engineering, modification, or distribution of this software is strictly prohibited and punishable under Copyright Ordinance 1962 &amp; PECA 2016.</span>
        <span>v1.0</span>
      </footer>

      {/* Global Search Overlay */}
      <GlobalSearch />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcuts />

      {/* Change Password Dialog */}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      {/* Settings is now a full page view (admin-settings) — no side sheet needed */}

      {/* Session Timeout Dialog */}
      <SessionTimeoutDialog />
    </div>
  );
}
