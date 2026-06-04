'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Route,
  MapPin,
  Clock,
  Store,
  Navigation,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Users,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Dynamically import ShopMap to avoid SSR issues with Leaflet
const ShopMap = dynamic(() => import('./ShopMap'), {
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
  phone: string | null;
  status: string;
}

interface ShopLocation {
  shopId: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  balance: number;
  status: string;
  orderbookerName: string;
  routeDays: string[];
  lat: number;
  lng: number;
}

interface RouteLocation {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  recordedAt: string;
}

interface ShopVisit {
  id: string;
  shopId: string;
  shopName: string | null;
  enterLat: number | null;
  enterLng: number | null;
  enterTime: string;
  exitTime: string | null;
  timeSpent: number | null;
  distanceToShop: number | null;
  isAutoDetected: boolean;
}

interface LiveSession {
  id: string;
  orderbookerId: string;
  orderbookerName: string;
  startTime: string;
  startLat: number | null;
  startLng: number | null;
  startAddress: string | null;
  totalDistance: number;
  totalDuration: number;
  status: string;
  currentLocation: RouteLocation | null;
  locations: RouteLocation[];
  shopVisits: ShopVisit[];
}

interface HistorySession {
  id: string;
  orderbookerId: string;
  orderbookerName: string;
  startTime: string;
  endTime: string | null;
  startLat: number | null;
  startLng: number | null;
  startAddress: string | null;
  endLat: number | null;
  endLng: number | null;
  endAddress: string | null;
  totalDistance: number;
  totalDuration: number;
  status: string;
  autoEndReason: string | null;
  locations: RouteLocation[];
  shopVisits: ShopVisit[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatDistance(meters: number): string {
  if (!meters || meters <= 0) return '0m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)}m`;
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

function formatTimeSpent(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '--';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function getTodayString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

// ── Loading Skeleton ───────────────────────────────────────────────────────

function RouteTrackerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-12rem)]">
        <Skeleton className="flex-[7] h-full rounded-xl" />
        <div className="flex-[3] space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminRouteTracker() {
  // State
  const [selectedOB, setSelectedOB] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [shopLocations, setShopLocations] = useState<ShopLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [leafletCssLoaded, setLeafletCssLoaded] = useState(false);

  // Derived
  const isLiveMode = selectedDate === getTodayString();

  // Refs
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Leaflet CSS injection ─────────────────────────────────────────────
  useEffect(() => {
    if (document.querySelector('link[href*="leaflet"]')) {
      setLeafletCssLoaded(true);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    link.onload = () => setLeafletCssLoaded(true);

    return () => {
      const existing = document.querySelector('link[href*="leaflet"]');
      if (existing) existing.remove();
    };
  }, []);

  // ── Fetch orderbookers ────────────────────────────────────────────────
  useEffect(() => {
    const fetchOrderbookers = async () => {
      try {
        const res = await apiFetch('/api/orderbookers');
        if (res.ok) {
          const data = await res.json();
          setOrderbookers(Array.isArray(data) ? data : []);
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load orderbookers', variant: 'destructive' });
      }
    };
    fetchOrderbookers();
  }, []);

  // ── Fetch shop locations ──────────────────────────────────────────────
  useEffect(() => {
    const fetchShopLocations = async () => {
      try {
        const res = await apiFetch('/api/shops/locations');
        if (res.ok) {
          const data = await res.json();
          const locations = (Array.isArray(data) ? data : []).map((loc: any) => ({
            shopId: loc.shopId,
            name: loc.shopName || 'Unknown',
            ownerName: loc.ownerName ?? null,
            area: loc.area ?? null,
            balance: Number(loc.balance || 0),
            status: loc.status || 'active',
            orderbookerName: loc.orderbookerName || 'Unknown',
            routeDays: loc.routeDays || [],
            lat: Number(loc.lat),
            lng: Number(loc.lng),
          }));
          setShopLocations(locations);
        }
      } catch {
        // silent
      }
    };
    fetchShopLocations();
  }, []);

  // ── Fetch live sessions with polling ──────────────────────────────────
  const fetchLiveSessions = useCallback(async (showLoading = false) => {
    if (showLoading) setPolling(true);
    try {
      const res = await apiFetch('/api/route-sessions/live');
      if (res.ok) {
        const data = await res.json();
        setLiveSessions(data.sessions || []);
      }
    } catch {
      // silent for polling
    } finally {
      if (showLoading) setPolling(false);
      setLoading(false);
    }
  }, []);

  // ── Fetch history sessions ────────────────────────────────────────────
  const fetchHistorySessions = useCallback(async (obId: string, date: string) => {
    setLoading(true);
    try {
      let url = `/api/route-sessions/history?date=${date}`;
      if (obId && obId !== 'all') {
        url += `&orderbookerId=${obId}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistorySessions(data.sessions || []);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load route history', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Auto-polling for live mode ────────────────────────────────────────
  useEffect(() => {
    // Clear previous interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (isLiveMode) {
      fetchLiveSessions(true);
      pollIntervalRef.current = setInterval(() => {
        fetchLiveSessions(false);
      }, 5000);
    } else {
      fetchHistorySessions(selectedOB, selectedDate);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isLiveMode, selectedOB, selectedDate, fetchLiveSessions, fetchHistorySessions]);

  // ── Refetch when OB changes in history mode ───────────────────────────
  useEffect(() => {
    if (!isLiveMode) {
      fetchHistorySessions(selectedOB, selectedDate);
    }
  }, [selectedOB, selectedDate, isLiveMode, fetchHistorySessions]);

  // ── Computed: active orderbooker IDs ──────────────────────────────────
  const activeOBIds = useMemo(() => {
    return new Set(liveSessions.map((s) => s.orderbookerId));
  }, [liveSessions]);

  // ── Computed: current session data ────────────────────────────────────
  const currentSessions = useMemo(() => {
    if (isLiveMode) {
      if (selectedOB === 'all') return liveSessions;
      return liveSessions.filter((s) => s.orderbookerId === selectedOB);
    } else {
      if (selectedOB === 'all') return historySessions;
      return historySessions.filter((s) => s.orderbookerId === selectedOB);
    }
  }, [isLiveMode, selectedOB, liveSessions, historySessions]);

  // ── Computed: primary session for stats ───────────────────────────────
  const primarySession = useMemo(() => {
    if (currentSessions.length === 0) return null;
    if (selectedOB !== 'all') return currentSessions[0] || null;
    // When "all" is selected, combine stats
    return currentSessions[0] || null;
  }, [currentSessions, selectedOB]);

  // ── Computed: aggregate stats ─────────────────────────────────────────
  const aggregateStats = useMemo(() => {
    if (selectedOB !== 'all' && primarySession) {
      const visitedCount = primarySession.shopVisits.length;
      return {
        totalDistance: primarySession.totalDistance || 0,
        totalDuration: primarySession.totalDuration || 0,
        visitedShops: visitedCount,
        totalShops: shopLocations.filter(
          (s) => s.orderbookerName === (primarySession as any).orderbookerName
        ).length || visitedCount,
      };
    }

    // Aggregate all sessions
    let totalDistance = 0;
    let totalDuration = 0;
    let visitedShops = 0;
    const allOBNames = new Set<string>();

    currentSessions.forEach((s) => {
      totalDistance += s.totalDistance || 0;
      totalDuration += s.totalDuration || 0;
      visitedShops += s.shopVisits.length;
      allOBNames.add((s as any).orderbookerName);
    });

    return {
      totalDistance,
      totalDuration,
      visitedShops,
      totalShops: shopLocations.filter(
        (s) => allOBNames.has(s.orderbookerName)
      ).length || visitedShops,
    };
  }, [currentSessions, primarySession, selectedOB, shopLocations]);

  // ── Computed: shop markers for the map ────────────────────────────────
  const mapMarkers = useMemo(() => {
    if (selectedOB === 'all') {
      return shopLocations.map((s) => ({
        id: s.shopId,
        name: s.name,
        ownerName: s.ownerName,
        area: s.area,
        balance: s.balance,
        status: s.status,
        orderbookerName: s.orderbookerName,
        routeDays: s.routeDays,
        lat: s.lat,
        lng: s.lng,
      }));
    }
    // Filter to selected OB's shops
    const ob = orderbookers.find((o) => o.id === selectedOB);
    if (!ob) return [];
    return shopLocations
      .filter((s) => s.orderbookerName === ob.name)
      .map((s) => ({
        id: s.shopId,
        name: s.name,
        ownerName: s.ownerName,
        area: s.area,
        balance: s.balance,
        status: s.status,
        orderbookerName: s.orderbookerName,
        routeDays: s.routeDays,
        lat: s.lat,
        lng: s.lng,
      }));
  }, [shopLocations, selectedOB, orderbookers]);

  // ── Computed: live orderbookers for ShopMap ───────────────────────────
  const liveOrderbookers = useMemo(() => {
    return currentSessions.map((session) => ({
      orderbookerId: session.orderbookerId,
      orderbookerName: (session as any).orderbookerName,
      currentLocation: session.currentLocation
        ? { lat: session.currentLocation.lat, lng: session.currentLocation.lng }
        : null,
      locations: (session.locations || []).map((loc) => ({
        lat: loc.lat,
        lng: loc.lng,
        recordedAt: loc.recordedAt,
      })),
      startTime: session.startTime,
      shopVisits: (session.shopVisits || []).map((visit) => ({
        shopId: visit.shopId,
        shopName: visit.shopName,
        enterTime: visit.enterTime,
        exitTime: visit.exitTime,
        timeSpent: visit.timeSpent,
        enterLat: visit.enterLat,
        enterLng: visit.enterLng,
      })),
      totalDistance: session.totalDistance,
      totalDuration: session.totalDuration,
      startLat: (session as any).startLat,
      startLng: (session as any).startLng,
      status: (session as any).status,
    }));
  }, [currentSessions]);

  // ── Computed: visited shops list for sidebar ──────────────────────────
  const visitedShopsList = useMemo(() => {
    if (selectedOB !== 'all' && primarySession) {
      return primarySession.shopVisits || [];
    }
    // Show all from current sessions
    return currentSessions.flatMap((s) => s.shopVisits || []);
  }, [currentSessions, primarySession, selectedOB]);

  // ── Handle date change ────────────────────────────────────────────────
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value || getTodayString());
  };

  // ── Handle manual refresh ─────────────────────────────────────────────
  const handleRefresh = () => {
    if (isLiveMode) {
      fetchLiveSessions(true);
    } else {
      fetchHistorySessions(selectedOB, selectedDate);
    }
  };

  // ── Render: Loading state ─────────────────────────────────────────────
  if (loading && !primarySession && currentSessions.length === 0) {
    return <RouteTrackerSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Route &amp; Tracking
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live tracking of orderbooker routes and visits
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={polling}
          className="h-8 text-xs gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${polling ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main Layout: Map + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4" style={{ height: 'calc(100dvh - 12rem)' }}>
        {/* ─── Map Area (70%) ──────────────────────────────────────────── */}
        <div className="flex-[7] min-h-0 rounded-xl overflow-hidden border border-border">
          {leafletCssLoaded ? (
            <ShopMap
              markers={mapMarkers}
              liveOrderbookers={liveOrderbookers}
              showLiveTracking={currentSessions.length > 0}
              selectedOB={selectedOB}
              isHistoryMode={!isLiveMode}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* ─── Sidebar (30%) ───────────────────────────────────────────── */}
        <div className="flex-[3] min-w-0 flex flex-col gap-3 overflow-hidden">
          {/* Orderbooker Selector */}
          <Card className="card-elevated shrink-0">
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Orderbooker
                </label>
                <Select value={selectedOB} onValueChange={setSelectedOB}>
                  <SelectTrigger className="w-full h-9 text-sm">
                    <SelectValue placeholder="Select orderbooker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        All Orderbookers
                      </span>
                    </SelectItem>
                    {orderbookers
                      .filter((ob) => ob.status === 'active')
                      .map((ob) => (
                        <SelectItem key={ob.id} value={ob.id}>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${activeOBIds.has(ob.id) ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                            {ob.name}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Picker */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    max={getTodayString()}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>

              {/* Live Badge */}
              {isLiveMode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                  <div className="relative flex items-center justify-center">
                    <span className="absolute h-3 w-3 rounded-full bg-emerald-500 animate-ping opacity-75" />
                    <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                    Live Tracking
                  </span>
                  {liveSessions.length > 0 && (
                    <Badge className="text-[9px] h-4 px-1.5 font-bold bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800 ml-auto">
                      {liveSessions.length} active
                    </Badge>
                  )}
                </div>
              )}

              {!isLiveMode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Historical View
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <Card className="card-elevated shrink-0">
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3">
                {/* Distance */}
                <div className="text-center">
                  <div className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center mx-auto mb-1.5">
                    <MapPin className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{formatDistance(aggregateStats.totalDistance)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Distance</p>
                </div>

                {/* Duration */}
                <div className="text-center">
                  <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center mx-auto mb-1.5">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground">{formatDuration(aggregateStats.totalDuration)}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Duration</p>
                </div>

                {/* Shops Visited */}
                <div className="text-center">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-1.5">
                    <Store className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {aggregateStats.visitedShops}
                    <span className="text-muted-foreground font-normal">/{aggregateStats.totalShops}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium">Shops</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Auto-ended Warning */}
          {primarySession && (primarySession as any).status === 'auto_ended' && (
            <Card className="border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 shrink-0">
              <CardContent className="p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Auto-ended at midnight</p>
                  {(primarySession as any).autoEndReason && (
                    <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                      {(primarySession as any).autoEndReason}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Visited Shops List */}
          <Card className="card-elevated flex-1 min-h-0 flex flex-col">
            <CardHeader className="pb-2 pt-3 px-4 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Visited Shops
                </CardTitle>
                {visitedShopsList.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] font-bold h-4 px-1.5">
                    {visitedShopsList.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 flex-1 min-h-0">
              {visitedShopsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                    <Store className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {isLiveMode ? 'No visits yet' : 'No visits recorded'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 max-w-[200px]">
                    {isLiveMode
                      ? 'Shop visits will appear here as the orderbooker makes them'
                      : 'No route data available for this date'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-full max-h-[calc(100dvh-32rem)]">
                  <div className="space-y-1.5">
                    {visitedShopsList.map((visit, idx) => (
                      <div
                        key={visit.id || idx}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0 mt-0.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate">
                              {visit.shopName || 'Unknown Shop'}
                            </p>
                            {visit.isAutoDetected && (
                              <Badge className="text-[7px] px-1 py-0 h-3 font-bold bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800 shrink-0">
                                AUTO
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            <span>
                              {formatTime(visit.enterTime)}
                              {visit.exitTime ? ` - ${formatTime(visit.exitTime)}` : ' - Now'}
                            </span>
                            {visit.timeSpent != null && visit.timeSpent > 0 && (
                              <span className="font-medium text-foreground/70">
                                {formatTimeSpent(visit.timeSpent)}
                              </span>
                            )}
                          </div>
                          {visit.distanceToShop != null && visit.distanceToShop > 0 && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              {formatDistance(visit.distanceToShop)} from route
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* No Active Routes Empty State */}
          {isLiveMode && liveSessions.length === 0 && !loading && (
            <Card className="border-border bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
              <CardContent className="p-4 text-center">
                <Activity className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">
                  No Active Routes
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">
                  No orderbookers are currently on an active route. Routes will appear here when orderbookers start their daily route tracking.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
