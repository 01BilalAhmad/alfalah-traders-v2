'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart3, Loader2, Store, Users, User, AlertTriangle, TrendingUp, MapPin, RefreshCw, Repeat, Wallet,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR, formatLocalDate } from '@/lib/utils';
import { REASON_CODE_LABELS } from '@/lib/tally-constants';

interface AnalyticsData {
  period: { days: number; since: string };
  topShops: { shopId: string; shopName: string; area: string | null; discrepancyCount: number; totalDifference: number; avgDifference: number }[];
  orderbookerRates: { orderbookerId: string; orderbookerName: string; totalTallies: number; discrepancies: number; discrepancyRate: number; totalDifference: number }[];
  tellerRates: { tellerId: string; tellerName: string; totalTallies: number; discrepancies: number; discrepancyRate: number; totalDifference: number }[];
  reasonBreakdown: { reasonCode: string; count: number; totalAbsDifference: number }[];
  trend: { day: string; total: number; discrepancies: number; verified: number; netDifference: number }[];
  gpsStats: { locationStatus: string; count: number }[];
  repeatShops: { shopId: string; shopName: string; area: string | null; discrepancyCount: number; lastDiscrepancyDate: string }[];
}

export default function DiscrepancyAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/tally/analytics?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: d.error || 'Failed to load analytics', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Discrepancy Analytics
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Identify patterns — which shops, OBs, tellers, and reasons drive the most discrepancies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetch} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? null : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Tallies</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {(data.trend || []).reduce((s, t) => s + t.total, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Discrepancies</p>
                <p className="text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
                  {(data.trend || []).reduce((s, t) => s + t.discrepancies, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">GPS Verified</p>
                <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
                  {data.gpsStats.filter(g => g.locationStatus === 'verified').reduce((s, g) => s + g.count, 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Repeat Discrepancy Shops</p>
                <p className="text-2xl font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400">{data.repeatShops.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Shops */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Top Shops by Discrepancy Count
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.topShops.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">No discrepancies in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shop</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Discrepancies</TableHead>
                      <TableHead className="text-right">Total Diff</TableHead>
                      <TableHead className="text-right">Avg Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topShops.map((s) => (
                      <TableRow key={s.shopId}>
                        <TableCell className="font-medium text-sm">{s.shopName}</TableCell>
                        <TableCell className="text-xs">{s.area || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.discrepancyCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{formatPKR(s.totalDifference)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPKR(s.avgDifference)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* ─── Discrepancy Amount by Orderbooker (prominent) ─── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Discrepancy Amount by Orderbooker
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Positive amount = system shows <strong>more</strong> than shopkeeper claims (OB likely missed recording recovery).
                Negative = system shows <strong>less</strong> (OB likely missed recording credit, or over-recovered).
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {data.orderbookerRates.filter(o => o.totalDifference !== 0).length === 0 ? (
                <p className="text-center py-6 text-sm text-muted-foreground">No discrepancies in this period — all balances match.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orderbooker</TableHead>
                      <TableHead className="text-right">Discrepancies</TableHead>
                      <TableHead className="text-right">Net Difference</TableHead>
                      <TableHead className="text-right">Action Needed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.orderbookerRates]
                      .filter(o => o.totalDifference !== 0)
                      .sort((a, b) => Math.abs(b.totalDifference) - Math.abs(a.totalDifference))
                      .map((o) => {
                        const positive = o.totalDifference > 0;
                        return (
                          <TableRow key={o.orderbookerId}>
                            <TableCell className="font-medium text-sm">{o.orderbookerName}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{o.discrepancies}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className={`font-bold text-sm ${positive ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {positive ? '+' : ''}{formatPKR(o.totalDifference)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge className={`text-[10px] ${positive ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800' : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'}`}>
                                {positive ? 'Recovery missing' : 'Credit missing'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* OB + Teller Rates side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Orderbooker Discrepancy Rates</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orderbooker</TableHead>
                      <TableHead className="text-right">Tallies</TableHead>
                      <TableHead className="text-right">Disc.</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orderbookerRates.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>
                    ) : data.orderbookerRates.map((o) => (
                      <TableRow key={o.orderbookerId}>
                        <TableCell className="font-medium text-sm">{o.orderbookerName}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{o.totalTallies}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{o.discrepancies}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-[10px] ${o.discrepancyRate >= 30 ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800' : o.discrepancyRate >= 15 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800' : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'}`}>
                            {o.discrepancyRate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" /> Teller Discrepancy Rates</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Teller</TableHead>
                      <TableHead className="text-right">Tallies</TableHead>
                      <TableHead className="text-right">Disc.</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.tellerRates.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>
                    ) : data.tellerRates.map((t) => (
                      <TableRow key={t.tellerId}>
                        <TableCell className="font-medium text-sm">{t.tellerName}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{t.totalTallies}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{t.discrepancies}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-[10px] ${t.discrepancyRate >= 30 ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800' : t.discrepancyRate >= 15 ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800' : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'}`}>
                            {t.discrepancyRate}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Reason breakdown + Repeat shops */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Reason Code Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Total |Diff|</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.reasonBreakdown.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>
                    ) : data.reasonBreakdown.map((r) => (
                      <TableRow key={r.reasonCode}>
                        <TableCell className="text-sm">
                          {(REASON_CODE_LABELS as any)[r.reasonCode] || r.reasonCode}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{r.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{formatPKR(r.totalAbsDifference)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-primary" /> Repeat Discrepancy Shops (3+)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.repeatShops.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">No repeat discrepancies in this period.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shop</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead>Last</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.repeatShops.slice(0, 20).map((s) => (
                        <TableRow key={s.shopId}>
                          <TableCell className="font-medium text-sm">
                            {s.shopName}
                            <span className="block text-[10px] text-muted-foreground">{s.area || 'No area'}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge className="text-[10px] bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-800">{s.discrepancyCount}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{formatLocalDate(new Date(s.lastDiscrepancyDate))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trend */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Daily Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {data.trend.length === 0 ? (
                <p className="text-center py-6 text-sm text-muted-foreground">No tallies in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Verified</TableHead>
                        <TableHead className="text-right">Discrepancies</TableHead>
                        <TableHead className="text-right">Net Diff</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...data.trend].reverse().map((t) => (
                        <TableRow key={t.day}>
                          <TableCell className="text-xs">{formatLocalDate(new Date(t.day))}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{t.total}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-emerald-600 dark:text-emerald-400">{t.verified}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-amber-600 dark:text-amber-400">{t.discrepancies}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">{formatPKR(t.netDifference)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
