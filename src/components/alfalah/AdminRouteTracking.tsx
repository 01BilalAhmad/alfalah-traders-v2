'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Route,
  MapPin,
  Clock,
  Navigation,
  Play,
  Square,
  Store,
  TrendingUp,
  Filter,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatPKR, getLocalDateString } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────
interface RouteData {
  id: string;
  orderbookerId: string;
  orderbookerName: string;
  companyId: string | null;
  routeDate: string;
  startLat: number | null;
  startLng: number | null;
  startTime: string;
  endLat: number | null;
  endLng: number | null;
  endTime: string | null;
  totalDistance: number | null;
  totalDuration: number | null;
  status: 'ongoing' | 'completed';
  stopsCount: number;
  waypointsCount: number;
  previewWaypoints?: { lat: number; lng: number; timestamp?: string }[];
}

interface Waypoint {
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: string;
}

interface RouteStopData {
  id: string;
  routeId: string;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  arrivalTime: string;
  departureTime: string | null;
  timeSpent: number | null;
  lat: number;
  lng: number;
  recoveryAmount: number | null;
}

interface RouteDetail extends RouteData {
  waypoints: Waypoint[];
  stops: RouteStopData[];
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

interface Company {
  id: string;
  name: string;
}

// ── Dynamic Map Import (no SSR) ───────────────────────────────────────────
const RouteMap = dynamic(() => import('./RouteMapInner'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-xl">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    </div>
  ),
});

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDistance(km: number | null): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function formatDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-PK', {
      timeZone: 'Asia/Karachi',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function RouteTrackingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-52 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-72" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-20 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-4">
          <Skeleton className="skeleton-shimmer h-96 w-full rounded-xl" />
        </CardContent>
      </Card>
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

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminRouteTracking() {
  // Data
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [filterDate, setFilterDate] = useState<string>(getLocalDateString());
  const [filterOB, setFilterOB] = useState<string>('');
  const [filterCompany, setFilterCompany] = useState<string>('');

  // Leaflet CSS injection
  const [leafletCssLoaded, setLeafletCssLoaded] = useState(false);

  // Inject Leaflet CSS
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    if (!document.querySelector('link[href*="leaflet"]')) {
      document.head.appendChild(link);
    }
    setLeafletCssLoaded(true);

    return () => {
      const existing = document.querySelector('link[href*="leaflet"]');
      if (existing) existing.remove();
    };
  }, []);

  // Fetch orderbookers and companies on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [obRes, compRes] = await Promise.all([
          apiFetch('/api/orderbookers'),
          apiFetch('/api/companies'),
        ]);
        if (obRes.ok) {
          const obs = await obRes.json();
          setOrderbookers(Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : []);
        }
        if (compRes.ok) {
          const comps = await compRes.json();
          setCompanies(Array.isArray(comps) ? comps : []);
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load initial data', variant: 'destructive' });
      }
    };
    fetchInitialData();
  }, []);

  // Fetch routes when filters change
  const fetchRoutes = useCallback(async () => {
    setRoutesLoading(true);
    setSelectedRoute(null);
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date', filterDate);
      if (filterOB) params.set('orderbookerId', filterOB);
      if (filterCompany) params.set('companyId', filterCompany);

      const res = await apiFetch(`/api/route-tracking/routes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRoutes(Array.isArray(data) ? data : data.routes || []);
      } else {
        setRoutes([]);
      }
    } catch {
      setRoutes([]);
      toast({ title: 'Error', description: 'Failed to load routes', variant: 'destructive' });
    } finally {
      setRoutesLoading(false);
      setLoading(false);
    }
  }, [filterDate, filterOB, filterCompany]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // Fetch route detail when a route is selected
  const fetchRouteDetail = useCallback(async (routeId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/route-tracking/routes/${routeId}`);
      if (res.ok) {
        const data = await res.json();
        // API now returns flattened structure: route properties + waypoints + stops at top level
        setSelectedRoute(data);
      } else {
        toast({ title: 'Error', description: 'Failed to load route details', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load route details', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRoutes = routes.length;
    const totalDistance = routes.reduce((sum, r) => sum + (r.totalDistance || 0), 0);
    const routesWithDuration = routes.filter((r) => r.totalDuration != null);
    const avgDuration = routesWithDuration.length > 0
      ? routesWithDuration.reduce((sum, r) => sum + (r.totalDuration || 0), 0) / routesWithDuration.length
      : 0;
    const totalStops = routes.reduce((sum, r) => sum + (r.stopsCount || 0), 0);
    return { totalRoutes, totalDistance, avgDuration, totalStops };
  }, [routes]);

  // Handle row click in route table
  const handleRouteClick = (route: RouteData) => {
    fetchRouteDetail(route.id);
  };

  // Refresh handler
  const handleRefresh = () => {
    fetchRoutes();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <RouteTrackingSkeleton />;

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Route Map
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track orderbooker routes with GPS waypoints and shop visits
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleRefresh} disabled={routesLoading}>
          <RefreshCw className={`h-3.5 w-3.5 ${routesLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Top Bar — Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Filters</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Date Picker */}
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="h-8 text-xs w-40"
                />
              </div>

              {/* Orderbooker Filter */}
              <Select value={filterOB} onValueChange={(v) => setFilterOB(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-44 h-8 text-xs">
                  <SelectValue placeholder="All OBs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Orderbookers</SelectItem>
                  {orderbookers.map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Company Filter */}
              <Select value={filterCompany} onValueChange={(v) => setFilterCompany(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-40 h-8 text-xs">
                  <SelectValue placeholder="All Companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Companies</SelectItem>
                  {companies.map((comp) => (
                    <SelectItem key={comp.id} value={comp.id}>{comp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in stagger-children">
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
              <Route className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Total Routes</p>
              <p className="text-lg font-bold text-foreground">{summaryStats.totalRoutes}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
              <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Total Distance</p>
              <p className="text-lg font-bold text-foreground">{formatDistance(summaryStats.totalDistance)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Avg Duration</p>
              <p className="text-lg font-bold text-foreground">{formatDuration(summaryStats.avgDuration)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Shops Visited</p>
              <p className="text-lg font-bold text-foreground">{summaryStats.totalStops}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gradient Divider */}
      <div className="divider-gradient" />

      {/* Map Section */}
      <Card className="card-elevated">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Route Map
            </CardTitle>
            {selectedRoute && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {selectedRoute.orderbookerName}
                </Badge>
                <Badge
                  className={`text-[10px] font-bold ${
                    selectedRoute.status === 'ongoing'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                  }`}
                >
                  {selectedRoute.status === 'ongoing' ? 'Ongoing' : 'Completed'}
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-[500px] rounded-xl overflow-hidden border border-border">
            {leafletCssLoaded ? (
              <RouteMap
                routeDetail={selectedRoute}
                loading={detailLoading}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted/30">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Route History Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Route History
              <Badge variant="secondary" className="text-[11px] ml-1">
                {routes.length} routes
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {routesLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : routes.length === 0 ? (
            <div className="text-center py-14">
              <div className="mx-auto mb-4 h-20 w-20">
                <div className="relative z-10 h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Route className="h-9 w-9 text-slate-400 animate-gentle-float" />
                </div>
              </div>
              <p className="font-semibold text-muted-foreground text-sm">No routes found</p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                No route tracking data available for the selected date and filters. Try changing the date or orderbooker filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Start</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">End</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Duration</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden md:table-cell">Distance</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">Stops</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((route, idx) => (
                    <TableRow
                      key={route.id}
                      className={`cursor-pointer transition-colors ${
                        selectedRoute?.id === route.id
                          ? 'bg-primary/10 hover:bg-primary/15'
                          : 'table-row-hover-effect'
                      } ${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}`}
                      onClick={() => handleRouteClick(route)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {route.orderbookerName?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm font-medium truncate max-w-[120px]">
                            {route.orderbookerName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatDateShort(route.routeDate)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Play className="h-3 w-3 text-emerald-500" />
                          <span className="text-xs font-medium">{formatTime(route.startTime)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {route.endTime ? (
                          <div className="flex items-center justify-center gap-1">
                            <Square className="h-3 w-3 text-red-500" />
                            <span className="text-xs font-medium">{formatTime(route.endTime)}</span>
                          </div>
                        ) : (
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold px-1.5 h-4">
                            Live
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <span className="text-xs font-semibold tabular-nums">{formatDuration(route.totalDuration)}</span>
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <span className="text-xs font-semibold tabular-nums">{formatDistance(route.totalDistance)}</span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <div className="flex items-center justify-center gap-1">
                          <Store className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-semibold">{route.stopsCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {route.status === 'ongoing' ? (
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold px-1.5 h-4">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-live-pulse mr-1" />
                            Ongoing
                          </Badge>
                        ) : (
                          <Badge className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-semibold px-1.5 h-4">
                            Completed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Detail Panel — Shows when a route is selected */}
      {selectedRoute && (
        <Card className="card-elevated animate-fade-in">
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                Route Details — {selectedRoute.orderbookerName}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setSelectedRoute(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {/* Route Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium">Waypoints</p>
                <p className="text-sm font-bold tabular-nums">{selectedRoute.waypoints?.length || 0}</p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium">Shop Stops</p>
                <p className="text-sm font-bold tabular-nums">{selectedRoute.stops?.length || 0}</p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium">Total Distance</p>
                <p className="text-sm font-bold tabular-nums">{formatDistance(selectedRoute.totalDistance)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground font-medium">Duration</p>
                <p className="text-sm font-bold tabular-nums">{formatDuration(selectedRoute.totalDuration)}</p>
              </div>
            </div>

            {/* Shop Stops List */}
            {selectedRoute.stops && selectedRoute.stops.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Shop Stops</h4>
                <ScrollArea className="max-h-64">
                  <div className="space-y-1.5">
                    {selectedRoute.stops.map((stop, idx) => (
                      <div
                        key={stop.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-6 w-6 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-xs font-bold text-orange-600 dark:text-orange-400 shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{stop.shopName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {stop.shopArea && `${stop.shopArea} • `}
                            Arrived {formatTime(stop.arrivalTime)}
                            {stop.timeSpent != null && ` • ${Math.round(stop.timeSpent)}m spent`}
                          </p>
                        </div>
                        {stop.recoveryAmount != null && stop.recoveryAmount > 0 && (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                            {formatPKR(stop.recoveryAmount)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
