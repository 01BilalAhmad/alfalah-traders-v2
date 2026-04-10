'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Home,
  Store,
  Users,
  TrendingUp,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Activity,
  BarChart3,
} from 'lucide-react';

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
}

interface TodayTxn {
  id: string;
  type: string;
  amount: number;
  createdAt: string;
  shop: { id: string; name: string; area: string };
  creator: { id: string; name: string; role: string };
}

interface DashboardData {
  orderbookers: Orderbooker[];
  todayTxns: TodayTxn[];
  todayCredit: number;
  todayRecovery: number;
  totalShops: number;
  totalOutstanding: number;
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>({
    orderbookers: [], todayTxns: [], todayCredit: 0, todayRecovery: 0, totalShops: 0, totalOutstanding: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [obRes, txnRes] = await Promise.all([
          fetch('/api/orderbookers'),
          fetch(`/api/transactions?date=${new Date().toISOString().split('T')[0]}&limit=10`),
        ]);
        const orderbookers = obRes.ok ? await obRes.json() : [];
        const txnData = txnRes.ok ? await txnRes.json() : { transactions: [] };
        const todayCredit = txnData.transactions.filter((t: TodayTxn) => t.type === 'credit').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const todayRecovery = txnData.transactions.filter((t: TodayTxn) => t.type === 'recovery').reduce((s: number, t: TodayTxn) => s + t.amount, 0);
        const totalOutstanding = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalOutstanding, 0);
        const totalShops = orderbookers.reduce((s: number, ob: Orderbooker) => s + ob.totalShops, 0);

        setData({ orderbookers, todayTxns: txnData.transactions, todayCredit, todayRecovery, totalShops, totalOutstanding });
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Home className="h-5 w-5 text-primary" />
          Dashboard
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Overview for {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="alfalah-card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <ArrowUpRight className="h-4 w-4 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Today&apos;s Credit</p>
            <p className="text-xl font-bold text-amber-600">{formatCurrency(data.todayCredit)}</p>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
                <ArrowDownRight className="h-4 w-4 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Today&apos;s Recovery</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(data.todayRecovery)}</p>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(data.totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Store className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">Total Active Shops</p>
            <p className="text-xl font-bold">{data.totalShops}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Orderbooker Overview */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Orderbooker Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <Table>
                <TableHeader>
                  <TableRow className="data-table-header hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Shops</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orderbookers.map((ob) => (
                    <TableRow key={ob.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-medium">{ob.name}</TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {ob.totalShops}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-red-600">{formatCurrency(ob.totalOutstanding)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.orderbookers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">No orderbookers</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <div className="divide-y divide-border">
                {data.todayTxns.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No activity today</div>
                ) : (
                  data.todayTxns.map((txn) => (
                    <div key={txn.id} className="px-5 py-3 flex items-start gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${txn.type === 'credit' ? 'bg-amber-50' : 'bg-green-50'}`}>
                        {txn.type === 'credit' ? (
                          <ArrowUpRight className="h-4 w-4 text-amber-600" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{txn.shop.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {txn.type === 'credit' ? 'Credit posted' : 'Recovery collected'} • {txn.creator.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${txn.type === 'credit' ? 'text-amber-600' : 'text-green-600'}`}>
                          {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(txn.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
