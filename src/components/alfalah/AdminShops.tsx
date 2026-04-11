'use client';

import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Store,
  Search,
  Plus,
  Pencil,
  Loader2,
  UserMinus,
  UserCheck,
  UserX,
  CheckCircle,
  XCircle,
  BookOpen,
  Download,
  ArrowLeft,
  Users,
  Wallet,
  TrendingDown,
  MapPin,
  BarChart3,
  Eye,
  Phone,
  User,
  CreditCard,
  FileDown,
  X,
  TrendingUp,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';
import { exportToCSV } from '@/lib/csv-export';
import { WORKING_DAYS, getTodayRouteDay } from '@/lib/utils';

const ROUTE_DAYS = [...WORKING_DAYS];

// Off days not in working days (e.g., Friday)
const OFF_DAYS = ['friday'];

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  routeDay: string;
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

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AdminShops() {
  const { setCurrentView, setSelectedShopId, setSelectedShopName } = useAppStore();
  const [shops, setShops] = useState<Shop[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('');

  const todayDay = getTodayRouteDay();
  const [selectedOBFilter, setSelectedOBFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [formName, setFormName] = useState('');
  const [formOwner, setFormOwner] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRouteDay, setFormRouteDay] = useState('');
  const [formOrderbookerId, setFormOrderbookerId] = useState('');
  const [formCreditLimit, setFormCreditLimit] = useState('');
  const [saving, setSaving] = useState(false);

  // Confirmation dialog state
  const [confirmDeactivate, setConfirmDeactivate] = useState<Shop | null>(null);

  // Ledger dialog state
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerShop, setLedgerShop] = useState<Shop | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Day counts
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  // Shop detail dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailShop, setDetailShop] = useState<Shop | null>(null);
  const [detailLedgerData, setDetailLedgerData] = useState<LedgerData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Bulk selection state
  const [selectedShopIds, setSelectedShopIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'assign' | 'deactivate' | 'reactivate' | null>(null);
  const [bulkOrderbookerId, setBulkOrderbookerId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await fetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        setOrderbookers(data);
      }
    } catch { /* silent */ }
  }, []);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedDay) params.set('routeDay', selectedDay);
      if (showInactive) params.set('includeInactive', 'true');
      const res = await fetch(`/api/shops?${params.toString()}`);
      if (res.ok) setShops(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [searchQuery, selectedDay, showInactive]);

  const fetchAllShopsForCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/shops');
      if (res.ok) {
        const data: Shop[] = await res.json();
        setAllShops(data);
        const counts: Record<string, number> = {};
        ROUTE_DAYS.forEach((d) => { counts[d] = 0; });
        data.forEach((s) => {
          // Count all days, including non-working days like 'friday'
          if (!counts[s.routeDay]) {
            counts[s.routeDay] = 0;
          }
          counts[s.routeDay]++;
        });
        setDayCounts(counts);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchOrderbookers(); }, [fetchOrderbookers]);
  useEffect(() => { fetchShops(); }, [fetchShops]);
  useEffect(() => { fetchAllShopsForCounts(); }, [fetchAllShopsForCounts]);

  const openAddDialog = () => {
    setEditingShop(null);
    setFormName('');
    setFormOwner('');
    setFormArea('');
    setFormAddress('');
    setFormPhone('');
    setFormRouteDay('');
    setFormOrderbookerId('');
    setFormCreditLimit('');
    setDialogOpen(true);
  };

  const openEditDialog = (shop: Shop) => {
    setEditingShop(shop);
    setFormName(shop.name);
    setFormOwner(shop.ownerName || '');
    setFormArea(shop.area || '');
    setFormAddress(shop.address || '');
    setFormPhone(shop.phone || '');
    setFormRouteDay(shop.routeDay);
    setFormOrderbookerId(shop.orderbooker.id);
    setFormCreditLimit(shop.creditLimit > 0 ? String(shop.creditLimit) : '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formRouteDay || !formOrderbookerId) {
      toast({ title: 'Error', description: 'Name, route day, and orderbooker are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        ownerName: formOwner.trim() || null,
        area: formArea.trim() || null,
        address: formAddress.trim() || null,
        phone: formPhone.trim() || null,
        routeDay: formRouteDay,
        orderbookerId: formOrderbookerId,
        creditLimit: formCreditLimit ? parseFloat(formCreditLimit) : 0,
      };

      const url = '/api/shops';
      const method = editingShop ? 'PATCH' : 'POST';
      const body = editingShop ? { ...payload, id: editingShop.id } : payload;

      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: editingShop ? 'Shop Updated' : 'Shop Created', description: `${formName} has been ${editingShop ? 'updated' : 'created'}` });
      setDialogOpen(false);
      fetchShops();
      fetchAllShopsForCounts();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate || confirmDeactivate.status === 'inactive') return;
    try {
      const res = await fetch('/api/shops', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDeactivate.id, status: 'inactive' }),
      });
      if (res.ok) {
        toast({ title: 'Deactivated', description: `${confirmDeactivate.name} has been deactivated` });
        setConfirmDeactivate(null);
        fetchShops();
        fetchAllShopsForCounts();
      }
    } catch { /* silent */ }
  };

  const openLedger = async (shop: Shop) => {
    setLedgerShop(shop);
    setLedgerData(null);
    setLedgerOpen(true);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/reports/ledger?shopId=${shop.id}`);
      if (res.ok) {
        setLedgerData(await res.json());
      }
    } catch { /* silent */ }
    finally { setLedgerLoading(false); }
  };

  const openShopDetail = async (shop: Shop) => {
    setDetailShop(shop);
    setDetailLedgerData(null);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/reports/ledger?shopId=${shop.id}`);
      if (res.ok) {
        setDetailLedgerData(await res.json());
      }
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  };

  const handleDownloadLedgerPDF = () => {
    if (!ledgerData) return;
    downloadLedgerPDF(ledgerData);
    toast({ title: 'PDF Downloaded', description: `${ledgerData.shop.name} ledger saved` });
  };

  // Bug fix: Include shop's current orderbooker even if inactive
  const orderbookerOptions = editingShop
    ? [
        ...orderbookers.filter((ob) => ob.status === 'active'),
        ...(orderbookers.find((ob) => ob.id === editingShop.orderbooker.id && ob.status !== 'active')
          ? [orderbookers.find((ob) => ob.id === editingShop.orderbooker.id)!]
          : []),
      ]
    : orderbookers.filter((ob) => ob.status === 'active');

  const filteredShops = shops
    .filter((s) => !selectedDay || s.routeDay === selectedDay)
    .filter((s) => !selectedOBFilter || s.orderbooker.id === selectedOBFilter);

  // Bulk selection helpers
  const allSelected = filteredShops.length > 0 && filteredShops.every((s) => selectedShopIds.has(s.id));
  const someSelected = filteredShops.some((s) => selectedShopIds.has(s.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedShopIds(new Set());
    } else {
      setSelectedShopIds(new Set(filteredShops.map((s) => s.id)));
    }
  };

  const toggleSelectShop = (id: string) => {
    setSelectedShopIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedShopIds(new Set());

  // Bulk action handlers
  const openBulkAssign = () => {
    setBulkAction('assign');
    setBulkOrderbookerId('');
    setBulkDialogOpen(true);
  };

  const openBulkDeactivate = () => {
    setBulkAction('deactivate');
    setBulkDialogOpen(true);
  };

  const openBulkReactivate = () => {
    setBulkAction('reactivate');
    setBulkDialogOpen(true);
  };

  const handleBulkAction = async () => {
    if (selectedShopIds.size === 0) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedShopIds);

      if (bulkAction === 'assign') {
        if (!bulkOrderbookerId) {
          toast({ title: 'Error', description: 'Please select an orderbooker', variant: 'destructive' });
          setBulkLoading(false);
          return;
        }
        const res = await fetch('/api/shops/bulk-assign', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopIds: ids, orderbookerId: bulkOrderbookerId }),
        });
        if (res.ok) {
          const obName = orderbookers.find((o) => o.id === bulkOrderbookerId)?.name || 'Unknown';
          toast({ title: 'Bulk Assign Complete', description: `${ids.length} shops assigned to ${obName}` });
          setBulkDialogOpen(false);
          setBulkAction(null);
          clearSelection();
          fetchShops();
          fetchAllShopsForCounts();
        } else {
          const data = await res.json();
          toast({ title: 'Bulk Assign Failed', description: data.error || 'Unknown error. Please try again.', variant: 'destructive' });
        }
      } else if (bulkAction === 'deactivate') {
        const res = await fetch('/api/shops/bulk-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopIds: ids, status: 'inactive' }),
        });
        if (res.ok) {
          toast({ title: 'Bulk Deactivate Complete', description: `${ids.length} shops deactivated` });
          setBulkDialogOpen(false);
          clearSelection();
          fetchShops();
          fetchAllShopsForCounts();
        } else {
          const data = await res.json();
          toast({ title: 'Error', description: data.error, variant: 'destructive' });
        }
      } else if (bulkAction === 'reactivate') {
        const res = await fetch('/api/shops/bulk-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopIds: ids, status: 'active' }),
        });
        if (res.ok) {
          toast({ title: 'Bulk Reactivate Complete', description: `${ids.length} shops reactivated` });
          setBulkDialogOpen(false);
          clearSelection();
          fetchShops();
          fetchAllShopsForCounts();
        } else {
          const data = await res.json();
          toast({ title: 'Error', description: data.error, variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setBulkLoading(false);
    }
  };

  // Analytics computation from allShops
  const activeShops = allShops.filter((s) => s.status === 'active');
  const inactiveShops = allShops.filter((s) => s.status === 'inactive');
  const totalOutstanding = allShops.reduce((sum, s) => sum + s.balance, 0);
  const averageBalance = allShops.length > 0 ? totalOutstanding / allShops.length : 0;
  const highestBalanceShop = allShops.length > 0
    ? allShops.reduce((max, s) => s.balance > max.balance ? s : max, allShops[0])
    : null;

  // Area with most shops
  const areaCounts: Record<string, number> = {};
  allShops.forEach((s) => {
    const area = s.area || 'Unknown';
    areaCounts[area] = (areaCounts[area] || 0) + 1;
  });
  const topArea = Object.entries(areaCounts).sort((a, b) => b[1] - a[1])[0] || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Manage Shops
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{shops.length} shops total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white focus-glow">
            <Plus className="h-4 w-4 mr-2" /> Add Shop
          </Button>
          {filteredShops.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = filteredShops.map((s) => ({
                  Name: s.name,
                  Owner: s.ownerName || '',
                  Area: s.area || '',
                  Phone: s.phone || '',
                  'Route Day': s.routeDay.charAt(0).toUpperCase() + s.routeDay.slice(1),
                  Orderbooker: s.orderbooker.name,
                  Balance: s.balance,
                  Status: s.status.charAt(0).toUpperCase() + s.status.slice(1),
                }));
                exportToCSV(rows, 'shops-list', ['Name', 'Owner', 'Area', 'Phone', 'Route Day', 'Orderbooker', 'Balance', 'Status']);
                toast({ title: 'Exported', description: `${filteredShops.length} shops exported` });
              }}
            >
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in stagger-children">
        {/* Total Active Shops */}
        <Card className="stat-card-green alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Active Shops</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{activeShops.length}</p>
            </div>
            <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 text-[10px] font-bold">
              Live
            </Badge>
          </CardContent>
        </Card>

        {/* Total Inactive Shops */}
        <Card className="stat-card-red alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Inactive Shops</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400">{inactiveShops.length}</p>
            </div>
            <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold">
              Off
            </Badge>
          </CardContent>
        </Card>

        {/* Total Outstanding Balance */}
        <Card className="stat-card-amber alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Average Balance */}
        <Card className="stat-card-blue alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Average Balance</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(Math.round(averageBalance))}</p>
            </div>
          </CardContent>
        </Card>

        {/* Highest Balance Shop */}
        <Card className="stat-card-red alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Highest Balance</p>
              {highestBalanceShop ? (
                <p className="text-sm font-bold text-foreground truncate">{highestBalanceShop.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            {highestBalanceShop && (
              <span className="text-sm font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                {formatCurrency(highestBalanceShop.balance)}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Area with Most Shops */}
        <Card className="stat-card-green alfalah-card-hover animate-card-entrance">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Top Area</p>
              {topArea ? (
                <p className="text-sm font-bold text-foreground truncate">{topArea[0]}</p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            {topArea && (
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                {topArea[1]} shops
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gradient Divider */}
      <div className="divider-gradient" />

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shops..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedOBFilter} onValueChange={(v) => setSelectedOBFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All Orderbookers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Orderbookers</SelectItem>
                {orderbookers.filter((ob) => ob.status === 'active').map((ob) => (
                  <SelectItem key={ob.id} value={ob.id}>
                    <span className="flex items-center gap-2">{ob.name} <span className="text-muted-foreground text-xs">({ob.totalShops})</span></span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant={showInactive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowInactive(!showInactive)}
                className={showInactive ? 'bg-primary text-white' : ''}
              >
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </Button>
              {(searchQuery || selectedDay || selectedOBFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearchQuery(''); setSelectedDay(''); setSelectedOBFilter(''); }}
                  className="text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedDay('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!selectedDay ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              All Days ({Object.values(dayCounts).reduce((a, b) => a + b, 0)})
            </button>
            {ROUTE_DAYS.map((day) => (
              <button key={day} onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${selectedDay === day ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)}
                {(dayCounts[day] || 0) > 0 && (
                  <span className={`inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                    selectedDay === day ? 'bg-white/20 text-primary-foreground' : 'bg-primary/10 text-primary'
                  }`}>
                    {dayCounts[day]}
                  </span>
                )}
                {day === todayDay && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                )}
              </button>
            ))}
            {/* Non-working days (e.g., Friday) */}
            {Object.entries(dayCounts).filter(([d]) => !ROUTE_DAYS.includes(d)).map(([day, count]) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border border-dashed border-amber-300 dark:border-amber-700 ${selectedDay === day ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}
              >
                <AlertTriangle className="h-3 w-3" />
                {day.charAt(0).toUpperCase() + day.slice(1)}
                {(count || 0) > 0 && (
                  <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shops Table */}
      <Card className="card-elevated">
        {(searchQuery || selectedDay || selectedOBFilter) && (
          <div className="px-4 pt-3 pb-0 flex items-center justify-between">
            <span className="text-xs text-muted-foreground animate-fade-in">
              Showing <span className="font-semibold text-foreground">{filteredShops.length}</span> of {shops.length} shops
              {searchQuery && <span className="ml-1">matching &ldquo;<span className="font-medium text-primary">{searchQuery}</span>&rdquo;</span>}
              {selectedOBFilter && (
                <span className="ml-1">
                  for <span className="font-medium text-primary">{orderbookers.find(o => o.id === selectedOBFilter)?.name || 'OB'}</span>
                </span>
              )}
            </span>
          </div>
        )}
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="skeleton-shimmer h-5 w-32" />
                  <Skeleton className="skeleton-shimmer h-5 w-20 hidden sm:block" />
                  <Skeleton className="skeleton-shimmer h-5 w-24 hidden md:block" />
                  <Skeleton className="skeleton-shimmer h-5 w-16 hidden lg:block" />
                  <Skeleton className="skeleton-shimmer h-5 w-24 hidden lg:block" />
                  <div className="flex-1" />
                  <Skeleton className="skeleton-shimmer h-5 w-20" />
                  <Skeleton className="skeleton-shimmer h-6 w-14" />
                  <div className="flex gap-1">
                    <Skeleton className="skeleton-shimmer h-8 w-8 rounded" />
                    <Skeleton className="skeleton-shimmer h-8 w-8 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <div className="empty-state-illustration mx-auto mb-4 h-20 w-20">
                <div className="relative z-10 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-blue-100 dark:from-primary/20 dark:to-blue-900/30 flex items-center justify-center">
                  <Store className="h-9 w-9 text-primary/50 animate-gentle-float" />
                </div>
              </div>
              <p className="font-semibold text-muted-foreground text-sm">No shops match your filters</p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Try adjusting your search query, day filter, or show inactive shops.
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors focus-glow"
                  onClick={() => { setSearchQuery(''); setSelectedDay(''); setShowInactive(false); }}
                >
                  Clear Filters
                </button>
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors focus-glow"
                  onClick={openAddDialog}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Shop
                </button>
              </div>
            </div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow className="data-table-header hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs w-10">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => { if (el) { (el as unknown as HTMLInputElement).indeterminate = someSelected && !allSelected; } }}
                        onCheckedChange={toggleSelectAll}
                        className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-primary data-[state=checked]:border-white"
                      />
                    </TableHead>
                    <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Owner</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Area</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Route</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Credit Limit</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Status</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShops.map((shop, idx) => {
                    const isSelected = selectedShopIds.has(shop.id);
                    return (
                    <TableRow key={shop.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} ${shop.status === 'inactive' ? 'opacity-60' : ''} ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''} ${shop.creditLimit > 0 && shop.balance > shop.creditLimit ? 'border-l-2 border-l-red-500 bg-red-50/50 dark:bg-red-950/20' : ''} hover-scale-102 transition-colors`}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectShop(shop.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{shop.name}</p>
                        {shop.creditLimit > 0 && shop.balance > shop.creditLimit && (
                          <p className="text-[10px] text-red-600 dark:text-red-400 font-medium leading-tight">
                            Over limit ({formatCurrency(shop.balance)} / {formatCurrency(shop.creditLimit)})
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground sm:hidden">{shop.ownerName || ''} &bull; {shop.area || ''}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{shop.ownerName || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{shop.area || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-[10px]">{shop.routeDay.charAt(0).toUpperCase() + shop.routeDay.slice(1)}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{shop.orderbooker.name}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold text-sm ${shop.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(shop.balance)}</span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (!shop.creditLimit || shop.creditLimit <= 0) {
                            return <span className="text-xs text-muted-foreground">—</span>;
                          }
                          if (shop.balance > shop.creditLimit) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] font-bold animate-pulse">
                                  ⚠ Over Limit
                                </Badge>
                                <span className="text-[9px] text-red-600 dark:text-red-400 font-medium">Limit: {formatCurrency(shop.creditLimit)}</span>
                              </div>
                            );
                          }
                          if (shop.balance > shop.creditLimit * 0.8) {
                            return (
                              <div className="flex flex-col gap-0.5">
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-[10px] font-bold">
                                  Near Limit
                                </Badge>
                                <span className="text-[9px] text-muted-foreground">Limit: {formatCurrency(shop.creditLimit)}</span>
                              </div>
                            );
                          }
                          return (
                            <div className="flex flex-col gap-0.5">
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                                Within Limit
                              </Badge>
                              <span className="text-[9px] text-muted-foreground">Limit: {formatCurrency(shop.creditLimit)}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${shop.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                          {shop.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 action-btn-group">
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover-lift btn-ripple" onClick={() => openShopDetail(shop)} title="View Details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover-lift btn-ripple" onClick={() => openEditDialog(shop)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover-lift btn-ripple" onClick={() => openLedger(shop)} title="View Ledger">
                            <BookOpen className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover-lift btn-ripple text-primary" onClick={() => {
                            setSelectedShopId(shop.id);
                            setSelectedShopName(shop.name);
                            setCurrentView('admin-shop-detail');
                          }} title="View Analytics">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </Button>
                          {shop.status === 'active' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover-lift btn-ripple" onClick={() => setConfirmDeactivate(shop)} title="Deactivate">
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedShopIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up lg:left-64">
          <div className="mx-2 mb-2">
            <div className="bg-background border border-border shadow-lg rounded-xl px-4 py-3 flex items-center justify-between gap-3 backdrop-blur-sm bg-background/95">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{selectedShopIds.size}</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {selectedShopIds.size} {selectedShopIds.size === 1 ? 'shop' : 'shops'} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={openBulkAssign}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Assign OB
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                  onClick={openBulkDeactivate}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Deactivate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 hover:border-green-200"
                  onClick={openBulkReactivate}
                >
                  <UserX className="h-3.5 w-3.5" />
                  Reactivate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={clearSelection}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Dialog */}
      <Dialog open={bulkDialogOpen && bulkAction === 'assign'} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) setBulkAction(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Assign Orderbooker
            </DialogTitle>
            <DialogDescription>
              Assign an orderbooker to {selectedShopIds.size} selected {selectedShopIds.size === 1 ? 'shop' : 'shops'}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-sm font-medium mb-2 block">Select Orderbooker</Label>
            <Select value={bulkOrderbookerId} onValueChange={setBulkOrderbookerId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an orderbooker..." />
              </SelectTrigger>
              <SelectContent>
                {orderbookers.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No orderbookers found</div>
                )}
                {orderbookers.map((ob) => (
                  <SelectItem key={ob.id} value={ob.id} disabled={ob.status !== 'active'}>
                    <span className="flex items-center gap-2">
                      {ob.name}
                      {ob.status !== 'active' && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">Inactive</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkAction(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkAction}
              disabled={!bulkOrderbookerId || bulkLoading}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Assign to {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Deactivate Confirmation Dialog */}
      <AlertDialog open={bulkDialogOpen && bulkAction === 'deactivate'} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) setBulkAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-red-500" />
              Deactivate {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedShopIds.size} selected {selectedShopIds.size === 1 ? 'shop' : 'shops'}. They will be hidden from active lists but can be reactivated later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => { setBulkDialogOpen(false); setBulkAction(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              disabled={bulkLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Deactivate {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Reactivate Confirmation Dialog */}
      <AlertDialog open={bulkDialogOpen && bulkAction === 'reactivate'} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) setBulkAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-green-500" />
              Reactivate {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate {selectedShopIds.size} selected {selectedShopIds.size === 1 ? 'shop' : 'shops'}. They will appear in active lists again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => { setBulkDialogOpen(false); setBulkAction(null); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              disabled={bulkLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reactivate {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shop Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Shop Header - Navy Blue Gradient */}
          <div className="bg-gradient-to-r from-[#1E3A8A] to-[#1D4ED8] px-6 py-5 shrink-0">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-white text-lg">
                    <Store className="h-5 w-5" />
                    {detailShop?.name || 'Shop Details'}
                  </DialogTitle>
                  <DialogDescription className="text-blue-200 text-xs mt-1">
                    {detailShop?.area && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {detailShop.area}
                      </span>
                    )}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  {detailShop?.routeDay && (
                    <Badge className="bg-white/15 text-white border-white/20 text-[10px]">
                      {detailShop.routeDay.charAt(0).toUpperCase() + detailShop.routeDay.slice(1)}
                    </Badge>
                  )}
                  <Badge className={`text-[10px] ${detailShop?.status === 'active' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-red-500/20 text-red-200 border-red-400/30'}`}>
                    {detailShop?.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {detailShop?.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </DialogHeader>
          </div>

          {detailLoading ? (
            <div className="flex-1 p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="skeleton-shimmer h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : detailShop && detailLedgerData ? (
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">
                {/* Owner & Phone Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Owner</p>
                      <p className="text-sm font-semibold text-foreground truncate">{detailShop.ownerName || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Phone</p>
                      <p className="text-sm font-semibold text-foreground truncate">{detailShop.phone || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Balance Info Card */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground font-medium">Current Balance</p>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                        {detailShop.orderbooker.name}
                      </Badge>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${detailShop.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatCurrency(detailShop.balance)}
                    </p>

                    {/* Credit Limit Progress Bar */}
                    {detailShop.creditLimit && detailShop.creditLimit > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground font-medium">Credit Limit</span>
                          <span className="text-[11px] font-semibold text-foreground">{formatCurrency(detailShop.creditLimit)}</span>
                        </div>
                        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              detailShop.balance > detailShop.creditLimit
                                ? 'bg-red-500'
                                : detailShop.balance > detailShop.creditLimit * 0.8
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min((detailShop.balance / detailShop.creditLimit) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-medium ${
                            detailShop.balance > detailShop.creditLimit
                              ? 'text-red-600 dark:text-red-400'
                              : detailShop.balance > detailShop.creditLimit * 0.8
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {detailShop.balance > detailShop.creditLimit
                              ? `${formatCurrency(detailShop.balance)} — Over limit by ${formatCurrency(detailShop.balance - detailShop.creditLimit)}`
                              : `${Math.round((detailShop.balance / detailShop.creditLimit) * 100)}% used`
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Mini Balance Trend Sparkline */}
                {detailLedgerData.transactions.length > 0 && (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground font-medium mb-3">Balance Trend (Last 10 Transactions)</p>
                      <div className="h-28 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={(() => {
                              const allTxns = [...detailLedgerData.transactions];
                              const last10 = allTxns.length > 10 ? allTxns.slice(allTxns.length - 10) : allTxns;
                              return last10.map((t) => ({
                                date: new Date(t.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }),
                                balance: t.newBalance,
                                type: t.type,
                                amount: t.amount,
                              }));
                            })()}
                            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                          >
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                              tickLine={false}
                              axisLine={{ stroke: 'hsl(var(--border))' }}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                              width={40}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: '8px',
                                border: '1px solid hsl(var(--border))',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                fontSize: '11px',
                              }}
                              formatter={(value: number, name: string) => [formatCurrency(value), 'Balance']}
                            />
                            <Line
                              type="monotone"
                              dataKey="balance"
                              stroke="#1E3A8A"
                              strokeWidth={2}
                              dot={(props: Record<string, unknown>) => {
                                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { type: string } };
                                const fill = payload.type === 'credit' ? '#F59E0B' : '#10B981';
                                return (
                                  <circle
                                    key={`dot-${cx}-${cy}`}
                                    cx={cx}
                                    cy={cy}
                                    r={4}
                                    fill={fill}
                                    stroke="white"
                                    strokeWidth={2}
                                  />
                                );
                              }}
                              activeDot={{ r: 6, stroke: '#1E3A8A', strokeWidth: 2, fill: 'white' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Credit
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Recovery
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Quick Actions Row */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setDetailOpen(false);
                      openEditDialog(detailShop);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Shop
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setDetailOpen(false);
                      setCurrentView('admin-credit');
                    }}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Post Credit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      downloadLedgerPDF(detailLedgerData);
                      toast({ title: 'PDF Downloaded', description: `${detailShop.name} ledger saved` });
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                  </Button>
                </div>

                {/* Recent Transactions Table */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-0">
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-xs text-muted-foreground font-medium">Recent Transactions (Last 10)</p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="data-table-header hover:bg-transparent">
                          <TableHead className="text-white font-semibold text-[10px]">Type</TableHead>
                          <TableHead className="text-white font-semibold text-[10px]">Amount</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] hidden sm:table-cell">Description</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] hidden md:table-cell">Date</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...detailLedgerData.transactions].reverse().slice(0, 10).map((txn, idx) => (
                          <TableRow key={txn.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} hover-scale-102 transition-colors`}>
                            <TableCell>
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : 'Recovery'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs font-bold ${txn.type === 'credit' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                              </span>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="text-xs text-muted-foreground truncate max-w-[140px] block">
                                {txn.description || '—'}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-xs font-semibold text-foreground tabular-nums">
                                {formatCurrency(txn.newBalance)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {detailLedgerData.transactions.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">
                              No transactions yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-muted-foreground">Failed to load shop details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto dialog-content-animate">
          <DialogHeader>
            <DialogTitle>{editingShop ? 'Edit Shop' : 'Add New Shop'}</DialogTitle>
            <DialogDescription>
              {editingShop ? `Editing ${editingShop.name}` : 'Fill in the shop details below'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shop Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Ali General Store" className="input-enhanced" />
              </div>
              <div className="space-y-2">
                <Label>Owner Name</Label>
                <Input value={formOwner} onChange={(e) => setFormOwner(e.target.value)} placeholder="e.g., Muhammad Ali" className="input-enhanced" />
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Input value={formArea} onChange={(e) => setFormArea(e.target.value)} placeholder="e.g., Gulshan-e-Iqbal" className="input-enhanced" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g., 0300-1234567" className="input-enhanced" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Full address" rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Route Day *</Label>
                <Select value={formRouteDay} onValueChange={setFormRouteDay}>
                  <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                  <SelectContent>
                    {ROUTE_DAYS.map((d) => (
                      <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Orderbooker *</Label>
                <Select value={formOrderbookerId} onValueChange={setFormOrderbookerId}>
                  <SelectTrigger><SelectValue placeholder="Select orderbooker" /></SelectTrigger>
                  <SelectContent>
                    {orderbookerOptions.map((ob) => (
                      <SelectItem key={ob.id} value={ob.id}>
                        {ob.name}{ob.status === 'inactive' ? ' (Inactive)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Credit Limit</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">Rs.</span>
                  <Input
                    type="number"
                    value={formCreditLimit}
                    onChange={(e) => setFormCreditLimit(e.target.value)}
                    placeholder="0 = No limit"
                    className="pl-9 input-enhanced"
                    min="0"
                    step="1000"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Leave 0 for no credit limit</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formRouteDay || !formOrderbookerId} className="bg-primary hover:bg-primary/90 focus-glow">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingShop ? 'Update Shop' : 'Create Shop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation Confirmation Dialog */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={(open) => { if (!open) setConfirmDeactivate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {confirmDeactivate?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {confirmDeactivate?.name}? This will hide them from active views but keep all data intact. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} className="bg-destructive hover:bg-destructive/90 text-white">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ledger Dialog */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            {ledgerData ? (
              <div className="flex items-center justify-between pr-8">
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    {ledgerData.shop.name} — Ledger
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {ledgerData.shop.area || 'No area'} &bull; {ledgerData.shop.orderbooker.name}
                  </DialogDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadLedgerPDF}>
                  <Download className="h-3.5 w-3.5 mr-1" /> PDF
                </Button>
              </div>
            ) : (
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {ledgerShop?.name} — Ledger
                </DialogTitle>
                <DialogDescription>Loading transaction history...</DialogDescription>
              </div>
            )}
          </DialogHeader>
          {ledgerLoading ? (
            <div className="flex-1 p-5 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="skeleton-shimmer h-5 w-14 rounded" />
                    <Skeleton className="skeleton-shimmer h-4 w-40" />
                  </div>
                  <Skeleton className="skeleton-shimmer h-4 w-20" />
                </div>
              ))}
            </div>
          ) : ledgerData ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 px-1">
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Credit</p>
                  <p className="text-sm font-bold text-amber-700">{formatCurrency(ledgerData.summary.totalCredit)}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Recovery</p>
                  <p className="text-sm font-bold text-green-700">{formatCurrency(ledgerData.summary.totalRecovery)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                  <p className="text-sm font-bold text-blue-700">{formatCurrency(ledgerData.summary.currentBalance)}</p>
                </div>
              </div>
              {/* Transactions */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="max-h-[400px]">
                  <div className="divide-y divide-border">
                    {[...ledgerData.transactions].reverse().map((txn) => (
                      <div key={txn.id} className="px-1 py-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : 'Recovery'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{txn.description || '—'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm ${txn.type === 'credit' ? 'text-amber-600' : 'text-green-600'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Bal: {formatCurrency(txn.newBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {ledgerData.transactions.length === 0 && (
                      <div className="text-center py-8 text-sm text-muted-foreground">No transactions yet</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Failed to load ledger data</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
