'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Clock,
  Store,
  MapPin,
  User,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  TrendingDown,
  Download,
  Loader2,
  Search,
  Building2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToExcel } from '@/lib/excel-export';

// Currency formatter — kept inline so the file is self-contained.
const formatPKR = (amount: number | undefined | null): string =>
  `Rs. ${(amount ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

interface AgingShop {
  shopId: string;
  shopName: string;
  area: string | null;
  orderbookerName: string | null;
  balance: number;
  ageDays: number;
  bucket: string;
  lastCreditDate: string | null;
  lastRecoveryDate: string | null;
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

type Bucket = '0-30' | '31-60' | '61-90' | '90+';

const getBucket = (ageDays: number): Bucket => {
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
};

// Sort weight so 90+ appears at the top, then 61-90, etc.
const bucketWeight: Record<Bucket, number> = {
  '90+': 0,
  '61-90': 1,
  '31-60': 2,
  '0-30': 3,
};

const bucketStyles: Record<
  Bucket,
  { badge: string; card: string; icon: string; label: string }
> = {
  '0-30': {
    label: '0-30 Days',
    badge:
      'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
    card: 'bg-emerald-100 dark:bg-emerald-900/40',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  '31-60': {
    label: '31-60 Days',
    badge:
      'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800',
    card: 'bg-blue-100 dark:bg-blue-900/40',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  '61-90': {
    label: '61-90 Days',
    badge:
      'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-400 dark:border-amber-800',
    card: 'bg-amber-100 dark:bg-amber-900/40',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  '90+': {
    label: '90+ Days',
    badge:
      'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
    card: 'bg-red-100 dark:bg-red-900/40',
    icon: 'text-red-600 dark:text-red-400',
  },
};

function AgingSkeleton() {

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-40" />
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
              <Skeleton className="skeleton-shimmer h-4 w-40" />
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

export default function AdminAgingReport() {
  const [shops, setShops] = useState<AgingShop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
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
        'Balance': s.balance,
        'Age (Days)': s.ageDays,
        'Bucket': s.bucket,
        'Last Credit': s.lastCreditDate ? new Date(s.lastCreditDate).toLocaleDateString('en-PK') : 'N/A',
        'Last Recovery': s.lastRecoveryDate ? new Date(s.lastRecoveryDate).toLocaleDateString('en-PK') : 'N/A',
      })),
        `aging-report-${new Date().toISOString().split('T')[0]}`,
        'Aging Report',
        [20, 15, 20, 15, 10, 10, 18, 18],
      );
      toast({ title: 'Export Complete', description: 'Aging Report exported to Excel' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOB, setSelectedOB] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedOB !== 'all') params.set('orderbookerId', selectedOB);
      if (selectedCompany !== 'all') params.set('companyId', selectedCompany);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';
      const [agingRes, obRes, compRes] = await Promise.all([
        apiFetch(`/api/reports/aging${qs}`),
        apiFetch('/api/orderbookers'),
        apiFetch('/api/companies'),
      ]);

      if (!agingRes.ok) {
        throw new Error('Failed to load aging report');
      }
      const data = await agingRes.json();
      setShops(Array.isArray(data) ? data : data.shops ?? []);

      if (obRes.ok) {
        const obs = await obRes.json();
        setOrderbookers(
          Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : []
        );
      }
      if (compRes.ok) {
        const compJson = await compRes.json();
        // /api/companies returns either an array (mobile path) or { companies: [...] } (admin path)
        const compList: any[] = Array.isArray(compJson)
          ? compJson
          : Array.isArray(compJson?.companies)
          ? compJson.companies
          : [];
        setCompanies(compList.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOB, selectedCompany, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sort: oldest buckets first, then by age descending within a bucket.
  const sortedShops = useMemo(() => {
    return [...shops].sort((a, b) => {
      const ba = bucketWeight[getBucket(a.ageDays)];
      const bb = bucketWeight[getBucket(b.ageDays)];
      if (ba !== bb) return ba - bb;
      return b.ageDays - a.ageDays;
    });
  }, [shops]);

  // Summary KPIs — total balance + shop count per bucket.
  const summary = useMemo(() => {
    const buckets: Record<Bucket, { balance: number; count: number }> = {
      '0-30': { balance: 0, count: 0 },
      '31-60': { balance: 0, count: 0 },
      '61-90': { balance: 0, count: 0 },
      '90+': { balance: 0, count: 0 },
    };
    for (const s of shops) {
      const b = getBucket(s.ageDays);
      buckets[b].balance += s.balance;
      buckets[b].count += 1;
    }
    return buckets;
  }, [shops]);

  if (loading) return <AgingSkeleton />;

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

  const bucketOrder: Bucket[] = ['0-30', '31-60', '61-90', '90+'];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Aging Report
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Outstanding balances grouped by age buckets
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search shop..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-[160px] rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
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
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {bucketOrder.map((bucket) => {
          const style = bucketStyles[bucket];
          const data = summary[bucket];
          return (
            <Card key={bucket} className="card-hover border border-border hover-scale-102">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`h-10 w-10 rounded-xl ${style.card} flex items-center justify-center shadow-sm`}
                  >
                    <Clock className={`h-5 w-5 ${style.icon}`} />
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-medium">
                    {data.count} shops
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-medium mb-0.5">
                  {style.label}
                </p>
                <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
                  {formatPKR(data.balance)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            Outstanding Balances
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
                    Balance
                  </TableHead>
                  {(selectedCompany === 'all') && (
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">
                      Company Balances
                    </TableHead>
                  )}
                  {selectedCompany !== 'all' && (
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">
                      Company
                    </TableHead>
                  )}
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Age
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">
                    Bucket
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">
                    Last Credit
                  </TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">
                    Last Recovery
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedShops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <div className="text-center py-10">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">
                          No outstanding balances
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          All shops are clear or no data matches the current filter
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedShops.map((shop, idx) => {
                    const bucket = getBucket(shop.ageDays);
                    const style = bucketStyles[bucket];
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
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPKR(shop.balance)}
                          </span>
                        </TableCell>
                        {selectedCompany !== 'all' && (
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Building2 className="h-3 w-3" />
                              {(shop as any).companyName || '—'}
                            </Badge>
                          </TableCell>
                        )}
                        {selectedCompany === 'all' && (
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {((shop as any).companyBalances || []).map((cb: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-[9px] gap-0.5">
                                  <span className="text-muted-foreground">{cb.companyName}:</span>
                                  <span className="font-semibold text-foreground">{formatPKR(Number(cb.balance))}</span>
                                </Badge>
                              ))}
                              {(!((shop as any).companyBalances) || (shop as any).companyBalances.length === 0) && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="text-center">
                          <span className="text-sm font-medium tabular-nums inline-flex items-center gap-1">
                            <TrendingDown className="h-3 w-3 text-muted-foreground" />
                            {shop.ageDays}d
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={`text-[10px] border font-semibold ${style.badge}`}
                          >
                            {style.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center">
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(shop.lastCreditDate)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center">
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(shop.lastRecoveryDate)}
                          </span>
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
