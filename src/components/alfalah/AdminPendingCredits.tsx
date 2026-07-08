'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Clock,
  AlertTriangle,
  CreditCard,
  Store,
  AlertCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  FileDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { exportToCSV } from '@/lib/csv-export';
import { formatPKR } from '@/lib/utils';

interface PendingPreview {
  id: string;
  amount: number;
  shopName: string | null;
  shopArea: string | null;
  createdAt: string;
}

interface PendingSummary {
  count: number;
  total: number;
  preview: PendingPreview[];
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

interface OBPendingInfo {
  ob: Orderbooker;
  count: number;
  total: number;
}

function PendingSkeleton() {
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
        <CardContent className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-5 w-5" />
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPendingCredits() {
  const router = useRouter();
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [obPendingList, setOBPendingList] = useState<OBPendingInfo[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOB, setSelectedOB] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, obRes] = await Promise.all([
        apiFetch('/api/transactions/pending-summary'),
        apiFetch('/api/orderbookers'),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }

      if (obRes.ok) {
        const obs = await obRes.json();
        const activeOBs = Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : [];
        setOrderbookers(activeOBs);

        // Fetch pending summary per OB
        const obPromises = activeOBs.map((ob: Orderbooker) =>
          apiFetch(`/api/transactions/pending-summary?orderbookerId=${ob.id}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        );
        const obResults = await Promise.all(obPromises);
        const obList: OBPendingInfo[] = activeOBs.map((ob: Orderbooker, i: number) => ({
          ob,
          count: obResults[i]?.count || 0,
          total: obResults[i]?.total || 0,
        }));
        setOBPendingList(obList.sort((a, b) => b.total - a.total));
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load pending credits', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCSVExport = useCallback(() => {
    if (!summary || !summary.preview.length) return;
    setExporting(true);
    try {
      const headers = ['Shop', 'Area', 'Amount', 'Date'];
      const rows = summary.preview.map(t => ({
        Shop: t.shopName || 'Unknown',
        Area: t.shopArea || '',
        Amount: t.amount,
        Date: new Date(t.createdAt).toLocaleDateString('en-PK'),
      }));
      exportToCSV(rows, 'pending-credits', headers);
      toast({ title: 'Export Complete', description: `${summary.preview.length} pending credits exported` });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not export CSV', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [summary]);

  const handleViewTransactions = () => {
    router.push('/transactions');
  };

  if (loading) return <PendingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Pending Credits
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Unapproved credit transactions awaiting review
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleCSVExport} disabled={exporting || !summary?.count}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={handleViewTransactions}>
            View All Transactions
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-elevated card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Pending</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Pending</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary?.count || 0}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Unapproved</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Amount</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{formatPKR(summary?.total || 0)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Average</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg per Transaction</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary?.count ? formatPKR(summary.total / summary.count) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">OBs</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">OBs with Pending</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {obPendingList.filter(o => o.count > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* OB Pending Breakdown */}
      {obPendingList.filter(o => o.count > 0).length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Pending by Orderbooker
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {obPendingList.filter(o => o.count > 0).map(info => (
                <div
                  key={info.ob.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium truncate">{info.ob.name}</p>
                  <p className="text-lg font-bold text-foreground mt-1">{info.count}</p>
                  <p className="text-[11px] text-muted-foreground">{formatPKR(info.total)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Pending Transactions */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Recent Pending Transactions
            <Badge variant="secondary" className="text-[11px] ml-1">
              Latest {summary?.preview.length || 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-amber-800 dark:bg-amber-950 hover:bg-amber-800 dark:hover:bg-amber-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Shop</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Area</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Amount</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!summary?.preview || summary.preview.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="text-center py-10">
                        <CreditCard className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground text-sm">No pending credits</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">All credit transactions have been approved</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  summary.preview.map((txn, idx) => (
                    <TableRow
                      key={txn.id}
                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                    >
                      <TableCell className="text-sm">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs font-bold shrink-0">
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{txn.shopName || 'Unknown Shop'}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-muted-foreground">{txn.shopArea || '—'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {formatPKR(txn.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs text-muted-foreground">
                          {new Date(txn.createdAt).toLocaleString('en-PK', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
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
