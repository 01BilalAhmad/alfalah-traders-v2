'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Home,
  Store,
  Users,
  TrendingUp,
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Plus,
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

interface DailyTrend {
  date: string;
  label: string;
  credit: number;
  recovery: number;
  net: number;
}

interface DashboardData {
  orderbookers: Orderbooker[];
  todayTxns: TodayTxn[];
  todayCredit: number;
  todayRecovery: number;
  totalShops: number;
  totalOutstanding: number;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-40 mb-1" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-5 py-3 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-5 py-3 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { setCurrentView } = useAppStore();
  const [data, setData] = useState<DashboardData>({
    orderbookers: [], todayTxns: [], todayCredit: 0, todayRecovery: 0, totalShops: 0, totalOutstanding: 0,
  });
  const [trends, setTrends] = useState<DailyTrend[]>([]);
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

        // Fetch daily trends
        const trendsRes = await fetch('/api/reports/daily-trends');
        const trendsData = trendsRes.ok ? await trendsRes.json() : [];

        setData({ orderbookers, todayTxns: txnData.transactions, todayCredit, todayRecovery, totalShops, totalOutstanding });
        setTrends(trendsData);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
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
            <p className="text-xl font-bold text-amber-600 animate-live-pulse">{formatCurrency(data.todayCredit)}</p>
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
            <p className="text-xl font-bold text-green-600 animate-live-pulse">{formatCurrency(data.todayRecovery)}</p>
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
            <p className="text-xl font-bold text-red-600 animate-live-pulse">{formatCurrency(data.totalOutstanding)}</p>
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

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          className="h-auto py-3 px-4 flex flex-col items-center gap-2 hover:bg-primary/5 hover:border-primary/30 transition-all"
          onClick={() => setCurrentView('admin-credit')}
        >
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Post Credit</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 px-4 flex flex-col items-center gap-2 hover:bg-primary/5 hover:border-primary/30 transition-all"
          onClick={() => setCurrentView('admin-recovery')}
        >
          <TrendingUp className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Recovery Report</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 px-4 flex flex-col items-center gap-2 hover:bg-primary/5 hover:border-primary/30 transition-all"
          onClick={() => setCurrentView('admin-shops')}
        >
          <Plus className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Add Shop</span>
        </Button>
      </div>

      {/* Daily Trends Chart */}
      <Card className="alfalah-card-hover">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Daily Credit vs Recovery — Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {trends.length > 0 ? (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="recoveryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      `Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`,
                      name === 'credit' ? 'Credit' : 'Recovery',
                    ]}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="credit"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fill="url(#creditGradient)"
                    dot={{ r: 3, fill: '#F59E0B', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="recovery"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#recoveryGradient)"
                    dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 sm:h-64 flex items-center justify-center text-sm text-muted-foreground">
              No trend data available
            </div>
          )}
          <div className="flex items-center justify-center gap-6 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-xs text-muted-foreground">Credit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">Recovery</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  {data.orderbookers.map((ob, idx) => (
                    <TableRow key={ob.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}`}>
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
                    <div key={txn.id} className="px-5 py-3 flex items-start gap-3 hover:bg-muted/20 transition-colors">
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
                          {txn.type === 'credit' ? 'Credit posted' : 'Recovery collected'} &bull; {txn.creator.name}
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
