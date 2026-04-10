'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  CalendarDays,
  Banknote,
  Users,
  MapPin,
  Navigation,
  ExternalLink,
  Download,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { exportToCSV } from '@/lib/csv-export';
import { toast } from '@/hooks/use-toast';

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface RecoveryEntry {
  id: string;
  amount: number;
  time: string;
  description: string | null;
  hasGps: boolean;
  gpsLat: number | null;
  gpsLng: number | null;
}

interface ShopRecovery {
  shopId: string;
  shopName: string;
  shopArea: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  recoveryEntries: RecoveryEntry[];
}

interface OrderbookerRecovery {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  shops: ShopRecovery[];
}

interface RecoverySummary {
  date: string;
  grandTotalRecovery: number;
  orderbookers: OrderbookerRecovery[];
}

function RecoverySkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="skeleton-shimmer h-7 w-48 mb-1" />
        <Skeleton className="skeleton-shimmer h-4 w-52" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="skeleton-shimmer h-11 w-11 rounded-xl" />
              <div>
                <Skeleton className="skeleton-shimmer h-3 w-28 mb-2" />
                <Skeleton className="skeleton-shimmer h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="skeleton-shimmer h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="skeleton-shimmer h-4 w-32 mb-1" />
                      <Skeleton className="skeleton-shimmer h-3 w-44" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="skeleton-shimmer h-4 w-20" />
                    <Skeleton className="skeleton-shimmer h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminRecoveryReport() {
  const { selectedDate, setSelectedDate } = useAppStore();
  const [summary, setSummary] = useState<RecoverySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedOB, setExpandedOB] = useState<Set<string>>(new Set());

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/recovery-summary?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load recovery data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const toggleExpand = (id: string) => {
    setExpandedOB((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (!summary) return;
    const allIds = summary.orderbookers.map((ob) => ob.orderbookerId);
    if (allIds.every((id) => expandedOB.has(id))) {
      setExpandedOB(new Set());
    } else {
      setExpandedOB(new Set(allIds));
    }
  };

  const anyExpanded = summary ? summary.orderbookers.some((ob) => expandedOB.has(ob.orderbookerId)) : false;

  const getTodayString = () => new Date().toISOString().split('T')[0];
  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  if (loading) {
    return <RecoverySkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recovery Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Daily recovery summary by orderbooker</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 w-44"
            />
          </div>
          <Button
            variant={selectedDate === getTodayString() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getTodayString())}
            className="text-xs"
          >
            Today
          </Button>
          <Button
            variant={selectedDate === getYesterdayString() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getYesterdayString())}
            className="text-xs"
          >
            Yesterday
          </Button>
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading} className="btn-ripple">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          {summary && summary.orderbookers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="btn-ripple"
              onClick={() => {
                const rows: Record<string, unknown>[] = [];
                summary.orderbookers.forEach((ob) => {
                  ob.shops.forEach((shop) => {
                    rows.push({
                      Orderbooker: ob.orderbookerName,
                      Shop: shop.shopName,
                      Area: shop.shopArea || '',
                      'Prev Balance': shop.previousBalance,
                      Credit: shop.todayCredit,
                      Recovery: shop.todayRecovery,
                      'Closing Balance': shop.closingBalance,
                      Visited: shop.visited ? 'Yes' : 'No',
                    });
                  });
                });
                exportToCSV(rows, `recovery-report-${summary.date}`, ['Orderbooker', 'Shop', 'Area', 'Prev Balance', 'Credit', 'Recovery', 'Closing Balance', 'Visited']);
                toast({ title: 'Exported', description: 'Recovery report CSV downloaded' });
              }}
            >
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
          <Card className="alfalah-card-hover animate-card-entrance">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Grand Total Recovery</p>
                <p className="text-xl font-bold text-green-600 animate-live-pulse">{formatCurrency(summary.grandTotalRecovery)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover animate-card-entrance">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active Orderbookers</p>
                <p className="text-xl font-bold text-foreground">{summary.orderbookers.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover animate-card-entrance">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Shops Visited</p>
                <p className="text-xl font-bold text-foreground">
                  {summary.orderbookers.reduce((s, ob) => s + ob.visitedShops, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orderbooker Accordion */}
      {summary && summary.orderbookers.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpandAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {anyExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Expand All
              </>
            )}
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          {!summary || summary.orderbookers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recovery data for this date</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary.orderbookers.map((ob) => {
                const isExpanded = expandedOB.has(ob.orderbookerId);
                const obTotalCredit = ob.shops.reduce((s, sh) => s + sh.todayCredit, 0);
                const obTotalRecovery = ob.totalRecovery;
                const obTotalOutstanding = obTotalCredit + obTotalRecovery;
                const recoveryRate = obTotalOutstanding > 0 ? (obTotalRecovery / obTotalOutstanding) * 100 : 0;
                const recoveryPct = Math.round(recoveryRate * 10) / 10;
                return (
                  <div key={ob.orderbookerId}>
                    {/* Orderbooker Header */}
                    <button
                      onClick={() => toggleExpand(ob.orderbookerId)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">{ob.orderbookerName.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{ob.orderbookerName}</p>
                            {recoveryPct >= 80 ? (
                              <Badge className="text-[10px] bg-green-100 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                80%+ {recoveryPct}%
                              </Badge>
                            ) : recoveryPct >= 50 ? (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                                <TrendingUp className="h-3 w-3 mr-0.5" />
                                {recoveryPct}%
                              </Badge>
                            ) : obTotalOutstanding > 0 ? (
                              <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                Low {recoveryPct}%
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {ob.visitedShops}/{ob.totalShops} shops visited
                            {ob.orderbookerPhone && ` \u2022 ${ob.orderbookerPhone}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-600">{formatCurrency(obTotalRecovery)}</p>
                          <p className="text-[10px] text-muted-foreground">Collected Today</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Progress Indicator */}
                    {isExpanded && (
                      <div className="px-5 pb-3">
                        {obTotalOutstanding > 0 ? (
                          <>
                            <div className="w-full h-1 rounded-full bg-muted overflow-hidden flex">
                              <div
                                className="h-full bg-green-500 transition-all duration-500"
                                style={{ width: `${(obTotalRecovery / obTotalOutstanding) * 100}%` }}
                              />
                              <div
                                className="h-full bg-amber-400 transition-all duration-500"
                                style={{ width: `${(obTotalCredit / obTotalOutstanding) * 100}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatCurrency(obTotalRecovery)} / {formatCurrency(obTotalOutstanding)} recovered
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">No credit activity today</p>
                        )}
                      </div>
                    )}

                    {/* Expanded Shop Details */}
                    {isExpanded && (
                      <div className="bg-muted/20 px-5 pb-4 animate-fade-in">
                        <ScrollArea className="max-h-72">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs font-semibold">Shop</TableHead>
                                <TableHead className="text-xs font-semibold hidden sm:table-cell">Area</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Prev. Balance</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Credit</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Recovery</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Closing</TableHead>
                                <TableHead className="text-xs font-semibold text-center hidden md:table-cell">GPS</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ob.shops.map((shop, idx) => (
                                <TableRow key={shop.shopId} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} transition-colors`}>
                                  <TableCell className="text-sm font-medium">
                                    <div className="flex items-center gap-1.5">
                                      {shop.shopName}
                                      {shop.visited && (
                                        <Badge className="text-[9px] badge-recovery">Visited</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                    {shop.shopArea || '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {formatCurrency(shop.previousBalance)}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-amber-600 font-medium">
                                    {shop.todayCredit > 0 ? `+${formatCurrency(shop.todayCredit)}` : '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-green-600 font-medium">
                                    {shop.todayRecovery > 0 ? `-${formatCurrency(shop.todayRecovery)}` : '\u2014'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {shop.closingBalance === 0 ? (
                                        <Badge className="text-[9px] bg-green-100 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                          <CheckCircle className="h-3 w-3 mr-0.5" />
                                          Settled
                                        </Badge>
                                      ) : (
                                        <span className={shop.closingBalance > shop.previousBalance + shop.todayCredit ? 'font-bold text-red-600' : 'font-bold'}>
                                          {formatCurrency(shop.closingBalance)}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center hidden md:table-cell">
                                    {shop.recoveryEntries.length > 0 ? (
                                      shop.recoveryEntries.every((e) => e.hasGps) ? (
                                        <a
                                          href={`https://www.openstreetmap.org/?mlat=${shop.recoveryEntries[0].gpsLat}&mlon=${shop.recoveryEntries[0].gpsLng}#map=17/${shop.recoveryEntries[0].gpsLat}/${shop.recoveryEntries[0].gpsLng}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 transition-colors"
                                          title="All recoveries GPS verified"
                                        >
                                          <Navigation className="h-3.5 w-3.5" />
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      ) : shop.recoveryEntries.some((e) => e.hasGps) ? (
                                        <span className="inline-flex items-center gap-1 text-amber-600" title="Partial GPS verification">
                                          <Navigation className="h-3.5 w-3.5" />
                                          <span className="text-[9px]">
                                            {shop.recoveryEntries.filter((e) => e.hasGps).length}/{shop.recoveryEntries.length}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center text-muted-foreground" title="No GPS captured">
                                          <Navigation className="h-3.5 w-3.5" />
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-muted-foreground">\u2014</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                        <p className="mt-2 text-[10px] text-muted-foreground text-right">
                          Closing = (Previous Balance + Today Credit) - Today Recovery
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Grand Total */}
              <div className="flex items-center justify-between px-5 py-3 bg-primary/5">
                <span className="font-bold text-sm">Grand Total</span>
                <span className="font-bold text-sm text-primary">{formatCurrency(summary.grandTotalRecovery)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
