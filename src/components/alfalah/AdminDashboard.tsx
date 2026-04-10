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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
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
  PieChart as PieChartIcon,
  TrendingDown,
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

interface Shop {
  id: string;
  name: string;
  area: string | null;
  routeDay: string;
  balance: number;
  status: string;
}

const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ROUTE_COLORS = ['#1E3A8A', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

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
  const { user, setCurrentView } = useAppStore();
  const [data, setData] = useState<DashboardData>({
    orderbookers: [], todayTxns: [], todayCredit: 0, todayRecovery: 0, totalShops: 0, totalOutstanding: 0,
  });
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [obRes, txnRes, shopsRes] = await Promise.all([
          fetch('/api/orderbookers'),
          fetch(`/api/transactions?date=${new Date().toISOString().split('T')[0]}&limit=10`),
          fetch('/api/shops'),
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

        const shops = shopsRes.ok ? await shopsRes.json() : [];
        setData({ orderbookers, todayTxns: txnData.transactions, todayCredit, todayRecovery, totalShops, totalOutstanding });
        setTrends(trendsData);
        setAllShops(shops);
      } catch { /* silent */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  // Compute route distribution data
  const routeData = ROUTE_DAYS.map((day, idx) => ({
    name: day.charAt(0).toUpperCase() + day.slice(1),
    value: allShops.filter(s => s.routeDay === day).length,
    fill: ROUTE_COLORS[idx],
  })).filter(d => d.value > 0);

  // Compute top 5 debtors
  const topDebtors = [...allShops]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const maxDebt = topDebtors.length > 0 ? topDebtors[0].balance : 1;

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="alfalah-gradient rounded-xl p-5 text-white relative overflow-hidden">
        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 mesh-gradient opacity-40" />
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/2 w-24 h-24 rounded-full bg-white/5 translate-y-1/2" />
        <div className="absolute top-1/2 left-1/3 w-16 h-16 rounded-full bg-blue-400/10 blur-sm" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Home className="h-5 w-5 text-blue-200" />
            <h2 className="text-lg font-bold">Welcome back, {user?.name?.split(' ')[0] || 'Admin'}</h2>
          </div>
          <p className="text-sm text-blue-200">
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}
            {data.totalShops} shops across {data.orderbookers.length} orderbookers
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="dot-pattern rounded-xl p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="kpi-card stat-card-amber hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shadow-sm">
                  <ArrowUpRight className="h-5 w-5 text-amber-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">Today</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Today&apos;s Credit</p>
              <p className="text-2xl font-bold text-amber-600 tabular-nums">{formatCurrency(data.todayCredit)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-green hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-100 to-green-50 flex items-center justify-center shadow-sm">
                  <ArrowDownRight className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">Today</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Today&apos;s Recovery</p>
              <p className="text-2xl font-bold text-green-600 tabular-nums">{formatCurrency(data.todayRecovery)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-red hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-100 to-red-50 flex items-center justify-center shadow-sm">
                  <Wallet className="h-5 w-5 text-red-600" />
                </div>
                <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full">Alert</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Outstanding</p>
              <p className="text-2xl font-bold text-red-600 tabular-nums">{formatCurrency(data.totalOutstanding)}</p>
            </CardContent>
          </Card>
          <Card className="kpi-card stat-card-blue hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shadow-sm">
                  <Store className="h-5 w-5 text-blue-600" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">All</span>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Active Shops</p>
              <p className="text-2xl font-bold tabular-nums">{data.totalShops}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift"
          onClick={() => setCurrentView('admin-credit')}
        >
          <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
            <CreditCard className="h-5 w-5 text-amber-600" />
          </div>
          <span className="text-xs font-medium">Post Credit</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift"
          onClick={() => setCurrentView('admin-recovery')}
        >
          <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <span className="text-xs font-medium">Recovery Report</span>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-4 px-4 flex flex-col items-center gap-2.5 hover:bg-primary/5 hover:border-primary/30 hover:shadow-sm transition-all group hover-lift"
          onClick={() => setCurrentView('admin-shops')}
        >
          <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
            <Plus className="h-5 w-5 text-blue-600" />
          </div>
          <span className="text-xs font-medium">Add Shop</span>
        </Button>
      </div>

      {/* Divider */}
      <hr className="divider-gradient" />

      {/* Daily Trends Chart */}
      <Card className="hover-scale-102">
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

      {/* Orderbooker Performance Chart */}
      <Card className="hover-scale-102">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Orderbooker Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {data.orderbookers.length > 0 ? (
            <div className="h-60 sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.orderbookers} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="outstandingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="shopsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
                    }
                    label={{ value: 'Rs.', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94A3B8' }, offset: 0 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    label={{ value: 'Shops', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#94A3B8' }, offset: 0 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'Total Outstanding') return [`Rs. ${value.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`, 'Total Outstanding'];
                      return [value, 'Total Shops'];
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="totalOutstanding"
                    name="Total Outstanding"
                    fill="url(#outstandingGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="totalShops"
                    name="Total Shops"
                    fill="url(#shopsGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 sm:h-[240px] flex items-center justify-center text-sm text-muted-foreground">
              No orderbooker data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Distribution Pie Chart */}
      <Card className="hover-scale-102">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-primary" />
            Route Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-5">
          {routeData.length > 0 ? (
            <div className="h-72 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={routeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                    label={({ name, value }: { name: string; value: number }) =>
                      value > 0 ? `${name} (${value})` : ''
                    }
                    labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }}
                  >
                    {routeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${value} shops`, 'Shops']}
                    labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 sm:h-80 flex items-center justify-center text-sm text-muted-foreground">
              No route data available
            </div>
          )}
          <div className="flex items-center justify-center gap-4 mt-1">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">{allShops.length} total shops</span>
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

        {/* Top Debtors */}
        <Card className="hover-scale-102">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Top 5 Debtors
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-80">
              <div className="px-5 py-2 space-y-3">
                {topDebtors.length > 0 && topDebtors.some(s => s.balance > 0) ? (
                  topDebtors.map((shop, idx) => {
                    const pct = maxDebt > 0 ? (shop.balance / maxDebt) * 100 : 0;
                    return (
                      <div key={shop.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${idx === 0 ? 'bg-red-100 text-red-600' : idx === 1 ? 'bg-orange-100 text-orange-600' : idx === 2 ? 'bg-amber-100 text-amber-600' : 'bg-muted text-muted-foreground'}`}>
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{shop.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{shop.area || '—'}</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-red-600 tabular-nums shrink-0 ml-2">{formatCurrency(shop.balance)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <TrendingDown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No outstanding balances</p>
                    <p className="text-xs mt-1">All shops are settled</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

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
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="font-medium">No activity today</p>
                  <p className="text-xs mt-1">Credit postings and recoveries will appear here</p>
                </div>
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
  );
}
