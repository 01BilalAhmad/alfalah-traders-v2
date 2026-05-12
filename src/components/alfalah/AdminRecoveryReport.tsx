'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useAppStore } from '@/lib/store';
import { getLocalDateString, getYesterdayDateString, formatPKR } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  CalendarDays,
  Banknote,
  Users,
  MapPin,
  Navigation,
  ExternalLink,
  Download,
  CheckCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Store,
  Search,
  X,
} from 'lucide-react';
import { exportToCSV } from '@/lib/csv-export';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

interface RecoveryEntry {
  id: string;
  amount: number;
  time: string;
  description: string | null;
  hasGps: boolean;
  gpsLat: number | null;
  gpsLng: number | null;
}

interface ShopRecovery {
  shopId: string;
  shopName: string;
  shopArea: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  recoveryEntries: RecoveryEntry[];
}

interface OrderbookerRecovery {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  shops: ShopRecovery[];
}

interface RecoverySummary {
  date: string;
  grandTotalRecovery: number;
  orderbookers: OrderbookerRecovery[];
}

interface OrderbookerOption {
  id: string;
  name: string;
}

interface ShopOption {
  id: string;
  name: string;
  area: string;
  balance: number;
  orderbooker: { id: string; name: string } | null;
}

function RecoverySkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="skeleton-shimmer h-7 w-48 mb-1" />
        <Skeleton className="skeleton-shimmer h-4 w-52" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="skeleton-shimmer h-11 w-11 rounded-xl" />
              <div>
                <Skeleton className="skeleton-shimmer h-3 w-28 mb-2" />
                <Skeleton className="skeleton-shimmer h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="skeleton-shimmer h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="skeleton-shimmer h-4 w-32 mb-1" />
                      <Skeleton className="skeleton-shimmer h-3 w-44" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Skeleton className="skeleton-shimmer h-4 w-20" />
                    <Skeleton className="skeleton-shimmer h-4 w-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type GpsFilter = 'all' | 'with-gps' | 'without-gps';

export default function AdminRecoveryReport() {
  const { selectedDate, setSelectedDate, user } = useAppStore();
  const [summary, setSummary] = useState<RecoverySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedOB, setExpandedOB] = useState<Set<string>>(new Set());
  const [expandedShops, setExpandedShops] = useState<Set<string>>(new Set());
  const [gpsFilter, setGpsFilter] = useState<GpsFilter>('all');

  // Edit recovery state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<RecoveryEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);

  // Delete recovery state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<RecoveryEntry | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Add recovery state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3>(1);
  const [orderbookers, setOrderbookers] = useState<OrderbookerOption[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [selectedOBId, setSelectedOBId] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addRecoveryDate, setAddRecoveryDate] = useState(getLocalDateString());
  const [addSaving, setAddSaving] = useState(false);
  const [fetchingDropdowns, setFetchingDropdowns] = useState(false);
  const [shopSearch, setShopSearch] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/recovery-summary?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load recovery data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const toggleExpand = (id: string) => {
    setExpandedOB((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (!summary) return;
    const allIds = summary.orderbookers.map((ob) => ob.orderbookerId);
    if (allIds.every((id) => expandedOB.has(id))) {
      setExpandedOB(new Set());
    } else {
      setExpandedOB(new Set(allIds));
    }
  };

  const toggleShopExpand = (shopKey: string) => {
    setExpandedShops((prev) => {
      const next = new Set(prev);
      if (next.has(shopKey)) next.delete(shopKey);
      else next.add(shopKey);
      return next;
    });
  };

  const anyExpanded = summary ? summary.orderbookers.some((ob) => expandedOB.has(ob.orderbookerId)) : false;

  // Client-side GPS filter helper
  const filterRecoveryEntries = (entries: RecoveryEntry[]): RecoveryEntry[] => {
    if (gpsFilter === 'all') return entries;
    if (gpsFilter === 'with-gps') return entries.filter((e) => e.hasGps);
    return entries.filter((e) => !e.hasGps);
  };

  const filterShops = (shops: ShopRecovery[]): ShopRecovery[] => {
    if (gpsFilter === 'all') return shops;
    return shops
      .map((shop) => ({
        ...shop,
        recoveryEntries: filterRecoveryEntries(shop.recoveryEntries),
        todayRecovery: filterRecoveryEntries(shop.recoveryEntries).reduce((s, e) => s + e.amount, 0),
      }))
      .filter((shop) => shop.recoveryEntries.length > 0);
  };

  const filterOrderbookers = (obs: OrderbookerRecovery[]): OrderbookerRecovery[] => {
    if (gpsFilter === 'all') return obs;
    return obs
      .map((ob) => ({
        ...ob,
        shops: filterShops(ob.shops),
        totalRecovery: filterShops(ob.shops).reduce((s, sh) => s + sh.todayRecovery, 0),
        visitedShops: filterShops(ob.shops).filter((sh) => sh.visited).length,
      }))
      .filter((ob) => ob.shops.length > 0);
  };

  const filteredOrderbookers = summary ? filterOrderbookers(summary.orderbookers) : [];
  const filteredGrandTotal = filteredOrderbookers.reduce((s, ob) => s + ob.totalRecovery, 0);

  // Auto-refresh every 30 seconds so new recovery data from orderbookers appears automatically
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      fetchSummary();
    }, 30000); // 30 seconds
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchSummary]);

  // Track last updated time
  useEffect(() => {
    if (summary) {
      setLastUpdated(new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }));
    }
  }, [summary]);

  const gpsFilterTabs: { value: GpsFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'with-gps', label: 'With GPS' },
    { value: 'without-gps', label: 'Without GPS' },
  ];

  // ─── Edit Recovery Handlers ───
  const openEditDialog = (entry: RecoveryEntry) => {
    setEditEntry(entry);
    setEditAmount(String(entry.amount));
    setEditDescription(entry.description || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editEntry || !user) return;
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editEntry.id,
          amount: parseFloat(editAmount),
          description: editDescription.trim() || null,
          updatedBy: user.id,
        }),
      });
      if (res.ok) {
        toast({ title: 'Updated', description: 'Recovery entry updated successfully' });
        setEditConfirmOpen(false);
        setEditDialogOpen(false);
        setEditEntry(null);
        fetchSummary();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update recovery', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update recovery', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete Recovery Handlers ───
  const openDeleteConfirm = (entry: RecoveryEntry) => {
    setDeleteEntry(entry);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteEntry || !user) return;
    setDeleteSaving(true);
    try {
      const res = await apiFetch(`/api/transactions?id=${deleteEntry.id}&deletedBy=${user.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: 'Recovery entry deleted successfully' });
        setDeleteConfirmOpen(false);
        setDeleteEntry(null);
        fetchSummary();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to delete recovery', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete recovery', variant: 'destructive' });
    } finally {
      setDeleteSaving(false);
    }
  };

  // ─── Add Recovery Handlers ───
  const openAddDialog = async () => {
    setAddStep(1);
    setSelectedOBId('');
    setSelectedShopId('');
    setAddAmount('');
    setAddDescription('');
    setAddRecoveryDate(getLocalDateString());
    setShopSearch('');
    setShops([]);
    setAddDialogOpen(true);
    setFetchingDropdowns(true);
    try {
      const obRes = await apiFetch('/api/orderbookers');
      if (obRes.ok) {
        const obData = await obRes.json();
        setOrderbookers(Array.isArray(obData) ? obData : obData.orderbookers || []);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load orderbookers', variant: 'destructive' });
    } finally {
      setFetchingDropdowns(false);
    }
  };

  // Fetch ALL shops for selected orderbooker (including zero-balance + secondary assignments)
  const [obShopsLoading, setObShopsLoading] = useState(false);
  const fetchOrderbookerShops = useCallback(async (obId: string) => {
    setObShopsLoading(true);
    setSelectedShopId('');
    setShopSearch('');
    try {
      // showZeroBalance=true ensures admin sees ALL shops
      const res = await apiFetch(`/api/shops?orderbookerId=${obId}&showZeroBalance=true&includeInactive=true`);
      if (res.ok) {
        const data = await res.json();
        setShops(Array.isArray(data) ? data : []);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load shops', variant: 'destructive' });
    } finally {
      setObShopsLoading(false);
    }
  }, []);

  const filteredShops = shopSearch.trim()
    ? shops.filter((s) => {
        const q = shopSearch.trim().toLowerCase();
        return s.name.toLowerCase().includes(q) || (s.area && s.area.toLowerCase().includes(q));
      })
    : shops;

  // Selected shop details
  const selectedShopDetails = selectedShopId ? filteredShops.find((s) => s.id === selectedShopId) : null;

  const handleAddSubmit = async () => {
    if (!selectedShopId || !addAmount || !user) return;
    setAddSaving(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShopId,
          type: 'recovery',
          amount: parseFloat(addAmount),
          description: addDescription.trim() || undefined,
          createdBy: user.id,
          customDate: addRecoveryDate !== getLocalDateString() ? addRecoveryDate : undefined,
        }),
      });
      if (res.ok) {
        toast({ title: 'Added', description: 'Recovery entry added successfully' });
        setAddDialogOpen(false);
        fetchSummary();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to add recovery', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add recovery', variant: 'destructive' });
    } finally {
      setAddSaving(false);
    }
  };

  if (loading) {
    return <RecoverySkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recovery Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Daily recovery summary by orderbooker</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Add Recovery Button */}
          <Button
            onClick={openAddDialog}
            className="bg-green-600 hover:bg-green-700 text-white "
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Recovery
          </Button>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-9 w-44"
            />
          </div>
          <Button
            variant={selectedDate === getLocalDateString() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getLocalDateString())}
            className="text-xs "
          >
            Today
          </Button>
          <Button
            variant={selectedDate === getYesterdayDateString() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getYesterdayDateString())}
            className="text-xs "
          >
            Yesterday
          </Button>
          <Button variant="outline" size="sm" onClick={fetchSummary} disabled={loading} className="">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" />Refresh</>}
          </Button>
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              Updated {lastUpdated}
            </span>
          )}
          {summary && summary.orderbookers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className=""
              onClick={() => {
                const rows: Record<string, unknown>[] = [];
                summary.orderbookers.forEach((ob) => {
                  ob.shops.forEach((shop) => {
                    rows.push({
                      Orderbooker: ob.orderbookerName,
                      Shop: shop.shopName,
                      Area: shop.shopArea || '',
                      'Prev Balance': shop.previousBalance,
                      Credit: shop.todayCredit,
                      Recovery: shop.todayRecovery,
                      'Closing Balance': shop.closingBalance,
                      Visited: shop.visited ? 'Yes' : 'No',
                    });
                  });
                });
                exportToCSV(rows, `recovery-report-${summary.date}`, ['Orderbooker', 'Shop', 'Area', 'Prev Balance', 'Credit', 'Recovery', 'Closing Balance', 'Visited']);
                toast({ title: 'Exported', description: 'Recovery report CSV downloaded' });
              }}
            >
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="card-hover " style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Grand Total Recovery</p>
                <p className="text-xl font-bold text-foreground animate-live-pulse number-display">{formatPKR(summary.grandTotalRecovery)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover " style={{ animationDelay: '50ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Active Orderbookers</p>
                <p className="text-xl font-bold text-foreground">{summary.orderbookers.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover " style={{ animationDelay: '100ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Shops Visited</p>
                <p className="text-xl font-bold text-foreground">
                  {summary.orderbookers.reduce((s, ob) => s + ob.visitedShops, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subtle gradient divider between summary and accordion */}
      {summary && (
        <div className="divider-gradient" />
      )}

      {/* GPS Filter */}
      {summary && summary.orderbookers.length > 0 && (
        <div className="flex gap-1.5">
          {gpsFilterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setGpsFilter(tab.value)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                gpsFilter === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {tab.label}
              {tab.value !== 'all' && (
                <span className="ml-1 opacity-70">
                  {tab.value === 'with-gps'
                    ? (() => {
                        const count = summary.orderbookers.reduce(
                          (s, ob) => s + ob.shops.filter((sh) => sh.recoveryEntries.some((e) => e.hasGps)).length,
                          0
                        );
                        return count;
                      })()
                    : (() => {
                        const count = summary.orderbookers.reduce(
                          (s, ob) => s + ob.shops.filter((sh) => sh.recoveryEntries.some((e) => !e.hasGps)).length,
                          0
                        );
                        return count;
                      })()}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Orderbooker Accordion */}
      {summary && summary.orderbookers.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpandAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {anyExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
                Expand All
              </>
            )}
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-0">
          {!summary || summary.orderbookers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="empty-state-illustration mx-auto mb-4 h-20 w-20">
                <div className="relative z-10 h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <TrendingUp className="h-9 w-9 text-slate-400 animate-gentle-float" />
                </div>
              </div>
              <p className="font-semibold text-muted-foreground text-sm">No recovery data for this date</p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Recovery entries will appear here once orderbookers start collecting payments.
              </p>
              <button
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors "
                onClick={fetchSummary}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Try Another Date
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(gpsFilter === 'all' ? summary.orderbookers : filteredOrderbookers).map((ob) => {
                const isExpanded = expandedOB.has(ob.orderbookerId);
                const displayShops = gpsFilter === 'all' ? ob.shops : filterShops(ob.shops);
                const obTotalCredit = displayShops.reduce((s, sh) => s + sh.todayCredit, 0);
                const obTotalRecovery = displayShops.reduce((s, sh) => s + sh.todayRecovery, 0);
                const obTotalOutstanding = displayShops.reduce((s, sh) => s + sh.previousBalance, 0);
                const recoveryRate = obTotalCredit > 0 ? (obTotalRecovery / obTotalCredit) * 100 : (obTotalRecovery > 0 ? 100 : 0);
                const recoveryPct = Math.round(recoveryRate * 10) / 10;
                return (
                  <div key={ob.orderbookerId}>
                    {/* Orderbooker Header */}
                    <button
                      onClick={() => toggleExpand(ob.orderbookerId)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">{ob.orderbookerName.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{ob.orderbookerName}</p>
                            {recoveryPct >= 80 ? (
                              <Badge className="text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                80%+ {recoveryPct}%
                              </Badge>
                            ) : recoveryPct >= 50 ? (
                              <Badge className="text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                <TrendingUp className="h-3 w-3 mr-0.5" />
                                {recoveryPct}%
                              </Badge>
                            ) : obTotalOutstanding > 0 ? (
                              <Badge className="text-[10px] bg-red-100 text-red-700 hover:bg-red-100 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                Low {recoveryPct}%
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {displayShops.filter((sh) => sh.visited).length}/{ob.totalShops} shops visited
                            {ob.orderbookerPhone && ` \u2022 ${ob.orderbookerPhone}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">{formatPKR(obTotalRecovery)}</p>
                          <p className="text-[10px] text-muted-foreground">Collected Today</p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Progress Indicator */}
                    {isExpanded && (
                      <div className="px-5 pb-3">
                        {obTotalOutstanding > 0 ? (
                          <>
                            <div className="w-full h-1 rounded-full bg-muted overflow-hidden flex">
                              <div
                                className="h-full bg-slate-300 transition-all duration-500"
                                style={{ width: `${(obTotalRecovery / obTotalOutstanding) * 100}%` }}
                              />
                              <div
                                className="h-full bg-slate-400 transition-all duration-500"
                                style={{ width: `${(obTotalCredit / obTotalOutstanding) * 100}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatPKR(obTotalRecovery)} / {formatPKR(obTotalOutstanding)} recovered
                            </p>
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">No credit activity today</p>
                        )}
                      </div>
                    )}

                    {/* Expanded Shop Details */}
                    {isExpanded && (
                      <div className="bg-muted/20 px-5 pb-4 animate-fade-in">
                        <ScrollArea className="max-h-72">
                          <Table>
                            <TableHeader>
                              <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs font-semibold w-8" />
                                <TableHead className="text-xs font-semibold">Shop</TableHead>
                                <TableHead className="text-xs font-semibold hidden sm:table-cell">Area</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Prev. Balance</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Credit</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Recovery</TableHead>
                                <TableHead className="text-xs font-semibold text-right">Closing</TableHead>
                                <TableHead className="text-xs font-semibold text-center hidden md:table-cell">GPS</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {displayShops.map((shop, idx) => {
                                const shopKey = `${ob.orderbookerId}-${shop.shopId}`;
                                const isShopExpanded = expandedShops.has(shopKey);
                                const shopEntries = filterRecoveryEntries(shop.recoveryEntries);
                                return (
                                  <Fragment key={shopKey}>
                                    {/* Shop Summary Row */}
                                    <TableRow
                                      key={shop.shopId}
                                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} transition-colors`}
                                    >
                                      <TableCell className="w-8 px-2">
                                        {shopEntries.length > 0 && (
                                          <button
                                            onClick={() => toggleShopExpand(shopKey)}
                                            className="p-0.5 hover:bg-muted rounded transition-colors"
                                          >
                                            {isShopExpanded ? (
                                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                            ) : (
                                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                          </button>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm font-medium">
                                        <div className="flex items-center gap-1.5">
                                          {shop.shopName}
                                          {shop.visited && (
                                            <Badge className="text-[9px] badge-recovery">Visited</Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                                        {shop.shopArea || '\u2014'}
                                      </TableCell>
                                      <TableCell className="text-right text-sm">
                                        {formatPKR(shop.previousBalance)}
                                      </TableCell>
                                      <TableCell className="text-right text-sm text-foreground font-medium">
                                        {shop.todayCredit > 0 ? `+${formatPKR(shop.todayCredit)}` : '\u2014'}
                                      </TableCell>
                                      <TableCell className="text-right text-sm text-foreground font-medium">
                                        {shop.todayRecovery > 0 ? `-${formatPKR(shop.todayRecovery)}` : '\u2014'}
                                      </TableCell>
                                      <TableCell className="text-right text-sm">
                                        <div className="flex items-center justify-end gap-1.5">
                                          {shop.closingBalance === 0 ? (
                                            <Badge className="text-[9px] bg-slate-50 text-slate-500 hover:bg-slate-50 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700">
                                              <CheckCircle className="h-3 w-3 mr-0.5" />
                                              Settled
                                            </Badge>
                                          ) : (
                                            <span className={shop.closingBalance > shop.previousBalance + shop.todayCredit ? 'font-bold text-red-600' : 'font-bold'}>
                                              {formatPKR(shop.closingBalance)}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center hidden md:table-cell">
                                        {shop.recoveryEntries.length > 0 ? (
                                          shop.recoveryEntries.every((e) => e.hasGps) ? (
                                            <a
                                              href={`https://www.openstreetmap.org/?mlat=${shop.recoveryEntries[0].gpsLat}&mlon=${shop.recoveryEntries[0].gpsLng}#map=17/${shop.recoveryEntries[0].gpsLat}/${shop.recoveryEntries[0].gpsLng}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-500 transition-colors"
                                              title="All recoveries GPS verified"
                                            >
                                              <Navigation className="h-3.5 w-3.5" />
                                              <ExternalLink className="h-3 w-3" />
                                            </a>
                                          ) : shop.recoveryEntries.some((e) => e.hasGps) ? (
                                            <span className="inline-flex items-center gap-1 text-slate-500" title="Partial GPS verification">
                                              <Navigation className="h-3.5 w-3.5" />
                                              <span className="text-[9px]">
                                                {shop.recoveryEntries.filter((e) => e.hasGps).length}/{shop.recoveryEntries.length}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center text-muted-foreground" title="No GPS captured">
                                              <Navigation className="h-3.5 w-3.5" />
                                            </span>
                                          )
                                        ) : (
                                          <span className="text-muted-foreground">\u2014</span>
                                        )}
                                      </TableCell>
                                    </TableRow>

                                    {/* Expanded Recovery Entries for this shop */}
                                    {isShopExpanded && shopEntries.length > 0 && (
                                      <TableRow key={`${shop.shopId}-entries`} className="bg-muted/40">
                                        <TableCell colSpan={8} className="p-0">
                                          <div className="px-8 py-3">
                                            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                                              Recovery Entries ({shopEntries.length})
                                            </div>
                                            <div className="rounded-lg border overflow-hidden">
                                              <Table>
                                                <TableHeader>
                                                  <TableRow className="hover:bg-transparent bg-muted/50">
                                                    <TableHead className="text-[11px] font-semibold">Time</TableHead>
                                                    <TableHead className="text-[11px] font-semibold text-right">Amount</TableHead>
                                                    <TableHead className="text-[11px] font-semibold hidden sm:table-cell">Description</TableHead>
                                                    <TableHead className="text-[11px] font-semibold text-center hidden sm:table-cell">GPS</TableHead>
                                                    <TableHead className="text-[11px] font-semibold text-right hidden md:table-cell">Actions</TableHead>
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {shopEntries.map((entry) => (
                                                    <TableRow key={entry.id} className="text-sm">
                                                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                                        {entry.time
                                                          ? new Date(entry.time).toLocaleTimeString('en-PK', {
                                                              hour: '2-digit',
                                                              minute: '2-digit',
                                                              hour12: true,
                                                            })
                                                          : '\u2014'}
                                                      </TableCell>
                                                      <TableCell className="text-right text-sm font-medium text-foreground">
                                                        {formatPKR(entry.amount)}
                                                      </TableCell>
                                                      <TableCell className="text-xs text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">
                                                        {entry.description || '\u2014'}
                                                      </TableCell>
                                                      <TableCell className="text-center hidden sm:table-cell">
                                                        {entry.hasGps ? (
                                                          <Navigation className="h-3.5 w-3.5 text-slate-500 mx-auto" />
                                                        ) : (
                                                          <span className="text-muted-foreground text-xs">\u2014</span>
                                                        )}
                                                      </TableCell>
                                                      <TableCell className="text-right hidden md:table-cell">
                                                        <div className="flex items-center justify-end gap-1">
                                                          <Button
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0"
                                                            onClick={() => openEditDialog(entry)}
                                                            title="Edit recovery"
                                                          >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                          </Button>
                                                          <Button
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                                            onClick={() => openDeleteConfirm(entry)}
                                                            title="Delete recovery"
                                                          >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                          </Button>
                                                        </div>
                                                      </TableCell>
                                                    </TableRow>
                                                  ))}
                                                </TableBody>
                                              </Table>
                                            </div>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                        <p className="mt-2 text-[10px] text-muted-foreground text-right">
                          Closing = (Previous Balance + Today Credit) - Today Recovery
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Grand Total */}
              <div className="flex items-center justify-between px-5 py-3 bg-primary/5">
                <span className="font-bold text-sm">Grand Total {gpsFilter !== 'all' ? `(filtered)` : ''}</span>
                <span className="font-bold text-sm text-primary number-display">{formatPKR(gpsFilter === 'all' ? summary.grandTotalRecovery : filteredGrandTotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Edit Recovery Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        if (!open) { setEditDialogOpen(false); setEditEntry(null); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Recovery Entry</DialogTitle>
            <DialogDescription>
              Modify the amount and description for this recovery entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount (Rs.)</Label>
              <Input
                id="edit-amount"
                type="number"
                min="0"
                step="1"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Input
                id="edit-description"
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditDialogOpen(false); setEditEntry(null); }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setEditConfirmOpen(true)}
              disabled={!editAmount || parseFloat(editAmount) <= 0 || editSaving}
            >
              {editSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Confirmation AlertDialog */}
      <AlertDialog open={editConfirmOpen} onOpenChange={setEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this recovery entry to {formatPKR(parseFloat(editAmount) || 0)}?
              {editDescription.trim() && ` Description: "${editDescription.trim()}"`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={editSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEditSave}
              disabled={editSaving}
              className="bg-primary hover:bg-primary/90"
            >
              {editSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Confirm Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Recovery AlertDialog ─── */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={(open) => {
        if (!open) setDeleteEntry(null);
        setDeleteConfirmOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recovery Entry</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry
                ? `Delete this recovery entry of ${formatPKR(deleteEntry.amount)}? This action cannot be undone.`
                : 'Are you sure you want to delete this recovery entry?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteSaving}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add Recovery Dialog (3-step) ─── */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        if (!open) { setAddDialogOpen(false); setAddStep(1); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Recovery</DialogTitle>
            <DialogDescription>
              {addStep === 1 && 'Step 1: Select an orderbooker'}
              {addStep === 2 && 'Step 2: Select a shop'}
              {addStep === 3 && 'Step 3: Enter recovery details'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  step <= addStep ? 'bg-slate-600' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {fetchingDropdowns ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading data...</span>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 min-h-0">
            <>
              {/* Step 1: Select Orderbooker */}
              {addStep === 1 && (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Select Orderbooker</Label>
                    <Select
                      value={selectedOBId}
                      onValueChange={(val) => {
                        setSelectedOBId(val);
                        setSelectedShopId('');
                        fetchOrderbookerShops(val); // Fetch ALL shops for this orderbooker
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an orderbooker" />
                      </SelectTrigger>
                      <SelectContent>
                        {orderbookers.map((ob) => (
                          <SelectItem key={ob.id} value={ob.id}>
                            {ob.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2: Select Shop */}
              {addStep === 2 && (
                <div className="space-y-3 py-2">
                  {obShopsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Loading shops...</span>
                    </div>
                  ) : selectedShopDetails && !shopSearch ? (
                    <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-primary shrink-0" />
                          <div>
                            <p className="font-semibold text-sm">{selectedShopDetails.name}</p>
                            {selectedShopDetails.area && (
                              <p className="text-xs text-muted-foreground">{selectedShopDetails.area}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setSelectedShopId('');
                            setShopSearch('');
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Banknote className="h-3 w-3 text-slate-500" />
                        Balance: <span className="font-bold text-foreground">{formatPKR(selectedShopDetails.balance)}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Label>Search & Select Shop</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Type shop name or area..."
                          value={shopSearch}
                          onChange={(e) => {
                            setShopSearch(e.target.value);
                            if (selectedShopId) setSelectedShopId('');
                          }}
                          className="pl-9"
                          autoFocus
                        />
                        {shopSearch && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                            onClick={() => { setShopSearch(''); setSelectedShopId(''); }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <ScrollArea className="max-h-52 border rounded-lg">
                        <div className="p-1">
                          {filteredShops.length === 0 ? (
                            <p className="text-xs text-muted-foreground p-3 text-center">No shops found</p>
                          ) : (
                            filteredShops.slice(0, 20).map((shop) => (
                              <button
                                key={shop.id}
                                onClick={() => {
                                  setSelectedShopId(shop.id);
                                  setShopSearch('');
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors ${
                                  selectedShopId === shop.id
                                    ? 'bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
                                    : 'hover:bg-muted'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <div className="text-left min-w-0">
                                    <p className="font-medium truncate">{shop.name}</p>
                                    {shop.area && (
                                      <p className="text-[10px] text-muted-foreground">{shop.area}</p>
                                    )}
                                  </div>
                                </div>
                                <span className={`text-xs font-bold tabular-nums shrink-0 ${shop.balance > 0 ? 'text-foreground' : 'text-slate-500 dark:text-slate-400'}`}>
                                  {formatPKR(shop.balance)}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                      {filteredShops.length > 20 && (
                        <p className="text-[10px] text-muted-foreground text-center">
                          Showing 20 of {filteredShops.length} — type to narrow results
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Enter Amount & Description */}
              {addStep === 3 && selectedShopDetails && (
                <div className="space-y-4 py-2">
                  {/* Shop info card */}
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium text-sm">{selectedShopDetails.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => { setAddStep(2); setSelectedShopId(''); setShopSearch(''); }}
                      >
                        Change
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Banknote className="h-3 w-3 text-slate-500" />
                      Outstanding Balance: <span className="font-bold text-foreground">{formatPKR(selectedShopDetails.balance)}</span>
                    </div>
                    {selectedShopDetails.area && (
                      <p className="text-[10px] text-muted-foreground">{selectedShopDetails.area}</p>
                    )}
                  </div>
                  {/* Recovery balance warning */}
                  {addAmount && parseFloat(addAmount) > selectedShopDetails.balance && (
                    <div className="flex items-center gap-1.5 p-2 rounded-md bg-destructive/10 text-destructive text-xs font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Recovery amount ({formatPKR(parseFloat(addAmount))}) exceeds shop balance ({formatPKR(selectedShopDetails.balance)}). Server will reject this.
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="add-amount">Amount (Rs.)</Label>
                    <Input
                      id="add-amount"
                      type="number"
                      min="0"
                      step="1"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      placeholder="Enter recovery amount"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-recovery-date" className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      Recovery Date
                      {addRecoveryDate !== getLocalDateString() && (
                        <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400">
                          Backdated
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="add-recovery-date"
                      type="date"
                      value={addRecoveryDate}
                      max={getLocalDateString()}
                      onChange={(e) => setAddRecoveryDate(e.target.value)}
                      className="text-sm"
                    />
                    {addRecoveryDate !== getLocalDateString() && (
                      <p className="text-[10px] text-foreground font-medium animate-fade-in">
                        Recovery will be recorded for {new Date(addRecoveryDate + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })} instead of today
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="add-description">Description (optional)</Label>
                    <Input
                      id="add-description"
                      type="text"
                      value={addDescription}
                      onChange={(e) => setAddDescription(e.target.value)}
                      placeholder="e.g., Cash payment, Cheque #123"
                    />
                  </div>
                </div>
              )}
            </>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (addStep === 1) { setAddDialogOpen(false); }
                else { setAddStep((addStep - 1) as 1 | 2); }
              }}
            >
              {addStep === 1 ? 'Cancel' : 'Back'}
            </Button>
            {addStep < 3 ? (
              <Button
                onClick={() => setAddStep((addStep + 1) as 2 | 3)}
                disabled={
                  (addStep === 1 && !selectedOBId) ||
                  (addStep === 2 && !selectedShopId)
                }
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleAddSubmit}
                disabled={!addAmount || parseFloat(addAmount) <= 0 || addSaving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {addSaving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Add Recovery
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
