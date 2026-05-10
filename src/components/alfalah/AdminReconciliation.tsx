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

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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
      const res = await fetch(`/api/reports/reconciliation?date=${selectedDate}`);
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
      const res = await fetch(`/api/reports/month-summary?month=${currentMonth}`);
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
    const html = document.documentElement;
    const hadDark = html.classList.contains('dark');
    if (hadDark) { html.classList.remove('dark'); html.style.colorScheme = 'light'; }
    setTimeout(() => {
      window.print();
      if (hadDark) {
        const restore = () => { html.classList.add('dark'); html.style.colorScheme = 'dark'; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        setTimeout(() => { if (!html.classList.contains('dark')) { html.classList.add('dark'); html.style.colorScheme = 'dark'; } }, 1000);
      }
    }, 100);
  };

  const recoveryRate = monthSummary && monthSummary.totalCredit > 0
    ? Math.round((monthSummary.totalRecovery / monthSummary.totalCredit) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Month-to-Date Overview */}
      <div>
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
              <Card className="stat-card-amber alfalah-card-hover">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Total Credit</p>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{formatCurrency(monthSummary.totalCredit)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {monthSummary.creditCount} transactions
                        {monthSummary.topCreditDay && (
                          <span className="text-amber-600 dark:text-amber-400 ml-1">
                            &middot; Peak: {formatCurrency(monthSummary.topCreditDay.amount)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Month's Total Recovery */}
              <Card className="stat-card-green alfalah-card-hover">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                      <ArrowDownRight className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Total Recovery</p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatCurrency(monthSummary.totalRecovery)}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {monthSummary.recoveryCount} transactions
                        {monthSummary.topRecoveryDay && (
                          <span className="text-green-600 dark:text-green-400 ml-1">
                            &middot; Peak: {formatCurrency(monthSummary.topRecoveryDay.amount)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Month's Net Position */}
              <Card className={`alfalah-card-hover ${monthSummary.netPosition >= 0 ? 'stat-card-green' : 'stat-card-red'}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${monthSummary.netPosition >= 0 ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                      <BarChart3 className={`h-5 w-5 ${monthSummary.netPosition >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-medium">Month&apos;s Net Position</p>
                      <p className={`text-lg font-bold tabular-nums ${monthSummary.netPosition >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                        {monthSummary.netPosition >= 0 ? '+' : ''}{formatCurrency(monthSummary.netPosition)}
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
                    <span className={`text-sm font-bold tabular-nums ${recoveryRate >= 80 ? 'text-green-600 dark:text-green-400' : recoveryRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                      {recoveryRate}%
                    </span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        recoveryRate >= 80
                          ? 'bg-gradient-to-r from-green-400 to-green-500'
                          : recoveryRate >= 50
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500'
                            : 'bg-gradient-to-r from-red-400 to-red-500'
                      }`}
                      style={{ width: `${Math.min(recoveryRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      {formatCurrency(monthSummary.totalRecovery)} recovered of {formatCurrency(monthSummary.totalCredit)} credit
                    </span>
                    <span className={`text-[10px] font-semibold ${recoveryRate >= 80 ? 'text-green-600' : recoveryRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
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
      <div className="divider-gradient my-2" />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="pl-9 w-44 input-enhanced" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading} className="btn-ripple">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="no-print btn-ripple">
            <Printer className="h-4 w-4" />
          </Button>
          {report && report.orderbookers.length > 0 && (
            <Button
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
              className="no-print btn-ripple"
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
          {/* Total Credit — amber themed with mini bar */}
          <Card className="stat-card-amber alfalah-card-hover animate-card-entrance" style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Total Credit</p>
                  <p className="text-lg font-bold text-amber-700 dark:text-amber-400 number-display">{formatCurrency(report.totalCredit)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Proportion</span>
                  <span className="text-[10px] font-semibold text-amber-600">{creditPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${creditPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Recovery — green themed with mini bar */}
          <Card className="stat-card-green alfalah-card-hover animate-card-entrance" style={{ animationDelay: '50ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
                  <ArrowDownRight className="h-5 w-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Total Recovery</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400 number-display">{formatCurrency(report.totalRecovery)}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">Proportion</span>
                  <span className="text-[10px] font-semibold text-green-600">{recoveryPct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full bg-green-100 dark:bg-green-900/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${recoveryPct}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Net Position — red/green based on sign */}
          <Card className={`alfalah-card-hover animate-card-entrance ${report.netChange >= 0 ? 'stat-card-green' : 'stat-card-red'}`} style={{ animationDelay: '100ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${report.netChange >= 0 ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                  <TrendingUp className={`h-5 w-5 ${report.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Net Position</p>
                  <p className={`text-xl font-extrabold tabular-nums number-display ${report.netChange >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {report.netChange >= 0 ? '+' : ''}{formatCurrency(report.netChange)}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <Badge className={`text-[10px] font-bold ${report.netChange >= 0
                  ? 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                  : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'}`}>
                  {report.netChange >= 0 ? '↑ Recovery Surplus' : '↓ Credit Excess'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card className="stat-card-blue alfalah-card-hover animate-card-entrance" style={{ animationDelay: '150ms' }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">Transactions</p>
                  <p className="text-lg font-bold text-foreground">{report.totalTransactions}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-muted-foreground">OBs Active</span>
                  <span className="text-[10px] font-semibold text-blue-600">{report.orderbookers.length}</span>
                </div>
                <div className="h-1.5 w-full bg-blue-100 dark:bg-blue-900/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500"
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
              {report.orderbookers.map((ob) => {
                const isExpanded = expandedOB.has(ob.orderbookerId);
                const obTotal = ob.credit + ob.recovery;
                const creditProportion = obTotal > 0 ? (ob.credit / obTotal) * 100 : 0;
                const recoveryProportion = obTotal > 0 ? (ob.recovery / obTotal) * 100 : 0;
                const recoveryRate = ob.credit > 0 ? Math.round((ob.recovery / ob.credit) * 100) : (ob.recovery > 0 ? 100 : 0);
                const recoveryColorClass = recoveryRate >= 80
                  ? 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800'
                  : recoveryRate >= 50
                    ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800'
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
                          <p className="font-semibold text-amber-600">{formatCurrency(ob.credit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Recovery</p>
                          <p className="font-semibold text-green-600">{formatCurrency(ob.recovery)}</p>
                        </div>
                        <Badge className={`${recoveryColorClass} text-[10px] font-bold border`}>{recoveryRate}%</Badge>
                      </div>
                    </div>
                    {/* Stacked bar + recovery rate for each OB */}
                    <div className="px-5 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted flex">
                          <div
                            className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                            style={{ width: `${creditProportion}%` }}
                            title={`Credit: ${creditProportion.toFixed(0)}%`}
                          />
                          <div
                            className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                            style={{ width: `${recoveryProportion}%` }}
                            title={`Recovery: ${recoveryProportion.toFixed(0)}%`}
                          />
                        </div>
                      </div>
                      {obTotal > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Credit {creditProportion.toFixed(0)}%
                            <span className="inline-block w-2 h-2 rounded-full bg-green-400 ml-3 mr-1" />Recovery {recoveryProportion.toFixed(0)}%
                          </span>
                          <span className={`text-[10px] font-semibold ${recoveryRate >= 80 ? 'text-green-600' : recoveryRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
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
                                <TableCell className="text-right text-sm text-amber-600 hidden sm:table-cell">
                                  {shop.credit > 0 ? `+${formatCurrency(shop.credit)}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-sm text-green-600 hidden sm:table-cell">
                                  {shop.recovery > 0 ? `-${formatCurrency(shop.recovery)}` : '—'}
                                </TableCell>
                                <TableCell className="text-right text-sm font-semibold">{formatCurrency(shop.closingBalance)}</TableCell>
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
