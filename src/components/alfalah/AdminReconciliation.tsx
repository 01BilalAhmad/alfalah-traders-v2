'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
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

export default function AdminReconciliation() {
  const { selectedDate, setSelectedDate } = useAppStore();
  const [report, setReport] = useState<ReconReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedOB, setExpandedOB] = useState<Set<string>>(new Set());

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

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const toggleExpand = (id: string) => {
    setExpandedOB((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Daily Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Credit vs Recovery breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="pl-9 w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchReport} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="no-print">
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="alfalah-card-hover">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <ArrowUpRight className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Credit</p>
                <p className="text-lg font-bold text-amber-600">{formatCurrency(report.totalCredit)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <ArrowDownRight className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Recovery</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(report.totalRecovery)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${report.netChange >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <TrendingUp className={`h-5 w-5 ${report.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Net Change</p>
                <p className={`text-lg font-bold ${report.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {report.netChange >= 0 ? '+' : ''}{formatCurrency(report.netChange)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <RefreshCw className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Transactions</p>
                <p className="text-lg font-bold text-foreground">{report.totalTransactions}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                return (
                  <div key={ob.orderbookerId}>
                    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => toggleExpand(ob.orderbookerId)}>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{ob.orderbookerName.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{ob.orderbookerName}</p>
                          <p className="text-[10px] text-muted-foreground">{ob.shops.length} shops</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-sm">
                        <div className="hidden sm:block text-right">
                          <p className="text-[10px] text-muted-foreground">Credit</p>
                          <p className="font-semibold text-amber-600">{formatCurrency(ob.credit)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Recovery</p>
                          <p className="font-semibold text-green-600">{formatCurrency(ob.recovery)}</p>
                        </div>
                      </div>
                    </div>
                    {isExpanded && ob.shops.length > 0 && (
                      <div className="bg-muted/20 px-5 pb-3">
                        <Table>
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
