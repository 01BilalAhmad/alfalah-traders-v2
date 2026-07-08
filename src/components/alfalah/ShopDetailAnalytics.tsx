'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

const ShopDetailAnalyticsCharts = dynamic(() => import('./ShopDetailAnalyticsCharts'), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted/20 rounded-lg" /> });
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Store,
  User,
  MapPin,
  Phone,
  Calendar,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  Clock,
  AlertTriangle,
  FileDown,
  Loader2,
  UserCircle,
  Activity,
  ShieldCheck,
  MessageSquare,
  Trash2,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportToCSV } from '@/lib/csv-export';
import { apiFetch } from '@/lib/api';
import { Textarea } from '@/components/ui/textarea';
import { formatPKR } from '@/lib/utils';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonth(month: string): string {
  const [year, mon] = month.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(mon, 10) - 1]} ${year.slice(2)}`;
}

interface ShopDetailData {
  shop: {
    id: string;
    name: string;
    ownerName: string | null;
    area: string | null;
    address: string | null;
    phone: string | null;
    routeDays: string[];
    balance: number;
    creditLimit: number;
    status: string;
    orderbookerName: string;
    createdAt: string;
  };
  stats: {
    totalCredit: number;
    totalRecovery: number;
    totalClaims: number;
    netBalance: number;
    avgCreditPerTransaction: number;
    avgRecoveryPerTransaction: number;
    transactionCount: number;
    lastTransactionDate: string | null;
    daysSinceLastTransaction: number;
    creditLimitUsage: number;
  };
  monthlyTrend: { month: string; credit: number; recovery: number }[];
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    previousBalance: number;
    newBalance: number;
    description: string | null;
    createdBy: string;
    createdAt: string;
  }[];
  topCreditDays: string[];
  recoveryRate: number;
}

// Shop note types
interface ShopNote {
  id: string;
  note: string;
  createdBy: string;
  creatorName?: string;
  createdAt: string;
}

// Balance trend types
interface BalanceTrendData {
  shopId: string;
  shopName: string;
  currentBalance: number;
  startBalance: number;
  change: number;
  changePercent: number;
  data: { date: string; balance: number }[];
}

// ─── Sparkline Mini Chart Component ───
function SparklineMini({
  data,
  direction,
  width = 100,
  height = 36,
}: {
  data: { date: string; balance: number }[];
  direction: 'down' | 'up' | 'flat';
  width?: number;
  height?: number;
}) {
  const balances = data.map((d) => d.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;
  const pad = 2;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;

  const points = balances
    .map((b, i) => {
      const x = pad + (i / Math.max(balances.length - 1, 1)) * chartW;
      const y = pad + chartH - ((b - min) / range) * chartH;
      return `${x},${y}`;
    })
    .join(' ');

  const color = direction === 'down' ? '#10B981' : direction === 'up' ? '#EF4444' : '#64748B';
  const fillColor = direction === 'down' ? 'rgba(16,185,129,0.15)' : direction === 'up' ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.1)';

  // Build filled area path
  const firstX = pad;
  const lastX = pad + chartW;
  const baseline = pad + chartH;
  const areaPath = `M ${firstX},${baseline} L ${points.split(' ').join(' L ')} L ${lastX},${baseline} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="flex-shrink-0">
      <defs>
        <linearGradient id={`spark-fill-${direction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-fill-${direction})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Balance Trend Chart Component (Full SVG) ───
function BalanceTrendChart({
  data,
  direction,
}: {
  data: { date: string; balance: number }[];
  direction: 'down' | 'up' | 'flat';
}) {
  const balances = data.map((d) => d.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const range = max - min || 1;

  // Chart dimensions
  const svgW = 700;
  const svgH = 140;
  const padLeft = 45;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 24;
  const chartW = svgW - padLeft - padRight;
  const chartH = svgH - padTop - padBottom;

  const color = direction === 'down' ? '#10B981' : direction === 'up' ? '#EF4444' : '#64748B';

  // Map data to SVG coordinates
  const points = balances.map((b, i) => ({
    x: padLeft + (i / Math.max(balances.length - 1, 1)) * chartW,
    y: padTop + chartH - ((b - min) / range) * chartH,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const baseline = padTop + chartH;
  const areaPath = `M ${points[0].x},${baseline} L ${polyline.replace(/,/g, ' ').split(' ').join(' L ')} L ${points[points.length - 1].x},${baseline} Z`;

  // Y-axis labels (3 labels)
  const yTicks = [max, min + (max - min) / 2, min];
  const yLabels = yTicks.map((v) => {
    if (v >= 100000) return `${(v / 1000).toFixed(0)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  });
  const yPositions = yTicks.map((v) => padTop + chartH - ((v - min) / range) * chartH);

  // X-axis labels: every 5th date
  const xLabels: { label: string; x: number }[] = [];
  data.forEach((d, i) => {
    if (i % 5 === 0 || i === data.length - 1) {
      const dateObj = new Date(d.date + 'T00:00:00');
      const label = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
      const x = padLeft + (i / Math.max(data.length - 1, 1)) * chartW;
      xLabels.push({ label, x });
    }
  });

  // Grid lines
  const gridLines = yPositions.map((y) => ({ y }));

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-32" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`trend-fill-${direction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {gridLines.map((line, i) => (
        <line
          key={`grid-${i}`}
          x1={padLeft}
          y1={line.y}
          x2={svgW - padRight}
          y2={line.y}
          stroke="currentColor"
          className="text-muted-foreground/15"
          strokeWidth={0.5}
          strokeDasharray={i === 0 ? 'none' : '3 3'}
        />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((label, i) => (
        <text
          key={`ylabel-${i}`}
          x={padLeft - 6}
          y={yPositions[i] + 3}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: '10px' }}
        >
          Rs. {label}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((xl, i) => (
        <text
          key={`xlabel-${i}`}
          x={xl.x}
          y={svgH - 4}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: '10px' }}
        >
          {xl.label}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#trend-fill-${direction})`} />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Start dot */}
      <circle cx={points[0].x} cy={points[0].y} r={3} fill="white" stroke={color} strokeWidth={2} />

      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r={3.5}
        fill={color}
        stroke="white"
        strokeWidth={2}
      />
    </svg>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Skeleton className="skeleton-shimmer h-9 w-9 rounded-lg" />
        <Skeleton className="skeleton-shimmer h-7 w-48" />
      </div>
      <Skeleton className="skeleton-shimmer h-40 w-full rounded-xl" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="skeleton-shimmer h-72 w-full rounded-xl" />
      <Skeleton className="skeleton-shimmer h-64 w-full rounded-xl" />
    </div>
  );
}

export default function ShopDetailAnalytics() {
  const { selectedShopId, selectedShopName } = useAppStore();
  const router = useRouter();
  const [data, setData] = useState<ShopDetailData | null>(null);
  const [balanceTrend, setBalanceTrend] = useState<BalanceTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [shopNotes, setShopNotes] = useState<ShopNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleting, setNoteDeleting] = useState<string | null>(null);
  const fetchShopDetail = useCallback(async () => {
    if (!selectedShopId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/shop-detail?shopId=${selectedShopId}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast({ title: 'Error', description: 'Failed to load shop analytics', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedShopId]);

  const fetchBalanceTrend = useCallback(async () => {
    if (!selectedShopId) return;
    try {
      const res = await apiFetch(`/api/reports/shop-balance-trend?shopId=${selectedShopId}&days=30`);
      if (res.ok) {
        const result = await res.json();
        setBalanceTrend(result);
      }
    } catch {
      // Silently fail — balance trend is supplementary
    }
  }, [selectedShopId]);

  const fetchShopNotes = useCallback(async () => {
    if (!selectedShopId) return;
    setNotesLoading(true);
    try {
      const res = await apiFetch(`/api/shops/${selectedShopId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setShopNotes(Array.isArray(data) ? data : data.notes || []);
      }
    } catch { /* silent */ }
    finally { setNotesLoading(false); }
  }, [selectedShopId]);

  const handleAddNote = async () => {
    if (!selectedShopId || !newNote.trim()) return;
    setNoteSaving(true);
    try {
      const res = await apiFetch(`/api/shops/${selectedShopId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: newNote.trim(),
          createdBy: selectedShopId, // fallback, store may have user context
        }),
      });
      if (res.ok) {
        toast({ title: 'Note Added', description: 'Your note has been saved' });
        setNewNote('');
        fetchShopNotes();
      } else {
        const errData = await res.json();
        toast({ title: 'Error', description: errData.error || 'Failed to add note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedShopId) return;
    setNoteDeleting(noteId);
    try {
      const res = await apiFetch(`/api/shops/${selectedShopId}/notes?noteId=${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Note Deleted', description: 'The note has been removed' });
        setShopNotes(prev => prev.filter(n => n.id !== noteId));
      } else {
        toast({ title: 'Error', description: 'Failed to delete note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setNoteDeleting(null);
    }
  };

  useEffect(() => {
    fetchShopDetail();
    fetchBalanceTrend();
    fetchShopNotes();
  }, [fetchShopDetail, fetchBalanceTrend, fetchShopNotes]);

  const handleBack = () => {
    router.push('/shops');
  };

  const handleCSVExport = useCallback(() => {
    if (!data || data.recentTransactions.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Date', 'Type', 'Amount', 'Prev Balance', 'New Balance', 'Description', 'Posted By'];
      const rows = data.recentTransactions.map((t) => ({
        Date: formatDate(t.createdAt),
        Type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
        Amount: t.amount,
        'Prev Balance': t.previousBalance,
        'New Balance': t.newBalance,
        Description: t.description || '',
        'Posted By': t.createdBy,
      }));
      exportToCSV(rows, `transactions-${data.shop.name.replace(/\s+/g, '-').toLowerCase()}`, headers);
      toast({ title: 'Export Complete', description: `${rows.length} transactions exported` });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not export CSV', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [data]);

  // Chart data with formatted month labels
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.monthlyTrend.map((d) => ({
      name: formatMonth(d.month),
      Credit: d.credit,
      Recovery: d.recovery,
    }));
  }, [data]);

  // Credit limit progress color
  const creditLimitColor = useMemo(() => {
    if (!data) return 'text-green-600';
    const usage = data.stats.creditLimitUsage;
    if (usage >= 1) return 'text-red-600 dark:text-red-400';
    if (usage >= 0.8) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  }, [data]);

  // Balance trend direction: balance down = good (green), balance up = bad (red)
  const balanceTrendDirection = useMemo<'down' | 'up' | 'flat'>(() => {
    if (!balanceTrend) return 'flat';
    if (balanceTrend.change < -10) return 'down';
    if (balanceTrend.change > 10) return 'up';
    return 'flat';
  }, [balanceTrend]);

  // Recovery rate color
  const recoveryColor = useMemo(() => {
    if (!data) return 'text-green-600';
    const rate = data.recoveryRate;
    if (rate >= 80) return 'text-green-600 dark:text-green-400';
    if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  }, [data]);

  if (!selectedShopId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Store className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">No shop selected</p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => router.push('/shops')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Shops
        </Button>
      </div>
    );
  }

  if (loading) return <DetailSkeleton />;

  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={handleBack} className="hover-lift" aria-label="Back to shop list">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Shop Analytics
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{data.shop.name}</p>
          </div>
        </div>
        <Button
            type="button"
          variant="outline"
          size="sm"
          onClick={handleCSVExport}
          disabled={exporting || data.recentTransactions.length === 0}
          className="h-9 gap-1.5"
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      </div>

      {/* Shop Header Card */}
      <Card className="card-elevated overflow-hidden">
        <div className="bg-primary p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Store className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{data.shop.name}</h3>
                  <p className="text-sm text-white/70">
                    {data.shop.ownerName && (
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {data.shop.ownerName}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-white/80">
                {data.shop.area && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {data.shop.area}</span>
                )}
                {data.shop.address && (
                  <span className="flex items-center gap-1 hidden md:inline">{data.shop.address}</span>
                )}
                {data.shop.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {data.shop.phone}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {data.shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}
                </span>
                <span className="flex items-center gap-1">
                  <UserCircle className="h-3.5 w-3.5" />
                  {data.shop.orderbookerName}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={`text-xs font-semibold px-3 py-1 ${data.shop.status === 'active' ? 'bg-green-500/20 text-green-100 border-green-400/30' : 'bg-red-500/20 text-red-100 border-red-400/30'}`}>
                {data.shop.status === 'active' ? <ShieldCheck className="h-3.5 w-3.5 mr-1" /> : <AlertTriangle className="h-3.5 w-3.5 mr-1" />}
                {data.shop.status.charAt(0).toUpperCase() + data.shop.status.slice(1)}
              </Badge>
              <span className="text-xs text-white/50">
                Since {formatDate(data.shop.createdAt)}
              </span>
            </div>
          </div>
        </div>
        {/* Credit Limit Progress */}
        {data.shop.creditLimit > 0 && (
          <div className="px-5 py-3 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" /> Credit Limit Usage
              </span>
              <span className={`text-xs font-bold ${creditLimitColor}`}>
                {formatPKR(data.shop.balance)} / {formatPKR(data.shop.creditLimit)}
                ({Math.round(data.stats.creditLimitUsage * 100)}%)
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.stats.creditLimitUsage >= 1
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(data.stats.creditLimitUsage * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Balance Trend Section */}
      {balanceTrend && (
        <Card className="card-elevated overflow-hidden">
          <div className="p-5 pb-0">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">30-Day Balance Trend</h3>
              {balanceTrendDirection === 'down' && (
                <Badge className="ml-auto bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-200 dark:border-green-800 text-[10px] font-bold">
                  <TrendingDown className="h-3 w-3 mr-0.5" />
                  Debt Reducing
                </Badge>
              )}
              {balanceTrendDirection === 'up' && (
                <Badge className="ml-auto bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold">
                  <TrendingUp className="h-3 w-3 mr-0.5" />
                  Debt Growing
                </Badge>
              )}
              {balanceTrendDirection === 'flat' && (
                <Badge variant="secondary" className="ml-auto text-[10px] font-bold">
                  Stable
                </Badge>
              )}
            </div>

            {/* Balance Change Card */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-medium mb-1">Current Balance</p>
                <p className={`text-3xl font-bold tabular-nums ${
                  balanceTrendDirection === 'down'
                    ? 'text-green-700 dark:text-green-400'
                    : balanceTrendDirection === 'up'
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-foreground'
                }`}>
                  {formatPKR(Math.round(balanceTrend.currentBalance))}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">30-Day Change</p>
                  <div className="flex items-center gap-1.5">
                    {balanceTrend.change <= 0 ? (
                      <TrendingDown className={`h-4 w-4 ${balanceTrend.change < -10 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
                    ) : (
                      <TrendingUp className={`h-4 w-4 ${balanceTrend.change > 10 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
                    )}
                    <span className={`text-sm font-bold tabular-nums ${
                      balanceTrend.change < -10
                        ? 'text-green-600 dark:text-green-400'
                        : balanceTrend.change > 10
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-muted-foreground'
                    }`}>
                      {balanceTrend.change >= 0 ? '+' : ''}{formatPKR(Math.round(balanceTrend.change))}
                    </span>
                    {balanceTrend.changePercent !== 0 && (
                      <span className={`text-xs font-medium tabular-nums ${
                        balanceTrend.change < -10
                          ? 'text-green-600 dark:text-green-400'
                          : balanceTrend.change > 10
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                      }`}>
                        ({balanceTrend.changePercent >= 0 ? '+' : ''}{balanceTrend.changePercent}%)
                      </span>
                    )}
                  </div>
                </div>
                {/* Mini Sparkline */}
                <SparklineMini
                  data={balanceTrend.data}
                  direction={balanceTrendDirection}
                  width={100}
                  height={36}
                />
              </div>
            </div>
          </div>

          {/* SVG Balance Trend Chart */}
          <div className="px-5 pb-5">
            <BalanceTrendChart data={balanceTrend.data} direction={balanceTrendDirection} />
          </div>
        </Card>
      )}

      {/* 6 Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {/* Total Credit */}
        <Card className="card-elevated stat-card-amber hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Credit</p>
            <p className="text-xl font-bold text-foreground tabular-nums number-animate">{formatPKR(data.stats.totalCredit)}</p>
          </CardContent>
        </Card>

        {/* Total Recovery */}
        <Card className="card-elevated stat-card-green hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                <TrendingDown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Recovery</p>
            <p className="text-xl font-bold text-foreground tabular-nums number-animate">{formatPKR(data.stats.totalRecovery)}</p>
          </CardContent>
        </Card>

        {/* Total Claims */}
        <Card className="card-elevated stat-card-red hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Deducted</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Claims</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums number-animate">{formatPKR(data.stats.totalClaims || 0)}</p>
          </CardContent>
        </Card>

        {/* Net Balance */}
        <Card className={`card-elevated ${data.stats.netBalance > 0 ? 'stat-card-red' : 'stat-card-green'} hover-scale-102`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Current</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Net Balance</p>
            <p className="text-xl font-bold tabular-nums number-animate text-foreground">
              {formatPKR(data.stats.netBalance)}
            </p>
          </CardContent>
        </Card>

        {/* Avg Credit per Transaction */}
        <Card className="card-elevated stat-card-blue hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center shadow-sm">
                <CreditCard className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Avg</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg Credit / Txn</p>
            <p className="text-xl font-bold text-foreground tabular-nums number-animate">{formatPKR(data.stats.avgCreditPerTransaction)}</p>
          </CardContent>
        </Card>

        {/* Recovery Rate */}
        <Card className="card-elevated hover-scale-102" style={{
          borderLeft: `4px solid ${data.recoveryRate >= 80 ? '#10B981' : data.recoveryRate >= 50 ? '#F59E0B' : '#EF4444'}`,
        }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Rate</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Recovery Rate</p>
            <p className={`text-xl font-bold tabular-nums number-animate ${recoveryColor}`}>{data.recoveryRate}%</p>
          </CardContent>
        </Card>

        {/* Days Since Last Transaction */}
        <Card className={`card-elevated ${data.stats.daysSinceLastTransaction > 7 ? 'stat-card-red' : 'stat-card-green'} hover-scale-102`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <Clock className={`h-5 w-5 ${data.stats.daysSinceLastTransaction > 7 ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
              </div>
              {data.stats.daysSinceLastTransaction > 7 && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                  Warning
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Days Since Last Txn</p>
            <p className={`text-xl font-bold tabular-nums number-animate ${data.stats.daysSinceLastTransaction > 7 ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}>
              {data.stats.lastTransactionDate ? data.stats.daysSinceLastTransaction : '—'}
            </p>
            {data.stats.lastTransactionDate && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Last: {formatDate(data.stats.lastTransactionDate)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ShopDetailAnalyticsCharts chartData={chartData} />

      {/* Additional Info Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Credit Limit Usage */}
        <Card className="card-elevated">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Credit Limit Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {data.shop.creditLimit > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Outstanding Balance</span>
                  <span className="font-semibold">{formatPKR(data.shop.balance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Credit Limit</span>
                  <span className="font-semibold">{formatPKR(data.shop.creditLimit)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Available Credit</span>
                  <span className={`font-semibold ${creditLimitColor}`}>
                    {formatPKR(Math.max(0, data.shop.creditLimit - data.shop.balance))}
                  </span>
                </div>
                <Progress
                  value={Math.min(data.stats.creditLimitUsage * 100, 100)}
                  className="h-3 mt-1"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.round(data.stats.creditLimitUsage * 100)}% used</span>
                  <span>
                    {data.stats.creditLimitUsage >= 1
                      ? '⚠ Over limit'
                      : data.stats.creditLimitUsage >= 0.8
                        ? '⚠ Near limit'
                        : '✓ Healthy'}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No credit limit set for this shop.</p>
            )}
          </CardContent>
        </Card>

        {/* Top Credit Days & Quick Stats */}
        <Card className="card-elevated">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Transaction Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Transactions</span>
              <span className="font-semibold tabular-nums">{data.stats.transactionCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Avg Recovery / Txn</span>
              <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{formatPKR(data.stats.avgRecoveryPerTransaction)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Top Credit Days</span>
              <span className="font-semibold">
                {data.topCreditDays.length > 0
                  ? data.topCreditDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recovery Rate</span>
              <span className={`font-bold ${recoveryColor}`}>{data.recoveryRate}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shop Notes Section */}
      <Card className="card-elevated">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Notes
            </CardTitle>
            <Badge variant="secondary" className="text-[11px]">
              {shopNotes.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          {/* Add Note */}
          <div className="space-y-2">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note about this shop..."
              className="resize-none"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
            type="button"
                size="sm"
                onClick={handleAddNote}
                disabled={noteSaving || !newNote.trim()}
                className="bg-primary hover:bg-primary/90 "
              >
                {noteSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Add Note
              </Button>
            </div>
          </div>

          {/* Notes List */}
          {notesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-full bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : shopNotes.length === 0 ? (
            <div className="text-center py-6">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground text-sm">No notes yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Add notes to keep track of important information</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {shopNotes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-foreground">{note.creatorName || note.createdBy}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(note.createdAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}
                          {new Date(note.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap">{note.note}</p>
                    </div>
                    <Button
            type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={noteDeleting === note.id}
                      aria-label="Delete note"
                    >
                      {noteDeleting === note.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Transactions
            </CardTitle>
            <Badge variant="secondary" className="text-[11px]">
              Last {data.recentTransactions.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.recentTransactions.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground text-sm">No transactions yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">This shop has no recorded transactions</p>
            </div>
          ) : (
            <ScrollArea className="max-h-96">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Type</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Amount</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right hidden sm:table-cell">Balance</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Posted By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTransactions.map((txn, idx) => (
                    <TableRow key={txn.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(txn.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] font-semibold ${txn.type === 'credit' ? 'badge-credit' : txn.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'badge-recovery'}`}>
                          {txn.type === 'credit' ? '↑ Credit' : txn.type === 'claim' ? '↓ Claim' : '↓ Recovery'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${txn.type === 'credit' ? 'text-red-600 dark:text-red-400' : txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-sm tabular-nums text-muted-foreground">{formatPKR(txn.newBalance)}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground truncate max-w-[180px] block">{txn.description || '—'}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">{txn.createdBy}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
