'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  FileText,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  Download,
  BarChart3,
} from 'lucide-react';
import { exportToCSV } from '@/lib/csv-export';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR } from '@/lib/utils';
import { handlePrint as sharedHandlePrint, PrintHeader } from '@/lib/print-utils';

interface ShopDetail {
  shopId: string;
  shopName: string;
  shopArea: string;
  previousBalance: number;
  credit: number;
  recovery: number;
  closingBalance: number;
}

interface OrderbookerRecon {
  orderbookerId: string;
  orderbookerName: string;
  credit: number;
  recovery: number;
  shops: ShopDetail[];
}

interface ReconReport {
  date: string;
  totalCredit: number;
  totalRecovery: number;
  netChange: number;
  totalTransactions: number;
  orderbookers: OrderbookerRecon[];
}

interface MonthSummary {
  month: string;
  totalCredit: number;
  totalRecovery: number;
  netPosition: number;
  transactionCount: number;
  creditCount: number;
  recoveryCount: number;
  topRecoveryDay: { date: string; amount: number } | null;
  topCreditDay: { date: string; amount: number } | null;
  activeDays: number;
}

function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function AdminReconciliation() {
  const { selectedDate, setSelectedDate } = useAppStore();
  const [report, setReport] = useState<ReconReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedOB, setExpandedOB] = useState<Set<string>>(new Set());

  // Month-to-date state
  const [monthSummary, setMonthSummary] = useState<MonthSummary | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/reconciliation?date=${selectedDate}`);
      if (res.ok) setReport(await res.json());
    } catch {
      toast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const fetchMonthSummary = useCallback(async () => {
    setMonthLoading(true);
    try {
      const res = await apiFetch(`/api/reports/month-summary?month=${currentMonth}`);
      if (res.ok) setMonthSummary(await res.json());
    } catch {
      // silent fail — month summary is non-critical
    } finally {
      setMonthLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => { fetchReport(); }, [fetchReport]);
  useEffect(() => { fetchMonthSummary(); }, [fetchMonthSummary]);

  const toggleExpand = (id: string) => {
    setExpandedOB((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    sharedHandlePrint({ delay: 300 });
  };

  const recoveryRate = monthSummary && monthSummary.totalCredit > 0
    ? Math.round((monthSummary.totalRecovery / monthSummary.totalCredit) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Month-to-Date Overview */}
      <div className="print-hidden">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-foreground">Month-to-Date Overview</h2>
          <Badge variant="secondary" className="text-[10px] font-medium">
            {getMonthLabel(currentMonth)}
          </Badge>
        </div>

        {monthLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : monthSummary ? (
          <div className="space-y-4">
            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Month's Total Credit */}
              <Card className="card-hover border border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Total Credit</p>
                      <p className="text-lg font-bold text-foreground">{formatPKR(monthSummary.totalCredit)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {monthSummary.creditCount} transactions
                        {monthSummary.topCreditDay && (
                          <span className="text-indigo-600 dark:text-indigo-400 ml-1">
                            &middot; Peak: {formatPKR(monthSummary.topCreditDay.amount)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Month's Total Recovery */}
              <Card className="card-hover border border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <ArrowDownRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Total Recovery</p>
                      <p className="text-lg font-bold text-foreground">{formatPKR(monthSummary.totalRecovery)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {monthSummary.recoveryCount} transactions
                        {monthSummary.topRecoveryDay && (
                          <span className="text-emerald-600 dark:text-emerald-400 ml-1">
                            &middot; Peak: {formatPKR(monthSummary.topRecoveryDay.amount)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Month's Net Position */}
              <Card className="card-hover border border-border">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/40">
                      <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Net Position</p>
                      <p className="text-lg font-bold tabular-nums text-foreground">
                        {monthSummary.netPosition >= 0 ? '+' : ''}{formatPKR(monthSummary.netPosition)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {monthSummary.transactionCount} total &middot; {monthSummary.activeDays} active days
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recovery Rate Progress Bar */}
            {monthSummary.totalCredit > 0 && (
              <Card className="overflow-hidden">
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
                      {formatPKR(monthSummary.totalRecovery)} recovered of {formatPKR(monthSummary.totalCredit)} credit
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {recoveryRate >= 80 ? '✓ On Track' : recoveryRate >= 50 ? '⚠ Needs Attention' : '✗ Behind Target'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Could not load month summary</p>
          </div>
        )}
      </div>

      {/* Thin gradient divider */}
      <div className="divider-gradient my-2 print-hidden" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Daily Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Credit vs Recovery breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="pl-9 w-44 " />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchReport} disabled={loading} className="">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handlePrint} className="no-print ">
            <Printer className="h-4 w-4" />
          </Button>
          {report && report.orderbookers.length > 0 && (
            <Button
            type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const rows: Record<string, unknown>[] = [];
                report.orderbookers.forEach((ob) => {
                  ob.shops.forEach((shop) => {
                    rows.push({
                      Orderbooker: ob.orderbookerName,
                      Shop: shop.shopName,
                      Area: shop.shopArea || '',
                      Credit: shop.credit,
                      Recovery: shop.recovery,
                      'Closing Balance': shop.closingBalance,
                    });
                  });
                });
                exportToCSV(rows, `reconciliation-${report.date}`, ['Orderbooker', 'Shop', 'Area', 'Credit', 'Recovery', 'Closing Balance']);
                toast({ title: 'Exported', description: 'Reconciliation CSV downloaded' });
              }}
              className="no-print "
            >
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      {report && (() => {
        const totalFlow = report.totalCredit + report.totalRecovery;
        const creditPct = totalFlow > 0 ? (report.totalCredit / totalFlow) * 100 : 0;
        const recoveryPct = totalFlow > 0 ? (report.totalRecovery / totalFlow) * 100 : 0;
        return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Credit with mini bar */}
          <Card className="card-hover border border-border" style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Total Credit</p>
                  <p className="text-lg font-bold text-foreground number-display">{formatPKR(report.totalCredit)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Proportion</span>
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">{creditPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                    style={{ width: `${creditPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Recovery — green themed with mini bar */}
          <Card className="card-hover border border-border" style={{ animationDelay: '50ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Total Recovery</p>
                  <p className="text-lg font-bold text-foreground number-display">{formatPKR(report.totalRecovery)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Proportion</span>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{recoveryPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${recoveryPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Position — red/green based on sign */}
          <Card className="card-hover border border-border" style={{ animationDelay: '100ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/40">
                  <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Net Position</p>
                  <p className="text-xl font-extrabold tabular-nums number-display text-foreground">
                    {report.netChange >= 0 ? '+' : ''}{formatPKR(report.netChange)}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <Badge className={`text-[10px] font-bold border ${report.netChange >= 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800'}`}>
                  {report.netChange >= 0 ? '↑ Recovery Surplus' : '↓ Credit Excess'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card className="card-hover border border-border" style={{ animationDelay: '150ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Transactions</p>
                  <p className="text-lg font-bold text-foreground">{report.totalTransactions}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">OBs Active</span>
                  <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">{report.orderbookers.length}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(report.orderbookers.length * 33, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        );
      })()}

      {/* Orderbooker Breakdown */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !report || report.orderbookers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transactions for this date</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* ─── PRINT-ONLY HEADER ─── */}
              <div className="print-only" style={{ padding: '12px 0', borderBottom: '2px solid #4F46E5', marginBottom: '12px' }}>
                <PrintHeader
                  title="Daily Reconciliation Report"
                  subtitle={`Date: ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                  date={`Credit: ${formatPKR(report.totalCredit)} | Recovery: ${formatPKR(report.totalRecovery)} | Net: ${report.netChange >= 0 ? '+' : ''}${formatPKR(report.netChange)}`}
                  stats={[
                    { label: 'Total Credit', value: formatPKR(report.totalCredit) },
                    { label: 'Total Recovery', value: formatPKR(report.totalRecovery) },
                    { label: 'Transactions', value: String(report.totalTransactions) },
                  ]}
                />
              </div>

              {report.orderbookers.map((ob) => {
                const isExpanded = expandedOB.has(ob.orderbookerId);
                const obTotal = ob.credit + ob.recovery;
                const creditProportion = obTotal > 0 ? (ob.credit / obTotal) * 100 : 0;
                const recoveryProportion = obTotal > 0 ? (ob.recovery / obTotal) * 100 : 0;
                const recoveryRate = ob.credit > 0 ? Math.round((ob.recovery / ob.credit) * 100) : (ob.recovery > 0 ? 100 : 0);
                const recoveryColorClass = recoveryRate >= 80
                  ? 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : recoveryRate >= 50
                    ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800';
                return (
                  <div key={ob.orderbookerId}>
                    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleExpand(ob.orderbookerId)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{ob.orderbookerName.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{ob.orderbookerName}</p>
                          <p className="text-[10px] text-muted-foreground">{ob.shops.length} shops</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-5 text-sm shrink-0">
                        <div className="hidden sm:block text-right">
                          <p className="text-[10px] text-muted-foreground">Credit</p>
                          <p className="font-semibold text-indigo-600 dark:text-indigo-400">{formatPKR(ob.credit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Recovery</p>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatPKR(ob.recovery)}</p>
                        </div>
                        <Badge className={`${recoveryColorClass} text-[10px] font-bold border`}>{recoveryRate}%</Badge>
                      </div>
                    </div>
                    {/* Stacked bar + recovery rate for each OB */}
                    <div className="px-5 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted flex">
                          <div
                            className="h-full bg-indigo-400 transition-all duration-500"
                            style={{ width: `${creditProportion}%` }}
                            title={`Credit: ${creditProportion.toFixed(0)}%`}
                          />
                          <div
                            className="h-full bg-emerald-400 transition-all duration-500"
                            style={{ width: `${recoveryProportion}%` }}
                            title={`Recovery: ${recoveryProportion.toFixed(0)}%`}
                          />
                        </div>
                      </div>
                      {obTotal > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />Credit {creditProportion.toFixed(0)}%
                            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 ml-3 mr-1" />Recovery {recoveryProportion.toFixed(0)}%
                          </span>
                          <span className={`text-[10px] font-semibold ${recoveryRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : recoveryRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600'}`}>
                            {recoveryRate >= 80 ? '✓' : recoveryRate >= 50 ? '⚠' : '✗'} {recoveryRate}% recovered
                          </span>
                        </div>
                      )}
                    </div>
                    {isExpanded && ob.shops.length > 0 && (
                      <div className="bg-muted/20 px-5 pb-3">
                        <div className="overflow-x-auto">
                        <Table className="min-w-[600px]">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="text-xs">Shop</TableHead>
                              <TableHead className="text-xs text-right hidden sm:table-cell">Credit</TableHead>
                              <TableHead className="text-xs text-right hidden sm:table-cell">Recovery</TableHead>
                              <TableHead className="text-xs text-right">Closing</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ob.shops.map((shop) => (
                              <TableRow key={shop.shopId}>
                                <TableCell className="text-sm">
                                  {shop.shopName}
                                  <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">({shop.shopArea})</span>
                                </TableCell>
                                <TableCell className="text-right text-sm text-indigo-600 dark:text-indigo-400 hidden sm:table-cell">
                                  {shop.credit > 0 ? `+${formatPKR(shop.credit)}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400 hidden sm:table-cell">
                                  {shop.recovery > 0 ? `-${formatPKR(shop.recovery)}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-sm font-semibold">{formatPKR(shop.closingBalance)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
