'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAppStore } from '@/lib/store';
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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportToCSV } from '@/lib/csv-export';

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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
    routeDay: string;
    balance: number;
    creditLimit: number;
    status: string;
    orderbookerName: string;
    createdAt: string;
  };
  stats: {
    totalCredit: number;
    totalRecovery: number;
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
  const { selectedShopId, selectedShopName, setCurrentView } = useAppStore();
  const [data, setData] = useState<ShopDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchShopDetail = useCallback(async () => {
    if (!selectedShopId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/shop-detail?shopId=${selectedShopId}`);
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

  useEffect(() => {
    fetchShopDetail();
  }, [fetchShopDetail]);

  const handleBack = () => {
    setCurrentView('admin-shops');
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
        <Button variant="outline" className="mt-4" onClick={() => setCurrentView('admin-shops')}>
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
          <Button variant="ghost" size="icon" onClick={handleBack} className="hover-lift">
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
        <div className="alfalah-gradient p-5">
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
                  {data.shop.routeDay.charAt(0).toUpperCase() + data.shop.routeDay.slice(1)}
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
                {formatCurrency(data.shop.balance)} / {formatCurrency(data.shop.creditLimit)}
                ({Math.round(data.stats.creditLimitUsage * 100)}%)
              </span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  data.stats.creditLimitUsage >= 1
                    ? 'bg-gradient-to-r from-red-500 to-red-600'
                    : data.stats.creditLimitUsage >= 0.8
                      ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                      : 'bg-gradient-to-r from-green-400 to-green-500'
                }`}
                style={{ width: `${Math.min(data.stats.creditLimitUsage * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* 6 Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
        {/* Total Credit */}
        <Card className="card-elevated stat-card-amber hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Credit</p>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums number-animate">{formatCurrency(data.stats.totalCredit)}</p>
          </CardContent>
        </Card>

        {/* Total Recovery */}
        <Card className="card-elevated stat-card-green hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-950/40 flex items-center justify-center shadow-sm">
                <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Recovery</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums number-animate">{formatCurrency(data.stats.totalRecovery)}</p>
          </CardContent>
        </Card>

        {/* Net Balance */}
        <Card className={`card-elevated ${data.stats.netBalance > 0 ? 'stat-card-red' : 'stat-card-green'} hover-scale-102`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-sm ${
                data.stats.netBalance > 0
                  ? 'bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-950/40'
                  : 'bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-950/40'
              }`}>
                <Wallet className={`h-5 w-5 ${data.stats.netBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Current</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Net Balance</p>
            <p className={`text-xl font-bold tabular-nums number-animate ${data.stats.netBalance > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
              {formatCurrency(data.stats.netBalance)}
            </p>
          </CardContent>
        </Card>

        {/* Avg Credit per Transaction */}
        <Card className="card-elevated stat-card-blue hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-950/40 flex items-center justify-center shadow-sm">
                <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Avg</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg Credit / Txn</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-400 tabular-nums number-animate">{formatCurrency(data.stats.avgCreditPerTransaction)}</p>
          </CardContent>
        </Card>

        {/* Recovery Rate */}
        <Card className="card-elevated hover-scale-102" style={{
          borderLeft: `4px solid ${data.recoveryRate >= 80 ? '#10B981' : data.recoveryRate >= 50 ? '#F59E0B' : '#EF4444'}`,
        }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/40 flex items-center justify-center shadow-sm">
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
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-sm ${
                data.stats.daysSinceLastTransaction > 7
                  ? 'bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-950/40'
                  : 'bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-950/40'
              }`}>
                <Clock className={`h-5 w-5 ${data.stats.daysSinceLastTransaction > 7 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
              </div>
              {data.stats.daysSinceLastTransaction > 7 && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold">
                  <AlertTriangle className="h-3 w-3 mr-0.5" />
                  Warning
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Days Since Last Txn</p>
            <p className={`text-xl font-bold tabular-nums number-animate ${data.stats.daysSinceLastTransaction > 7 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
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

      {/* Monthly Trend Chart */}
      <Card className="card-elevated hover-scale-102">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Monthly Trend — Last 6 Months
            </CardTitle>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Credit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Recovery
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {chartData.length > 0 ? (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
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
                    dataKey="name"
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
                    formatter={(value: number) => [
                      formatCurrency(value),
                    ]}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Credit"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fill="url(#creditGradient)"
                    dot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#F59E0B' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Recovery"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#recoveryGradient)"
                    dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, fill: '#10B981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
              <p>No trend data available for the last 6 months</p>
            </div>
          )}
        </CardContent>
      </Card>

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
                  <span className="font-semibold">{formatCurrency(data.shop.balance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Credit Limit</span>
                  <span className="font-semibold">{formatCurrency(data.shop.creditLimit)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Available Credit</span>
                  <span className={`font-semibold ${creditLimitColor}`}>
                    {formatCurrency(Math.max(0, data.shop.creditLimit - data.shop.balance))}
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
              <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{formatCurrency(data.stats.avgRecoveryPerTransaction)}</span>
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
                  <TableRow className="data-table-header hover:bg-transparent">
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
                        <Badge className={`text-[10px] font-semibold ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                          {txn.type === 'credit' ? '↑ Credit' : '↓ Recovery'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${txn.type === 'credit' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className="text-sm tabular-nums text-muted-foreground">{formatCurrency(txn.newBalance)}</span>
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
