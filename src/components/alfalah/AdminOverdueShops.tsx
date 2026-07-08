'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  Store,
  Clock,
  Phone,
  MapPin,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  User,
  CheckCircle2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { formatPKR } from '@/lib/utils';

interface OverdueShop {
  id: string;
  name: string;
  area: string;
  balance: number;
  phone: string | null;
  orderbookerId: string;
  orderbookerName: string;
  lastCreditDate: string | null;
  lastRecoveryDate: string | null;
  daysSinceCredit: number | null;
  daysSinceRecovery: number | null;
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

function OverdueSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-5 w-5" />
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) {
    return (
      <Badge className="text-[10px] bg-muted text-muted-foreground border-border font-semibold">
        —
      </Badge>
    );
  }

  if (days >= 30) {
    return (
      <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800 font-semibold">
        {days}d — Critical
      </Badge>
    );
  }
  if (days >= 21) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800 font-semibold">
        {days}d — Urgent
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800 font-semibold">
      {days}d — Overdue
    </Badge>
  );
}

export default function AdminOverdueShops() {
  const { setSelectedShopId, setSelectedShopName } = useAppStore();
  const router = useRouter();
  const [shops, setShops] = useState<OverdueShop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [minDays, setMinDays] = useState('14');
  const [selectedOB, setSelectedOB] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [overdueRes, obRes] = await Promise.all([
        apiFetch(`/api/shops/needing-recovery?minDays=${minDays}${selectedOB !== 'all' ? `&orderbookerId=${selectedOB}` : ''}`),
        apiFetch('/api/orderbookers'),
      ]);

      if (overdueRes.ok) {
        const data = await overdueRes.json();
        setShops(data.shops || []);
      } else {
        toast({ title: 'Error', description: 'Failed to load overdue shops', variant: 'destructive' });
      }

      if (obRes.ok) {
        const obs = await obRes.json();
        setOrderbookers(Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : []);
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [minDays, selectedOB]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter by search
  const filteredShops = useMemo(() => {
    if (!searchQuery.trim()) return shops;
    const q = searchQuery.toLowerCase();
    return shops.filter(
      s => s.name.toLowerCase().includes(q) ||
           s.area?.toLowerCase().includes(q) ||
           s.orderbookerName?.toLowerCase().includes(q) ||
           s.phone?.includes(q)
    );
  }, [shops, searchQuery]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalBalance = shops.reduce((s, sh) => s + sh.balance, 0);
    const criticalCount = shops.filter(s => s.daysSinceCredit !== null && s.daysSinceCredit >= 30).length;
    const urgentCount = shops.filter(s => s.daysSinceCredit !== null && s.daysSinceCredit >= 21 && s.daysSinceCredit < 30).length;
    const neverRecovered = shops.filter(s => s.daysSinceRecovery === null).length;
    return {
      totalOverdue: shops.length,
      totalBalance,
      criticalCount,
      urgentCount,
      neverRecovered,
    };
  }, [shops]);

  // OB-wise breakdown
  const obBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; balance: number }> = {};
    for (const s of shops) {
      if (!map[s.orderbookerId]) {
        map[s.orderbookerId] = { name: s.orderbookerName || 'Unknown', count: 0, balance: 0 };
      }
      map[s.orderbookerId].count++;
      map[s.orderbookerId].balance += s.balance;
    }
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [shops]);

  const handleShopClick = (shop: OverdueShop) => {
    setSelectedShopId(shop.id);
    setSelectedShopName(shop.name);
    router.push(`/shops/${shop.id}`);
  };

  if (loading) return <OverdueSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            Overdue Shops
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Shops with no recovery in {minDays}+ days — need immediate follow-up
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={minDays} onValueChange={setMinDays}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7+ days</SelectItem>
              <SelectItem value="14">14+ days</SelectItem>
              <SelectItem value="21">21+ days</SelectItem>
              <SelectItem value="30">30+ days</SelectItem>
              <SelectItem value="60">60+ days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedOB} onValueChange={setSelectedOB}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="All OBs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {orderbookers.map(ob => (
                <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">{minDays}+ Days</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Overdue Shops</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.totalOverdue}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">At Risk</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Outstanding Balance</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{formatPKR(summary.totalBalance)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Critical</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">30+ Days Overdue</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shadow-sm">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Never</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Never Recovered</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.neverRecovered}</p>
          </CardContent>
        </Card>
      </div>

      {/* OB Breakdown */}
      {obBreakdown.length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Overdue by Orderbooker
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {obBreakdown.map(ob => (
                <button
                  key={ob.id}
                  onClick={() => setSelectedOB(ob.id)}
                  className={`rounded-lg border p-3 text-left transition-all hover:shadow-md ${
                    selectedOB === ob.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{ob.name}</p>
                  <p className="text-lg font-bold text-foreground mt-1">{ob.count}</p>
                  <p className="text-[11px] text-muted-foreground">{formatPKR(ob.balance)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Shops Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Overdue Shops List
              <Badge variant="secondary" className="text-[11px] ml-1">
                {filteredShops.length} shops
              </Badge>
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shops..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-rose-800 dark:bg-rose-950 hover:bg-rose-800 dark:hover:bg-rose-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Area</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Last Credit</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Days Overdue</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Orderbooker</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="text-center py-10">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">No overdue shops found</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {shops.length === 0
                            ? 'All shops have recent recovery activity'
                            : 'Try adjusting the search or filters'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShops.map((shop, idx) => (
                    <TableRow
                      key={shop.id}
                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect cursor-pointer`}
                      onClick={() => handleShopClick(shop)}
                    >
                      <TableCell className="text-sm">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium hover:text-primary transition-colors">{shop.name}</p>
                          <p className="text-[11px] text-muted-foreground sm:hidden">{shop.area}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{shop.area || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {formatPKR(shop.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {shop.lastCreditDate ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(shop.lastCreditDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <DaysBadge days={shop.daysSinceCredit} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{shop.orderbookerName}</span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {shop.phone ? (
                          <a
                            href={`tel:${shop.phone}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3" />
                            {shop.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


