'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  TrendingUp,
  Store,
  Banknote,
  Wallet,
  MapPin,
  Phone,
  FileText,
  Download,
  ArrowLeft,
  Loader2,
  Navigation,
  ExternalLink,
  CheckCircle,
  Clock,
  CheckCircle2,
  Zap,
  BarChart3,
  CalendarDays,
  MessageSquare,
  X,
  LogOut,
  Settings,
  KeyRound,
  WifiOff,
  RefreshCw,
  CloudOff,
  CloudUpload,
  User,
  PhoneCall,
  UserCircle,
  Shield,
  Share2,
  Layers,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';
import { getLocalDateString, WORKING_DAYS, getTodayRouteDay, formatPKR } from '@/lib/utils';
import SessionTimeoutDialog from './SessionTimeoutDialog';
import BackupSettingsDialog from './BackupSettingsDialog';
import ChangePasswordDialog from './ChangePasswordDialog';
import ShareMenu from './ShareMenu';
import PWAInstallPrompt from './PWAInstallPrompt';
import { useOnlineStatus } from '@/lib/use-online-status';
import {
  cacheShops,
  getCachedShops,
  addPendingTransaction,
  getPendingTransactions,
  getUnsyncedCount,
  hasCachedShops,
  getCacheAge,
  type CachedShop,
  type PendingTransaction,
} from '@/lib/offline-store';

const ROUTE_DAYS = [...WORKING_DAYS];

// Helper: Get the display balance for a shop based on user's company assignment
function getShopDisplayBalance(shop: Shop, userCompanyId: string | null): number {
  if (!userCompanyId || !shop.companyBalances || shop.companyBalances.length === 0) {
    return shop.balance; // No company assigned or no company balances, show total
  }
  const companyBal = shop.companyBalances.find(cb => cb.companyId === userCompanyId);
  return companyBal ? companyBal.balance : 0;
}

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  phone: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string };
  companyId?: string | null;
  companyName?: string | null;
  distributorPhone?: string | null;
  companyBalances?: { companyId: string; companyName: string; balance: number; creditLimit: number }[];
}

interface RecoveryTransaction {
  id: string;
  amount: number;
  createdAt: string;
  description: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  shop: {
    id: string;
    name: string;
    area: string | null;
  };
  creator: {
    id: string;
    name: string;
    role: string;
  };
}

interface ShopTransaction {
  id: string;
  type: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdAt: string;
  creator: {
    id: string;
    name: string;
    role: string;
  };
}

function formatNiceDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function SuccessOverlay({
  show,
  shopName,
  amount,
  onClose,
}: {
  show: boolean;
  shopName: string;
  amount: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-card rounded-2xl shadow-2xl p-6 mx-6 text-center pointer-events-auto animate-success-bounce"
      >
        <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Recovery Collected!</h3>
        <p className="text-sm text-muted-foreground mb-2">{shopName}</p>
        <p className="text-2xl font-bold text-green-600 animate-count-up">{formatPKR(parseFloat(amount))}</p>
      </div>
    </div>
  );
}

// ─── Profile View ────────────────────────────────────────────────────────────

type DateFilter = '7days' | '30days' | 'all';

interface WeeklyData {
  weekLabel: string;
  startDate: string;
  endDate: string;
  total: number;
  days: number;
  avg: number;
  shopsVisited: number;
}

interface WeeklyPerformance {
  orderbookerName: string;
  totalRecovered: number;
  totalDays: number;
  avgDaily: number;
  bestDay: { date: string; amount: number } | null;
  weeklyData: WeeklyData[];
}

export function ProfileView({
  onChangePassword,
  onOpenSettings,
}: {
  onChangePassword?: () => void;
  onOpenSettings?: () => void;
}) {
  const { user } = useAppStore();
  const router = useRouter();
  // Fallback: if no callbacks provided, manage own dialog state
  const [localChangePasswordOpen, setLocalChangePasswordOpen] = useState(false);
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false);
  const handleChangePassword = onChangePassword || (() => setLocalChangePasswordOpen(true));
  const handleOpenSettings = onOpenSettings || (() => setLocalSettingsOpen(true));
  const [monthlyRecovery, setMonthlyRecovery] = useState<RecoveryTransaction[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [weeklyPerf, setWeeklyPerf] = useState<WeeklyPerformance | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setWeeklyLoading(true);
    try {
      // Fetch all recovery transactions for this month
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const res = await apiFetch(`/api/transactions?limit=200&type=recovery&status=approved&createdBy=${user.id}&startDate=${firstOfMonth}`);
      if (res.ok) {
        const data = await res.json();
        setMonthlyRecovery(data.transactions || []);
      }

      // Fetch weekly performance data
      const weeklyRes = await apiFetch(`/api/reports/ob-weekly-performance?orderbookerId=${user.id}&weeks=4`);
      if (weeklyRes.ok) {
        const weeklyData = await weeklyRes.json();
        setWeeklyPerf(weeklyData);
      }
    } catch { /* silent */ }
    finally {
      setProfileLoading(false);
      setWeeklyLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchProfileData(); }, [fetchProfileData]);

  // Performance calculations
  const totalRecovery = monthlyRecovery.reduce((s, t) => s + t.amount, 0);
  const uniqueShops = new Set(monthlyRecovery.map((t) => t.shop.id)).size;
  const avgPerVisit = uniqueShops > 0 ? Math.round(totalRecovery / uniqueShops) : 0;

  const initials = user?.name
    ? user.name.split(' ').map((n) => n.charAt(0)).join('').toUpperCase().slice(0, 2)
    : 'OB';

  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="p-4 space-y-4">
      {/* Profile Card */}
      <Card className="overflow-hidden animate-fade-in">
        <div className="bg-primary p-5 text-white relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />
          <div className="relative z-10 flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center shadow-lg">
              <span className="text-2xl font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate">{user?.name || 'Orderbooker'}</h2>
              {user?.username && (
                <p className="text-xs text-blue-200 mt-0.5 flex items-center gap-1">
                  <UserCircle className="h-3 w-3" />
                  @{user.username}
                </p>
              )}
              {user?.phone && (
                <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {user.phone}
                </p>
              )}
            </div>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Role</span>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">
            Orderbooker
          </Badge>
        </CardContent>
      </Card>

      {/* Performance Stats */}
      <Card className="animate-fade-in relative overflow-hidden" style={{ animationDelay: '100ms' }}>
        <div className="absolute inset-0 pointer-events-none" />
        <CardHeader className="pb-2 relative z-10">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Performance — {currentMonth}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 relative z-10">
          {profileLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-sm font-bold text-green-600">{formatPKR(totalRecovery)}</p>
                <p className="text-[9px] text-muted-foreground">Total Recovery</p>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-sm font-bold text-blue-600">{uniqueShops}</p>
                <p className="text-[9px] text-muted-foreground">Shops Visited</p>
              </div>
              <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-sm font-bold text-amber-600">{formatPKR(avgPerVisit)}</p>
                <p className="text-[9px] text-muted-foreground">Avg / Visit</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Performance Summary Row */}
      <Card className="animate-fade-in relative overflow-hidden" style={{ animationDelay: '150ms' }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Weekly Performance — Last 4 Weeks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {weeklyLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : weeklyPerf ? (
            <div className="space-y-4">
              {/* 3 Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-sm font-bold text-green-600">{formatPKR(weeklyPerf.totalRecovered)}</p>
                  <p className="text-[9px] text-muted-foreground">Total Recovered</p>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="text-sm font-bold text-blue-600">{formatPKR(weeklyPerf.avgDaily)}</p>
                  <p className="text-[9px] text-muted-foreground">Daily Average</p>
                </div>
                <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="text-sm font-bold text-amber-600">
                    {weeklyPerf.bestDay ? formatPKR(weeklyPerf.bestDay.amount) : '—'}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Best Single Day</p>
                </div>
              </div>

              {/* Weekly Recovery Bar Chart */}
              {weeklyPerf.weeklyData.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Week-by-Week Breakdown</p>
                  {(() => {
                    const maxTotal = Math.max(...weeklyPerf.weeklyData.map((w) => w.total), 1);
                    const bestWeekIdx = weeklyPerf.weeklyData.reduce((best, w, i) => w.total > weeklyPerf.weeklyData[best].total ? i : best, 0);
                    const lowestWeekIdx = weeklyPerf.weeklyData.reduce((lowest, w, i) => w.total < weeklyPerf.weeklyData[lowest].total ? i : lowest, 0);

                    return weeklyPerf.weeklyData.map((week, idx) => {
                      const pct = maxTotal > 0 ? Math.round((week.total / maxTotal) * 100) : 0;
                      const isBest = idx === bestWeekIdx;
                      const isLowest = idx === lowestWeekIdx && weeklyPerf.weeklyData.length > 1;

                      let barClass = 'from-primary to-blue-500';
                      if (isBest) barClass = 'from-green-500 to-emerald-400';
                      else if (isLowest) barClass = 'from-amber-500 to-yellow-400';

                      return (
                        <div key={week.weekLabel}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-medium text-foreground">{week.weekLabel}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">{week.shopsVisited} shops</span>
                              <span className="text-xs font-bold tabular-nums">{formatPKR(week.total)}</span>
                            </div>
                          </div>
                          <div className="w-full h-6 bg-muted/50 dark:bg-muted/20 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-all duration-700 ease-out`}
                              style={{ width: `${Math.max(pct, 4)}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Best day callout */}
              {weeklyPerf.bestDay && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40">
                  <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Best day: <span className="font-semibold">{weeklyPerf.bestDay.date}</span> — collected{' '}
                    <span className="font-bold">{formatPKR(weeklyPerf.bestDay.amount)}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <BarChart3 className="h-8 w-8 mb-2 text-blue-300 dark:text-blue-700" />
              <p className="text-xs font-medium">No weekly data available</p>
              <p className="text-[10px] mt-0.5">Start collecting recovery to see your weekly stats</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="animate-fade-in" style={{ animationDelay: '250ms' }}>
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Actions</p>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 h-11"
            onClick={handleChangePassword}
          >
            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <KeyRound className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium">Change Password</span>
              <p className="text-[10px] text-muted-foreground">Update your account password</p>
            </div>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-3 h-11"
            onClick={handleOpenSettings}
          >
            <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Settings className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-left">
              <span className="text-sm font-medium">Settings</span>
              <p className="text-[10px] text-muted-foreground">Backup, sync & app settings</p>
            </div>
          </Button>
        </CardContent>
      </Card>

      {/* Share Profile */}
      <Card className="animate-fade-in" style={{ animationDelay: '350ms' }}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Share Profile</span>
            </div>
            <ShareMenu
              title="Share Profile"
              text={`${user?.name} is an orderbooker at Finexa. Recovery this month: ${formatPKR(totalRecovery)}`}
              className="h-9 w-9"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Share your profile info with shops or team members
          </p>
        </CardContent>
      </Card>

      {/* Local dialog instances (fallback when not provided by layout) */}
      {!onChangePassword && <ChangePasswordDialog open={localChangePasswordOpen} onOpenChange={setLocalChangePasswordOpen} />}
      {!onOpenSettings && <BackupSettingsDialog open={localSettingsOpen} onOpenChange={setLocalSettingsOpen} />}
    </div>
  );
}

// ─── Recovery History View ───────────────────────────────────────────────────

type HistoryDateFilter = '7days' | '30days' | 'all';

export function RecoveryHistory() {
  const { user } = useAppStore();
  const [allTransactions, setAllTransactions] = useState<RecoveryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>('all');

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/transactions?limit=500&type=recovery&status=approved&createdBy=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setAllTransactions(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Filter by date range
  const transactions = allTransactions.filter((txn) => {
    if (dateFilter === 'all') return true;
    const now = new Date();
    const txnDate = new Date(txn.createdAt);
    const cutoff = new Date();
    if (dateFilter === '7days') {
      cutoff.setDate(now.getDate() - 7);
    } else {
      cutoff.setDate(now.getDate() - 30);
    }
    return txnDate >= cutoff;
  });

  // Group by date
  const grouped = transactions.reduce<Record<string, RecoveryTransaction[]>>((acc, txn) => {
    const dateKey = new Date(txn.createdAt).toLocaleDateString('en-PK', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(txn);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped);

  const totalRecovered = transactions.reduce((s, t) => s + t.amount, 0);
  const avgPerEntry = transactions.length > 0 ? Math.round(totalRecovered / transactions.length) : 0;

  const filterButtons: { key: HistoryDateFilter; label: string }[] = [
    { key: '7days', label: 'Last 7 days' },
    { key: '30days', label: 'Last 30 days' },
    { key: 'all', label: 'All Time' },
  ];

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allTransactions.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Recovery History</h2>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Banknote className="h-10 w-10 mb-3 text-emerald-300 dark:text-emerald-700" />
            <p className="text-sm font-medium">No recovery history yet</p>
            <p className="text-xs mt-1">Start collecting recovery from shops to see your history here</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Recovery History</h2>
        </div>
      </div>

      {/* Summary Row */}
      <Card className="overflow-hidden animate-fade-in">
        <CardContent className="p-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Entries</p>
              <p className="text-sm font-bold tabular-nums">{transactions.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Total Recovered</p>
              <p className="text-sm font-bold text-green-600 tabular-nums">{formatPKR(totalRecovered)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Avg / Entry</p>
              <p className="text-sm font-bold tabular-nums">{formatPKR(avgPerEntry)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date Range Filter */}
      <div className="flex gap-2">
        {filterButtons.map((btn) => (
          <Button
            type="button"
            key={btn.key}
            size="sm"
            variant={dateFilter === btn.key ? 'default' : 'outline'}
            className={`flex-1 text-xs font-medium h-8 ${dateFilter === btn.key ? 'bg-primary hover:bg-primary/90 text-white' : 'hover:bg-muted'}`}
            onClick={() => setDateFilter(btn.key)}
          >
            {btn.label}
          </Button>
        ))}
      </div>

      {/* Filtered content */}
      {transactions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 text-amber-300 dark:text-amber-700" />
            <p className="text-sm">No recovery entries in this period</p>
            <p className="text-xs mt-1">Try selecting a different time range</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100dvh-18rem)]">
          <div className="space-y-4 pb-4">
            {dateKeys.map((dateKey) => {
              const items = grouped[dateKey];
              const dayTotal = items.reduce((s, t) => s + t.amount, 0);
              return (
                <div key={dateKey}>
                  {/* Date Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-sm font-semibold">{dateKey}</span>
                      <Badge variant="outline" className="text-[10px]">{items.length} entries</Badge>
                    </div>
                    <span className="text-sm font-bold text-green-600">{formatPKR(dayTotal)}</span>
                  </div>

                  {/* Transactions */}
                  <div className="space-y-2">
                    {items.map((txn) => (
                      <Card key={txn.id} className="card-hover overflow-hidden">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-sm font-semibold truncate">{txn.shop.name}</h4>
                                {txn.gpsLat && txn.gpsLng ? (
                                  <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="GPS captured" />
                                ) : (
                                  <div className="h-2 w-2 rounded-full bg-red-300 dark:bg-red-600 shrink-0" title="No GPS" />
                                )}
                              </div>
                              {txn.shop.area && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {txn.shop.area}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(txn.createdAt).toLocaleTimeString('en-PK', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <p className="text-sm font-bold text-green-600">
                                +{formatPKR(txn.amount)}
                              </p>
                              <div className="flex items-center gap-1 justify-end mt-0.5">
                                <Navigation className="h-2.5 w-2.5 text-muted-foreground" />
                                <span className="text-[9px] text-muted-foreground">
                                  {txn.gpsLat && txn.gpsLng ? 'GPS' : 'No GPS'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Day Total */}
                  <div className="flex items-center justify-end mt-2 pr-1">
                    <span className="text-[10px] text-muted-foreground">Day total:&nbsp;</span>
                    <span className="text-xs font-bold text-green-600">{formatPKR(dayTotal)}</span>
                  </div>

                  <Separator className="mt-3" />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── Main Layout ────────────────────────────────────────────────────────────

function OfflineBanner({ isOnline, unsyncedCount, syncing, onSync }: { isOnline: boolean; unsyncedCount: number; syncing: boolean; onSync: () => void }) {
  if (isOnline && unsyncedCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 animate-slide-down">
        <WifiOff className="h-3.5 w-3.5" />
        <span>You&apos;re offline. Shops loaded from cache. Recovery will be queued.</span>
      </div>
    );
  }

  return (
    <div className="bg-blue-500 text-white px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 animate-slide-down">
      <CloudUpload className="h-3.5 w-3.5" />
      <span>{unsyncedCount} pending recovery{unsyncedCount > 1 ? 'ies' : 'y'} to sync</span>
      <button
        onClick={onSync}
        disabled={syncing}
        className="ml-1 bg-white/20 hover:bg-white/30 px-2.5 py-0.5 rounded-full flex items-center gap-1 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
}

function PendingSyncCard({ transactions }: { transactions: PendingTransaction[] }) {
  if (transactions.length === 0) return null;

  // Get cached distributor phone for offline receipt display
  let cachedDistPhone: string | null = null;
  try {
    cachedDistPhone = localStorage.getItem('finexa-distributor-phone') || localStorage.getItem('alfalah-distributor-phone') || null;
  } catch { /* storage unavailable */ }

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <CloudOff className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Pending Offline Recovery ({transactions.length})
          </span>
        </div>
        <div className="space-y-1.5">
          {transactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className={`h-2 w-2 rounded-full shrink-0 ${txn.synced ? 'bg-green-500' : txn.syncError ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="truncate">{txn.shopName}</span>
                {(txn.distributorPhone || cachedDistPhone) && (
                  <span className="text-[9px] text-green-600 dark:text-green-400 shrink-0">
                    📞 {txn.distributorPhone || cachedDistPhone}
                  </span>
                )}
              </div>
              <span className="font-semibold text-amber-700 dark:text-amber-400 shrink-0 ml-2">
                Rs. {txn.amount.toLocaleString('en-PK')}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          These will sync automatically when you&apos;re back online.
        </p>
      </CardContent>
    </Card>
  );
}

export default function OrderbookerLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const onlineStatus = useOnlineStatus();

  // Sync store currentView from pathname
  const { syncViewFromPathname } = useAppStore();
  useEffect(() => {
    syncViewFromPathname(pathname);
  }, [pathname, syncViewFromPathname]);

  const handleLogout = () => {
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
  };

  if (!user) return null;

  const isDashboard = pathname === '/ob';
  const isHistory = pathname === '/ob/history';
  const isLedger = pathname === '/ob/ledger';
  const isProfile = pathname === '/ob/profile';
  const showBottomNav = isDashboard || isHistory || isLedger || isProfile;

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Offline Banner */}
      <OfflineBanner
        isOnline={onlineStatus.isOnline}
        unsyncedCount={onlineStatus.unsyncedCount}
        syncing={onlineStatus.syncing}
        onSync={onlineStatus.sync}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 relative flex items-center justify-between px-4 py-2.5 pt-[env(safe-area-inset-top,0px)] bg-primary text-primary-foreground border-b border-primary/20">
        <div className="flex items-center gap-2.5">
          {/* Online/Offline indicator */}
          <div className={`h-2 w-2 rounded-full ${onlineStatus.isOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400'}`} title={onlineStatus.isOnline ? 'Online' : 'Offline'} />
          {isLedger && (
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" aria-label="Back to home" onClick={() => router.push('/ob')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/20">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Finexa</h1>
            <p className="text-[9px] text-blue-200 leading-tight hidden sm:block">
              {isHistory ? 'Recovery History' : isLedger ? 'Shop Ledger' : isProfile ? 'My Profile' : 'Orderbooker Portal'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white">{user.name}</p>
            <p className="text-[9px] text-white/70">Orderbooker</p>
          </div>
          <ShareMenu
            title="Share"
            text="Finexa - Smart Credit Management"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 border-0 p-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setChangePasswordOpen(true)}
            title="Change Password"
            aria-label="Change password"
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-white/80 hover:text-white hover:bg-white/10 gap-1.5 text-xs font-medium"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="inline">Logout</span>
          </Button>
          <div className="relative sm:hidden">
            <div className="avatar-ring">
              <div className="h-7 w-7 bg-white/20 flex items-center justify-center text-xs font-bold text-white">
                {user.name.charAt(0)}
              </div>
            </div>
            <span className="online-dot text-white" />
          </div>
        </div>
        {/* Clean bottom border */}
        {/* Current date - mobile - improved visibility */}
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 sm:hidden">
          <span className="text-[10px] text-white/70 font-medium bg-white/10 px-2.5 py-1 rounded-md">
            <CalendarDays className="h-3 w-3 inline mr-1 -mt-px" />
            {formatNiceDate()}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto page-transition">
        {children}
      </main>

      {/* Bottom Nav */}
      {showBottomNav && (
        <nav className="sticky bottom-0 bottom-nav-glass z-40 safe-area-bottom">
          <div className="flex items-center justify-around py-2 px-2">
            <button
              className={`tab-indicator flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 ${isDashboard ? 'text-primary active bg-primary/8' : 'text-emerald-500 dark:text-emerald-400/70 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
              onClick={() => router.push('/ob')}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${isDashboard ? 'bg-primary/10' : ''}`}>
                <MapPin className={`h-4.5 w-4.5 ${isDashboard ? 'text-primary' : ''}`} />
              </div>
              <span className="text-[10px] font-semibold">My Route</span>
            </button>
            <button
              className={`tab-indicator flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 ${isHistory ? 'text-primary active bg-primary/8' : 'text-blue-500 dark:text-blue-400/70 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
              onClick={() => router.push('/ob/history')}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${isHistory ? 'bg-primary/10' : ''}`}>
                <Clock className={`h-4.5 w-4.5 ${isHistory ? 'text-primary' : ''}`} />
              </div>
              <span className="text-[10px] font-semibold">History</span>
            </button>
            <button
              className={`tab-indicator flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 ${isLedger ? 'text-primary active bg-primary/8' : 'text-amber-500 dark:text-amber-400/70 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
              onClick={() => router.push('/ob/ledger')}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${isLedger ? 'bg-primary/10' : ''}`}>
                <FileText className={`h-4.5 w-4.5 ${isLedger ? 'text-primary' : ''}`} />
              </div>
              <span className="text-[10px] font-semibold">Ledger</span>
            </button>
            <button
              className={`tab-indicator flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 ${isProfile ? 'text-primary active bg-primary/8' : 'text-violet-500 dark:text-violet-400/70 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}
              onClick={() => router.push('/ob/profile')}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center transition-colors ${isProfile ? 'bg-primary/10' : ''}`}>
                <User className={`h-4.5 w-4.5 ${isProfile ? 'text-primary' : ''}`} />
              </div>
              <span className="text-[10px] font-semibold">Profile</span>
            </button>
          </div>
        </nav>
      )}

      {/* Change Password Dialog */}
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

      {/* Settings & Backup Dialog */}
      <BackupSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Session Timeout Dialog */}
      <SessionTimeoutDialog />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt floating />
    </div>
  );
}

// ─── Pull to Refresh Hook ────────────────────────────────────────────────────

function usePullToRefresh(onRefresh: () => void) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0 && !isRefreshing) {
        startYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isRefreshing) return;
      if (el.scrollTop > 0) {
        setPullDistance(0);
        return;
      }
      const diff = e.touches[0].clientY - startYRef.current;

      if (diff < 0) {
        setPullDistance(0);
        return;
      }

      const distance = Math.max(0, Math.min((diff - 20) * 0.5, threshold));
      setPullDistance(distance);

      if (diff > 20) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (isRefreshing) return;
      if (pullDistance >= threshold * 0.8) {
        setIsRefreshing(true);
        setPullDistance(0);
        onRefresh();
        setTimeout(() => {
          setIsRefreshing(false);
        }, 1000);
      } else {
        setPullDistance(0);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isRefreshing, pullDistance, onRefresh]);

  return { containerRef, isRefreshing, pullDistance };
}

// ─── Orderbooker Dashboard ──────────────────────────────────────────────────

export function OrderbookerDashboard() {
  const { user } = useAppStore();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Success overlay state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successShopName, setSuccessShopName] = useState('');
  const [successAmount, setSuccessAmount] = useState('');

  // Recovery summary state
  const [todayRecovery, setTodayRecovery] = useState<RecoveryTransaction[]>([]);
  const [recoverySummaryLoading, setRecoverySummaryLoading] = useState(true);

  // Shop detail dialog state
  const [shopDetailOpen, setShopDetailOpen] = useState(false);
  const [shopDetailData, setShopDetailData] = useState<Shop | null>(null);
  const [shopTransactions, setShopTransactions] = useState<ShopTransaction[]>([]);
  const [shopTxLoading, setShopTxLoading] = useState(false);

  // Pending offline transactions
  const [pendingTxns, setPendingTxns] = useState<PendingTransaction[]>([]);

  const todayDay = getTodayRouteDay();

  const fetchShops = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch ALL shops assigned to this orderbooker (no day filter)
      const res = await apiFetch(`/api/shops?orderbookerId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        setIsOfflineMode(false);

        // Fetch distributor phone for the orderbooker's company (for offline receipts)
        let distributorPhone: string | null = null;
        let companyName: string | null = null;
        try {
          const dpRes = await apiFetch(`/api/companies/distributor-phone${user.companyId ? `?companyId=${user.companyId}` : ''}`);
          if (dpRes.ok) {
            const dpData = await dpRes.json();
            distributorPhone = dpData.distributorPhone || null;
            companyName = dpData.companyName || null;
          }
        } catch { /* non-blocking */ }

        // Cache distributor phone in localStorage for offline use
        try {
          localStorage.setItem('finexa-distributor-phone', distributorPhone || '');
          localStorage.setItem('finexa-company-name', companyName || '');
        } catch { /* storage unavailable */ }

        // Cache shops for offline use (including company/distributor info for receipts)
        cacheShops(data.map((s: Shop) => ({
          id: s.id,
          name: s.name,
          ownerName: s.ownerName,
          area: s.area,
          phone: s.phone,
          routeDays: s.routeDays,
          balance: s.balance,
          creditLimit: s.creditLimit,
          status: s.status,
          orderbookerId: s.orderbooker?.id || '',
          orderbookerName: s.orderbooker?.name || '',
          companyId: s.companyBalances?.[0]?.companyId || user.companyId || null,
          companyName: s.companyBalances?.[0]?.companyName || companyName || null,
          distributorPhone: distributorPhone,
          companyBalances: s.companyBalances?.map(cb => ({
            companyId: cb.companyId,
            companyName: cb.companyName,
            balance: cb.balance,
            creditLimit: cb.creditLimit,
          })),
        })));
      }
    } catch {
      // Network error — try loading from cache
      const cached = getCachedShops();
      if (cached.length > 0) {
        // Also restore cached distributor phone
        let cachedDistPhone: string | null = null;
        let cachedCompanyName: string | null = null;
        try {
          cachedDistPhone = localStorage.getItem('finexa-distributor-phone') || localStorage.getItem('alfalah-distributor-phone') || null;
          cachedCompanyName = localStorage.getItem('finexa-company-name') || localStorage.getItem('alfalah-company-name') || null;
        } catch { /* storage unavailable */ }

        setShops(cached.map((s: CachedShop) => ({
          id: s.id,
          name: s.name,
          ownerName: s.ownerName,
          area: s.area,
          phone: s.phone,
          routeDays: s.routeDays,
          balance: s.balance,
          creditLimit: s.creditLimit,
          status: s.status,
          orderbooker: { id: s.orderbookerId, name: s.orderbookerName },
          companyId: s.companyId,
          companyName: s.companyName,
          distributorPhone: s.distributorPhone || cachedDistPhone,
          companyBalances: s.companyBalances,
        })));
        setIsOfflineMode(true);
        toast({ title: 'Offline Mode', description: `Loaded ${cached.length} shops from cache (${getCacheAge()})` });
      }
    } finally { setLoading(false); }
  }, [user, refreshKey]);

  const fetchTodayRecovery = useCallback(async () => {
    if (!user) return;
    setRecoverySummaryLoading(true);
    try {
      const today = getLocalDateString();
      const res = await apiFetch(`/api/transactions?date=${today}&limit=50&type=recovery&status=approved&createdBy=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setTodayRecovery(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setRecoverySummaryLoading(false); }
  }, [user]);

  useEffect(() => { fetchShops(); }, [fetchShops]);
  useEffect(() => { fetchTodayRecovery(); }, [fetchTodayRecovery, refreshKey]);

  // Day-change detection: auto-refresh when a new day starts
  const [currentDateKey, setCurrentDateKey] = useState(getLocalDateString());
  useEffect(() => {
    const interval = setInterval(() => {
      const today = getLocalDateString();
      if (today !== currentDateKey) {
        setCurrentDateKey(today);
        // Clear today's recovery and refresh everything
        setTodayRecovery([]);
        setRefreshKey((k) => k + 1);
      }
    }, 60000); // Check every 60 seconds
    return () => clearInterval(interval);
  }, [currentDateKey]);

  // Visibility change: refresh when user comes back to the tab
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        const today = getLocalDateString();
        if (today !== currentDateKey) {
          setCurrentDateKey(today);
          setTodayRecovery([]);
          setRefreshKey((k) => k + 1);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [currentDateKey]);

  // Load pending transactions
  useEffect(() => {
    setPendingTxns(getPendingTransactions());
  }, [refreshKey]);

  // Pull to refresh
  const handlePullRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const { containerRef, isRefreshing, pullDistance } = usePullToRefresh(handlePullRefresh);

  // Recovery summary calculations (only today's shops for visited progress)
  const totalRecovered = todayRecovery.reduce((s, t) => s + t.amount, 0);
  const visitedShopIds = new Set(todayRecovery.map((t) => t.shop.id));
  const shopsVisited = visitedShopIds.size;
  const todayShops = shops.filter((s) => s.routeDays.includes(todayDay));
  const shopsTotal = todayShops.length;
  const avgRecovery = shopsVisited > 0 ? Math.round(totalRecovered / shopsVisited) : 0;

  // Check if admin has enabled "All Routes" for this orderbooker
  const allRoutesEnabled = user?.allRoutesEnabled === true;

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Error', description: 'Geolocation not supported', variant: 'destructive' });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGpsLoading(false);
        toast({ title: 'Location Captured', description: 'GPS coordinates recorded' });
      },
      (err) => {
        setGpsLoading(false);
        toast({ title: 'GPS Error', description: err.message, variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const openRecoveryDialog = (shop: Shop) => {
    setSelectedShop(shop);
    setRecoveryAmount('');
    setRecoveryNote('');
    setGpsLat(null);
    setGpsLng(null);
    setRecoveryDialogOpen(true);
  };

  const openShopDetail = async (shop: Shop) => {
    setShopDetailData(shop);
    setShopDetailOpen(true);
    setShopTxLoading(true);
    setShopTransactions([]);
    try {
      const res = await apiFetch(`/api/reports/ledger?shopId=${shop.id}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setShopTransactions(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setShopTxLoading(false); }
  };

  const handlePostRecovery = async () => {
    if (!selectedShop || !user || !recoveryAmount || parseFloat(recoveryAmount) <= 0) {
      toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(recoveryAmount);
    const description = recoveryNote?.trim()
      ? `Cash collected by orderbooker. Note: ${recoveryNote.trim()}`
      : 'Cash collected by orderbooker';

    setPosting(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          type: 'recovery',
          amount,
          description,
          createdBy: user.id,
          gpsLat: gpsLat || undefined,
          gpsLng: gpsLng || undefined,
          companyId: user.companyId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      // Success — online
      setSuccessShopName(selectedShop.name);
      setSuccessAmount(recoveryAmount);
      setRecoveryDialogOpen(false);
      setShowSuccess(true);
      setRefreshKey((k) => k + 1);
    } catch {
      // Network error — queue for offline sync
      // Get cached distributor phone for receipt
      let offlineDistPhone: string | null = null;
      let offlineCompanyName: string | null = null;
      try {
        offlineDistPhone = localStorage.getItem('finexa-distributor-phone') || localStorage.getItem('alfalah-distributor-phone') || selectedShop.distributorPhone || null;
        offlineCompanyName = localStorage.getItem('finexa-company-name') || localStorage.getItem('alfalah-company-name') || selectedShop.companyName || null;
      } catch { /* storage unavailable */ }

      addPendingTransaction({
        shopId: selectedShop.id,
        shopName: selectedShop.name,
        type: 'recovery',
        amount,
        description,
        createdBy: user.id,
        gpsLat,
        gpsLng,
        distributorPhone: offlineDistPhone,
        companyName: offlineCompanyName,
      });

      setPendingTxns(getPendingTransactions());
      setSuccessShopName(selectedShop.name);
      setSuccessAmount(recoveryAmount);
      setRecoveryDialogOpen(false);
      setShowSuccess(true);

      toast({
        title: 'Saved Offline',
        description: `Recovery Rs. ${amount.toLocaleString('en-PK')} queued. Will sync when online.`,
      });

      // Update local balance optimistically
      setShops(prev => prev.map(s =>
        s.id === selectedShop.id ? { ...s, balance: Math.max(0, s.balance - amount) } : s
      ));
    } finally {
      setPosting(false);
    }
  };

  const totalOutstanding = shops.reduce((s, shop) => s + getShopDisplayBalance(shop, user?.companyId || null), 0);

  // Progress percentage for shop visit progress bar
  const visitProgress = shopsTotal > 0 ? Math.round((shopsVisited / shopsTotal) * 100) : 0;

  // Helper: render a shop card
  const renderShopCard = (shop: Shop, idx: number) => {
    const displayBalance = getShopDisplayBalance(shop, user?.companyId || null);
    const isOverLimit = shop.creditLimit > 0 && displayBalance > shop.creditLimit;
    const isTodayShop = shop.routeDays.includes(todayDay);
    return (
      <Card
        key={shop.id}
        className={`card-hover overflow-hidden cursor-pointer ${isOverLimit ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20' : ''}`}
        style={{ animationDelay: `${Math.min(idx * 40, 300)}ms` }}
        onClick={() => openShopDetail(shop)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm truncate">{shop.name}</h3>
                {visitedShopIds.has(shop.id) && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                )}
                {isOverLimit && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800 text-[9px] font-bold animate-pulse shrink-0">
                    ⚠ Over Limit
                  </Badge>
                )}
                {!isTodayShop && (
                  <Badge variant="outline" className="text-[9px] text-muted-foreground shrink-0">
                    {shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                  </Badge>
                )}
              </div>
              {shop.area && (
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{shop.area}</span>
                </div>
              )}
              {shop.ownerName && (
                <p className="text-xs text-muted-foreground mt-0.5">Owner: {shop.ownerName}</p>
              )}
              {shop.creditLimit > 0 && (
                <>
                  <p className={`text-[10px] mt-0.5 font-medium ${isOverLimit ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                    Limit: {formatPKR(shop.creditLimit)}
                  </p>
                  {isOverLimit && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      Over limit ({formatPKR(displayBalance)} / {formatPKR(shop.creditLimit)})
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className={`text-lg font-bold ${displayBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatPKR(displayBalance)}
              </p>
              <p className="text-[10px] text-muted-foreground">Balance</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
            type="button"
              size="sm"
              className="flex-1 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium  "
              onClick={(e) => {
                e.stopPropagation();
                openRecoveryDialog(shop);
              }}
            >
              <Banknote className="h-3.5 w-3.5 mr-1.5" />
              Collect Recovery
            </Button>
            {shop.phone && (
              <Button
            type="button"
                size="sm"
                variant="outline"
                className="h-9 w-9 p-0 shrink-0 border-green-200 dark:border-green-800 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-700"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = `tel:${shop.phone}`;
                }}
                aria-label={`Call ${shop.name}`}
              >
                <PhoneCall className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div ref={containerRef} className="space-y-4 p-4" style={{ touchAction: 'pan-y' }}>
      {/* Pull to Refresh Indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{
          height: isRefreshing ? 48 : pullDistance,
          opacity: (isRefreshing || pullDistance > 10) ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium">{isRefreshing ? 'Refreshing...' : 'Pull to refresh'}</span>
        </div>
      </div>

      {/* Success Overlay */}
      <SuccessOverlay
        show={showSuccess}
        shopName={successShopName}
        amount={successAmount}
        onClose={() => setShowSuccess(false)}
      />

      {/* Day Header with Progress Bar */}
      <div className="bg-primary rounded-xl p-4 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute top-2 right-14 w-8 h-8 rounded-full bg-white/8" />
        <div className="absolute bottom-3 left-1/3 w-12 h-12 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/2 right-1/4 w-6 h-6 rounded-full bg-white/[0.06]" />
        <div className="relative z-10">
          <p className="text-xs text-blue-200 uppercase tracking-wider font-medium">Today's Route</p>
          <h2 className="text-xl font-bold mt-0.5">{todayDay ? todayDay.charAt(0).toUpperCase() + todayDay.slice(1) : 'Off Day'}</h2>
          <p className="text-xs text-blue-100 mt-1">{todayShops.length} shops scheduled today &bull; {shops.length} total assigned</p>
        </div>

        {/* Shop Visit Progress Bar */}
        {shopsTotal > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-blue-100">
                {shopsVisited} of {shopsTotal} shops visited
              </span>
              <span className="text-[10px] font-medium text-blue-100">{visitProgress}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all duration-500"
                style={{ width: `${visitProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="stat-card-blue animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Store className="h-4 w-4 text-blue-600" />
              <span className="text-[10px] text-muted-foreground font-medium">Total Shops</span>
            </div>
            <p className="text-xl font-bold number-display">{shops.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-red animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-red-500" />
              <span className="text-[10px] text-muted-foreground font-medium">Outstanding</span>
            </div>
            <p className="text-lg font-bold text-red-600 number-display">{formatPKR(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Recovery Summary */}
      <Card className="overflow-hidden animate-fade-in relative">
        <div className="absolute inset-0 pointer-events-none" />
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Today&apos;s Recovery</p>
              <p className="text-[9px] text-green-100">Collection performance</p>
            </div>
            {isOfflineMode && (
              <Badge className="ml-auto bg-amber-100 text-amber-700 text-[9px] border-0">OFFLINE</Badge>
            )}
          </div>
        </div>
        <CardContent className="p-4 glass-card">
          {recoverySummaryLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : todayRecovery.length === 0 ? (
            <div className="text-center py-3">
              <Zap className="h-6 w-6 mx-auto mb-1.5 text-amber-500" />
              <p className="text-xs font-medium text-muted-foreground">No recovery collected yet today</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Start your route and collect from the shops below!
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-around">
              {/* Collected stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-xs font-bold text-green-600">{formatPKR(totalRecovered)}</p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Collected</p>
              </div>

              {/* Visited stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-xs font-bold text-blue-600">
                  {shopsVisited}/{shopsTotal}
                  <span className="text-[9px] font-normal text-muted-foreground ml-1">shops</span>
                </p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Visited</p>
              </div>

              {/* Avg stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-xs font-bold text-amber-600">{formatPKR(avgRecovery)}</p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Avg / Shop</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Offline Recovery Card */}
      <PendingSyncCard transactions={pendingTxns.filter(t => !t.synced)} />

      {/* Shop Cards - Grouped by Route Day */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shops.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Store className="h-8 w-8 mb-2 text-cyan-300 dark:text-cyan-700" />
            <p className="text-sm font-medium">No shops assigned</p>
            <p className="text-xs mt-1">Contact admin to get shops assigned to your route</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {allRoutesEnabled ? (
            /* ═══ ALL ROUTES MODE (admin enabled) ═══ */
            <>
              {/* All Routes Banner */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Layers className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">All Routes Mode</p>
                  <p className="text-[10px] text-blue-600/70 dark:text-blue-300/60">Showing all days&apos; shops together (enabled by admin)</p>
                </div>
              </div>

              {/* Today's Route (highlighted at top) */}
              {todayShops.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <h3 className="text-sm font-bold text-foreground">Today &mdash; {todayDay.charAt(0).toUpperCase() + todayDay.slice(1)}</h3>
                    <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 dark:border-green-800">{todayShops.length} shops</Badge>
                  </div>
                  {todayShops.map((shop, idx) => renderShopCard(shop, idx))}
                </div>
              )}

              {/* All Other Days */}
              {(() => {
                const otherShops = shops.filter((s) => !s.routeDays.includes(todayDay));
                if (otherShops.length === 0) return null;

                const grouped: Record<string, Shop[]> = {};
                otherShops.forEach((s) => {
                  const day = s.routeDays[0] || 'unscheduled';
                  if (!grouped[day]) grouped[day] = [];
                  grouped[day].push(s);
                });

                const dayOrder = [...ROUTE_DAYS];
                const sortedDays = Object.keys(grouped).sort((a, b) => {
                  const aIdx = a === 'unscheduled' ? 999 : dayOrder.indexOf(a);
                  const bIdx = b === 'unscheduled' ? 999 : dayOrder.indexOf(b);
                  return aIdx - bIdx;
                });

                return sortedDays.map((day) => {
                  const dayShops = grouped[day];
                  return (
                    <div key={day} className="space-y-2">
                      <Separator className="my-2" />
                      <div className="flex items-center gap-2 pl-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {day === 'unscheduled' ? 'Unscheduled' : day.charAt(0).toUpperCase() + day.slice(1)}
                        </span>
                        <Badge variant="outline" className="text-[9px]">{dayShops.length} shops</Badge>
                      </div>
                      {dayShops.map((shop, idx) => renderShopCard(shop, idx))}
                    </div>
                  );
                });
              })()}
            </>
          ) : (
            /* ═══ NORMAL DAY-WISE MODE ═══ */
            <>
              {/* Today's Route Shops - ONLY today's shops visible */}
              {todayShops.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <h3 className="text-sm font-bold text-foreground">Today's Route &mdash; {todayDay.charAt(0).toUpperCase() + todayDay.slice(1)}</h3>
                    <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 dark:border-green-800">{todayShops.length} shops</Badge>
                  </div>
                  {todayShops.map((shop, idx) => renderShopCard(shop, idx))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {todayDay ? `No shops scheduled for ${todayDay.charAt(0).toUpperCase() + todayDay.slice(1)}` : 'Today is off — no route scheduled'}
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Contact admin if you need access to other routes</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Recovery Dialog */}
      <RecoveryDialog
        open={recoveryDialogOpen}
        onOpenChange={setRecoveryDialogOpen}
        shop={selectedShop}
        amount={recoveryAmount}
        setAmount={setRecoveryAmount}
        note={recoveryNote}
        setNote={setRecoveryNote}
        gpsLat={gpsLat}
        gpsLng={gpsLng}
        gpsLoading={gpsLoading}
        onCaptureGPS={captureGPS}
        onPost={handlePostRecovery}
        posting={posting}
      />

      {/* Shop Detail Dialog */}
      <ShopDetailDialog
        open={shopDetailOpen}
        onOpenChange={setShopDetailOpen}
        shop={shopDetailData}
        transactions={shopTransactions}
        loading={shopTxLoading}
        onCollectRecovery={(shop) => {
          setShopDetailOpen(false);
          openRecoveryDialog(shop);
        }}
      />
    </div>
  );
}

// ─── Recovery Dialog ────────────────────────────────────────────────────────

function RecoveryDialog({
  open,
  onOpenChange,
  shop,
  amount,
  setAmount,
  note,
  setNote,
  gpsLat,
  gpsLng,
  gpsLoading,
  onCaptureGPS,
  onPost,
  posting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shop: Shop | null;
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsLoading: boolean;
  onCaptureGPS: () => void;
  onPost: () => void;
  posting: boolean;
}) {
  return (
    <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-5" />
        {shop && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Banknote className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-base">Collect Recovery</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5 pl-10">{shop.name} &bull; Current: <span className="font-semibold text-red-600">{formatPKR(getShopDisplayBalance(shop, user?.companyId || null))}</span></p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Amount (Rs.)</label>
                <Input
                  type="number"
                  placeholder="Enter recovery amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[500, 1000, 2000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        amount === String(preset)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Rs. {preset.toLocaleString('en-PK')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Recovery Note <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="Add a note about this recovery..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="resize-none min-h-[60px] text-sm"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">GPS Location</label>
                <Button
            type="button"
                  variant="outline"
                  className="w-full"
                  onClick={onCaptureGPS}
                  disabled={gpsLoading}
                >
                  {gpsLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : gpsLat && gpsLng ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  ) : (
                    <Navigation className="h-4 w-4 mr-2" />
                  )}
                  {gpsLat && gpsLng ? 'Location Captured' : 'Capture Location'}
                </Button>
                {gpsLat && gpsLng && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}
                    </p>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${gpsLat}&mlon=${gpsLng}#map=17/${gpsLat}/${gpsLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" /> Map
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
            type="button"
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={onPost}
                disabled={posting || !amount || parseFloat(amount) <= 0}
              >
                {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Collect
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shop Detail Dialog ───────────────────────────────────────────────────

function ShopDetailDialog({
  open,
  onOpenChange,
  shop,
  transactions,
  loading,
  onCollectRecovery,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shop: Shop | null;
  transactions: ShopTransaction[];
  loading: boolean;
  onCollectRecovery: (shop: Shop) => void;
}) {
  if (!open || !shop) return null;

  return (
    <div className="fixed inset-0 z-50 block">
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-x-0 bottom-0 top-12 bg-card rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200 flex flex-col max-h-[calc(100dvh-3rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Back" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-bold">Shop Details</h3>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="space-y-4">
            {/* Shop Info Card */}
            <div className="bg-primary rounded-xl p-4 text-white relative overflow-hidden">
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
              <div className="relative z-10">
                <h2 className="text-lg font-bold">{shop.name}</h2>
                {shop.area && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {shop.area}
                  </p>
                )}
                {shop.ownerName && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <Store className="h-3 w-3" /> {shop.ownerName}
                  </p>
                )}
                {shop.phone && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {shop.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Balance & Credit Limit */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="stat-card-red">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Current Balance</p>
                  <p className={`text-lg font-bold ${getShopDisplayBalance(shop, user?.companyId || null) > 0 ? 'text-red-600' : 'text-green-600'} tabular-nums`}>
                    {formatPKR(getShopDisplayBalance(shop, user?.companyId || null))}
                  </p>
                </CardContent>
              </Card>
              <Card className="stat-card-blue">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Credit Limit</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    {shop.creditLimit > 0 ? formatPKR(shop.creditLimit) : 'N/A'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Distributor / Company Info */}
            {(shop.distributorPhone || shop.companyName) && (
              <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Phone className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-[10px] text-green-700 dark:text-green-400 font-semibold uppercase tracking-wider">
                      {shop.companyName ? `${shop.companyName} Distributor` : 'Distributor'}
                    </span>
                  </div>
                  {shop.distributorPhone && (
                    <a
                      href={`tel:${shop.distributorPhone}`}
                      className="text-sm font-bold text-green-700 dark:text-green-300 hover:underline"
                    >
                      {shop.distributorPhone}
                    </a>
                  )}
                  {!shop.distributorPhone && (
                    <p className="text-xs text-muted-foreground">No distributor number available</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Credit Limit Utilization */}
            {shop.creditLimit > 0 && (() => {
              const displayBal = getShopDisplayBalance(shop, user?.companyId || null);
              return (
              <Card className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Limit Used</span>
                    <span className="text-[10px] font-semibold text-foreground tabular-nums">
                      {Math.min(Math.round((displayBal / shop.creditLimit) * 100), 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        displayBal > shop.creditLimit
                          ? 'bg-red-500'
                          : displayBal > shop.creditLimit * 0.8
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(Math.round((displayBal / shop.creditLimit) * 100), 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-muted-foreground">0</span>
                    <span className="text-[9px] text-muted-foreground">{formatPKR(shop.creditLimit)}</span>
                  </div>
                </CardContent>
              </Card>
            );
            })()}

            {/* Recent Transactions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  Recent Transactions
                </h3>
                <Badge variant="outline" className="text-[10px]">Last 5</Badge>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 text-blue-300 dark:text-blue-700" />
                    <p className="text-xs">No transactions yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {transactions.map((txn) => (
                    <Card key={txn.id} className={`overflow-hidden ${txn.type === 'claim' ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-[9px] px-1.5 py-0 ${txn.type === 'credit' ? 'badge-credit' : txn.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : 'Recovery'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleDateString('en-PK', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{txn.description || '—'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm tabular-nums ${txn.type === 'credit' ? 'text-amber-600' : txn.type === 'claim' ? 'text-red-600' : 'text-green-600'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">Bal: {formatPKR(txn.newBalance)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Collect Recovery Button at Bottom */}
        <div className="shrink-0 border-t border-border/50 bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            {shop.phone && (
              <Button
            type="button"
                variant="outline"
                className="h-11 w-11 p-0 shrink-0 border-green-200 dark:border-green-800 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                onClick={() => { window.location.href = `tel:${shop.phone}`; }}
                aria-label={`Call ${shop.name}`}
              >
                <PhoneCall className="h-4 w-4" />
              </Button>
            )}
            <Button
            type="button"
              className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white font-medium  "
              onClick={() => onCollectRecovery(shop)}
            >
              <Banknote className="h-4 w-4 mr-2" />
              Collect Recovery
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ledger View ────────────────────────────────────────────────────────────

export function LedgerView() {
  const { user, selectedShopId, setSelectedShopId } = useAppStore();
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerCompanyFilter, setLedgerCompanyFilter] = useState<string>('all');
  const [companies, setCompanies] = useState<{ id: string; name: string; status: string }[]>([]);

  const fetchShops = useCallback(async () => {
    if (!user) return;
    setLoadingShops(true);
    try {
      const res = await apiFetch(`/api/shops?orderbookerId=${user.id}`);
      if (res.ok) setShops(await res.json());
    } catch { /* silent */ }
    finally { setLoadingShops(false); }
  }, [user]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/companies?status=active');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchShops(); fetchCompanies(); }, [fetchShops, fetchCompanies]);

  const fetchLedger = useCallback(async (shopId: string, companyId?: string) => {
    setLoadingLedger(true);
    setSelectedShopId(shopId);
    setLedgerCompanyFilter(companyId || 'all');
    try {
      const filterId = companyId && companyId !== 'all' ? companyId : '';
      const url = filterId
        ? `/api/reports/ledger?shopId=${shopId}&companyId=${filterId}`
        : `/api/reports/ledger?shopId=${shopId}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (filterId) {
          data.filteredCompanyName = companies.find(c => c.id === filterId)?.name || null;
        }
        setLedger(data);
      }
    } catch { /* silent */ }
    finally { setLoadingLedger(false); }
  }, [setSelectedShopId, companies]);

  const handleLedgerCompanyChange = async (companyId: string) => {
    setLedgerCompanyFilter(companyId);
    if (!selectedShopId) return;
    setLoadingLedger(true);
    try {
      const filterId = companyId !== 'all' ? companyId : '';
      const url = filterId
        ? `/api/reports/ledger?shopId=${selectedShopId}&companyId=${filterId}`
        : `/api/reports/ledger?shopId=${selectedShopId}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (filterId) {
          data.filteredCompanyName = companies.find(c => c.id === filterId)?.name || null;
        }
        setLedger(data);
      }
    } catch { /* silent */ }
    finally { setLoadingLedger(false); }
  };

  const handleDownloadPDF = async () => {
    if (!ledger) return;
    await downloadLedgerPDF(ledger);
    toast({ title: 'PDF Downloaded', description: `${ledger.shop.name} ledger saved` });
  };

  const selectedShopName = shops.find((s) => s.id === selectedShopId)?.name;

  // Group shops by route day
  const groupedShops = (() => {
    const grouped: Record<string, Shop[]> = {};
    shops.forEach((s) => {
      const day = s.routeDays[0] || 'unscheduled';
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(s);
    });
    const dayOrder = [...ROUTE_DAYS];
    const sortedDays = Object.keys(grouped).sort((a, b) => {
      const aIdx = dayOrder.indexOf(a);
      const bIdx = dayOrder.indexOf(b);
      return aIdx - bIdx;
    });
    return sortedDays.map((day) => ({ day, shops: grouped[day] }));
  })();

  return (
    <div className="space-y-4 p-4">
      {selectedShopId && ledger ? (
        <>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Back to shop list" onClick={() => { setSelectedShopId(null); setLedger(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold truncate">{ledger.shop.name}</h2>
              <p className="text-xs text-muted-foreground">{ledger.shop.area || 'No area'}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
          </div>

          {/* Company Filter */}
          {companies.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Filter:</span>
              <button
                onClick={() => handleLedgerCompanyChange('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  ledgerCompanyFilter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                All
              </button>
              {(ledger.companyBalances || []).map((cb) => (
                <button
                  key={cb.companyId}
                  onClick={() => handleLedgerCompanyChange(cb.companyId)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    ledgerCompanyFilter === cb.companyId
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {cb.companyName} ({formatPKR(cb.balance)})
                </button>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Credit</p>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatPKR(ledger.summary.totalCredit)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Recovery</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatPKR(ledger.summary.totalRecovery)}</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Claims</p>
              <p className="text-sm font-bold text-red-700 dark:text-red-400">{formatPKR(ledger.summary.totalClaims || 0)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Balance</p>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{formatPKR(ledger.summary.currentBalance)}</p>
            </div>
          </div>

          {/* Transactions */}
          {loadingLedger ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <div className="divide-y divide-border">
                    {[...ledger.transactions].reverse().map((txn) => (
                      <div key={txn.id} className="px-4 py-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'badge-credit' : txn.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : 'Recovery'}
                              </Badge>
                              {txn.company && (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                                  {txn.company.name}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{txn.description || '\u2014'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm ${txn.type === 'credit' ? 'text-amber-600' : txn.type === 'claim' ? 'text-red-600' : 'text-green-600'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Bal: {formatPKR(txn.newBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">My Ledger</h2>
          <p className="text-sm text-muted-foreground">Select a shop to view its transaction history & download PDF</p>

          {loadingShops ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shops.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 text-amber-300 dark:text-amber-700" />
                <p className="text-sm">No shops assigned</p>
                <p className="text-xs mt-1">Contact admin to get shops assigned to your route</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5" />
                <span className="font-medium">{shops.length} shops assigned</span>
              </div>
              {groupedShops.map(({ day, shops: dayShops }) => (
                <div key={day} className="space-y-2">
                  <div className="flex items-center gap-2 pl-1">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </span>
                    <Badge variant="outline" className="text-[9px]">{dayShops.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {dayShops.map((shop) => (
                      <Card
                        key={shop.id}
                        className="cursor-pointer card-hover hover-lift"
                        onClick={() => fetchLedger(shop.id)}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{shop.name}</p>
                            <p className="text-xs text-muted-foreground">{shop.area || '\u2014'}{shop.ownerName ? ` \u2022 ${shop.ownerName}` : ''}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm ${getShopDisplayBalance(shop, user?.companyId || null) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatPKR(getShopDisplayBalance(shop, user?.companyId || null))}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Balance</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
