'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useAnimatedNumber } from '@/lib/use-animated-number';
import { getLocalDateString, WORKING_DAYS, formatPKR } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import dynamic from 'next/dynamic';

const DashboardCharts = dynamic(() => import('./DashboardCharts'), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted/20 rounded-lg" /> });
import { apiFetch } from '@/lib/api';
import {
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Activity,
  Plus,
  TrendingDown,
  Users,
  Clock,
  ExternalLink,
  Calendar,
  Sparkles,
  ChevronRight,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle,
  SkipForward,
} from 'lucide-react';

function PendingRecoveryBanner({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await apiFetch('/api/transactions/pending-summary');
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.count || 0);
          setPendingAmount(data.total || 0);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || pendingCount === 0) return null;

  return (
    <button
      onClick={() => onNavigate('/approve-recovery')}
      className="w-full rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 flex items-center justify-between hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-300 dark:hover:border-amber-800 transition-all group cursor-pointer animate-fade-in"
    >
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        <div className="text-left">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {pendingCount} Pending Recover{pendingCount === 1 ? 'y' : 'ies'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total: {formatPKR(pendingAmount)} — Click to review &amp; approve
          </p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 group-hover:translate-x-1 transition-transform" />
    </button>
  );
}

// ─── Overdue Shops Alert Widget ───
interface OverdueShop {
  id: string;
  name: string;
  area: string | null;
  balance: number;
  daysSinceCredit: number;
  daysSinceRecovery: number | null;
}

function OverdueShopsAlert({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [overdueShops, setOverdueShops] = useState<OverdueShop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOverdue() {
      try {
        const res = await apiFetch('/api/shops/needing-recovery?minDays=14');
        if (res.ok) {
          const data = await res.json();
          setOverdueShops(Array.isArray(data) ? data : data.shops || []);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    fetchOverdue();
    const interval = setInterval(fetchOverdue, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-red-500" />
          <span className="text-sm text-slate-500 dark:text-slate-400">Checking overdue shops...</span>
        </div>
      </div>
    );
  }

  if (overdueShops.length === 0) return null;

  const top5 = overdueShops.slice(0, 5);
  const criticalCount = overdueShops.filter(s => s.daysSinceCredit >= 30).length;

  return (
    <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-[#2E2E2E]">
        <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {overdueShops.length} shop{overdueShops.length === 1 ? '' : 's'} with credit 14+ days old and no recovery
        </span>
        {criticalCount > 0 && (
          <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full border bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900">
            {criticalCount} Critical · 30+ days
          </span>
        )}
      </div>
      <div className="px-4 py-3 divide-y divide-slate-100 dark:divide-slate-800">
        {top5.map((shop) => (
          <div key={shop.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`h-2 w-2 rounded-full shrink-0 ${shop.daysSinceCredit >= 30 ? 'bg-red-500' : 'bg-amber-500'}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{shop.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{shop.area || 'No area'} · {formatPKR(shop.balance)} balance</p>
              </div>
            </div>
            <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full border ${
              shop.daysSinceCredit >= 30
                ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}>
              {shop.daysSinceCredit}d
            </span>
          </div>
        ))}
      </div>
      {overdueShops.length > 5 && (
        <div className="border-t border-slate-200 dark:border-[#2E2E2E] px-4 py-2.5">
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1E40AF] dark:hover:text-blue-300 transition-colors"
            onClick={() => onNavigate('/shops')}
          >
            View All {overdueShops.length} Overdue Shops
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
  totalCreditPosted: number;
  totalRecovery: number;
}

interface TodayTxn {
  id: string;
  type: string;
  status: string;
  amount: number;
  createdAt: string;
  shop: { id: string; name: string; area: string };
  creator: { id: string; name: string; role: string };
}

interface DailyTrend {
  date: string;
  label: string;
  credit: number;
  recovery: number;
  net: number;
}

interface DashboardData {
  orderbookers: Orderbooker[];
  todayTxns: TodayTxn[];
  todayCredit: number;
  todayRecovery: number;
  totalShops: number;
  totalOutstanding: number;
}

interface TimelineEntry {
  id: string;
  type: string;
  shopName: string;
  shopArea: string | null;
  amount: number;
  description: string | null;
  createdBy: string;
  createdAt: string;
  balanceAfter: number;
}

interface Shop {
  id: string;
  name: string;
  area: string | null;
  routeDays: string[];
  balance: number;
  status: string;
}

interface MonthSummary {
  month: string;
  monthLabel: string;
  totalCredit: number;
  totalRecovery: number;
  netPosition: number;
  transactionCount: number;
  creditCount: number;
  recoveryCount: number;
  activeDays: number;
  creditChangePct: number;
  recoveryChangePct: number;
  netChangePct: number;
  prevTotalCredit: number;
  prevTotalRecovery: number;
  prevNetPosition: number;
}

interface SparklineData {
  orderbookerId: string;
  orderbookerName: string;
  data: number[];
  total: number;
  avg: number;
  trend: string;
}

const ROUTE_DAYS = [...WORKING_DAYS];
const ROUTE_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4'];

function RecoverySparkline({ data, width = 100, height = 28 }: { data: number[]; width?: number; height?: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 2;
  const chartHeight = height - padding * 2;
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  // Determine color based on trend (last 3 vs first 3)
  const halfLen = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, halfLen);
  const secondHalf = data.slice(halfLen);
  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const isUp = secondAvg > firstAvg;
  const hasData = data.some(d => d > 0);

  const strokeColor = isUp ? '#10B981' : '#EF4444';
  const fillColor = isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

  // Generate day labels for tooltip
  const today = new Date();
  const dayLabels = data.map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (data.length - 1 - i));
    return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' });
  });

  return (
    <div className="group relative inline-flex items-center">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        <polygon points={areaPoints} fill={fillColor} />
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Interactive hover areas */}
        {data.map((val, i) => {
          const cx = (i / (data.length - 1)) * width;
          const cy = height - padding - ((val - min) / range) * chartHeight;
          return (
            <g key={i}>
              <rect
                x={cx - width / data.length / 2}
                y={0}
                width={width / data.length}
                height={height}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
              />
              {hoveredIdx === i && (
                <>
                  <circle cx={cx} cy={cy} r={3.5} fill={strokeColor} stroke="white" strokeWidth={1.5} />
                  <line x1={cx} y1={cy} x2={cx} y2={height} stroke={strokeColor} strokeWidth={0.5} strokeDasharray="2 2" opacity={0.4} />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-popover text-popover-foreground text-[10px] font-medium rounded-md px-2 py-1 shadow-md border border-border whitespace-nowrap">
            <span className="text-muted-foreground">{dayLabels[hoveredIdx]}:</span>{' '}
            <span className="font-bold tabular-nums">{formatPKR(data[hoveredIdx])}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="skeleton-shimmer h-7 w-48 mb-1" />
        <Skeleton className="skeleton-shimmer h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="skeleton-shimmer h-2 w-2 rounded-full" />
              <Skeleton className="skeleton-shimmer h-3 w-24" />
            </div>
            <Skeleton className="skeleton-shimmer h-7 w-28 mb-2" />
            <Skeleton className="skeleton-shimmer h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <Skeleton className="skeleton-shimmer h-5 w-36" />
          </div>
          <div className="px-5 py-3 space-y-3 divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between pt-3 first:pt-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="skeleton-shimmer h-6 w-6 rounded-full" />
                  <Skeleton className="skeleton-shimmer h-4 w-28" />
                </div>
                <Skeleton className="skeleton-shimmer h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <Skeleton className="skeleton-shimmer h-5 w-36" />
          </div>
          <div className="px-5 py-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="skeleton-shimmer h-6 w-6 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton className="skeleton-shimmer h-4 w-32 mb-1" />
                  <Skeleton className="skeleton-shimmer h-3 w-48" />
                </div>
                <Skeleton className="skeleton-shimmer h-4 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAppStore();
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({
    orderbookers: [], todayTxns: [], todayCredit: 0, todayRecovery: 0, totalShops: 0, totalOutstanding: 0,
  });
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentTxns, setRecentTxns] = useState<TodayTxn[]>([]);
  const [recentTxnsLoading, setRecentTxnsLoading] = useState(true);
  const [bizSummary, setBizSummary] = useState<{ totalCredit: number; totalRecovery: number; netBalance: number } | null>(null);
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([]);
  const [sparklineLoading, setSparklineLoading] = useState(true);
  const [smsReport, setSmsReport] = useState<{
    total: number; sent: number; failed: number; skipped: number;
    smsCount: number; whatsappCount: number;
    perOB: Array<{ orderbookerId: string; orderbookerName: string; total: number; sent: number; failed: number; skipped: number; sms: number; whatsapp: number; }>;
  } | null>(null);

  // Animated number counters for KPI cards
  const animatedTodayCredit = useAnimatedNumber(data.todayCredit, 900);
  const animatedTodayRecovery = useAnimatedNumber(data.todayRecovery, 900);
  const animatedOutstanding = useAnimatedNumber(data.totalOutstanding, 1000);
  const animatedTotalShops = useAnimatedNumber(data.totalShops, 600);

  const loadDashboard = useCallback(async () => {
    try {
      // Try new aggregated API first, fallback to individual calls if it fails
      let d: any = null;
      try {
        const res = await apiFetch('/api/dashboard');
        if (res.ok) d = await res.json();
      } catch { /* aggregated API failed, try fallback */ }

      if (d) {
        // Aggregated API succeeded
        const orderbookers: Orderbooker[] = d.orderbookers || [];
        const todayTxns: TodayTxn[] = d.todayTransactions || [];
        const approvedTxns = todayTxns.filter((t: TodayTxn) => t.status === 'approved');
        const todayCredit = approvedTxns.filter((t: TodayTxn) => t.type === 'credit').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const todayRecovery = approvedTxns.filter((t: TodayTxn) => t.type === 'recovery').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const totalOutstanding = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalOutstanding, 0);
        const totalShops = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalShops, 0);

        const trendsData = d.dailyTrends || [];
        const shops = d.shops || [];
        const rawTimeline = Array.isArray(d.activityTimeline) ? d.activityTimeline : ((d.activityTimeline?.activities) || []);
        const timelineData: TimelineEntry[] = rawTimeline.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          type: (item.type as string) || 'credit',
          shopName: (item.shopName as string) || 'N/A',
          shopArea: item.shopArea as string | null,
          amount: (item.amount as number) || 0,
          description: item.description as string | null,
          createdBy: (item.performedBy as string) || (item.createdBy as string) || 'System',
          createdAt: item.createdAt as string,
          balanceAfter: (item.balanceAfter as number) || 0,
        }));
        const monthData = d.monthSummary || null;
        const rtData = d.recentTransactions || [];

        setData({ orderbookers, todayTxns, todayCredit, todayRecovery, totalShops, totalOutstanding });
        setTrends(trendsData);
        setAllShops(shops);
        setTimeline(timelineData);
        setMonthSummary(monthData);
        setRecentTxns(rtData);
        if (d.summary) setBizSummary(d.summary);
        if (d.smsReport) setSmsReport(d.smsReport);
      } else {
        // Fallback: use individual API calls (old method)
        const [obRes, todayTxnRes, shopsRes, trendsRes, tlRes, msRes, rtRes, summaryRes] = await Promise.all([
          apiFetch('/api/orderbookers'),
          apiFetch(`/api/transactions?date=${getLocalDateString()}&limit=500&status=approved`),
          apiFetch('/api/shops'),
          apiFetch('/api/reports/daily-trends'),
          apiFetch('/api/reports/activity-timeline?limit=20'),
          apiFetch('/api/reports/month-summary'),
          apiFetch('/api/transactions?limit=5&status=approved'),
          apiFetch('/api/summary'),
        ]);
        const orderbookers = obRes.ok ? await obRes.json() : [];
        const todayTxnData = todayTxnRes.ok ? await todayTxnRes.json() : { transactions: [] };
        const approvedTxns = todayTxnData.transactions.filter((t: TodayTxn) => t.status === 'approved');
        const todayCredit = approvedTxns.filter((t: TodayTxn) => t.type === 'credit').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const todayRecovery = approvedTxns.filter((t: TodayTxn) => t.type === 'recovery').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const totalOutstanding = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalOutstanding, 0);
        const totalShops = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalShops, 0);

        const trendsData = trendsRes.ok ? await trendsRes.json() : [];
        const shops = shopsRes.ok ? await shopsRes.json() : [];
        const tlResult = tlRes.ok ? await tlRes.json() : null;
        const rawTimeline = Array.isArray(tlResult) ? tlResult : (tlResult?.activities || []);
        const timelineData: TimelineEntry[] = rawTimeline.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          type: (item.type as string) || 'credit',
          shopName: (item.shopName as string) || 'N/A',
          shopArea: item.shopArea as string | null,
          amount: (item.amount as number) || 0,
          description: item.description as string | null,
          createdBy: (item.performedBy as string) || (item.createdBy as string) || 'System',
          createdAt: item.createdAt as string,
          balanceAfter: (item.balanceAfter as number) || 0,
        }));
        const monthData = msRes.ok ? await msRes.json() : null;
        const rtData = rtRes.ok ? await rtRes.json() : { transactions: [] };

        setData({ orderbookers, todayTxns: todayTxnData.transactions, todayCredit, todayRecovery, totalShops, totalOutstanding });
        setTrends(trendsData);
        setAllShops(shops);
        setTimeline(timelineData);
        setMonthSummary(monthData);
        setRecentTxns(rtData.transactions || []);
        if (summaryRes.ok) setBizSummary(await summaryRes.json());
      }
    } catch { /* silent */ }
    finally { setLoading(false); setTimelineLoading(false); setRecentTxnsLoading(false); }
  }, []);

  // Fetch OB recovery sparkline data
  useEffect(() => {
    async function fetchSparkline() {
      try {
        const res = await apiFetch('/api/reports/ob-recovery-sparkline?days=7');
        if (res.ok) setSparklineData(await res.json());
      } catch { /* silent */ }
      finally { setSparklineLoading(false); }
    }
    fetchSparkline();
  }, []);

  // Initial load on mount
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Auto-refresh every 60 seconds (reduced from 30s for performance)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      loadDashboard();
    }, 60000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [loadDashboard]);

  // Relative time helper
  function getTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    return `${diffDay}d ago`;
  }

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  }

  function formatTimeFull(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) {
      return `Today, ${formatTime(dateStr)}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${formatTime(dateStr)}`;
    }
    return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) + `, ${formatTime(dateStr)}`;
  }

  // Group timeline entries by date
  const timelineGroups = useMemo(() => {
    const groups: { key: string; label: string; entries: TimelineEntry[] }[] = [];
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    timeline.forEach((entry) => {
      const entryDate = new Date(entry.createdAt);
      const dateStr = entryDate.toDateString();
      let label: string;
      if (dateStr === today.toDateString()) label = 'Today';
      else if (dateStr === yesterday.toDateString()) label = 'Yesterday';
      else label = entryDate.toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' });

      const existing = groups.find((g) => g.key === dateStr);
      if (existing) existing.entries.push(entry);
      else groups.push({ key: dateStr, label, entries: [entry] });
    });
    return groups;
  }, [timeline]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Compute route distribution data
  const routeData = ROUTE_DAYS.map((day, idx) => ({
    name: day.charAt(0).toUpperCase() + day.slice(1),
    value: allShops.filter(s => Array.isArray(s.routeDays) && s.routeDays.includes(day)).length,
    fill: ROUTE_COLORS[idx],
  })).filter(d => d.value > 0);

  // Compute top 5 debtors
  const topDebtors = [...allShops]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const maxDebt = topDebtors.length > 0 ? topDebtors[0].balance : 1;

  // Compute subtitle metrics for KPI cards (change vs yesterday)
  const yesterdayTrendEntry = trends.length >= 2 ? trends[trends.length - 2] : null;
  const creditChangePct = (() => {
    if (!yesterdayTrendEntry || yesterdayTrendEntry.credit === 0) return null;
    return Math.round(((data.todayCredit - yesterdayTrendEntry.credit) / yesterdayTrendEntry.credit) * 100);
  })();
  const recoveryChangePct = (() => {
    if (!yesterdayTrendEntry || yesterdayTrendEntry.recovery === 0) return null;
    return Math.round(((data.todayRecovery - yesterdayTrendEntry.recovery) / yesterdayTrendEntry.recovery) * 100);
  })();

  return (
    <div className="space-y-6 page-transition">
      {/* Welcome Header — minimal */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Welcome back, {user?.name?.split(' ')[0] || 'Admin'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}
            {data.totalShops} shops across {data.orderbookers.length} orderbookers
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Live · updated every 60s</span>
        </div>
      </div>

      {/* KPI Cards — Clean Minimal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Credit */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today&apos;s Credit</span>
          </div>
          <p className="text-[28px] font-bold text-slate-900 dark:text-white tabular-nums leading-none number-animate number-display">{formatPKR(animatedTodayCredit)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {creditChangePct !== null ? (
              <span className={creditChangePct >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                {creditChangePct >= 0 ? '+' : ''}{creditChangePct}% from yesterday
              </span>
            ) : (
              <span>Total credits posted today</span>
            )}
          </p>
        </div>
        {/* Today's Recovery */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today&apos;s Recovery</span>
          </div>
          <p className="text-[28px] font-bold text-slate-900 dark:text-white tabular-nums leading-none number-animate number-display">{formatPKR(animatedTodayRecovery)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            {recoveryChangePct !== null ? (
              <span className={recoveryChangePct >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                {recoveryChangePct >= 0 ? '+' : ''}{recoveryChangePct}% from yesterday
              </span>
            ) : (
              <span>Total recoveries collected today</span>
            )}
          </p>
        </div>
        {/* Total Outstanding */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Outstanding</span>
          </div>
          <p className="text-[28px] font-bold text-slate-900 dark:text-white tabular-nums leading-none number-animate number-display">{formatPKR(animatedOutstanding)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            <span>Outstanding across all shops</span>
          </p>
        </div>
        {/* Total Active Shops */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-cyan-500" />
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Shops</span>
          </div>
          <p className="text-[28px] font-bold text-slate-900 dark:text-white tabular-nums leading-none number-animate number-display">{animatedTotalShops}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
            <span>Across {data.orderbookers.length} orderbookers</span>
          </p>
        </div>
      </div>

      {/* Monthly Overview — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-[#2E2E2E]">
          <Calendar className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            Monthly Overview — {monthSummary?.monthLabel || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-3 px-4 py-3 min-w-max items-center">
            {/* Credit */}
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Credit:</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(monthSummary?.totalCredit ?? 0)}</span>
              {monthSummary && monthSummary.prevTotalCredit > 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  monthSummary.creditChangePct !== 0
                    ? monthSummary.creditChangePct > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {monthSummary.creditChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                  {Math.abs(monthSummary.creditChangePct)}%
                </span>
              )}
            </div>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            {/* Recovery */}
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Recovery:</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(monthSummary?.totalRecovery ?? 0)}</span>
              {monthSummary && monthSummary.prevTotalRecovery > 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  monthSummary.recoveryChangePct !== 0
                    ? monthSummary.recoveryChangePct > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {monthSummary.recoveryChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                  {Math.abs(monthSummary.recoveryChangePct)}%
                </span>
              )}
            </div>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            {/* Net */}
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Net:</span>
              <span className={`text-xs font-bold tabular-nums text-slate-900 dark:text-white`}>
                {formatPKR(monthSummary?.netPosition ?? 0)}
              </span>
              {monthSummary && monthSummary.prevNetPosition !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                  monthSummary.netChangePct !== 0
                    ? monthSummary.netChangePct > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {monthSummary.netChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                  {Math.abs(monthSummary.netChangePct)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pending Recovery Alert Banner */}
      <PendingRecoveryBanner onNavigate={(path) => router.push(path)} />

      {/* Overdue Shops Alert */}
      <OverdueShopsAlert onNavigate={(path) => router.push(path)} />

      {/* Quick Actions — 4 ghost buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
          onClick={() => router.push('/credit-posting')}
        >
          <CreditCard className="h-5 w-5 text-[#2563EB] dark:text-blue-400" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Post Credit</span>
        </button>
        <button
          type="button"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
          onClick={() => router.push('/recovery')}
        >
          <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Recovery Report</span>
        </button>
        <button
          type="button"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
          onClick={() => router.push('/shops')}
        >
          <Plus className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Add Shop</span>
        </button>
        <button
          type="button"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group"
          onClick={() => router.push('/audit')}
        >
          <Activity className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">View Activity</span>
        </button>
      </div>

      {/* Today's Key Metrics Summary Strip — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-4">
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max snap-x snap-mandatory pb-1 items-center">
            {/* Total Credit Today */}
            <div className="flex items-center gap-2 snap-center">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Credit Today</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{formatPKR(data.todayCredit)}</span>
              </div>
            </div>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            {/* Total Recovery Today */}
            <div className="flex items-center gap-2 snap-center">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Recovery Today</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{formatPKR(data.todayRecovery)}</span>
              </div>
            </div>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            {/* Transactions */}
            <div className="flex items-center gap-2 snap-center">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Transactions</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{data.todayTxns.length} entries</span>
              </div>
            </div>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            {/* Shops Active */}
            <div className="flex items-center gap-2 snap-center">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">Shops Active</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5">{data.totalShops}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SMS Report Card — minimal */}
      {smsReport && smsReport.total > 0 && (
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">SMS Report — Today</span>
            </div>
            <button
              onClick={() => router.push('/sms-tracking')}
              className="text-xs text-[#2563EB] dark:text-blue-400 hover:text-[#1E40AF] dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            >
              View Details <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="text-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{smsReport.total}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Sent</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{smsReport.sent}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Failed</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">{smsReport.failed}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Skipped</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">{smsReport.skipped}</p>
              </div>
            </div>

            {smsReport.perOB.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                {smsReport.perOB.map((ob) => (
                  <div key={ob.orderbookerId} className="flex items-center justify-between gap-2 text-xs py-1.5 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{ob.orderbookerName}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title="Sent">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="font-semibold tabular-nums">{ob.sent}</span>
                      </span>
                      {ob.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-600 dark:text-red-400" title="Failed">
                          <XCircle className="h-3 w-3" />
                          <span className="font-semibold tabular-nums">{ob.failed}</span>
                        </span>
                      )}
                      {ob.skipped > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="Skipped">
                          <SkipForward className="h-3 w-3" />
                          <span className="font-semibold tabular-nums">{ob.skipped}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity Feed — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Recent Activity
          </h3>
          <button
            className="text-xs text-[#2563EB] dark:text-blue-400 hover:text-[#1E40AF] dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            onClick={() => router.push('/audit')}
          >
            View All
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="px-5 pb-4">
          {recentTxnsLoading ? (
            <div className="space-y-3 pt-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="skeleton-shimmer h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="skeleton-shimmer h-3.5 w-36" />
                    <Skeleton className="skeleton-shimmer h-3 w-20" />
                  </div>
                  <Skeleton className="skeleton-shimmer h-4 w-16" />
                </div>
              ))}
            </div>
          ) : recentTxns.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-500 dark:text-slate-400">No recent transactions</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTxns.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${txn.type === 'credit' ? 'bg-[#2563EB]' : txn.type === 'claim' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{txn.shop.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0 rounded-full border ${txn.type === 'claim' ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900' : txn.type === 'credit' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'}`}>
                          {txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : 'Recovery'}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">{getTimeAgo(txn.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                    {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Recovery Feed — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Recovery Feed
          </h3>
          <button
            className="text-xs text-[#2563EB] dark:text-blue-400 hover:text-[#1E40AF] dark:hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            onClick={() => router.push('/recovery')}
          >
            Full Report
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div className="px-5 pb-4">
          {recentTxnsLoading ? (
            <div className="space-y-3 pt-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="skeleton-shimmer h-6 w-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="skeleton-shimmer h-3.5 w-36" />
                    <Skeleton className="skeleton-shimmer h-3 w-20" />
                  </div>
                  <Skeleton className="skeleton-shimmer h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (() => {
            const recoveryTxns = recentTxns.filter(t => t.type === 'recovery' && t.status === 'approved').slice(0, 8);
            if (recoveryTxns.length === 0) {
              return (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 dark:text-slate-400">No recovery entries today</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Recovery from orderbookers will appear here in real-time</p>
                </div>
              );
            }
            const totalLiveRecovery = recoveryTxns.reduce((s, t) => s + t.amount, 0);
            return (
              <>
                <div className="flex items-center gap-2 mb-2 mt-2 px-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Live</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(totalLiveRecovery)}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-500">· across {recoveryTxns.length} entries</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recoveryTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-default"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{txn.shop.name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                            <span>{txn.creator?.name || 'System'}</span>
                            <span>·</span>
                            <span>{getTimeAgo(txn.createdAt)}</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                        -{formatPKR(txn.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Divider — minimal */}
      <div className="border-t border-slate-200 dark:border-[#2E2E2E]" />

      {/* Charts section — wrapped with Clean Minimal title */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Recovery Trend — Last 7 Days</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Credit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Recovery</span>
            </div>
          </div>
        </div>
        <DashboardCharts trends={trends} orderbookers={data.orderbookers} routeData={routeData} allShopsCount={allShops.length} />
      </div>

      {/* OB Performance Summary — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            OB Performance Summary
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-slate-400 dark:text-slate-500" />
              7d Recovery Trend
            </span>
            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
              {data.orderbookers.length} orderbookers
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.orderbookers.map((ob) => {
              const maxOutstanding = Math.max(...data.orderbookers.map(o => o.totalOutstanding), 1);
              const pct = (ob.totalOutstanding / maxOutstanding) * 100;
              const avatarColors = ['bg-blue-50 dark:bg-blue-950/40 text-[#1E40AF] dark:text-blue-400 border-blue-100 dark:border-blue-900', 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900', 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900', 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border-cyan-100 dark:border-cyan-900', 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border-violet-100 dark:border-violet-900', 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900'];
              const avatarIdx = ob.name.charCodeAt(0) % avatarColors.length;
              const spark = sparklineData.find(s => s.orderbookerId === ob.id);
              return (
                <div key={ob.id} className="border border-slate-200 dark:border-[#2E2E2E] rounded-lg p-3.5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-default" onClick={() => router.push('/analytics')}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-9 w-9 rounded-full border flex items-center justify-center text-sm font-bold shrink-0 ${avatarColors[avatarIdx]}`}>
                      {ob.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ob.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{ob.totalShops} shops assigned</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Outstanding</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(ob.totalOutstanding)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-2.5">
                    <div
                      className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  {/* Recovery Trend Sparkline */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-md p-2">
                    {sparklineLoading ? (
                      <div className="flex items-center justify-between">
                        <Skeleton className="skeleton-shimmer h-4 w-20" />
                        <Skeleton className="skeleton-shimmer h-5 w-16" />
                      </div>
                    ) : spark && spark.data.length >= 2 ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <RecoverySparkline data={spark.data} width={80} height={24} />
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                            7d avg: <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatPKR(spark.avg)}</span>
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums shrink-0 flex items-center gap-0.5 ${
                          spark.trend === 'up' ? 'text-emerald-600 dark:text-emerald-400' : spark.trend === 'down' ? 'text-red-500 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {spark.trend === 'up' ? <ArrowUp className="h-3 w-3" /> : spark.trend === 'down' ? <ArrowDown className="h-3 w-3" /> : <span className="text-[8px]">—</span>}
                          {spark.trend !== 'stable' ? (
                            <span>{spark.trend === 'up' ? 'Up' : 'Down'}</span>
                          ) : null}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-16 flex items-center justify-center text-[10px] text-slate-400 dark:text-slate-500">No data</div>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400">No recovery in 7 days</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Orderbooker Overview — minimal table */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Orderbooker Overview
            </h3>
          </div>
          <ScrollArea className="max-h-80">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-200 dark:border-[#2E2E2E]">
                  <TableHead className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">Name</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider text-center">Shops</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orderbookers.map((ob) => (
                  <TableRow key={ob.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{ob.name}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{ob.totalShops}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums number-animate">{formatPKR(ob.totalOutstanding)}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {data.orderbookers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">No orderbookers</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Top Debtors — minimal */}
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Top 5 Debtors
            </h3>
          </div>
          <ScrollArea className="max-h-80">
            <div className="px-5 py-4 space-y-3">
              {topDebtors.length > 0 && topDebtors.some(s => s.balance > 0) ? (
                topDebtors.map((shop, idx) => {
                  const pct = maxDebt > 0 ? (shop.balance / maxDebt) * 100 : 0;
                  return (
                    <div key={shop.id} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tabular-nums shrink-0 w-4">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{shop.name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{shop.area || '—'}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums shrink-0 ml-2 number-animate">{formatPKR(shop.balance)}</span>
                      </div>
                      <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400">
                  <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">No outstanding balances</p>
                  <p className="text-xs mt-1">All shops are settled</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Activity Timeline — minimal */}
      <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Activity Timeline
          </h3>
        </div>
        <ScrollArea className="max-h-[480px] custom-scrollbar">
          <div className="px-5 py-3">
            {timelineLoading ? (
              <div className="space-y-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="skeleton-shimmer h-6 w-6 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="skeleton-shimmer h-4 w-48" />
                      <Skeleton className="skeleton-shimmer h-3 w-32" />
                    </div>
                    <Skeleton className="skeleton-shimmer h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : timelineGroups.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-8 w-8 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">No recent activity</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Post credit or collect recovery to see activity here.
                </p>
                <button
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#EFF6FF] dark:bg-blue-950/50 text-[#2563EB] dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-100 dark:border-blue-900"
                  onClick={() => router.push('/credit-posting')}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Post Credit
                </button>
              </div>
            ) : (
              <div className="relative pl-8">
                {/* Vertical timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                {timelineGroups.map((group) => (
                  <div key={group.key} className="mb-6 last:mb-0">
                    {/* Date Header */}
                    <div className="flex items-center gap-3 mb-3 -ml-8">
                      <div className="h-3.5 w-3.5 rounded-full bg-[#2563EB] ring-4 ring-white dark:ring-[#1E1E1E] z-10 shrink-0" />
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{group.label}</h3>
                    </div>
                    {/* Entries for this date */}
                    <div>
                      {group.entries.map((entry) => (
                        <div key={entry.id} className="relative pb-4 last:pb-0">
                          {/* Timeline dot */}
                          <div className={`absolute -left-8 top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-[#1E1E1E] z-10 ${
                            entry.type === 'credit' ? 'bg-[#2563EB]' : entry.type === 'recovery' ? 'bg-emerald-500' : 'bg-slate-400'
                          }`} />
                          {/* Timeline entry */}
                          <div className="rounded-md border border-slate-200 dark:border-[#2E2E2E] bg-white dark:bg-[#1E1E1E] p-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {/* Time and badge */}
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{formatTimeFull(entry.createdAt)}</span>
                                  <span className={`text-[9px] font-medium px-1.5 py-0 rounded-full border ${
                                    entry.type === 'credit' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900' : entry.type === 'recovery' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                  }`}>
                                    {entry.type === 'credit' ? 'Credit' : entry.type === 'recovery' ? 'Recovery' : 'Edit'}
                                  </span>
                                </div>
                                {/* Shop name and area */}
                                <p className="text-sm font-medium leading-snug text-slate-900 dark:text-white">
                                  {entry.type === 'credit' ? 'Posted to' : entry.type === 'recovery' ? 'Collected from' : 'Updated'}{' '}
                                  <span className="font-semibold">{entry.shopName}</span>
                                  <span className="hidden sm:inline text-slate-500 dark:text-slate-400">{entry.shopArea ? ` · ${entry.shopArea}` : ''}</span>
                                </p>
                                {/* Posted by - hidden on mobile */}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 hidden sm:block">
                                  by {entry.createdBy}
                                </p>
                              </div>
                              {/* Amount */}
                              <div className="text-right shrink-0">
                                {entry.amount > 0 && (
                                  <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full border ${
                                    entry.type === 'credit' ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                                  }`}>
                                    {entry.type === 'credit' ? '+' : '-'}{formatPKR(entry.amount)}
                                  </span>
                                )}
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                                  {entry.balanceAfter > 0 ? `Bal: ${formatPKR(entry.balanceAfter)}` : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        {/* View All Activity Link */}
        {timeline.length > 0 && (
          <div className="border-t border-slate-200 dark:border-[#2E2E2E] px-5 py-3">
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:text-[#1E40AF] dark:hover:text-blue-300 transition-colors group"
              onClick={() => router.push('/audit')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View All Activity
              <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </button>
          </div>
        )}
      </div>

      {/* Business Summary Widget — minimal */}
      {bizSummary && (
        <div className="bg-white dark:bg-[#1E1E1E] border border-slate-200 dark:border-[#2E2E2E] rounded-lg overflow-hidden animate-fade-in">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200 dark:border-[#2E2E2E]">
            <Activity className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">All-Time Business Summary</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-left">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total Volume</p>
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(bizSummary.totalCredit)}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">All credit posted</p>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Total Recovery</p>
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(bizSummary.totalRecovery)}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">All recoveries collected</p>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">Net Outstanding</p>
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{formatPKR(bizSummary.netBalance)}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">Currently outstanding</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
