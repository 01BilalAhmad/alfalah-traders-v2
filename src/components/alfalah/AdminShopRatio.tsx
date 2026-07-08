'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PieChart,
  Store,
  MapPin,
  User,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToExcel } from '@/lib/excel-export';

// Currency formatter — kept inline so the file is self-contained.
const formatPKR = (amount: number | undefined | null): string =>
  `Rs. ${(amount ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

interface RatioShop {
  shopId: string;
  shopName: string;
  area: string | null;
  orderbookerName: string | null;
  totalCredit: number;
  totalRecovery: number;
  balance: number;
  ratio: number; // 0-100
  status: string;
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

type Status = 'good' | 'watch' | 'critical' | 'no-credit';

const getStatus = (shop: RatioShop): Status => {
  if (shop.totalCredit <= 0) return 'no-credit';
  if (shop.ratio >= 70) return 'good';
  if (shop.ratio >= 40) return 'watch';
  return 'critical';
};

const statusStyles: Record<
  Status,
  { label: string; badge: string; bar: string }
> = {
  good: {
    label: 'Good',
    badge:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
    bar: 'bg-emerald-500',
  },
  watch: {
    label: 'Watch',
    badge:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-400 dark:border-amber-800',
    bar: 'bg-amber-500',
  },
  critical: {
    label: 'Critical',
    badge:
      'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
    bar: 'bg-red-500',
  },
  'no-credit': {
    label: 'No Credit',
    badge:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
    bar: 'bg-slate-400',
  },
};

function RatioSkeleton() {

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-56" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-4 w-36" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminShopRatio() {
  const [shops, setShops] = useState<RatioShop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
    // ── Export to Excel ──────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!shops.length) return;
    setExporting(true);
    try {
      await exportToExcel(
        shops.map((s: any) => ({
        'Shop Name': s.shopName,
        'Area': s.area,
        'Orderbooker': s.orderbookerName,
        'Total Credit': s.totalCredit,
        'Total Recovery': s.totalRecovery,
        'Balance': s.balance,
        'Ratio %': s.ratio,
        'Status': s.status,
      })),
        `shop-ratio-${new Date().toISOString().split('T')[0]}`,
        'Credit Recovery Ratio',
        [20, 15, 20, 15, 15, 15, 10, 10],
      );
      toast({ title: 'Export Complete', description: 'Credit Recovery Ratio exported to Excel' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOB, setSelectedOB] = useState('all');
  const [minBalance, setMinBalance] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedOB !== 'all') params.set('orderbookerId', selectedOB);
      if (minBalance.trim() !== '') params.set('minBalance', minBalance.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';

      const [ratioRes, obRes] = await Promise.all([
        apiFetch(`/api/reports/shop-ratio${qs}`),
        apiFetch('/api/orderbookers'),
      ]);

      if (!ratioRes.ok) {
        throw new Error('Failed to load credit recovery ratio');
      }
      const data = await ratioRes.json();
      setShops(Array.isArray(data) ? data : data.shops ?? []);

      if (obRes.ok) {
        const obs = await obRes.json();
        setOrderbookers(
          Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : []
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOB, minBalance]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sort by balance descending (highest outstanding first).
  const sortedShops = useMemo(() => {
    return [...shops].sort((a, b) => b.balance - a.balance);
  }, [shops]);

  // Summary KPIs.
  const summary = useMemo(() => {
    const totalShops = shops.length;
    const totalCredit = shops.reduce((s, sh) => s + sh.totalCredit, 0);
    const totalRecovery = shops.reduce((s, sh) => s + sh.totalRecovery, 0);
    const withCredit = shops.filter((s) => s.totalCredit > 0);
    const avgRatio =
      withCredit.length > 0
        ? withCredit.reduce((s, sh) => s + sh.ratio, 0) / withCredit.length
        : 0;
    const riskShops = withCredit.filter((s) => s.ratio < 40).length;
    return { totalShops, totalCredit, totalRecovery, avgRatio, riskShops };
  }, [shops]);

  if (loading) return <RatioSkeleton />;

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
            <PieChart className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Credit Recovery Ratio
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Per-shop credit vs. recovery performance
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedOB} onValueChange={setSelectedOB}>
            <SelectTrigger className="w-[170px] h-9 text-sm">
              <SelectValue placeholder="All OBs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {orderbookers.map((ob) => (
                <SelectItem key={ob.id} value={ob.id}>
                  {ob.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            placeholder="Min Balance"
            value={minBalance}
            onChange={(e) => setMinBalance(e.target.value)}
            className="h-9 text-sm w-[140px]"
          />
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
            disabled={exporting || !shops.length}
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 stagger-children">
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
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
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Credit</p>
            <p className="text-xl font-bold text-foreground tabular-nums number-animate">
              {formatPKR(summary.totalCredit)}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Total Recovery
            </p>
            <p className="text-xl font-bold text-foreground tabular-nums number-animate">
              {formatPKR(summary.totalRecovery)}
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shadow-sm">
                <PieChart className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Avg Recovery %
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.avgRatio.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">
              Risk Shops (&lt;40%)
            </p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums number-animate">
              {summary.riskShops}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Shop-wise Recovery Ratio
            <Badge variant="secondary" className="text-[11px] ml-1">
              {sortedShops.length} shops
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-indigo-800 dark:bg-indigo-950 hover:bg-indigo-800 dark:hover:bg-indigo-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">
                    Area
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden md:table-cell">
                    Orderbooker
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">
                    Total Credit
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right hidden lg:table-cell">
                    Total Recovery
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">
                    Balance
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Ratio %
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedShops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="text-center py-10">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">
                          No shops found
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Try adjusting the orderbooker or minimum balance filter
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedShops.map((shop, idx) => {
                    const status = getStatus(shop);
                    const style = statusStyles[status];
                    const pctClamped = Math.min(shop.ratio, 100);
                    return (
                      <TableRow
                        key={shop.shopId}
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
                          <div>
                            <p className="text-sm font-medium text-foreground">{shop.shopName}</p>
                            <p className="text-[11px] text-muted-foreground sm:hidden">
                              {shop.area || '—'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {shop.area || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              {shop.orderbookerName || '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-medium tabular-nums text-amber-600 dark:text-amber-400">
                            {formatPKR(shop.totalCredit)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right">
                          <span className="text-sm font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                            {formatPKR(shop.totalRecovery)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-foreground tabular-nums inline-flex items-center gap-1 justify-end">
                            <TrendingDown className="h-3 w-3 text-muted-foreground" />
                            {formatPKR(shop.balance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1 min-w-[110px]">
                            <span className="text-xs font-semibold tabular-nums">
                              {shop.totalCredit > 0 ? `${shop.ratio.toFixed(1)}%` : '—'}
                            </span>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${style.bar} transition-all`}
                                style={{ width: `${pctClamped}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={`text-[10px] border font-semibold ${style.badge}`}
                          >
                            {style.label}
                          </Badge>
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
