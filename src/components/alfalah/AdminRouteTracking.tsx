'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Separator } from '@/components/ui/separator';
import {
  Route,
  MapPin,
  Clock,
  Navigation,
  RefreshCw,
  Loader2,
  Users,
  Store,
  TrendingUp,
  CalendarDays,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Timer,
  Map as MapIcon,
  X,
  Filter,
  Settings,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR, getLocalDateString, formatLocalDate } from '@/lib/utils';

// Dynamically import the route map to avoid SSR issues with Leaflet
const RouteTrackingMap = dynamic(() => import('./RouteTrackingMap'), {
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

// ── Types ──────────────────────────────────────────────────────────────────
interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
}

interface Company {
  id: string;
  name: string;
}

interface RouteStop {
  id: string;
  sequenceNumber?: number;
  shopId: string;
  shop: {
    id: string;
    name: string;
    area: string | null;
    address?: string | null;
    phone?: string | null;
  };
  arrivalTime: string;
  departureTime: string | null;
  timeSpent: number | null;
  lat: number;
  lng: number;
  recoveryAmount: number | null;
}

interface RouteData {
  id: string;
  orderbookerId: string;
  orderbooker: { id: string; name: string; username: string; phone?: string | null };
  companyId: string | null;
  company: { id: string; name: string } | null;
  routeDate: string;
  startLat: number;
  startLng: number;
  startTime: string | null;
  endLat: number | null;
  endLng: number | null;
  endTime: string | null;
  totalDistance: number | null;
  status: 'ongoing' | 'completed';
  stopsCount: number;
  stops: RouteStop[];
  createdAt: string;
  updatedAt: string;
  pathCoordinates?: Array<{
    lat: number;
    lng: number;
    type: 'start' | 'stop' | 'end';
    stopIndex?: number;
    shopName?: string;
  }>;
  summary?: {
    totalStops: number;
    completedStops: number;
    totalTimeSpent: number;
    totalRecovery: number;
  };
}

interface SummaryData {
  totalRoutes: number;
  completedRoutes: number;
  ongoingRoutes: number;
  totalShopsVisited: number;
  totalDistance: number;
  avgTimePerShop: number;
  totalRecovery: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTimeMinutes(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatDistance(km: number | null): string {
  if (km === null || km === 0) return '—';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function formatTimeOfDay(isoStr: string | null): string {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function formatRouteDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString('en-PK', {
      timeZone: 'Asia/Karachi',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function RouteTrackingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="skeleton-shimmer h-7 w-52" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-20 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="skeleton-shimmer h-8 w-full" />
          <Skeleton className="skeleton-shimmer h-80 w-full rounded-xl" />
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardContent className="p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-shimmer h-12 w-full mb-2" />
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
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [routesLoading, setRoutesLoading] = useState(false);

  // Filters
  const [filterOB, setFilterOB] = useState<string>('__all__');
  const [filterCompany, setFilterCompany] = useState<string>('__all__');
  const [filterStatus, setFilterStatus] = useState<string>('__all__');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Selected route for map
  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Feature toggle
  const [routeTrackingEnabled, setRouteTrackingEnabled] = useState<boolean>(true);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Leaflet CSS injection
  const [leafletCssLoaded, setLeafletCssLoaded] = useState(false);

  // Inject Leaflet CSS (same pattern as AdminMapView)
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

  // Fetch orderbookers and companies for filter dropdowns
  const fetchFilters = useCallback(async () => {
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
      // silent
    }
  }, []);

  // Fetch route list
  const fetchRoutes = useCallback(async () => {
    setRoutesLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOB && filterOB !== '__all__') params.set('orderbookerId', filterOB);
      if (filterCompany && filterCompany !== '__all__') params.set('companyId', filterCompany);
      if (filterStatus && filterStatus !== '__all__') params.set('status', filterStatus);
      if (filterDateFrom) params.set('date', filterDateFrom);
      params.set('limit', '100');

      const res = await apiFetch(`/api/route-tracking/routes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
      } else {
        toast({ title: 'Error', description: 'Failed to load routes', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setRoutesLoading(false);
    }
  }, [filterOB, filterCompany, filterStatus, filterDateFrom]);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterOB && filterOB !== '__all__') params.set('orderbookerId', filterOB);
      if (filterDateFrom) params.set('from', filterDateFrom);
      if (filterDateTo) params.set('to', filterDateTo);

      const res = await apiFetch(`/api/route-tracking/summary?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
      }
    } catch {
      // silent
    }
  }, [filterOB, filterDateFrom, filterDateTo]);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const res = await apiFetch('/api/route-tracking/settings');
      if (res.ok) {
        const data = await res.json();
        setRouteTrackingEnabled(data.routeTrackingEnabled ?? true);
      }
    } catch {
      // silent
    }
  }, []);

  // Toggle route tracking
  const handleToggleRouteTracking = async (enabled: boolean) => {
    setSettingsLoading(true);
    try {
      const res = await apiFetch('/api/route-tracking/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeTrackingEnabled: enabled }),
      });
      if (res.ok) {
        setRouteTrackingEnabled(enabled);
        toast({
          title: enabled ? 'Route Tracking Enabled' : 'Route Tracking Disabled',
          description: enabled
            ? 'Orderbookers can now start tracking routes'
            : 'Route tracking has been paused',
        });
      } else {
        toast({ title: 'Error', description: 'Failed to update settings', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSettingsLoading(false);
    }
  };

  // Select route & load detail
  const handleSelectRoute = useCallback(async (route: RouteData) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/route-tracking/routes/${route.id}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedRoute(detail);
      } else {
        // Fallback to list data
        setSelectedRoute(route);
      }
    } catch {
      setSelectedRoute(route);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Clear selected route
  const handleClearSelection = () => {
    setSelectedRoute(null);
  };

  // Initial data load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchFilters(), fetchSettings()]);
      setLoading(false);
    };
    init();
  }, [fetchFilters, fetchSettings]);

  // Fetch routes + summary when filters change
  useEffect(() => {
    fetchRoutes();
    fetchSummary();
  }, [fetchRoutes, fetchSummary]);

  // Clear filters
  const clearFilters = () => {
    setFilterOB('__all__');
    setFilterCompany('__all__');
    setFilterStatus('__all__');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const hasActiveFilters = filterOB !== '__all__' || filterCompany !== '__all__' || filterStatus !== '__all__' || filterDateFrom || filterDateTo;

  if (loading) return <RouteTrackingSkeleton />;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Page Title & Feature Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Route Tracking
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor orderbooker routes, shop visits &amp; recovery progress
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => { fetchRoutes(); fetchSummary(); }} disabled={routesLoading} className="h-9 gap-1.5">
            {routesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/30">
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor="route-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer">
              Tracking
            </Label>
            <Switch
              id="route-toggle"
              checked={routeTrackingEnabled}
              onCheckedChange={handleToggleRouteTracking}
              disabled={settingsLoading}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 animate-fade-in stagger-children">
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shadow-sm">
                <Route className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                {summary?.completedRoutes || 0} done
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Routes</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{summary?.totalRoutes || 0}</p>
          </CardContent>
        </Card>

        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">
                {summary?.ongoingRoutes || 0} active
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Shops Visited</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{summary?.totalShopsVisited || 0}</p>
          </CardContent>
        </Card>

        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shadow-sm">
                <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Avg</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Avg Time/Shop</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatTimeMinutes(summary?.avgTimePerShop || 0)}</p>
          </CardContent>
        </Card>

        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center shadow-sm">
                <Navigation className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Total</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Distance</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatDistance(summary?.totalDistance || 0)}</p>
          </CardContent>
        </Card>

        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Collected</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Recovery</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{summary?.totalRecovery ? formatPKR(summary.totalRecovery) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gradient Divider */}
      <div className="divider-gradient" />

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Filters</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Date From */}
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-36 h-8 text-xs"
                  placeholder="From"
                />
              </div>
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-36 h-8 text-xs"
                placeholder="To"
              />

              {/* Orderbooker Filter */}
              <Select value={filterOB} onValueChange={setFilterOB}>
                <SelectTrigger className="w-full sm:w-40 h-8 text-xs">
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
              <Select value={filterCompany} onValueChange={setFilterCompany}>
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

              {/* Status Filter */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-32 h-8 text-xs">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Status</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>

          {/* Active filter summary */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">Showing</span>
              <Badge variant="secondary" className="text-[10px] font-bold">{routes.length} routes</Badge>
              {filterOB !== '__all__' && (
                <Badge variant="outline" className="text-[10px]">
                  OB: {orderbookers.find((o) => o.id === filterOB)?.name || 'Unknown'}
                </Badge>
              )}
              {filterCompany !== '__all__' && (
                <Badge variant="outline" className="text-[10px]">
                  Co: {companies.find((c) => c.id === filterCompany)?.name || 'Unknown'}
                </Badge>
              )}
              {filterStatus !== '__all__' && (
                <Badge variant="outline" className="text-[10px]">
                  Status: {filterStatus === 'ongoing' ? 'Ongoing' : 'Completed'}
                </Badge>
              )}
              {filterDateFrom && (
                <Badge variant="outline" className="text-[10px]">
                  From: {filterDateFrom}
                </Badge>
              )}
              {filterDateTo && (
                <Badge variant="outline" className="text-[10px]">
                  To: {filterDateTo}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map + Route Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map Section */}
        <Card className="card-elevated lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapIcon className="h-4 w-4 text-primary" />
                Route Map
              </CardTitle>
              {selectedRoute && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClearSelection}>
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[400px] lg:h-[480px] rounded-xl overflow-hidden border border-border">
              {leafletCssLoaded ? (
                <RouteTrackingMap
                  selectedRoute={selectedRoute}
                  routes={routes}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted/30">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {/* Map Legend */}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-emerald-500 border border-emerald-600" />
                <span>Start</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500 border border-red-600" />
                <span>End</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-blue-500 border border-blue-600" />
                <span>Shop Stop</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-0.5 bg-primary" />
                <span>Route Path</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Route Detail Panel */}
        <Card className="card-elevated lg:col-span-1">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-primary" />
              Route Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {detailLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : selectedRoute ? (
              <ScrollArea className="max-h-[440px]">
                <div className="space-y-3">
                  {/* Route Header Info */}
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">
                          {selectedRoute.orderbooker.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{selectedRoute.orderbooker.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {selectedRoute.orderbooker.phone || selectedRoute.orderbooker.username}
                        </p>
                      </div>
                      <Badge className={`text-[10px] font-bold ${
                        selectedRoute.status === 'ongoing'
                          ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                      }`}>
                        {selectedRoute.status === 'ongoing' ? 'Ongoing' : 'Completed'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Date:</span>
                        <p className="font-medium">{formatRouteDate(selectedRoute.routeDate)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Distance:</span>
                        <p className="font-medium">{formatDistance(selectedRoute.totalDistance)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Started:</span>
                        <p className="font-medium">{formatTimeOfDay(selectedRoute.startTime)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ended:</span>
                        <p className="font-medium">{formatTimeOfDay(selectedRoute.endTime)}</p>
                      </div>
                    </div>
                    {selectedRoute.company && (
                      <div className="mt-2 pt-2 border-t border-primary/10 text-xs">
                        <span className="text-muted-foreground">Company:</span>{' '}
                        <span className="font-medium">{selectedRoute.company.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Summary stats */}
                  {selectedRoute.summary && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-md bg-muted/30 text-center">
                        <p className="text-[10px] text-muted-foreground">Stops</p>
                        <p className="text-sm font-bold">
                          {selectedRoute.summary.completedStops}/{selectedRoute.summary.totalStops}
                        </p>
                      </div>
                      <div className="p-2 rounded-md bg-muted/30 text-center">
                        <p className="text-[10px] text-muted-foreground">Recovery</p>
                        <p className="text-sm font-bold">{formatPKR(selectedRoute.summary.totalRecovery)}</p>
                      </div>
                      <div className="p-2 rounded-md bg-muted/30 text-center">
                        <p className="text-[10px] text-muted-foreground">Time Spent</p>
                        <p className="text-sm font-bold">{formatTimeMinutes(selectedRoute.summary.totalTimeSpent)}</p>
                      </div>
                      <div className="p-2 rounded-md bg-muted/30 text-center">
                        <p className="text-[10px] text-muted-foreground">Avg/Shop</p>
                        <p className="text-sm font-bold">
                          {formatTimeMinutes(
                            selectedRoute.summary.totalStops > 0
                              ? Math.round(selectedRoute.summary.totalTimeSpent / selectedRoute.summary.totalStops)
                              : 0
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stop-by-stop timeline */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Stop Timeline
                    </p>
                    <div className="space-y-0">
                      {/* Start point */}
                      <div className="flex gap-3 pb-2">
                        <div className="flex flex-col items-center">
                          <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                            <Navigation className="h-2.5 w-2.5 text-white" />
                          </div>
                          <div className="w-0.5 flex-1 bg-emerald-200 dark:bg-emerald-800 mt-1" />
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Route Start</p>
                          <p className="text-[11px] text-muted-foreground">{formatTimeOfDay(selectedRoute.startTime)}</p>
                        </div>
                      </div>

                      {/* Shop stops */}
                      {(selectedRoute.stops || []).map((stop, idx) => (
                        <div key={stop.id} className="flex gap-3 pb-2">
                          <div className="flex flex-col items-center">
                            <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-white">{idx + 1}</span>
                            </div>
                            {idx < (selectedRoute.stops?.length || 0) - 1 && (
                              <div className="w-0.5 flex-1 bg-blue-200 dark:bg-blue-800 mt-1" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pb-2">
                            <p className="text-xs font-semibold truncate">{stop.shop.name}</p>
                            {stop.shop.area && (
                              <p className="text-[10px] text-muted-foreground">{stop.shop.area}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTimeOfDay(stop.arrivalTime)}
                              </span>
                              {stop.departureTime && (
                                <>
                                  <ArrowRight className="h-2.5 w-2.5" />
                                  <span>{formatTimeOfDay(stop.departureTime)}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              {stop.timeSpent !== null && stop.timeSpent > 0 && (
                                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-medium">
                                  {formatTimeMinutes(stop.timeSpent)}
                                </Badge>
                              )}
                              {stop.recoveryAmount !== null && stop.recoveryAmount > 0 && (
                                <Badge className="text-[9px] h-4 px-1.5 font-bold bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800">
                                  {formatPKR(stop.recoveryAmount)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* End point */}
                      {selectedRoute.endLat && selectedRoute.endLng && (
                        <div className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                              <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-red-700 dark:text-red-400">Route End</p>
                            <p className="text-[11px] text-muted-foreground">{formatTimeOfDay(selectedRoute.endTime)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-10">
                <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                  <Route className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <p className="font-semibold text-muted-foreground text-sm">No Route Selected</p>
                <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Click a route from the table below to view its details and map visualization
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Route List Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" />
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
                {hasActiveFilters
                  ? 'Try adjusting your filters to find routes.'
                  : 'Routes will appear here when orderbookers start tracking their visits.'}
              </p>
              {hasActiveFilters && (
                <button
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                  onClick={clearFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">#</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Shops</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Total Time</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center hidden md:table-cell">Distance</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right hidden lg:table-cell">Recovery</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center w-16">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((route, idx) => {
                    const isSelected = selectedRoute?.id === route.id;
                    const routeSummary = route.summary || {
                      totalStops: route.stopsCount,
                      completedStops: route.stops?.filter((s) => s.departureTime).length || route.stopsCount,
                      totalTimeSpent: route.stops?.reduce((s, st) => s + (st.timeSpent || 0), 0) || 0,
                      totalRecovery: route.stops?.reduce((s, st) => s + (st.recoveryAmount || 0), 0) || 0,
                    };

                    return (
                      <TableRow
                        key={route.id}
                        className={`table-row-hover-effect cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                        } ${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}`}
                        onClick={() => handleSelectRoute(route)}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold bg-muted text-muted-foreground">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-primary">
                                {route.orderbooker.name.charAt(0)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{route.orderbooker.name}</p>
                              {route.company && (
                                <p className="text-[10px] text-muted-foreground truncate">{route.company.name}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{formatRouteDate(route.routeDate)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatTimeOfDay(route.startTime)} — {formatTimeOfDay(route.endTime)}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {route.stopsCount || route.stops?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {formatTimeMinutes(routeSummary.totalTimeSpent)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {formatDistance(route.totalDistance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <span className="text-sm font-semibold tabular-nums">
                            {routeSummary.totalRecovery > 0 ? formatPKR(routeSummary.totalRecovery) : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-[10px] font-bold ${
                            route.status === 'ongoing'
                              ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                          }`}>
                            {route.status === 'ongoing' ? 'Ongoing' : 'Completed'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            className="h-7 w-7 rounded-md hover:bg-primary/10 flex items-center justify-center transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRoute(route);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
