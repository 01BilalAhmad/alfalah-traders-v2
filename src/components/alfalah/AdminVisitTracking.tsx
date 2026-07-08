'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MapPin,
  CheckCircle2,
  XCircle,
  Flame,
  Trophy,
  Users,
  Navigation,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Calendar,
  Clock,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { formatPKR } from '@/lib/utils';

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
}

interface VisitStreak {
  orderbookerId: string;
  currentStreak: number;
  longestStreak: number;
  lastVisitDate: string | null;
  totalVisitDays: number;
}

interface ShopVisit {
  id: string;
  shopId: string;
  orderbookerId: string;
  orderbookerName: string;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAddress: string | null;
  inRange: boolean;
  createdAt: string;
  shopName?: string;
  source?: 'gps' | 'transaction';
  sourceLabel?: string;
  amount?: number | null;
  transactionType?: string | null;
  transactionStatus?: string | null;
}

function VisitSkeleton() {
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

function StreakBadge({ streak }: { streak: number }) {
  if (streak >= 7) {
    return (
      <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800 font-semibold">
        <Flame className="h-3 w-3 mr-1" /> {streak} days — On Fire!
      </Badge>
    );
  }
  if (streak >= 3) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800 font-semibold">
        {streak} days — Good
      </Badge>
    );
  }
  if (streak >= 1) {
    return (
      <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800 font-semibold">
        {streak} day{streak > 1 ? 's' : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px]">Inactive</Badge>
  );
}

export default function AdminVisitTracking() {
  const { setSelectedShopId, setSelectedShopName } = useAppStore();
  const router = useRouter();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [streaks, setStreaks] = useState<Record<string, VisitStreak>>({});
  const [recentVisits, setRecentVisits] = useState<ShopVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOB, setSelectedOB] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [visitsLoading, setVisitsLoading] = useState(false);

  const fetchStreaks = useCallback(async () => {
    setLoading(true);
    try {
      const obRes = await apiFetch('/api/orderbookers');
      if (!obRes.ok) {
        toast({ title: 'Error', description: 'Failed to load orderbookers', variant: 'destructive' });
        setLoading(false);
        return;
      }
      const obs = await obRes.json();
      const activeOBs = Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : [];
      setOrderbookers(activeOBs);

      // Fetch streaks for each OB
      const streakPromises = activeOBs.map((ob: Orderbooker) =>
        apiFetch(`/api/users/${ob.id}/visit-streak`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
      const streakResults = await Promise.all(streakPromises);
      const streakMap: Record<string, VisitStreak> = {};
      streakResults.forEach((s, i) => {
        if (s) streakMap[activeOBs[i].id] = s;
      });
      setStreaks(streakMap);
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentVisits = useCallback(async () => {
    setVisitsLoading(true);
    try {
      // Use the global visits endpoint that combines ShopVisit + Transaction data
      const res = await apiFetch('/api/visits/recent?limit=200');
      if (!res.ok) {
        setVisitsLoading(false);
        return;
      }
      const visits = await res.json();
      setRecentVisits(Array.isArray(visits) ? visits : []);
    } catch {
      // silent
    } finally {
      setVisitsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStreaks();
    fetchRecentVisits();

    // Auto-refresh every 30 seconds so admin sees new visits in real-time
    const interval = setInterval(() => {
      fetchRecentVisits();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchRecentVisits]);

  // Filtered visits
  const filteredVisits = useMemo(() => {
    let result = recentVisits;
    if (selectedOB !== 'all') {
      result = result.filter(v => v.orderbookerId === selectedOB);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        v => v.shopName?.toLowerCase().includes(q) ||
             v.orderbookerName?.toLowerCase().includes(q) ||
             v.gpsAddress?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [recentVisits, selectedOB, searchQuery]);

  // Summary
  const summary = useMemo(() => {
    const streakValues = Object.values(streaks);
    const totalVisitDays = streakValues.reduce((s, v) => s + v.totalVisitDays, 0);
    const avgStreak = streakValues.length > 0
      ? Math.round(streakValues.reduce((s, v) => s + v.currentStreak, 0) / streakValues.length)
      : 0;
    const bestStreak = Math.max(0, ...streakValues.map(v => v.currentStreak));

    // Active today: count OBs who have visits in recentVisits (today's data)
    const obsWithVisitToday = new Set(recentVisits.map(v => v.orderbookerId));
    // Also check streak data
    const obsWithStreakToday = streakValues.filter(v => {
      if (!v.lastVisitDate) return false;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      return v.lastVisitDate.startsWith(today);
    }).map(v => v.orderbookerId);
    obsWithStreakToday.forEach(id => obsWithVisitToday.add(id));

    const activeToday = obsWithVisitToday.size;

    // Shops visited today count
    const shopsVisitedToday = new Set(recentVisits.map(v => v.shopId)).size;

    return { totalVisitDays, avgStreak, bestStreak, activeToday, totalOBs: orderbookers.length, shopsVisitedToday };
  }, [streaks, orderbookers, recentVisits]);

  const handleShopClick = (shopId: string, shopName: string) => {
    setSelectedShopId(shopId);
    setSelectedShopName(shopName);
    router.push(`/shops/${shopId}`);
  };

  if (loading) return <VisitSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Visit Tracking
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Today's shop visits by orderbookers (from recovery, credit & GPS check-ins)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => { fetchStreaks(); fetchRecentVisits(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 stagger-children">
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                <Flame className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Best</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Best Active Streak</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.bestStreak}d</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Average</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg Active Streak</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.avgStreak}d</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shadow-sm">
                <Calendar className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">All Time</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Visit Days</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.totalVisitDays}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shadow-sm">
                <MapPin className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Today</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Shops Visited Today</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.shopsVisitedToday}
            </p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Today</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">OBs Active Today</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.activeToday}/{summary.totalOBs}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* OB Streaks Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            Orderbooker Visit Streaks
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-transparent">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Current Streak</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Longest Streak</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden md:table-cell">Total Visit Days</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">Last Visit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderbookers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="text-center py-10">
                        <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground text-sm">No orderbookers found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  orderbookers
                    .map(ob => ({ ob, streak: streaks[ob.id] }))
                    .sort((a, b) => (b.streak?.currentStreak || 0) - (a.streak?.currentStreak || 0))
                    .map(({ ob, streak }, idx) => (
                      <TableRow
                        key={ob.id}
                        className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                      >
                        <TableCell className="text-sm">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                            idx === 0 ? 'bg-amber-200 text-amber-700 dark:bg-amber-700 dark:text-amber-300'
                            : idx === 1 ? 'bg-amber-100 text-amber-600 dark:bg-amber-800 dark:text-amber-300'
                            : idx === 2 ? 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                            : 'bg-muted text-muted-foreground'
                          }`}>
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{ob.name}</p>
                            <p className="text-[11px] text-muted-foreground">{ob.phone || ob.username}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <StreakBadge streak={streak?.currentStreak || 0} />
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <div className="flex items-center justify-center gap-1.5">
                            <Trophy className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-semibold tabular-nums">{streak?.longestStreak || 0}d</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <span className="text-sm tabular-nums text-muted-foreground">{streak?.totalVisitDays || 0}</span>
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          {streak?.lastVisitDate ? (
                            <span className="text-xs text-muted-foreground">
                              {new Date(streak.lastVisitDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Never</span>
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

      {/* Recent Visits */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Recent Shop Visits
              <Badge variant="secondary" className="text-[11px] ml-1">
                {filteredVisits.length} records
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-3">
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
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search visits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visitsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Shop</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Source</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right hidden sm:table-cell">Amount</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden md:table-cell">GPS</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVisits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <div className="text-center py-10">
                          <MapPin className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="font-medium text-muted-foreground text-sm">No visits recorded today</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">Visits appear when orderbookers post recovery or check in at shops</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVisits.map((visit) => (
                      <TableRow
                        key={visit.id}
                        className="table-row-hover-effect cursor-pointer"
                        onClick={() => visit.shopName && handleShopClick(visit.shopId, visit.shopName)}
                      >
                        <TableCell>
                          <p className="text-sm font-medium hover:text-primary transition-colors">
                            {visit.shopName || 'Unknown Shop'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{visit.orderbookerName}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            {visit.source === 'gps' ? (
                              <Badge className="text-[10px] bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/50 dark:text-cyan-300 dark:border-cyan-800">
                                <MapPin className="h-3 w-3 mr-1" /> Check-in
                              </Badge>
                            ) : visit.transactionType === 'recovery' ? (
                              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800">
                                Recovery
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-800">
                                Credit
                              </Badge>
                            )}
                            {visit.transactionStatus && visit.transactionStatus !== 'approved' && (
                              <Badge className={`text-[9px] ${visit.transactionStatus === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800'}`}>
                                {visit.transactionStatus === 'pending' ? '⏳ Pending' : '✗ Rejected'}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          {visit.amount != null ? (
                            <span className={`text-sm font-semibold tabular-nums text-foreground`}>
                              {formatPKR(visit.amount)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {visit.inRange ? (
                            <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> In Range
                            </Badge>
                          ) : visit.gpsLat && visit.gpsLng ? (
                            <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800">
                              <XCircle className="h-3 w-3 mr-1" /> Out
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(visit.createdAt).toLocaleString('en-PK', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
