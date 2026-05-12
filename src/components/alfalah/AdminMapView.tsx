'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { useAppStore } from '@/lib/store';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MapPin,
  Map as MapIcon,
  Users,
  Wallet,
  Store,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Route,
  PieChart as PieChartIcon,
  Filter,
  X,
  Info,
  Loader2,
  Navigation,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { WORKING_DAYS, formatPKR } from '@/lib/utils';

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
interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string };
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops?: number;
  totalOutstanding?: number;
}

interface AreaGroup {
  area: string;
  shops: Shop[];
  totalBalance: number;
  activeShops: number;
  inactiveShops: number;
  riskLevel: 'low' | 'medium' | 'high';
}

interface OBRouteGroup {
  id: string;
  name: string;
  phone: string | null;
  totalShops: number;
  totalOutstanding: number;
  routeDays: string[];
  areas: { name: string; count: number }[];
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function capitalizeDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

// Risk level thresholds
const HIGH_OUTSTANDING_THRESHOLD = 500000;
const MEDIUM_OUTSTANDING_THRESHOLD = 200000;

function getRiskLevel(totalBalance: number): 'low' | 'medium' | 'high' {
  if (totalBalance >= HIGH_OUTSTANDING_THRESHOLD) return 'high';
  if (totalBalance >= MEDIUM_OUTSTANDING_THRESHOLD) return 'medium';
  return 'low';
}

function getRiskColor(risk: 'low' | 'medium' | 'high') {
  switch (risk) {
    case 'high': return { bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-border', text: 'text-foreground', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    case 'medium': return { bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-border', text: 'text-foreground', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    case 'low': return { bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-border', text: 'text-foreground', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
  }
}

// Pie chart colors
const PIE_COLORS = ['#475569', '#64748B', '#94A3B8', '#CBD5E1', '#334155', '#1E293B', '#475569', '#64748B', '#94A3B8', '#CBD5E1'];

// ── View Tabs ──────────────────────────────────────────────────────────────
type MapTab = 'areas' | 'map' | 'ob-routes';

function MapTabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ── Area Card Component ────────────────────────────────────────────────────
function AreaCard({ group, expanded, onToggle, onSelectShop }: {
  group: AreaGroup;
  expanded: boolean;
  onToggle: () => void;
  onSelectShop: (shop: Shop) => void;
}) {
  const colors = getRiskColor(group.riskLevel);

  return (
    <Card className={`card-elevated card-hover border ${colors.border} transition-all`}>
      <CardContent className="p-0">
        {/* Header — always visible */}
        <button
          onClick={onToggle}
          className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
        >
          <div className={`h-10 w-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
            <MapPin className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-sm truncate">{group.area}</h3>
              <Badge className={`${colors.badge} text-[9px] font-bold px-1.5 h-4`}>
                {group.riskLevel === 'high' ? 'High Risk' : group.riskLevel === 'medium' ? 'Medium' : 'Low Risk'}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Store className="h-3 w-3" />{group.shops.length} shops</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-slate-500" />{group.activeShops}</span>
              <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-slate-400" />{group.inactiveShops}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-bold ${group.totalBalance > 0 ? 'text-foreground' : 'text-slate-500 dark:text-slate-400'}`}>
              {formatPKR(group.totalBalance)}
            </span>
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {/* Expanded — shop list */}
        {expanded && (
          <div className="border-t px-4 pb-3">
            <ScrollArea className="max-h-64">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-semibold py-1.5 h-7">Shop</TableHead>
                    <TableHead className="text-[10px] font-semibold py-1.5 h-7 hidden sm:table-cell">Owner</TableHead>
                    <TableHead className="text-[10px] font-semibold py-1.5 h-7 hidden md:table-cell">OB</TableHead>
                    <TableHead className="text-[10px] font-semibold py-1.5 h-7 text-right">Balance</TableHead>
                    <TableHead className="text-[10px] font-semibold py-1.5 h-7 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.shops.map((shop) => (
                    <TableRow key={shop.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelectShop(shop)}>
                      <TableCell className="py-1.5">
                        <p className="text-xs font-medium">{shop.name}</p>
                        <p className="text-[10px] text-muted-foreground">{shop.routeDays.map(capitalizeDay).join(', ')}</p>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground hidden sm:table-cell">{shop.ownerName || '—'}</TableCell>
                      <TableCell className="py-1.5 text-xs text-muted-foreground hidden md:table-cell">{shop.orderbooker.name}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        <span className={`text-xs font-semibold ${shop.balance > 0 ? 'text-foreground' : 'text-slate-500 dark:text-slate-400'}`}>
                          {formatPKR(shop.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-center">
                        <Badge className={`text-[9px] px-1.5 h-4 font-bold ${shop.status === 'active' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' : 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                          {shop.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── OB Route Card Component ───────────────────────────────────────────────
function OBRouteCard({ ob }: { ob: OBRouteGroup }) {
  const pieData = ob.areas.map((a, i) => ({
    name: a.name,
    value: a.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <Card className="card-elevated card-hover">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* OB Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{ob.name}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {ob.phone || 'No phone'} &bull; {ob.totalShops} shops
                </p>
              </div>
            </div>

            {/* Route Days */}
            <div className="flex flex-wrap gap-1 mb-2">
              {WORKING_DAYS.map((day) => {
                const isActive = ob.routeDays.includes(day);
                return (
                  <span
                    key={day}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-muted text-muted-foreground/50 line-through'
                    }`}
                  >
                    {capitalizeDay(day).slice(0, 3)}
                  </span>
                );
              })}
            </div>

            {/* Areas */}
            <div className="space-y-1">
              {ob.areas.map((area) => (
                <div key={area.name} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate">{area.name}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-bold ml-2 shrink-0">
                    {area.count}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Outstanding */}
            <div className="mt-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Outstanding</span>
                <span className={`text-xs font-bold ${ob.totalOutstanding > 0 ? 'text-foreground' : 'text-slate-500 dark:text-slate-400'}`}>
                  {formatPKR(ob.totalOutstanding)}
                </span>
              </div>
            </div>
          </div>

          {/* Pie Chart */}
          {pieData.length > 0 && (
            <div className="w-24 h-24 shrink-0 hidden sm:block">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={18}
                    outerRadius={36}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '11px',
                      padding: '6px 8px',
                    }}
                    formatter={(value: number, name: string) => [`${value} shops`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading Skeleton ───────────────────────────────────────────────────────
function MapViewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="skeleton-shimmer h-7 w-48" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-8 w-24 rounded-lg" />
        ))}
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
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AdminMapView() {
  const { setSelectedShopId, setSelectedShopName, setCurrentView } = useAppStore();

  // Data
  const [shops, setShops] = useState<Shop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [shopLocations, setShopLocations] = useState<{ shopId: string; lat: number; lng: number; gpsAddress: string | null; lastVisitAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // View
  const [activeTab, setActiveTab] = useState<MapTab>('areas');

  // Filters
  const [filterOB, setFilterOB] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('');
  const [filterArea, setFilterArea] = useState<string>('');

  // Area expansion
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

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

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [shopsRes, obsRes, locRes] = await Promise.all([
        apiFetch('/api/shops?includeInactive=true'),
        apiFetch('/api/orderbookers'),
        apiFetch('/api/shops/locations'),
      ]);
      if (shopsRes.ok) setShops(await shopsRes.json());
      if (obsRes.ok) setOrderbookers(await obsRes.json());
      if (locRes.ok) setShopLocations(await locRes.json());
    } catch {
      toast({ title: 'Error', description: 'Failed to load map data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Computed data ──────────────────────────────────────────────────────────

  // Unique areas for filter
  const allAreas = useMemo(() => {
    const areas = new Set<string>();
    shops.forEach((s) => { if (s.area) areas.add(s.area); });
    return Array.from(areas).sort();
  }, [shops]);

  // Filtered shops
  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      if (filterOB && s.orderbooker.id !== filterOB) return false;
      if (filterDay && !s.routeDays.includes(filterDay)) return false;
      if (filterArea && s.area !== filterArea) return false;
      return true;
    });
  }, [shops, filterOB, filterDay, filterArea]);

  // Area groups
  const areaGroups = useMemo((): AreaGroup[] => {
    const map = new Map<string, Shop[]>();
    filteredShops.forEach((s) => {
      const area = s.area || 'Unknown';
      if (!map.has(area)) map.set(area, []);
      map.get(area)!.push(s);
    });

    return Array.from(map.entries())
      .map(([area, areaShops]) => {
        const totalBalance = areaShops.reduce((sum, s) => sum + s.balance, 0);
        return {
          area,
          shops: areaShops.sort((a, b) => b.balance - a.balance),
          totalBalance,
          activeShops: areaShops.filter((s) => s.status === 'active').length,
          inactiveShops: areaShops.filter((s) => s.status === 'inactive').length,
          riskLevel: getRiskLevel(totalBalance),
        };
      })
      .sort((a, b) => b.totalBalance - a.totalBalance);
  }, [filteredShops]);

  // OB route groups
  const obRouteGroups = useMemo((): OBRouteGroup[] => {
    const activeOBs = orderbookers.filter((ob) => ob.status === 'active' || filterOB === ob.id);

    return activeOBs.map((ob) => {
      const obShops = filteredShops.filter((s) => s.orderbooker.id === ob.id);
      const routeDaySet = new Set<string>();
      const areaMap = new Map<string, number>();

      obShops.forEach((s) => {
        for (const d of s.routeDays) { routeDaySet.add(d); }
        const area = s.area || 'Unknown';
        areaMap.set(area, (areaMap.get(area) || 0) + 1);
      });

      const areas = Array.from(areaMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      return {
        id: ob.id,
        name: ob.name,
        phone: ob.phone,
        totalShops: obShops.length,
        totalOutstanding: obShops.reduce((sum, s) => sum + s.balance, 0),
        routeDays: Array.from(routeDaySet),
        areas,
        status: ob.status,
      };
    })
    .filter((ob) => ob.totalShops > 0)
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [orderbookers, filteredShops, filterOB]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalShops = filteredShops.length;
    const activeCount = filteredShops.filter((s) => s.status === 'active').length;
    const inactiveCount = filteredShops.filter((s) => s.status === 'inactive').length;
    const totalOutstanding = filteredShops.reduce((sum, s) => sum + s.balance, 0);
    return { totalShops, activeCount, inactiveCount, totalOutstanding };
  }, [filteredShops]);

  // Map markers — from ShopVisit GPS coordinates
  const mapMarkers = useMemo(() => {
    const locationMap = new Map(shopLocations.map((loc) => [loc.shopId, loc]));
    return filteredShops
      .filter((s) => locationMap.has(s.id))
      .map((s) => {
        const loc = locationMap.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          ownerName: s.ownerName,
          area: s.area,
          balance: s.balance,
          status: s.status,
          orderbookerName: s.orderbooker.name,
          routeDays: s.routeDays,
          lat: loc.lat,
          lng: loc.lng,
        };
      });
  }, [filteredShops, shopLocations]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleArea = (area: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  const handleSelectShop = (shop: Shop) => {
    setSelectedShopId(shop.id);
    setSelectedShopName(shop.name);
    setCurrentView('admin-shops');
  };

  const clearFilters = () => {
    setFilterOB('');
    setFilterDay('');
    setFilterArea('');
  };

  const hasActiveFilters = filterOB || filterDay || filterArea;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <MapViewSkeleton />;

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-primary" />
          Map &amp; Area Distribution
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Geographic overview of shops, areas, and orderbooker routes
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in stagger-children">
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Active Shops</p>
              <p className="text-lg font-bold text-foreground">{summaryStats.activeCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Inactive Shops</p>
              <p className="text-lg font-bold text-foreground">{summaryStats.inactiveCount}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
              <p className="text-lg font-bold text-foreground">{formatPKR(summaryStats.totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Areas Covered</p>
              <p className="text-lg font-bold text-foreground">{areaGroups.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gradient Divider */}
      <div className="divider-gradient" />

      {/* View Tabs & Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* View Tabs */}
            <div className="flex gap-2">
              <MapTabButton active={activeTab === 'areas'} onClick={() => setActiveTab('areas')} icon={Layers} label="Areas" />
              <MapTabButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={MapIcon} label="Map" />
              <MapTabButton active={activeTab === 'ob-routes'} onClick={() => setActiveTab('ob-routes')} icon={Route} label="OB Routes" />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide hidden sm:inline">Filters:</span>
              </div>
              <Select value={filterOB} onValueChange={(v) => setFilterOB(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-40 h-8 text-xs">
                  <SelectValue placeholder="All OBs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Orderbookers</SelectItem>
                  {orderbookers.filter((ob) => ob.status === 'active').map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterDay} onValueChange={(v) => setFilterDay(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-32 h-8 text-xs">
                  <SelectValue placeholder="All Days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Days</SelectItem>
                  {WORKING_DAYS.map((day) => (
                    <SelectItem key={day} value={day}>{capitalizeDay(day)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterArea} onValueChange={(v) => setFilterArea(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-full sm:w-36 h-8 text-xs">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Areas</SelectItem>
                  {allAreas.map((area) => (
                    <SelectItem key={area} value={area}>{area}</SelectItem>
                  ))}
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
              <Badge variant="secondary" className="text-[10px] font-bold">{filteredShops.length} shops</Badge>
              {filterOB && (
                <Badge variant="outline" className="text-[10px]">
                  OB: {orderbookers.find((o) => o.id === filterOB)?.name || 'Unknown'}
                </Badge>
              )}
              {filterDay && (
                <Badge variant="outline" className="text-[10px]">
                  Day: {capitalizeDay(filterDay)}
                </Badge>
              )}
              {filterArea && (
                <Badge variant="outline" className="text-[10px]">
                  Area: {filterArea}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Tab Content ─────────────────────────────────────────────────── */}

      {/* Areas Distribution View */}
      {activeTab === 'areas' && (
        <div className="space-y-4 animate-fade-in">
          {areaGroups.length === 0 ? (
            <Card className="card-elevated">
              <CardContent className="py-14 text-center">
                <div className="mx-auto mb-4 h-20 w-20">
                  <div className="relative z-10 h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <MapPin className="h-9 w-9 text-slate-400 animate-gentle-float" />
                  </div>
                </div>
                <p className="font-semibold text-muted-foreground text-sm">No areas match your filters</p>
                <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                  Try adjusting your filters or add shops with area information.
                </p>
                {hasActiveFilters && (
                  <button
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Area Summary Chart — Horizontal bar-style */}
              <Card className="card-elevated">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Area Outstanding Ranking
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {areaGroups.map((group) => {
                      const colors = getRiskColor(group.riskLevel);
                      const maxBalance = areaGroups[0]?.totalBalance || 1;
                      const widthPct = Math.max(2, (group.totalBalance / maxBalance) * 100);
                      return (
                        <TooltipProvider key={group.area}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-3 cursor-default">
                                <span className="text-xs text-muted-foreground w-28 truncate text-right shrink-0">{group.area}</span>
                                <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${group.riskLevel === 'high' ? 'bg-red-500' : group.riskLevel === 'medium' ? 'bg-slate-400' : 'bg-slate-300'} transition-all duration-500`}
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold shrink-0 w-24 text-right ${colors.text}`}>{formatPKR(group.totalBalance)}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">
                                <p className="font-semibold">{group.area}</p>
                                <p>{group.shops.length} shops ({group.activeShops} active, {group.inactiveShops} inactive)</p>
                                <p>Outstanding: {formatPKR(group.totalBalance)}</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Area Cards Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {areaGroups.map((group) => (
                  <AreaCard
                    key={group.area}
                    group={group}
                    expanded={expandedAreas.has(group.area)}
                    onToggle={() => toggleArea(group.area)}
                    onSelectShop={handleSelectShop}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Map View */}
      {activeTab === 'map' && (
        <div className="space-y-4 animate-fade-in">
          <Card className="card-elevated">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-primary" />
                  Shop Map
                </CardTitle>
                {mapMarkers.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {mapMarkers.length} pinned
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="h-[500px] rounded-xl overflow-hidden border border-border">
                {leafletCssLoaded ? (
                  <ShopMap markers={mapMarkers} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* OB Route Groups Sidebar */}
          <Card className="card-elevated">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Route className="h-4 w-4 text-primary" />
                Orderbooker Route Regions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {obRouteGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Route className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No route data available</p>
                </div>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {obRouteGroups.map((ob, idx) => (
                      <div
                        key={ob.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ob.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {ob.areas.map((a) => a.name).join(', ') || 'No areas'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold">{ob.totalShops} shops</p>
                          <p className="text-[10px] text-muted-foreground">{ob.routeDays.map(capitalizeDay).join(', ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Location tracking notice */}
          {mapMarkers.length === 0 ? (
            <Card className="card-elevated border-border bg-slate-50 dark:bg-slate-800/50">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <Info className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">No Shop Locations Yet</h4>
                  <p className="text-xs text-slate-600/80 dark:text-slate-300/80 mt-0.5 leading-relaxed">
                    Shop markers appear on the map when orderbookers submit recovery with GPS location or mark a GPS visit.
                    {shopLocations.length === 0
                      ? ' No GPS data has been recorded yet. Ask orderbookers to enable GPS when submitting recovery.'
                      : ` ${shopLocations.length} shop(s) have GPS data but may not match your current filters.`}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="card-elevated border-border bg-slate-50 dark:bg-slate-800/50">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">GPS Tracking Active</h4>
                  <p className="text-xs text-slate-600/80 dark:text-slate-300/80 mt-0.5 leading-relaxed">
                    {mapMarkers.length} shop(s) are pinned on the map based on GPS data from orderbooker visits and recovery submissions.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* OB Route Distribution View */}
      {activeTab === 'ob-routes' && (
        <div className="space-y-4 animate-fade-in">
          {/* OB Area Distribution Chart */}
          <Card className="card-elevated">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-primary" />
                Orderbooker Shop Distribution by Area
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-5">
              {obRouteGroups.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-sm text-muted-foreground">
                  <PieChartIcon className="h-10 w-10 mb-2 opacity-30" />
                  <p>No orderbooker data available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {obRouteGroups.map((ob, obIdx) => {
                    const pieData = ob.areas.map((a, i) => ({
                      name: a.name,
                      value: a.count,
                      color: PIE_COLORS[i % PIE_COLORS.length],
                    }));

                    return (
                      <div key={ob.id} className="flex flex-col sm:flex-row items-center gap-4">
                        {/* OB Label */}
                        <div className="w-full sm:w-40 shrink-0 flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[obIdx % PIE_COLORS.length] }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{ob.name}</p>
                            <p className="text-[10px] text-muted-foreground">{ob.totalShops} shops &bull; {ob.routeDays.length} route days</p>
                          </div>
                        </div>

                        {/* Pie Chart */}
                        <div className="w-32 h-32 shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={24}
                                outerRadius={50}
                                paddingAngle={2}
                                dataKey="value"
                                stroke="none"
                              >
                                {pieData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                contentStyle={{
                                  borderRadius: '8px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                  fontSize: '11px',
                                  padding: '6px 8px',
                                }}
                                formatter={(value: number, name: string) => [`${value} shops`, name]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Legend */}
                        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1 min-w-0">
                          {pieData.map((entry) => (
                            <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                              <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                              <span className="text-muted-foreground truncate">{entry.name}</span>
                              <span className="font-bold ml-auto shrink-0">{entry.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OB Route Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {obRouteGroups.length === 0 ? (
              <Card className="card-elevated col-span-full">
                <CardContent className="py-14 text-center">
                  <div className="mx-auto mb-4 h-20 w-20">
                    <div className="relative z-10 h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Users className="h-9 w-9 text-slate-400 animate-gentle-float" />
                    </div>
                  </div>
                  <p className="font-semibold text-muted-foreground text-sm">No orderbooker routes match your filters</p>
                  <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Try adjusting your filters to see OB route distributions.
                  </p>
                  {hasActiveFilters && (
                    <button
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                      onClick={clearFilters}
                    >
                      Clear Filters
                    </button>
                  )}
                </CardContent>
              </Card>
            ) : (
              obRouteGroups.map((ob) => (
                <OBRouteCard key={ob.id} ob={ob} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
