'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useAnimatedNumber } from '@/lib/use-animated-number';
import { getLocalDateString, WORKING_DAYS } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Home,
  Store,
  Users,
  TrendingUp,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
  ArrowUp,
  ArrowDown,
  Activity,
  Plus,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingDown,
  Hash,
  CalendarDays,
  Clock,
  ExternalLink,
  Calendar,
  Banknote,
  Sparkles,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

function PendingRecoveryBanner({ setCurrentView }: { setCurrentView: (v: string) => void }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/recoveries?status=pending');
        if (res.ok) {
          const data = await res.json();
          setPendingCount(data.totalPending || 0);
          setPendingAmount(data.totalAmount || 0);
        }
      } catch { /* silent */ }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  if (pendingCount === 0) return null;

  return (
    <button
      onClick={() => setCurrentView('admin-approve-recovery')}
      className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/40 p-4 flex items-center justify-between hover:shadow-md transition-all group cursor-pointer animate-fade-in"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-orange-600" />
        </div>
        <div className="text-left">
          <p className="text-sm font-bold text-orange-800 dark:text-orange-200">
            {pendingCount} Pending Recover{pendingCount === 1 ? 'y' : 'ies'}
          </p>
          <p className="text-xs text-orange-600/70 dark:text-orange-400/70">
            Total: {formatCurrency(pendingAmount)} — Click to review &amp; approve
          </p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-orange-400 group-hover:translate-x-1 transition-transform" />
    </button>
  );
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
}

interface TodayTxn {
  id: string;
  type: string;
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
  routeDay: string;
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
const ROUTE_COLORS = ['#1E3A8A', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

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

  const strokeColor = isUp ? '#10B981' : hasData ? '#F59E0B' : '#94A3B8';
  const fillColor = isUp ? 'rgba(16, 185, 129, 0.12)' : hasData ? 'rgba(245, 158, 11, 0.06)' : 'rgba(148, 163, 184, 0.06)';

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
                  <line x1={cx} y1={cy} x2={cx} y2={height} stroke={strokeColor} strokeWidth={0.5} strokeDasharray="2 2" opacity={0.5} />
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
            <span className="font-bold tabular-nums">{formatCurrency(data[hoveredIdx])}</span>
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
        <Skeleton className="skeleton-shimmer h-7 w-40 mb-1" />
        <Skeleton className="skeleton-shimmer h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-36" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-5 py-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="skeleton-shimmer h-8 w-8 rounded-full" />
                    <Skeleton className="skeleton-shimmer h-4 w-28" />
                  </div>
                  <Skeleton className="skeleton-shimmer h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-36" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-5 py-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="skeleton-shimmer h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="skeleton-shimmer h-4 w-32 mb-1" />
                    <Skeleton className="skeleton-shimmer h-3 w-48" />
                  </div>
                  <Skeleton className="skeleton-shimmer h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, setCurrentView } = useAppStore();
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

  // Animated number counters for KPI cards
  const animatedTodayCredit = useAnimatedNumber(data.todayCredit, 900);
  const animatedTodayRecovery = useAnimatedNumber(data.todayRecovery, 900);
  const animatedOutstanding = useAnimatedNumber(data.totalOutstanding, 1000);
  const animatedTotalShops = useAnimatedNumber(data.totalShops, 600);

  const loadDashboard = useCallback(async () => {
    try {
      const [obRes, todayTxnRes, shopsRes, trendsRes, tlRes, msRes, rtRes, summaryRes] = await Promise.all([
        fetch('/api/orderbookers'),
        fetch(`/api/transactions?date=${getLocalDateString()}&limit=500`),
        fetch('/api/shops'),
        fetch('/api/reports/daily-trends'),
        fetch('/api/reports/activity-timeline?limit=20'),
        fetch('/api/reports/month-summary'),
        fetch('/api/transactions?limit=5'),
        fetch('/api/summary'),
      ]);
      const orderbookers = obRes.ok ? await obRes.json() : [];
      const todayTxnData = todayTxnRes.ok ? await todayTxnRes.json() : { transactions: [] };
      const todayCredit = todayTxnData.transactions.filter((t: TodayTxn) => t.type === 'credit').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
      const todayRecovery = todayTxnData.transactions.filter((t: TodayTxn) => t.type === 'recovery').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
      const totalOutstanding = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalOutstanding, 0);
      const totalShops = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalShops, 0);

      const trendsData = trendsRes.ok ? await trendsRes.json() : [];
      const shops = shopsRes.ok ? await shopsRes.json() : [];
      const tlResult = tlRes.ok ? await tlRes.json() : null;
      const rawTimeline = Array.isArray(tlResult) ? tlResult : (tlResult?.activities || []);
      // Map activity-timeline API fields to TimelineEntry shape expected by UI
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
    } catch { /* silent */ }
    finally { setLoading(false); setTimelineLoading(false); setRecentTxnsLoading(false); }
  }, []);

  // Fetch OB recovery sparkline data
  useEffect(() => {
    async function fetchSparkline() {
      try {
        const res = await fetch('/api/reports/ob-recovery-sparkline?days=7');
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

  // Auto-refresh every 30 seconds
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      loadDashboard();
    }, 30000);
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
    value: allShops.filter(s => s.routeDay === day).length,
    fill: ROUTE_COLORS[idx],
  })).filter(d => d.value > 0);

  // Compute top 5 debtors
  const topDebtors = [...allShops]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const maxDebt = topDebtors.length > 0 ? topDebtors[0].balance : 1;

  return (
    <div className="space-y-6 page-transition">
      {/* Welcome Banner */}
      <div className="alfalah-gradient rounded-xl p-5 text-white relative overflow-hidden">
        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 mesh-gradient opacity-40" />
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/2 w-24 h-24 rounded-full bg-white/5 translate-y-1/2" />
        <div className="absolute top-1/2 left-1/3 w-16 h-16 rounded-full bg-blue-400/10 blur-sm" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Home className="h-5 w-5 text-blue-200" />
            <h2 className="text-lg font-bold">Welcome back, {user?.name?.split(' ')[0] || 'Admin'}</h2>
          </div>
          <p className="text-sm text-blue-100">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}
            {data.totalShops} shops across {data.orderbookers.length} orderbookers
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dot-pattern rounded-xl p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <Card className="kpi-card stat-card-amber card-border-glow hover-scale-102 animate-card-entrance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shadow-sm">
                  <ArrowUpRight className="h-5 w-5 text-amber-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">Today</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Today&apos;s Credit</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums number-animate number-display">{formatCurrency(animatedTodayCredit)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-green stat-pulse animate-fade-in card-border-glow hover-scale-102 animate-card-entrance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center shadow-sm">
                  <ArrowDownRight className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">Today</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Today&apos;s Recovery</p>
              <p className="text-2xl font-bold text-green-600 tabular-nums number-animate number-display">{formatCurrency(animatedTodayRecovery)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-red card-border-glow hover-scale-102 animate-card-entrance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-100 to-red-50 flex items-center justify-center shadow-sm">
                  <Wallet className="h-5 w-5 text-red-600" />
                </div>
                <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full">Alert</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Outstanding</p>
              <p className="text-2xl font-bold text-red-600 tabular-nums number-animate number-display">{formatCurrency(animatedOutstanding)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-blue card-border-glow hover-scale-102 animate-card-entrance">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shadow-sm">
                  <Store className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">All</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Active Shops</p>
              <p className="text-2xl font-bold tabular-nums number-animate number-display">{animatedTotalShops}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Monthly Overview Badge */}
      <Card className="animate-fade-in overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/5 to-primary/[0.02] border-b border-border/40">
            <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Monthly Overview — {monthSummary?.monthLabel || new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-2 px-4 py-3 min-w-max">
              {/* Credit */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Credit:</span>
                <span className="text-xs font-bold text-amber-600 tabular-nums">{formatCurrency(monthSummary?.totalCredit ?? 0)}</span>
                {monthSummary && monthSummary.prevTotalCredit > 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    monthSummary.creditChangePct > 0
                      ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : monthSummary.creditChangePct < 0
                        ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {monthSummary.creditChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                    {Math.abs(monthSummary.creditChangePct)}%
                  </span>
                )}
              </div>
              <span className="text-border">|</span>
              {/* Recovery */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Recovery:</span>
                <span className="text-xs font-bold text-green-600 tabular-nums">{formatCurrency(monthSummary?.totalRecovery ?? 0)}</span>
                {monthSummary && monthSummary.prevTotalRecovery > 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    monthSummary.recoveryChangePct > 0
                      ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                      : monthSummary.recoveryChangePct < 0
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {monthSummary.recoveryChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                    {Math.abs(monthSummary.recoveryChangePct)}%
                  </span>
                )}
              </div>
              <span className="text-border">|</span>
              {/* Net */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Net:</span>
                <span className={`text-xs font-bold tabular-nums ${(monthSummary?.netPosition ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(monthSummary?.netPosition ?? 0)}
                </span>
                {monthSummary && monthSummary.prevNetPosition !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    monthSummary.netChangePct > 0
                      ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                      : monthSummary.netChangePct < 0
                        ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-muted text-muted-foreground'
                  }`}>
                    {monthSummary.netChangePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                    {Math.abs(monthSummary.netChangePct)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Recovery Alert Banner */}
      <PendingRecoveryBanner setCurrentView={setCurrentView} />

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift focus-glow"
          onClick={() => setCurrentView('admin-credit')}
        >
          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
            <CreditCard className="h-5 w-5 text-amber-600" />
          </div>
          <span className="text-xs font-medium">Post Credit</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift focus-glow"
          onClick={() => setCurrentView('admin-recovery')}
        >
          <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <span className="text-xs font-medium">Recovery Report</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift focus-glow"
          onClick={() => setCurrentView('admin-shops')}
        >
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="h-5 w-5 text-blue-600" />
          </div>
          <span className="text-xs font-medium">Add Shop</span>
        </Button>
      </div>

      {/* Today's Key Metrics Summary Strip */}
      <Card className="animate-fade-in">
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-max snap-x snap-mandatory pb-1">
              {/* Total Credit Today */}
              <div className="flex items-center gap-2.5 rounded-full bg-amber-50 border border-amber-200/60 px-4 py-2.5 snap-center">
                <div className="h-7 w-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-amber-600/70 leading-none">Total Credit Today</span>
                  <span className="text-sm font-bold text-amber-700 tabular-nums leading-tight mt-0.5">{formatCurrency(data.todayCredit)}</span>
                </div>
              </div>
              {/* Total Recovery Today */}
              <div className="flex items-center gap-2.5 rounded-full bg-green-50 border border-green-200/60 px-4 py-2.5 snap-center">
                <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-green-600/70 leading-none">Total Recovery Today</span>
                  <span className="text-sm font-bold text-green-700 tabular-nums leading-tight mt-0.5">{formatCurrency(data.todayRecovery)}</span>
                </div>
              </div>
              {/* Transactions */}
              <div className="flex items-center gap-2.5 rounded-full bg-blue-50 border border-blue-200/60 px-4 py-2.5 snap-center">
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Hash className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-blue-600/70 leading-none">Transactions</span>
                  <span className="text-sm font-bold text-blue-700 tabular-nums leading-tight mt-0.5">{data.todayTxns.length} entries</span>
                </div>
              </div>
              {/* Shops Active */}
              <div className="flex items-center gap-2.5 rounded-full bg-primary/5 border border-primary/15 px-4 py-2.5 snap-center">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-medium text-primary/60 leading-none">Shops Active</span>
                  <span className="text-sm font-bold text-primary tabular-nums leading-tight mt-0.5">{data.totalShops}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Feed */}
      <Card className="animate-fade-in">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
            <button
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
              onClick={() => setCurrentView('admin-audit')}
            >
              View All
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {recentTxnsLoading ? (
            <div className="space-y-3">
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
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No recent transactions</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTxns.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors cursor-default"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${txn.type === 'credit' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      {txn.type === 'credit' ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{txn.shop.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className={`text-[9px] px-1.5 py-0 font-medium ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                          {txn.type === 'credit' ? 'Credit' : 'Recovery'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{getTimeAgo(txn.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${txn.type === 'credit' ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                    {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Recovery Feed */}
      <Card className="animate-fade-in">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live Recovery Feed
            </CardTitle>
            <button
              className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
              onClick={() => setCurrentView('admin-recovery')}
            >
              Full Report
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {recentTxnsLoading ? (
            <div className="space-y-3">
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
            const recoveryTxns = recentTxns.filter(t => t.type === 'recovery').slice(0, 8);
            if (recoveryTxns.length === 0) {
              return (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No recovery entries today</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Recovery from orderbookers will appear here in real-time</p>
                </div>
              );
            }
            const totalLiveRecovery = recoveryTxns.reduce((s, t) => s + t.amount, 0);
            return (
              <>
                <div className="flex items-center gap-2 mb-3 px-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <Banknote className="h-3 w-3 text-green-600" />
                    <span className="text-xs font-bold text-green-700 dark:text-green-400">{formatCurrency(totalLiveRecovery)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">across {recoveryTxns.length} entries</span>
                </div>
                <div className="space-y-1">
                  {recoveryTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors cursor-default"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                          <ArrowDownRight className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{txn.shop.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>{txn.creator.name}</span>
                            <span>·</span>
                            <span>{getTimeAgo(txn.createdAt)}</span>
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums shrink-0">
                        -{formatCurrency(txn.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Divider */}
      <hr className="divider-gradient" />

      {/* Daily Trends Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Daily Credit vs Recovery — Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {trends.length > 0 ? (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                      name === 'credit' ? 'Credit' : 'Recovery',
                    ]}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="credit"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fill="url(#creditGradient)"
                    dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="recovery"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#recoveryGradient)"
                    dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 sm:h-64 flex items-center justify-center text-sm text-muted-foreground">
              No trend data available
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-xs text-muted-foreground">Credit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Recovery</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orderbooker Performance Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Orderbooker Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {data.orderbookers.length > 0 ? (
            <div className="h-60 sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.orderbookers} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="outstandingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="shopsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                    label={{ value: 'Rs.', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94A3B8' }, offset: 0 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    label={{ value: 'Shops', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#94A3B8' }, offset: 0 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Total Outstanding') return [`Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, 'Total Outstanding'];
                      return [value, 'Total Shops'];
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="totalOutstanding"
                    name="Total Outstanding"
                    fill="url(#outstandingGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="totalShops"
                    name="Total Shops"
                    fill="url(#shopsGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 sm:h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No orderbooker data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Distribution Pie Chart */}
      <Card className="hover-scale-102 card-shadow-transition">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-primary" />
            Route Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {routeData.length > 0 ? (
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={routeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                    label={({ name, value }: { name: string; value: number }) =>
                      value > 0 ? `${name} (${value})` : ''
                    }
                    labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }}
                  >
                    {routeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${value} shops`, 'Shops']}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 sm:h-80 flex items-center justify-center text-sm text-muted-foreground">
              No route data available
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">{allShops.length} total shops</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OB Performance Summary Cards */}
      <Card className="animate-fade-in overflow-hidden">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              OB Performance Summary
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary/50" />
                7d Recovery Trend
              </span>
              <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">
                {data.orderbookers.length} orderbookers
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
            {data.orderbookers.map((ob) => {
              const maxOutstanding = Math.max(...data.orderbookers.map(o => o.totalOutstanding), 1);
              const pct = (ob.totalOutstanding / maxOutstanding) * 100;
              const colorClass = ob.totalOutstanding > 50000 ? 'text-red-600 dark:text-red-400' : ob.totalOutstanding > 25000 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
              const progressClass = ob.totalOutstanding > 50000 ? 'progress-gradient-red' : ob.totalOutstanding > 25000 ? 'progress-gradient-amber' : 'progress-gradient-green';
              const avatarColors = ['bg-primary/15 text-primary', 'bg-emerald-500/15 text-emerald-600', 'bg-amber-500/15 text-amber-600', 'bg-rose-500/15 text-rose-600', 'bg-violet-500/15 text-violet-600'];
              const avatarIdx = ob.name.charCodeAt(0) % avatarColors.length;
              const spark = sparklineData.find(s => s.orderbookerId === ob.id);
              return (
                <div key={ob.id} className="alfalah-card-hover rounded-xl p-3.5 cursor-default" onClick={() => setCurrentView('admin-ob-analytics')}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-9 w-9 rounded-full avatar-initials text-sm ${avatarColors[avatarIdx]}`}>
                      {ob.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{ob.name}</p>
                      <p className="text-[10px] text-muted-foreground">{ob.totalShops} shops assigned</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Outstanding</span>
                    <span className={`text-sm font-bold tabular-nums ${colorClass}`}>{formatCurrency(ob.totalOutstanding)}</span>
                  </div>
                  <div className={`progress-gradient ${progressClass} mb-2.5`}>
                    <div style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  {/* Recovery Trend Sparkline */}
                  <div className="bg-muted/40 rounded-lg p-2 border border-border/30">
                    {sparklineLoading ? (
                      <div className="flex items-center justify-between">
                        <Skeleton className="skeleton-shimmer h-4 w-20" />
                        <Skeleton className="skeleton-shimmer h-5 w-16" />
                      </div>
                    ) : spark && spark.data.length >= 2 ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <RecoverySparkline data={spark.data} width={80} height={24} />
                          <span className="text-[9px] text-muted-foreground leading-tight">
                            7d avg: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(spark.avg)}</span>
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums shrink-0 flex items-center gap-0.5 ${
                          spark.trend === 'up' ? 'text-green-600 dark:text-green-400' : spark.trend === 'down' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                        }`}>
                          {spark.trend === 'up' ? <ArrowUp className="h-3 w-3" /> : spark.trend === 'down' ? <ArrowDown className="h-3 w-3" /> : <span className="text-[8px]">—</span>}
                          {spark.trend !== 'stable' ? (
                            <span>{spark.trend === 'up' ? 'Up' : 'Down'}</span>
                          ) : null}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-16 flex items-center justify-center text-[10px] text-muted-foreground/50">No data</div>
                        <span className="text-[9px] text-muted-foreground/50">No recovery in 7 days</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Orderbooker Overview */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Orderbooker Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <Table>
                <TableHeader>
                  <TableRow className="data-table-header hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Shops</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orderbookers.map((ob, idx) => (
                    <TableRow key={ob.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}`}>
                      <TableCell className="text-sm font-medium">{ob.name}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {ob.totalShops}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-red-600 number-animate">{formatCurrency(ob.totalOutstanding)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.orderbookers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No orderbookers</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Top Debtors */}
        <Card className="hover-scale-102">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Top 5 Debtors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <div className="px-5 py-2 space-y-3">
                {topDebtors.length > 0 && topDebtors.some(s => s.balance > 0) ? (
                  topDebtors.map((shop, idx) => {
                    const pct = maxDebt > 0 ? (shop.balance / maxDebt) * 100 : 0;
                    return (
                      <div key={shop.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? 'bg-red-100 text-red-600' : idx === 1 ? 'bg-orange-100 text-orange-600' : idx === 2 ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{shop.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{shop.area || '—'}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-red-600 tabular-nums shrink-0 ml-2 number-animate">{formatCurrency(shop.balance)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No outstanding balances</p>
                    <p className="text-xs mt-1">All shops are settled</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card className="animate-fade-in">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
                <div className="text-center py-10">
                  <div className="empty-state-illustration mx-auto mb-4 h-20 w-20">
                    <div className="relative z-10 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-blue-100 dark:from-primary/20 dark:to-blue-900/30 flex items-center justify-center">
                      <Clock className="h-9 w-9 text-primary/60 animate-gentle-float" />
                    </div>
                  </div>
                  <p className="font-semibold text-muted-foreground text-sm">No recent activity</p>
                  <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Post credit or collect recovery to see activity here.
                  </p>
                  <button
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors focus-glow"
                    onClick={() => setCurrentView('admin-credit')}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Post Credit
                  </button>
                </div>
              ) : (
                <div className="relative pl-8">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                  {timelineGroups.map((group) => (
                    <div key={group.key} className="mb-6 last:mb-0">
                      {/* Date Header */}
                      <div className="flex items-center gap-3 mb-3 -ml-8">
                        <div className="h-[22px] w-[22px] rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-background z-10 shrink-0">
                          <div className="h-2 w-2 rounded-full bg-primary" />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                      </div>
                      {/* Entries for this date */}
                      <div className="stagger-children">
                        {group.entries.map((entry) => (
                          <div key={entry.id} className="relative pb-4 last:pb-0 group">
                            {/* Timeline dot with icon */}
                            <div className={`absolute -left-8 top-0.5 h-[22px] w-[22px] rounded-full flex items-center justify-center ring-4 ring-background z-10 ${entry.type === 'credit' ? 'bg-amber-100 dark:bg-amber-900/40' : entry.type === 'recovery' ? 'bg-green-100 dark:bg-green-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                              {entry.type === 'credit' ? (
                                <ArrowUpRight className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                              ) : entry.type === 'recovery' ? (
                                <ArrowDownRight className="h-3 w-3 text-green-600 dark:text-green-400" />
                              ) : (
                                <Pencil className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              )}
                            </div>
                            {/* Timeline card */}
                            <div className="rounded-lg border border-border/50 bg-card p-3 -mx-2 alfalah-card-hover transition-all">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  {/* Time and badge */}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[11px] text-muted-foreground tabular-nums">{formatTimeFull(entry.createdAt)}</span>
                                    <Badge className={`text-[9px] px-1.5 py-0 ${entry.type === 'credit' ? 'badge-credit' : entry.type === 'recovery' ? 'badge-recovery' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800'}`}>
                                      {entry.type === 'credit' ? 'Credit' : entry.type === 'recovery' ? 'Recovery' : 'Edit'}
                                    </Badge>
                                  </div>
                                  {/* Shop name and area */}
                                  <p className="text-sm font-medium leading-snug">
                                    {entry.type === 'credit' ? 'Posted to' : entry.type === 'recovery' ? 'Collected from' : 'Updated'}{' '}
                                    <span className="font-semibold">{entry.shopName}</span>
                                    <span className="hidden sm:inline text-muted-foreground">{entry.shopArea ? ` · ${entry.shopArea}` : ''}</span>
                                  </p>
                                  {/* Posted by - hidden on mobile */}
                                  <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
                                    by {entry.createdBy}
                                  </p>
                                </div>
                                {/* Amount */}
                                <div className="text-right shrink-0">
                                  {entry.amount > 0 && (
                                    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${entry.type === 'credit' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'}`}>
                                      {entry.type === 'credit' ? '+' : '-'}{formatCurrency(entry.amount)}
                                    </span>
                                  )}
                                  <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                                    {entry.balanceAfter > 0 ? `Bal: ${formatCurrency(entry.balanceAfter)}` : ''}
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
            <div className="border-t border-border/60 px-5 py-3">
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors group"
                onClick={() => setCurrentView('admin-audit')}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View All Activity
                <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Business Summary Widget */}
      {bizSummary && (
        <Card className="animate-fade-in overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/5 to-primary/[0.02] border-b border-border/40">
            <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">All-Time Business Summary</span>
          </div>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2">
                  <ArrowUpRight className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-[10px] text-muted-foreground font-medium">Total Business Volume</p>
                <p className="text-base font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">{formatCurrency(bizSummary.totalCredit)}</p>
              </div>
              <div className="text-center">
                <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-2">
                  <ArrowDownRight className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-[10px] text-muted-foreground font-medium">Total Recovery Collected</p>
                <p className="text-base font-bold text-green-700 dark:text-green-400 tabular-nums mt-0.5">{formatCurrency(bizSummary.totalRecovery)}</p>
              </div>
              <div className="text-center">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center mx-auto mb-2 ${bizSummary.netBalance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <Wallet className={`h-4 w-4 ${bizSummary.netBalance > 0 ? 'text-red-600' : 'text-green-600'}`} />
                </div>
                <p className="text-[10px] text-muted-foreground font-medium">Net Outstanding</p>
                <p className={`text-base font-bold tabular-nums mt-0.5 ${bizSummary.netBalance > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>{formatCurrency(bizSummary.netBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
