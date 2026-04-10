'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  BarChart3,
  Users,
  TrendingUp,
  Wallet,
  FileDown,
  Clock,
  Trophy,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportToCSV } from '@/lib/csv-export';

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface OBPerformance {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalShops: number;
  totalOutstanding: number;
  todayRecovery: number;
  periodRecovery: number;
  lastActive: string | null;
  avgRecoveryPerShop: number;
  recoveryRate: number;
}

type ViewPeriod = 'week' | 'month' | 'quarter';

const periodLabels: Record<ViewPeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
};

function PerformanceBadge({ rate }: { rate: number }) {
  let variant: 'excellent' | 'good' | 'poor';
  let label: string;
  let classes: string;

  if (rate >= 80) {
    variant = 'excellent';
    label = 'Excellent';
    classes = 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800';
  } else if (rate >= 50) {
    variant = 'good';
    label = 'Good';
    classes = 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800';
  } else {
    variant = 'poor';
    label = 'Low';
    classes = 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800';
  }

  return (
    <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${classes}`}>
      {label}
    </Badge>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardHeader className="pb-2 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-52" />
        </CardHeader>
        <CardContent className="px-4 pb-5">
          <Skeleton className="skeleton-shimmer h-64 w-full" />
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-56" />
        </CardHeader>
        <CardContent className="p-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-5 w-5" />
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-12" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminOBAnalytics() {
  const [data, setData] = useState<OBPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<ViewPeriod>('month');
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (viewPeriod: ViewPeriod) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/ob-performance?period=${viewPeriod}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast({ title: 'Error', description: 'Failed to load orderbooker performance data', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error fetching analytics', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  // Summary KPIs
  const summary = useMemo(() => ({
    totalOBs: data.length,
    totalOutstanding: data.reduce((s, d) => s + d.totalOutstanding, 0),
    totalRecovery: data.reduce((s, d) => s + d.periodRecovery, 0),
    avgRecovery: data.length > 0 ? data.reduce((s, d) => s + d.periodRecovery, 0) / data.length : 0,
  }), [data]);

  // Chart data - top 10 by period recovery
  const chartData = useMemo(() => {
    return data.slice(0, 10).map((d) => ({
      name: d.orderbookerName.length > 12 ? d.orderbookerName.slice(0, 12) + '...' : d.orderbookerName,
      fullName: d.orderbookerName,
      Recovery: Math.round(d.periodRecovery),
      Outstanding: Math.round(d.totalOutstanding),
    }));
  }, [data]);

  // CSV Export
  const handleCSVExport = useCallback(() => {
    if (data.length === 0) return;
    setExporting(true);
    try {
      const headers = ['Rank', 'Name', 'Phone', 'Shops', 'Outstanding', 'Recovery', 'Avg/Shop', 'Last Active', 'Performance'];
      const rows = data.map((d, idx) => ({
        Rank: idx + 1,
        Name: d.orderbookerName,
        Phone: d.orderbookerPhone || '',
        Shops: d.totalShops,
        Outstanding: Math.round(d.totalOutstanding),
        Recovery: Math.round(d.periodRecovery),
        'Avg/Shop': Math.round(d.avgRecoveryPerShop),
        'Last Active': d.lastActive ? new Date(d.lastActive).toLocaleDateString('en-PK') : 'Never',
        Performance: d.recoveryRate >= 80 ? 'Excellent' : d.recoveryRate >= 50 ? 'Good' : 'Low',
      }));
      exportToCSV(rows, `ob-performance-${period}`, headers);
      toast({ title: 'Export Complete', description: `${data.length} orderbookers exported to CSV` });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not export CSV', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [data, period]);

  function formatRelativeDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
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
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  }

  if (loading) return <AnalyticsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Orderbooker Performance Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Compare orderbooker recovery performance and outstanding balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as ViewPeriod)}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCSVExport}
            disabled={exporting || data.length === 0}
            className="h-9 gap-1.5"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-elevated stat-card-blue hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-950/40 flex items-center justify-center shadow-sm">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Orderbookers</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.totalOBs}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated stat-card-red hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-950/40 flex items-center justify-center shadow-sm">
                <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">All Time</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums number-animate">{formatCurrency(summary.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated stat-card-green hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/40 dark:to-green-950/40 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">{periodLabels[period]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Recovery This Period</p>
            <p className="text-2xl font-bold text-green-600 tabular-nums number-animate">{formatCurrency(summary.totalRecovery)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated stat-card-amber hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/40 flex items-center justify-center shadow-sm">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Average</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg Recovery per OB</p>
            <p className="text-2xl font-bold text-amber-600 tabular-nums number-animate">{formatCurrency(summary.avgRecovery)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Bar Chart */}
      <Card className="card-elevated hover-scale-102">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Top Orderbookers by Recovery — {periodLabels[period]}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {chartData.length > 0 ? (
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="perfRecoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="perfOutstandingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.4} />
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
                      name,
                    ]}
                    labelFormatter={(label: string) => {
                      const item = chartData.find(d => d.name === label);
                      return item?.fullName || label;
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
                    dataKey="Recovery"
                    fill="url(#perfRecoveryGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 sm:h-72 flex flex-col items-center justify-center text-sm text-muted-foreground">
              <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
              <p>No performance data available</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Orderbooker Performance Rankings
            </CardTitle>
            <Badge variant="secondary" className="text-[11px]">
              {periodLabels[period]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="data-table-header hover:bg-transparent">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Shops</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Recovery</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right hidden md:table-cell">Avg/Shop</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">Last Active</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="text-center py-10">
                        <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground text-sm">No orderbookers found</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Add orderbookers to see performance analytics</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((ob, idx) => (
                    <TableRow
                      key={ob.orderbookerId}
                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                    >
                      <TableCell className="text-sm">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                          idx === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                          : idx === 1 ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                          : idx === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{ob.orderbookerName}</p>
                          <p className="text-[11px] text-muted-foreground sm:hidden">{ob.totalShops} shops</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {ob.totalShops}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-red-600 tabular-nums number-animate">
                          {formatCurrency(ob.totalOutstanding)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-green-600 tabular-nums number-animate">
                          {formatCurrency(ob.periodRecovery)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(ob.avgRecoveryPerShop)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <div className="flex items-center justify-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeDate(ob.lastActive)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <PerformanceBadge rate={ob.recoveryRate} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
