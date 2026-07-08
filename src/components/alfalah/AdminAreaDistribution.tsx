'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MapPin,
  Store,
  Users,
  Wallet,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToExcel } from '@/lib/excel-export';

// Currency formatter — kept inline so the file is self-contained.
const formatPKR = (amount: number | undefined | null): string =>
  `Rs. ${(amount ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

interface AreaRow {
  area: string;
  shopCount: number;
  totalBalance: number;
  todayRecovery: number;
  recoveryCount: number;
  obs: string[];
}

function AreaSkeleton() {

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-44" />
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
        <CardContent className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-16" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminAreaDistribution() {
  const [areas, setAreas] = useState<AreaRow[]>([]);
    // ── Export to Excel ──────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!areas.length) return;
    setExporting(true);
    try {
      await exportToExcel(
        areas.map((a: any) => ({
        'Area': a.area,
        'Shop Count': a.shopCount,
        'Total Balance': a.totalBalance,
        'Today Recovery': a.todayRecovery,
        'Recovery Count': a.recoveryCount,
        'OBs Assigned': (a.obs || []).join(', '),
      })),
        `area-distribution-${new Date().toISOString().split('T')[0]}`,
        'Area Distribution',
        [20, 12, 15, 15, 15, 30],
      );
      toast({ title: 'Export Complete', description: 'Area Distribution exported to Excel' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = date ? `?date=${encodeURIComponent(date)}` : '';
      const res = await apiFetch(`/api/reports/area-distribution${qs}`);
      if (!res.ok) {
        throw new Error('Failed to load area distribution');
      }
      const data = await res.json();
      setAreas(Array.isArray(data) ? data : data.areas ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sort by shop count descending.
  const sortedAreas = useMemo(() => {
    return [...areas].sort((a, b) => b.shopCount - a.shopCount);
  }, [areas]);

  // Summary KPIs.
  const summary = useMemo(() => {
    const totalAreas = areas.length;
    const totalShops = areas.reduce((s, a) => s + a.shopCount, 0);
    const totalOutstanding = areas.reduce((s, a) => s + a.totalBalance, 0);
    const todayRecovery = areas.reduce((s, a) => s + a.todayRecovery, 0);
    return { totalAreas, totalShops, totalOutstanding, todayRecovery };
  }, [areas]);

  if (loading) return <AreaSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <p className="text-base font-semibold text-foreground">Failed to load report</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{error}</p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={fetchData}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>

      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Area Distribution
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Outstanding and recovery distribution by area
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9 h-9 text-sm w-[170px]"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={fetchData}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5"
            onClick={handleExport}
            disabled={exporting || !areas.length}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export Excel
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                Areas
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Areas</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.totalAreas}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                Shops
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Shops</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.totalShops}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                Outstanding
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Total Outstanding
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {formatPKR(summary.totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                Today
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Today&apos;s Recovery
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {formatPKR(summary.todayRecovery)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Area Breakdown
            <Badge variant="secondary" className="text-[11px] ml-1">
              {sortedAreas.length} areas
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-indigo-800 dark:bg-indigo-950 hover:bg-indigo-800 dark:hover:bg-indigo-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Area</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Shop Count
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">
                    Total Balance
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">
                    Today&apos;s Recovery
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">
                    Recovery Count
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden md:table-cell">
                    OBs Assigned
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Recovery %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAreas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="text-center py-10">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">
                          No area data available
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Try selecting a different date
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedAreas.map((row, idx) => {
                    const pct =
                      row.totalBalance > 0
                        ? (row.todayRecovery / row.totalBalance) * 100
                        : 0;
                    const pctClamped = Math.min(pct, 100);
                    const barColor =
                      pct >= 70
                        ? 'bg-emerald-500'
                        : pct >= 40
                          ? 'bg-amber-500'
                          : 'bg-red-500';
                    return (
                      <TableRow
                        key={`${row.area}-${idx}`}
                        className={`${
                          idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'
                        } table-row-hover-effect`}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium text-foreground">
                              {row.area || 'Unknown'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-semibold tabular-nums">
                            {row.shopCount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPKR(row.totalBalance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {formatPKR(row.todayRecovery)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-center">
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {row.recoveryCount}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {row.obs && row.obs.length > 0 ? (
                            <div className="flex items-start gap-1.5 max-w-xs">
                              <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <span className="text-xs text-muted-foreground leading-relaxed">
                                {row.obs.join(', ')}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1 min-w-[110px]">
                            <span className="text-xs font-semibold tabular-nums">
                              {pct.toFixed(1)}%
                            </span>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${barColor} transition-all`}
                                style={{ width: `${pctClamped}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
