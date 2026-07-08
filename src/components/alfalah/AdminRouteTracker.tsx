'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { getLocalDateString } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Radio,
  MapPin,
  Clock,
  Route,
  Store,
  Navigation,
  Loader2,
  CalendarDays,
  ChevronDown,
  Timer,
  Footprints,
  Users,
  Play,
  Store as StoreIcon,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// Dynamically import RouteTrackerMap to avoid SSR issues with Leaflet
const RouteTrackerMap = dynamic(() => import('./RouteTrackerMap'), {
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
interface ShopVisit {
  id: string;
  sessionId: string;
  shopId: string | null;
  shopName: string | null;
  orderbookerId: string;
  enterLat: number | null;
  enterLng: number | null;
  exitLat: number | null;
  exitLng: number | null;
  enterTime: string;
  exitTime: string | null;
  timeSpent: number | null;
  distanceToShop: number | null;
  isAutoDetected: boolean;
}

interface SessionData {
  session: {
    id: string;
    orderbookerId: string;
    startTime: string;
    endTime: string | null;
    startLat: number | null;
    startLng: number | null;
    startAddress: string | null;
    endLat: number | null;
    endLng: number | null;
    endAddress: string | null;
    totalDistance: number;
    totalDuration: number | null;
    status: string;
    autoEndReason: string | null;
  };
  latestLocation?: { lat: number; lng: number; accuracy: number | null; recordedAt: string } | null;
  shopVisits: ShopVisit[];
  orderbooker: { id: string; name: string; phone?: string };
  locations?: Array<{
    id: string;
    sessionId: string;
    lat: number;
    lng: number;
    accuracy: number | null;
    speed: number | null;
    recordedAt: string;
  }>;
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

// ── OB Colors ──────────────────────────────────────────────────────────────
const OB_COLORS = ['#4F46E5', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

function getOBColor(index: number): string {
  return OB_COLORS[index % OB_COLORS.length];
}

// ── Time/Duration Formatting ───────────────────────────────────────────────
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMinutes(seconds: number | null): string {
  if (!seconds) return '--';
  const m = Math.round(seconds / 60);
  if (m < 1) return '<1m';
  return `${m}m`;
}

function calcDuration(startTime: string, endTime?: string | null): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return Math.max(0, Math.round((end - start) / 1000));
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function RouteTrackerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="flex-1 h-[500px] rounded-xl" />
        <Skeleton className="w-80 h-[500px] rounded-xl hidden lg:block" />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminRouteTracker() {
  const today = useMemo(() => getLocalDateString(), []);

  // Data state
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedOB, setSelectedOB] = useState<string>('__all__');
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Leaflet CSS injection
  const [leafletCssLoaded, setLeafletCssLoaded] = useState(false);

  // Computed: is the selected date today?
  const isToday = useMemo(() => {
    const dateStr = selectedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    return dateStr === today;
  }, [selectedDate, today]);

  const selectedDateStr = useMemo(() => {
    return selectedDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  }, [selectedDate]);

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

  // Fetch orderbookers
  useEffect(() => {
    async function fetchOBs() {
      try {
        const res = await apiFetch('/api/orderbookers');
        if (res.ok) {
          const data = await res.json();
          setOrderbookers(
            Array.isArray(data)
              ? data.filter((o: Orderbooker) => o.status === 'active')
              : []
          );
        }
      } catch {
        // silent
      }
    }
    fetchOBs();
  }, []);

  // Fetch route data
  const fetchRouteData = useCallback(async () => {
    setError(null);
    try {
      const obParam = selectedOB !== '__all__' ? `&orderbookerId=${selectedOB}` : '';

      if (isToday) {
        // Live mode
        const res = await apiFetch(`/api/route-sessions/live?${obParam.slice(1)}`);
        if (!res.ok) throw new Error('Failed to fetch live data');
        const data = await res.json();
        setSessions(data.sessions || []);
      } else {
        // Historical mode
        const res = await apiFetch(`/api/route-sessions/history?date=${selectedDateStr}${obParam}`);
        if (!res.ok) throw new Error('Failed to fetch historical data');
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch route data';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isToday, selectedDateStr, selectedOB]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchRouteData();
  }, [fetchRouteData]);

  // Auto-refresh every 30 seconds when viewing today's data
  // Data is synced from order booker's phone, not real-time, but auto-refresh
  // ensures the status updates when sync uploads complete
  useEffect(() => {
    if (!isToday) return; // Only auto-refresh for today's view

    const interval = setInterval(() => {
      fetchRouteData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isToday, fetchRouteData]);

  // ── Computed Data ──────────────────────────────────────────────────────────

  const filteredSessions = useMemo(() => {
    if (selectedOB === '__all__') return sessions;
    return sessions.filter((s) => s.orderbooker.id === selectedOB);
  }, [sessions, selectedOB]);

  // Active OB IDs from sessions
  const activeOBIds = useMemo(() => new Set(sessions.map((s) => s.orderbooker.id)), [sessions]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalOBsActive = filteredSessions.length;
    const totalDistance = filteredSessions.reduce((sum, s) => sum + (s.session.totalDistance || 0), 0);
    const totalShopsVisited = filteredSessions.reduce((sum, s) => sum + s.shopVisits.length, 0);

    return { totalOBsActive, totalDistance, totalShopsVisited };
  }, [filteredSessions]);

  // Selected session for timeline detail
  const selectedSession = useMemo(() => {
    if (selectedOB !== '__all__' && filteredSessions.length > 0) {
      return filteredSessions[0];
    }
    return filteredSessions.length > 0 ? filteredSessions[0] : null;
  }, [filteredSessions, selectedOB]);

  // Timeline events for selected session
  const timelineEvents = useMemo(() => {
    if (!selectedSession) return [];

    const events: Array<{
      type: 'start' | 'shop' | 'end';
      time: string;
      label: string;
      detail?: string;
      duration?: number;
      isAutoDetected?: boolean;
    }> = [];

    // Start event
    events.push({
      type: 'start',
      time: selectedSession.session.startTime,
      label: 'Route Started',
      detail: selectedSession.session.startAddress || undefined,
    });

    // Shop visits
    for (const visit of selectedSession.shopVisits) {
      events.push({
        type: 'shop',
        time: visit.enterTime,
        label: visit.shopName || 'Unknown Shop',
        duration: visit.timeSpent ?? undefined,
        isAutoDetected: visit.isAutoDetected,
      });
    }

    // End event
    if (selectedSession.session.endTime) {
      events.push({
        type: 'end',
        time: selectedSession.session.endTime,
        label: 'Route Ended',
        detail: selectedSession.session.endAddress || undefined,
      });
    }

    return events;
  }, [selectedSession]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && sessions.length === 0) return <RouteTrackerSkeleton />;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            Route Tracking
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            View orderbooker route history with shop visit waypoints synced from their phones
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date indicator */}
          <Badge variant="secondary" className="text-[10px] font-bold">
            {isToday ? 'TODAY' : 'HISTORICAL'}
          </Badge>

          {/* Date Picker */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-2 text-xs font-medium">
                <CalendarDays className="h-3.5 w-3.5" />
                {selectedDate.toLocaleDateString('en-PK', {
                  timeZone: 'Asia/Karachi',
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }
                }}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* OB Selector */}
          <Select value={selectedOB} onValueChange={setSelectedOB}>
            <SelectTrigger className="w-48 h-9 text-xs">
              <SelectValue placeholder="All Orderbookers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Orderbookers</SelectItem>
              {orderbookers.map((ob) => (
                <SelectItem key={ob.id} value={ob.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        activeOBIds.has(ob.id) ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    />
                    {ob.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => { setLoading(true); fetchRouteData(); }}
            disabled={loading}
          >
            <Navigation className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content: Map + Sidebar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Map Area */}
        <Card className="flex-1 card-elevated overflow-hidden">
          <CardContent className="p-0">
            <div className="h-[500px] lg:h-[600px] relative">
              {leafletCssLoaded ? (
                <RouteTrackerMap
                  sessions={filteredSessions}
                  selectedOB={selectedOB === '__all__' ? null : selectedOB}
                  isLive={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-muted/30">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Timeline Sidebar — compact, only Route Info + Orderbookers (Timeline moved below map) */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          {/* Route Info Card */}
          {selectedSession && (
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: getOBColor(
                        filteredSessions.findIndex((s) => s.session.id === selectedSession.session.id)
                      ),
                    }}
                  />
                  <span className="font-semibold text-sm text-foreground">
                    {selectedSession.orderbooker.name}
                  </span>
                  {isToday && selectedSession.session.status === 'active' && (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[9px] font-bold px-1.5 h-4">
                      In Progress
                    </Badge>
                  )}
                  {selectedSession.session.status === 'ended' && (
                    <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-900/60 dark:text-gray-300 border-gray-200 dark:border-gray-800 text-[9px] font-bold px-1.5 h-4">
                      Completed
                    </Badge>
                  )}
                  {selectedSession.session.status === 'auto_ended' && (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[9px] font-bold px-1.5 h-4">
                      Auto-ended
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Started</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {formatTime(selectedSession.session.startTime)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Duration</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <Timer className="h-3 w-3 text-muted-foreground" />
                      {formatDuration(
                        selectedSession.session.totalDuration ||
                          calcDuration(selectedSession.session.startTime, selectedSession.session.endTime)
                      )}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Distance</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <Footprints className="h-3 w-3 text-muted-foreground" />
                      {(selectedSession.session.totalDistance / 1000).toFixed(1)} km
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Shops</p>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <Store className="h-3 w-3 text-muted-foreground" />
                      {selectedSession.shopVisits.length} visited
                    </p>
                  </div>
                </div>

                {selectedSession.session.startAddress && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <p className="text-[10px] text-muted-foreground">
                      Start: {selectedSession.session.startAddress}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline moved below the map as a full-width section for better visibility of shop visits */}

          {/* Orderbookers List Card — multi-column grid (compact, no truncation) */}
          <Card className="card-elevated">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Orderbookers
                <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                  ({orderbookers.length})
                </span>
              </h3>
              {orderbookers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No orderbookers found
                </p>
              ) : (
                <ScrollArea className="max-h-64">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-2">
                    {orderbookers.map((ob) => {
                      const isActive = activeOBIds.has(ob.id);
                      const obSession = sessions.find((s) => s.orderbooker.id === ob.id);
                      const isSelected = selectedOB === ob.id;

                      return (
                        <button
                          key={ob.id}
                          onClick={() => setSelectedOB(isSelected ? '__all__' : ob.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border border-primary/20'
                              : 'hover:bg-muted/50 border border-transparent'
                          }`}
                        >
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: isActive
                                ? getOBColor(sessions.findIndex((s) => s.orderbooker.id === ob.id))
                                : '#9CA3AF',
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-foreground truncate leading-tight">{ob.name}</p>
                            {obSession && (
                              <p className="text-[9px] text-muted-foreground leading-tight">
                                {obSession.shopVisits.length} shops &bull;{' '}
                                {(obSession.session.totalDistance / 1000).toFixed(1)} km
                              </p>
                            )}
                          </div>
                          {isActive ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" title={obSession?.session.status === 'active' ? 'In Progress' : 'Completed'} />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats Bar */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center shrink-0">
                <Navigation className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Routes</p>
                <p className="text-lg font-bold text-foreground">{stats.totalOBsActive}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
                <Footprints className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total Distance</p>
                <p className="text-lg font-bold text-foreground">{(stats.totalDistance / 1000).toFixed(1)} km</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Shops Visited</p>
                <p className="text-lg font-bold text-foreground">{stats.totalShopsVisited}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline — Full-width below map + sidebar, shows shop visit order with full details */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Route className="h-4 w-4 text-primary" />
            Timeline
            <span className="text-[10px] font-normal text-muted-foreground ml-1">
              ({timelineEvents.length} events)
            </span>
          </h3>

          {timelineEvents.length === 0 ? (
            <div className="text-center py-8">
              <Route className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {selectedSession
                  ? 'No route events to display for this session'
                  : 'Select an orderbooker from the list to view their visit timeline'}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pr-2">
                {timelineEvents.map((event, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2.5 p-2 rounded-lg border ${
                      event.type === 'start'
                        ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
                        : event.type === 'shop'
                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                    }`}
                  >
                    {/* Index + dot */}
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          event.type === 'start'
                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : event.type === 'shop'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {event.type === 'start' ? (
                          <Play className="h-3 w-3" />
                        ) : event.type === 'shop' ? (
                          <StoreIcon className="h-3 w-3" />
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                        )}
                      </div>
                    </div>

                    {/* Event content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-foreground break-words leading-tight flex-1 min-w-0">
                          {event.type === 'shop' && (
                            <span className="text-[9px] text-muted-foreground mr-1">#{idx}</span>
                          )}
                          {event.label}
                        </span>
                        {event.isAutoDetected && (
                          <span className="text-[8px] px-1 py-0 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 font-bold shrink-0">
                            AUTO
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatTime(event.time)}
                        {event.duration != null && (
                          <span className="ml-1.5 text-foreground/70">
                            ({formatMinutes(event.duration)})
                          </span>
                        )}
                      </p>
                      {event.detail && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 break-words leading-tight line-clamp-2">
                          {event.detail}
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
    </div>
  );
}
