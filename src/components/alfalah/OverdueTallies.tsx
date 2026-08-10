'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Clock, Loader2, Store, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR, formatLocalDate } from '@/lib/utils';

interface StaleShop {
  shopId: string;
  shopName: string;
  area: string | null;
  ownerName: string | null;
  phone: string | null;
  balance: number;
  tallyFrequency: string;
  orderbookerId: string | null;
  orderbookerName: string | null;
  lastTallyDate: string | null;
  lastTallyStatus: string | null;
  lastTallyDifference: number | null;
  lastTallyTellerName: string | null;
  daysSinceTally: number | null;
  neverTallied: boolean;
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', none: 'None',
};

export default function OverdueTallies() {
  const [shops, setShops] = useState<StaleShop[]>([]);
  const [summary, setSummary] = useState({ total: 0, neverTallied: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tally/stale');
      if (res.ok) {
        const data = await res.json();
        setShops(data.shops || []);
        setSummary(data.summary || { total: 0, neverTallied: 0, overdue: 0 });
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: d.error || 'Failed to load', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" /> Overdue Tallies
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shops whose last tally is older than their configured frequency. Set frequency per shop on the Manage Shops page.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetch} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Overdue</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Never Tallied</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400">{summary.neverTallied}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overdue (was tallied)</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">{summary.overdue}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" /> Overdue Shops
            <Badge variant="secondary" className="ml-1">{shops.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : shops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-10 w-10 mb-2 opacity-40" />
              <p className="font-medium text-sm">All shops are tally-up-to-date</p>
              <p className="text-xs mt-1">No shops need immediate tally attention.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto sidebar-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[180px]">Shop</TableHead>
                    <TableHead className="min-w-[120px]">Area</TableHead>
                    <TableHead className="min-w-[120px]">Orderbooker</TableHead>
                    <TableHead className="text-right min-w-[120px]">Balance</TableHead>
                    <TableHead className="min-w-[100px]">Frequency</TableHead>
                    <TableHead className="min-w-[150px]">Last Tally</TableHead>
                    <TableHead className="text-right min-w-[100px]">Days Since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shops.map((s) => (
                    <TableRow key={s.shopId}>
                      <TableCell>
                        <p className="font-medium text-sm">{s.shopName}</p>
                        {s.phone && <p className="text-[10px] text-muted-foreground">{s.phone}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{s.area || '—'}</TableCell>
                      <TableCell className="text-xs">{s.orderbookerName || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPKR(s.balance)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{FREQ_LABELS[s.tallyFrequency] || s.tallyFrequency}</Badge>
                      </TableCell>
                      <TableCell>
                        {s.neverTallied ? (
                          <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300 dark:text-rose-300 dark:border-rose-700">
                            <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Never
                          </Badge>
                        ) : (
                          <div>
                            <p className="text-xs">{formatLocalDate(new Date(s.lastTallyDate!))}</p>
                            <p className="text-[10px] text-muted-foreground">by {s.lastTallyTellerName || '—'}</p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.neverTallied ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold text-sm">∞</span>
                        ) : (
                          <Badge className={`text-[10px] ${(s.daysSinceTally || 0) >= 60 ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800' : (s.daysSinceTally || 0) >= 30 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800' : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800'}`}>
                            {s.daysSinceTally} days
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
