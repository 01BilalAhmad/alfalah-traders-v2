'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { isNavActive, getViewRoute } from '@/lib/route-map';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  ChevronDown,
  Loader2,
  Search,
  Settings,
  KeyRound,
  CalendarDays,
  Activity,
  Banknote,
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
  ShieldAlert,
  MessageSquare,
  Clock,
  PieChart,
  TrendingDown,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardCheck,
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
      { id: 'admin-credit-posting-summary', label: 'Credit Posting Summary', icon: <FileText className="h-4 w-4" /> },
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
      { id: 'admin-area-management', label: 'Area Management', icon: <MapPin className="h-4 w-4" /> },
      { id: 'admin-orderbookers', label: 'Manage Orderbookers', icon: <Users className="h-4 w-4" /> },
      { id: 'admin-companies', label: 'Manage Companies', icon: <Building2 className="h-4 w-4" /> },
      { id: 'admin-daily-targets', label: 'Recovery Targets', icon: <Target className="h-4 w-4" /> },
      { id: 'admin-credit-targets', label: 'Credit Targets', icon: <TrendingDown className="h-4 w-4" /> },
    ],
  },
  {
    id: 'teller-system',
    label: 'Teller System',
    icon: <ClipboardCheck className="h-4 w-4" />,
    items: [
      { id: 'admin-teller-management', label: 'Teller Management', icon: <UserCog className="h-4 w-4" /> },
      { id: 'admin-market-tally', label: 'Market Tally', icon: <ClipboardList className="h-4 w-4" /> },
      { id: 'admin-tally-report', label: 'Tally Report', icon: <FileText className="h-4 w-4" /> },
      { id: 'admin-discrepancy-analytics', label: 'Discrepancy Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { id: 'admin-overdue-tallies', label: 'Overdue Tallies', icon: <Clock className="h-4 w-4" /> },
      { id: 'admin-teller-sessions', label: 'Teller Sessions', icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <ClipboardList className="h-4 w-4" />,
    items: [
      // Daily use reports (top)
      { id: 'admin-ob-recovery-report', label: 'OB Recovery Report', icon: <FileText className="h-4 w-4" /> },
      { id: 'admin-credit-recovery-analysis', label: 'Credit vs Recovery Analysis', icon: <BarChart3 className="h-4 w-4" /> },
      { id: 'admin-overdue-shops', label: 'Overdue Shops', icon: <AlertTriangle className="h-4 w-4" /> },
      // Financial reports
      { id: 'admin-monthly-summary', label: 'Monthly Summary', icon: <CalendarDays className="h-4 w-4" /> },
      { id: 'admin-balance-report', label: 'Balance Report', icon: <Banknote className="h-4 w-4" /> },
      { id: 'admin-company-report', label: 'Company Report', icon: <FileSpreadsheet className="h-4 w-4" /> },
      { id: 'admin-aging-report', label: 'Aging Report', icon: <Clock className="h-4 w-4" /> },
      { id: 'admin-shop-ratio', label: 'Credit Recovery Ratio', icon: <PieChart className="h-4 w-4" /> },
      // Performance & analytics
      { id: 'admin-ob-analytics', label: 'OB Analytics', icon: <BarChart3 className="h-4 w-4" /> },
      { id: 'admin-area-distribution', label: 'Area Distribution', icon: <MapPin className="h-4 w-4" /> },
      // Monitoring & logs
      { id: 'admin-activity', label: 'Activity Log', icon: <Activity className="h-4 w-4" /> },
      { id: 'admin-sms-tracking', label: 'SMS Tracking', icon: <MessageSquare className="h-4 w-4" /> },
      { id: 'admin-whatsapp-settings', label: 'WhatsApp Settings', icon: <MessageSquare className="h-4 w-4" /> },
      // Export
      { id: 'admin-export-data', label: 'Export & Backup', icon: <FileDown className="h-4 w-4" /> },
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

/** Derive a human-readable page title from the current pathname. */
function getPageTitle(pathname: string): string {
  const allItems = [dashboardItem, ...adminNavSections.flatMap((s) => s.items)];
  const match = allItems.find((item) => isNavActive(item.id, pathname));
  return match?.label || 'Dashboard';
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
  pendingApprovals = 0,
  collapsed = false,
  businessName,
  businessPhone,
  onLogout,
  user,
}: {
  pathname: string;
  collapsedSections: Record<string, boolean>;
  setCollapsedSections: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  handleNavClick: (viewId: string) => void;
  todayRecovery: number;
  miniStats: { totalShops: number; totalOBs: number };
  statsLoading: boolean;
  pendingApprovals?: number;
  collapsed?: boolean;
  businessName: string;
  businessPhone: string;
  onLogout: () => void;
  user: { name?: string; role?: string } | null;
}) {
  const triggerSearch = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));

  return (
    <div className="flex flex-col h-full bg-[#0B0D1C]">
      {/* Business Name Header */}
      <div className={`px-3 pt-4 pb-3 ${collapsed ? 'px-2' : ''}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-2'}`}>
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white leading-tight tracking-tight">
                AL-FALAH TRADERS
              </p>
              <p className="text-[10px] text-indigo-300/60 leading-tight mt-0.5">
                Management Portal
              </p>
            </div>
          )}
        </div>
      </div>

      {!collapsed && <div className="mx-4 border-t border-white/[0.07]" />}

      {/* Optional search row inside sidebar (only when expanded) */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <button
            onClick={triggerSearch}
            className="w-full flex items-center gap-2 h-8 px-3 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 text-xs transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search...</span>
            <kbd className="ml-auto h-4 rounded border border-white/10 bg-white/5 px-1 font-mono text-[10px] leading-none text-slate-500">
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto sidebar-scroll">
        {/* Dashboard */}
        <button
          onClick={() => handleNavClick(dashboardItem.id)}
          title={collapsed ? dashboardItem.label : undefined}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
            collapsed ? 'justify-center' : ''
          } ${
            isNavActive(dashboardItem.id, pathname)
              ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-lg shadow-indigo-950/50'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06] font-normal'
          }`}
        >
          <span className={`shrink-0 ${isNavActive(dashboardItem.id, pathname) ? 'text-white' : 'text-slate-500'}`}>
            {dashboardItem.icon}
          </span>
          {!collapsed && <span className="flex-1 text-left">{dashboardItem.label}</span>}
        </button>

        {/* Collapsible Sections */}
        {adminNavSections.map((section) => {
          const isSectionCollapsed = collapsedSections[section.id] !== false;
          const hasActiveItem = section.items.some((item) => isNavActive(item.id, pathname));
          const effectivelyCollapsed = hasActiveItem ? false : isSectionCollapsed;

          return (
            <div key={section.id}>
              {!collapsed ? (
                <button
                  onClick={() => setCollapsedSections((prev) => ({ ...prev, [section.id]: prev[section.id] === false }))}
                  className="w-full flex items-center gap-2 px-3 py-1.5 mt-3 rounded-md text-[10px] font-semibold uppercase tracking-wider text-indigo-200/50 hover:text-indigo-200/90 transition-colors"
                >
                  <span className="shrink-0 text-indigo-200/50">{section.icon}</span>
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown
                    className={`h-3 w-3 transition-transform duration-150 ${effectivelyCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>
              ) : (
                <div className="my-2 mx-2 border-t border-white/[0.07]" />
              )}
              <div
                className={`space-y-0.5 overflow-hidden transition-all duration-150 ${
                  effectivelyCollapsed || collapsed ? 'max-h-0 opacity-0' : 'max-h-[1200px] opacity-100'
                }`}
              >
                {section.items.map((item) => {
                  const isActive = isNavActive(item.id, pathname);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-medium shadow-lg shadow-indigo-950/50'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.06] font-normal'
                      }`}
                    >
                      <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                        {item.icon}
                      </span>
                      {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                      {!collapsed && item.id === 'admin-approve-recovery' && pendingApprovals > 0 && (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-950 border border-amber-300 tabular-nums shadow-sm">
                          {pendingApprovals}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Mini Stats at Bottom (expanded only) */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="border-t border-white/[0.07] pt-3 px-2 mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-indigo-200/50 font-semibold uppercase tracking-wider">
                Today&apos;s Recovery
              </span>
            </div>
            <p className="text-base font-bold text-white tabular-nums">
              Rs. {todayRecovery.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
            </p>
          </div>
          {statsLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-300/60" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 px-2 mb-2">
              <div className="px-2 py-1">
                <span className="text-[10px] text-indigo-200/50 font-medium uppercase tracking-wider">Shops</span>
                <p className="text-sm font-bold text-white tabular-nums">{miniStats.totalShops}</p>
              </div>
              <div className="px-2 py-1">
                <span className="text-[10px] text-indigo-200/50 font-medium uppercase tracking-wider">OBs</span>
                <p className="text-sm font-bold text-white tabular-nums">{miniStats.totalOBs}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* User profile at bottom — minimal, no card wrapper */}
      <div className={`border-t border-white/[0.07] ${collapsed ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 px-2 py-1.5'}`}>
          <button
            onClick={() => handleNavClick('admin-settings')}
            title={collapsed ? businessName : undefined}
            className="flex items-center gap-2.5 min-w-0"
            aria-label="Open settings"
          >
            <div className="h-7 w-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {businessName.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="text-left min-w-0 flex-1">
                <p className="text-xs font-medium text-white leading-tight truncate">
                  {businessName || user?.name || 'Admin'}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight truncate">
                  {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : (businessPhone || 'Admin')}
                </p>
              </div>
            )}
          </button>
          {!collapsed && (
            <button
              onClick={onLogout}
              className="h-7 w-7 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
          {collapsed && (
            <button
              onClick={onLogout}
              title="Logout"
              className="mt-2 h-7 w-7 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors mx-auto"
              aria-label="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAppStore();
  const { businessName, businessPhone } = useBusinessName();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Settings is now a full page (admin-settings view), not a side sheet
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [miniStats, setMiniStats] = useState<{ totalShops: number; totalOBs: number }>({ totalShops: 0, totalOBs: 0 });
  const [todayRecovery, setTodayRecovery] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState(0);

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

  // Pending approvals count — sidebar badge on "Approve Recovery" (visual aid only)
  useEffect(() => {
    let cancelled = false;
    const loadPending = async () => {
      try {
        const res = await apiFetch('/api/transactions/pending-summary');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setPendingApprovals(data.count || 0);
        }
      } catch { /* silent */ }
    };
    const timer = setTimeout(loadPending, 2500);
    const interval = setInterval(loadPending, 60000);
    return () => {
      cancelled = true;
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
    pendingApprovals,
    businessName,
    businessPhone,
    onLogout: handleLogout,
    user,
  };

  const pageTitle = getPageTitle(pathname);

  return (
    <div className="min-h-dvh flex flex-col bg-[#F7F7FB] dark:bg-[#101116]">
      {/* Brand gradient strip — signature accent line across the top */}
      <div className="h-[3px] bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 shrink-0 print:hidden" />

      {/* Top Header — Clean Minimal */}
      <header className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 lg:px-6 bg-white/85 dark:bg-[#1A1B24]/85 backdrop-blur-md border-b border-slate-200 dark:border-[#262733] print:hidden">
        {/* Left: mobile menu toggle + page title */}
        <div className="flex items-center gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden h-9 w-9 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="hidden sm:block h-6 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-600 shrink-0" aria-hidden />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{pageTitle}</h1>
        </div>

        {/* Center: search bar (desktop only) */}
        <div className="hidden md:flex flex-1 max-w-md mx-6">
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="w-full flex items-center gap-2 h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search shops, OBs, transactions...</span>
            <kbd className="ml-auto h-4 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 font-mono text-[10px] leading-none text-slate-400 dark:text-slate-500">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1">
          {/* Mobile search */}
          <button
            onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="md:hidden h-9 w-9 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>

          <ThemeToggle />

          <NotificationPanel />

          <ShareMenu
            title="Share"
            text="Finexa - Smart Credit Management"
            className="h-8 w-8 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-0 p-0"
          />

          {/* Change Password (icon-only) */}
          <button
            onClick={() => setChangePasswordOpen(true)}
            className="hidden sm:flex h-8 w-8 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white items-center justify-center transition-colors"
            title="Change Password"
            aria-label="Change Password"
          >
            <KeyRound className="h-4 w-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1.5 hidden sm:block" />

          {/* User Avatar (32px) — navigates to settings */}
          <button
            onClick={() => router.push('/settings')}
            className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 border border-indigo-300/40 dark:border-indigo-800/60 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-900 transition-all"
            aria-label="Open settings"
            title={businessName}
          >
            {businessName.charAt(0).toUpperCase()}
          </button>

          {/* Logout (icon-only) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 h-8 w-8 p-0"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
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
          <aside className="fixed inset-y-0 left-0 z-40 w-60 bg-[#0B0D1C] border-r border-white/[0.07] pt-14 print:hidden overflow-hidden lg:hidden">
            <ScrollArea className="h-[calc(100dvh-3.5rem)] sidebar-scroll">
              <SidebarContent {...sidebarProps} />
            </ScrollArea>
          </aside>
        )}

        {/* ═══════ Desktop Sidebar — always in DOM, static flex child ═══════ */}
        <aside
          className={`hidden lg:flex ${
            sidebarCollapsed ? 'w-16' : 'w-60'
          } bg-[#0B0D1C] border-r border-white/[0.07] print:hidden shrink-0 flex-col relative transition-all duration-200 shadow-[4px_0_24px_-12px_rgba(11,13,28,0.35)] dark:shadow-none`}
        >
          <ScrollArea className="flex-1 sidebar-scroll">
            <SidebarContent {...sidebarProps} collapsed={sidebarCollapsed} />
          </ScrollArea>

          {/* Collapse / expand toggle — minimal icon button at bottom */}
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="absolute -right-3 top-20 h-6 w-6 rounded-full bg-[#161A2E] border border-white/15 shadow-lg flex items-center justify-center text-slate-400 hover:text-white hover:border-white/30 transition-colors z-10"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        </aside>

        {/* ═══════ Main Content ═══════ */}
        <main className="flex-1 overflow-y-auto print:overflow-visible print:p-0" id="main-scroll-container">
          <div className="p-4 lg:p-6 animate-fade-in print:p-0 print:m-0" key={pathname}>
            {children}
          </div>
        </main>
      </div>

      {/* Footer — minimal */}
      <footer className="border-t border-slate-200 dark:border-[#2E2E2E] px-6 py-2.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-500 print:hidden">
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
