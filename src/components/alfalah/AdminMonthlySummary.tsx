'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import dynamic from 'next/dynamic';

const MonthlySummaryCharts = dynamic(() => import('./MonthlySummaryCharts'), { ssr: false, loading: () => <div className="h-64 animate-pulse bg-muted/20 rounded-lg" /> });
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  BarChart3,
  Trophy,
  Target,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/csv-export';
import { formatPKR } from '@/lib/utils';

interface DailyBreakdown {
  date: string;
  credit: number;
  recovery: number;
  net: number;
}

interface TopShop {
  shopName: string;
  area: string;
  recovery?: number;
  credit?: number;
  orderbookerName: string;
}

interface OBBreakdown {
  name: string;
  credit: number;
  recovery: number;
  shops: number;
}

interface MonthlySummaryData {
  month: string;
  monthLabel: string;
  totalCredit: number;
  totalRecovery: number;
  netChange: number;
  shopCount: number;
  activeOrderbookers: number;
  dailyBreakdown: DailyBreakdown[];
  topRecoveryShops: TopShop[];
  topCreditShops: TopShop[];
  orderbookerBreakdown: OBBreakdown[];
}

function getMonthDate(monthStr: string): Date {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function toMonthString(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function SummarySkeleton() {
  return (
    <div className="space-y-6">
      {/* Month selector skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-52 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="skeleton-shimmer h-9 w-9" />
          <Skeleton className="skeleton-shimmer h-9 w-40" />
          <Skeleton className="skeleton-shimmer h-9 w-9" />
        </div>
      </div>
      {/* KPI cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-10 w-10 rounded-xl mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-28 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart skeleton */}
      <Card className="card-elevated">
        <CardHeader className="pb-2 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-52" />
        </CardHeader>
        <CardContent className="px-4 pb-5">
          <Skeleton className="skeleton-shimmer h-64 w-full" />
        </CardContent>
      </Card>
      {/* Tables skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-10 w-full mb-1" />
            ))}
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-10 w-full mb-1" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminMonthlySummary() {
  const currentMonthStr = toMonthString(new Date());
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [data, setData] = useState<MonthlySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async (month: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/monthly-summary?month=${month}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        toast({ title: 'Error', description: 'Failed to load monthly summary', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error fetching summary', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedMonth);
  }, [selectedMonth, fetchData]);

  // Month navigation
  const goToPrevMonth = () => {
    const d = getMonthDate(selectedMonth);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(toMonthString(d));
  };

  const goToNextMonth = () => {
    const d = getMonthDate(selectedMonth);
    d.setMonth(d.getMonth() + 1);
    // Don't allow future months
    if (d <= new Date()) {
      setSelectedMonth(toMonthString(d));
    }
  };

  const isCurrentMonth = selectedMonth === currentMonthStr;
  const isFutureMonth = getMonthDate(selectedMonth) > new Date();

  // Recovery rate
  const recoveryRate = data && data.totalCredit > 0
    ? Math.round((data.totalRecovery / data.totalCredit) * 100)
    : 0;

  // Chart data
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.dailyBreakdown.map((d) => ({
      date: formatDayLabel(d.date),
      Credit: Math.round(d.credit),
      Recovery: Math.round(d.recovery),
    }));
  }, [data]);

  // CSV Export
  const handleCSVExport = useCallback(() => {
    if (!data) return;
    setExporting(true);
    try {
      const rows: Record<string, unknown>[] = [];

      // Daily breakdown
      data.dailyBreakdown.forEach((d) => {
        rows.push({
          Section: 'Daily Breakdown',
          Date: d.date,
          Credit: Math.round(d.credit),
          Recovery: Math.round(d.recovery),
          'Net Change': Math.round(d.net),
        });
      });

      // Orderbooker breakdown
      data.orderbookerBreakdown.forEach((ob) => {
        rows.push({
          Section: 'Orderbooker Summary',
          Name: ob.name,
          Credit: Math.round(ob.credit),
          Recovery: Math.round(ob.recovery),
          'Net Balance': Math.round(ob.credit - ob.recovery),
          Shops: ob.shops,
        });
      });

      // Top recovery shops
      data.topRecoveryShops.forEach((s) => {
        rows.push({
          Section: 'Top Recovery Shops',
          'Shop Name': s.shopName,
          Area: s.area,
          Recovery: s.recovery,
          Orderbooker: s.orderbookerName,
        });
      });

      // Top credit shops
      data.topCreditShops.forEach((s) => {
        rows.push({
          Section: 'Top Credit Shops',
          'Shop Name': s.shopName,
          Area: s.area,
          Credit: s.credit,
          Orderbooker: s.orderbookerName,
        });
      });

      exportToCSV(rows, `monthly-summary-${data.month}`, [
        'Section', 'Date', 'Name', 'Shop Name', 'Area', 'Credit', 'Recovery', 'Net Change', 'Net Balance', 'Shops', 'Orderbooker',
      ]);
      toast({ title: 'Export Complete', description: 'Monthly summary CSV downloaded' });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not export CSV', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [data]);

  if (loading) return <SummarySkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header + Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="animate-fade-in">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Monthly Summary Report
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Comprehensive monthly business overview with daily trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={goToPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card min-w-[180px] justify-center">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{getMonthLabel(selectedMonth)}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={goToNextMonth}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCSVExport}
            disabled={exporting || !data}
            className="h-9 gap-1.5 ml-1"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            {/* Total Credit */}
            <Card className="card-elevated card-hover border border-border" style={{ animationDelay: '0ms' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                    <ArrowUpRight className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-medium">{getMonthLabel(selectedMonth)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Credit Posted</p>
                <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
                  {formatPKR(Math.abs(data.totalCredit))}
                </p>
              </CardContent>
            </Card>

            {/* Total Recovery */}
            <Card className="card-elevated card-hover border border-border" style={{ animationDelay: '50ms' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                    <ArrowDownRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    {recoveryRate >= 80 ? 'On Track' : recoveryRate >= 50 ? 'Attention' : 'Behind'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Recovery Collected</p>
                <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
                  {formatPKR(Math.abs(data.totalRecovery))}
                </p>
              </CardContent>
            </Card>

            {/* Net Balance Change */}
            <Card
              className="card-elevated card-hover border border-border"
              style={{ animationDelay: '100ms' }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm bg-amber-100 dark:bg-amber-900/40">
                    {data.netChange > 0 ? (
                      <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    ) : data.netChange < 0 ? (
                      <TrendingDown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    {data.netChange > 0 ? 'Credit Excess' : data.netChange < 0 ? 'Recovery Surplus' : 'Balanced'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Net Balance Change</p>
                <p className="text-2xl font-bold tabular-nums number-animate text-foreground">
                  {data.netChange > 0 ? '+' : data.netChange < 0 ? '-' : ''}
                  {formatPKR(Math.abs(data.netChange))}
                </p>
              </CardContent>
            </Card>

            {/* Active Shops & OBs */}
            <Card className="card-elevated card-hover border border-border" style={{ animationDelay: '150ms' }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center shadow-sm">
                    <Users className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-medium">Active</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">Active Shops &amp; OBs</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold tabular-nums number-animate">{data.shopCount}</p>
                  <span className="text-sm text-muted-foreground">shops</span>
                  <span className="text-muted-foreground">&middot;</span>
                  <p className="text-lg font-bold tabular-nums text-primary">{data.activeOrderbookers}</p>
                  <span className="text-sm text-muted-foreground">OBs</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recovery Rate Progress Bar */}
          {data.totalCredit > 0 && (
            <Card className="card-elevated overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Month Recovery Rate</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {recoveryRate}%
                  </span>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-emerald-400"
                    style={{ width: `${Math.min(recoveryRate, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {formatPKR(Math.abs(data.totalRecovery))} recovered of {formatPKR(Math.abs(data.totalCredit))} credit
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {recoveryRate >= 80 ? '✓ On Track' : recoveryRate >= 50 ? '⚠ Needs Attention' : '✗ Behind Target'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <MonthlySummaryCharts chartData={chartData} dailyBreakdownLength={data.dailyBreakdown.length} />

          {/* Orderbooker Breakdown Table */}
          {data.orderbookerBreakdown.length > 0 && (
            <Card className="card-elevated">
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Orderbooker Breakdown
                  </CardTitle>
                  <Badge variant="secondary" className="text-[11px]">
                    {data.orderbookerBreakdown.length} orderbookers
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary hover:bg-transparent">
                        <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                        <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Shops</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-right">Credit</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-right">Recovery</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-right">Net</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-center hidden md:table-cell">Recovery Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.orderbookerBreakdown.map((ob, idx) => {
                        const net = ob.credit - ob.recovery;
                        const rate = ob.credit > 0 ? Math.round((ob.recovery / ob.credit) * 100) : (ob.recovery > 0 ? 100 : 0);
                        const rateColorClass = rate >= 80
                          ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 border-emerald-200 dark:border-emerald-800'
                          : rate >= 50
                            ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 border-amber-200 dark:border-amber-800'
                            : 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
                        return (
                          <TableRow
                            key={ob.name}
                            className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                          >
                            <TableCell className="text-sm">
                              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                                idx === 0 ? 'bg-amber-200 text-amber-800 dark:bg-amber-700 dark:text-amber-200'
                                : idx === 1 ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                : idx === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                : 'bg-muted text-muted-foreground'
                              }`}>
                                {idx + 1}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-primary">{ob.name.charAt(0)}</span>
                                </div>
                                <span className="text-sm font-medium">{ob.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                {ob.shops}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatPKR(Math.abs(ob.credit))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                                {formatPKR(Math.abs(ob.recovery))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`text-sm font-semibold tabular-nums ${net > 0 ? 'text-foreground' : net < 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {net > 0 ? '+' : net < 0 ? '-' : ''}
                                {formatPKR(Math.abs(net))}
                              </span>
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 border ${rateColorClass}`}>
                                {rate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Shops - Credit & Recovery */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 5 Credit Shops */}
            <Card className="card-elevated hover-scale-102">
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                    Top 5 Credit Shops
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    Credit
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.topCreditShops.length > 0 ? (
                  <div className="space-y-2">
                    {data.topCreditShops.map((shop, idx) => {
                      const maxCredit = data.topCreditShops[0].credit || 1;
                      const pct = ((shop.credit || 0) / maxCredit) * 100;
                      return (
                        <div
                          key={`credit-${idx}`}
                          className={`flex items-center gap-3 p-2.5 rounded-lg ${idx % 2 === 0 ? 'bg-muted/30' : ''} transition-colors`}
                        >
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                            idx === 0 ? 'bg-amber-500 text-white'
                            : idx === 1 ? 'bg-gray-400 dark:bg-gray-500 text-white'
                            : idx === 2 ? 'bg-amber-700 text-amber-100'
                            : 'bg-muted text-muted-foreground'
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{shop.shopName}</p>
                                <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                  <Store className="h-2.5 w-2.5" />
                                  {shop.area} {shop.orderbookerName ? `· ${shop.orderbookerName}` : ''}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-foreground tabular-nums ml-2 shrink-0">
                                {formatPKR(Math.abs(shop.credit || 0))}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Store className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No credit posted this month</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 5 Recovery Shops */}
            <Card className="card-elevated hover-scale-102">
              <CardHeader className="pb-3 pt-4 px-5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Top 5 Recovery Shops
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                    Recovery
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {data.topRecoveryShops.length > 0 ? (
                  <div className="space-y-2">
                    {data.topRecoveryShops.map((shop, idx) => {
                      const maxRecovery = data.topRecoveryShops[0].recovery || 1;
                      const pct = ((shop.recovery || 0) / maxRecovery) * 100;
                      return (
                        <div
                          key={`recovery-${idx}`}
                          className={`flex items-center gap-3 p-2.5 rounded-lg ${idx % 2 === 0 ? 'bg-muted/30' : ''} transition-colors`}
                        >
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                            idx === 0 ? 'bg-amber-500 text-white'
                            : idx === 1 ? 'bg-gray-400 dark:bg-gray-500 text-white'
                            : idx === 2 ? 'bg-amber-700 text-amber-100'
                            : 'bg-muted text-muted-foreground'
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{shop.shopName}</p>
                                <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                  <Store className="h-2.5 w-2.5" />
                                  {shop.area} {shop.orderbookerName ? `· ${shop.orderbookerName}` : ''}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-foreground tabular-nums ml-2 shrink-0">
                                {formatPKR(Math.abs(shop.recovery || 0))}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No recovery collected this month</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
