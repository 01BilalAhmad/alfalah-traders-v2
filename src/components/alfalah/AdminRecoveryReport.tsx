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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 w-44"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="alfalah-card-hover">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Grand Total Recovery</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(summary.grandTotalRecovery)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover">
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
          <Card className="alfalah-card-hover">
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
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !summary || summary.orderbookers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No recovery data for this date</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {summary.orderbookers.map((ob) => {
                const isExpanded = expandedOB.has(ob.orderbookerId);
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
                          <p className="font-semibold text-sm">{ob.orderbookerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {ob.visitedShops}/{ob.totalShops} shops visited
                            {ob.orderbookerPhone && ` • ${ob.orderbookerPhone}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-bold text-green-600">{formatCurrency(ob.totalRecovery)}</p>
                          <p className="text-[10px] text-muted-foreground">Collected Today</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Shop Details */}
                    {isExpanded && (
                      <div className="bg-muted/20 px-5 pb-4">
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
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ob.shops.map((shop) => (
                                <TableRow key={shop.shopId}>
                                  <TableCell className="text-sm font-medium">
                                    {shop.shopName}
                                    {shop.visited && (
                                      <Badge className="ml-2 text-[9px] badge-recovery">Visited</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                    {shop.shopArea || '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {formatCurrency(shop.previousBalance)}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-amber-600 font-medium">
                                    {shop.todayCredit > 0 ? `+${formatCurrency(shop.todayCredit)}` : '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-green-600 font-medium">
                                    {shop.todayRecovery > 0 ? `-${formatCurrency(shop.todayRecovery)}` : '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-bold">
                                    {formatCurrency(shop.closingBalance)}
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
