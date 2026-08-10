'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Store,
  Search,
  Loader2,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  MapPin,
  Wallet,
  Calendar,
  RefreshCw,
  Equal,
  BookOpen,
  Pencil,
  User,
  Phone,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatPKR, formatLocalDateTime } from '@/lib/utils';
import type { LedgerData } from '@/lib/pdf-generator';

interface TallyShop {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  phone: string | null;
  ownerName: string | null;
  balance: number;
  orderbookerId: string;
  orderbookerName: string;
  orderbookerUsername: string;
  status: string;
  lastTally: {
    tallyDate: string;
    status: string;
    difference: number;
    talliedByName: string | null;
  } | null;
}

interface Orderbooker {
  id: string;
  name: string;
  username: string;
}

interface TallyRow {
  id: string;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  tallyDate: string;
  systemBalance: number;
  shopBalance: number;
  difference: number;
  status: string;
  notes: string | null;
  tellerName: string | null;
  orderbookerName: string | null;
}

interface MarketTallyProps {
  /** When true, show admin-only features (all OBs in filter). */
  isAdmin?: boolean;
}

export default function MarketTally({ isAdmin = false }: MarketTallyProps) {
  const { user } = useAppStore();
  const roleIsAdmin = isAdmin || user?.role === 'admin';

  const [shops, setShops] = useState<TallyShop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [selectedOBId, setSelectedOBId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Recent tallies (today's)
  const [todayTallies, setTodayTallies] = useState<TallyRow[]>([]);
  const [talliesLoading, setTalliesLoading] = useState(true);

  // Tally dialog
  const [tallyDialogShop, setTallyDialogShop] = useState<TallyShop | null>(null);
  const [shopBalanceInput, setShopBalanceInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  // Ledger dialog state
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerShop, setLedgerShop] = useState<TallyShop | null>(null);
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Edit shop (phone + owner name) dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editShop, setEditShop] = useState<TallyShop | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Tellers should NOT see zero-balance shops in the tally list.
  const shouldExcludeZeroBalance = !roleIsAdmin;

  const fetchShops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOBId !== 'all') params.set('orderbookerId', selectedOBId);
      if (shouldExcludeZeroBalance) params.set('excludeZeroBalance', 'true');
      const res = await apiFetch(`/api/tally/shops?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setShops(data.shops || []);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to load shops', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOBId]);

  const fetchTodayTallies = useCallback(async () => {
    setTalliesLoading(true);
    try {
      const params = new URLSearchParams({ today: 'true' });
      if (selectedOBId !== 'all') params.set('orderbookerId', selectedOBId);
      const res = await apiFetch(`/api/tally?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTodayTallies(data.tallies || []);
      } else {
        setTodayTallies([]);
      }
    } catch {
      setTodayTallies([]);
    } finally {
      setTalliesLoading(false);
    }
  }, [selectedOBId]);

  // Fetch OBs (admin: all; teller: their assigned OBs via /api/tally/shops)
  const fetchOrderbookers = useCallback(async () => {
    if (roleIsAdmin) {
      try {
        const res = await apiFetch('/api/orderbookers?status=active');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setOrderbookers(list.map((ob: any) => ({
            id: ob.id,
            name: ob.name,
            username: ob.username,
          })));
        }
      } catch { /* silent */ }
    } else {
      // Teller: derive OBs from the shops endpoint (no filter)
      try {
        const res = await apiFetch('/api/tally/shops');
        if (res.ok) {
          const data = await res.json();
          const allShops: TallyShop[] = data.shops || [];
          const obMap = new Map<string, Orderbooker>();
          for (const s of allShops) {
            if (s.orderbookerId && !obMap.has(s.orderbookerId)) {
              obMap.set(s.orderbookerId, {
                id: s.orderbookerId,
                name: s.orderbookerName,
                username: s.orderbookerUsername,
              });
            }
          }
          setOrderbookers(Array.from(obMap.values()));
        }
      } catch { /* silent */ }
    }
  }, [roleIsAdmin]);

  useEffect(() => {
    fetchOrderbookers();
  }, [fetchOrderbookers]);

  useEffect(() => {
    fetchShops();
    fetchTodayTallies();
  }, [fetchShops, fetchTodayTallies]);

  const filteredShops = useMemo(() => {
    if (!searchTerm) return shops;
    const q = searchTerm.toLowerCase();
    return shops.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q) ||
      (s.ownerName || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q)
    );
  }, [shops, searchTerm]);

  const openTallyDialog = (shop: TallyShop) => {
    setTallyDialogShop(shop);
    setShopBalanceInput(String(shop.balance || 0));
    setNotesInput('');
  };

  const handleTallySubmit = async () => {
    if (!tallyDialogShop) return;
    const balance = parseFloat(shopBalanceInput);
    if (isNaN(balance)) {
      toast({ title: 'Error', description: 'Please enter a valid shop balance', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/tally', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: tallyDialogShop.id,
          shopBalance: balance,
          notes: notesInput.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to record tally', variant: 'destructive' });
        return;
      }
      const result = await res.json();
      toast({
        title: result.status === 'verified' ? 'Verified' : 'Discrepancy Recorded',
        description:
          result.status === 'verified'
            ? `${tallyDialogShop.name} tally matches the system balance.`
            : `${tallyDialogShop.name} tally has a difference of ${formatPKR(result.difference)}.`,
        variant: result.status === 'verified' ? 'default' : 'destructive',
      });
      setTallyDialogShop(null);
      setShopBalanceInput('');
      setNotesInput('');
      // Refresh lists
      fetchShops();
      fetchTodayTallies();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Ledger helpers ────────────────────────────────────────────
  const openLedger = async (shop: TallyShop) => {
    setLedgerShop(shop);
    setLedgerData(null);
    setLedgerOpen(true);
    setLedgerLoading(true);
    try {
      const res = await apiFetch(`/api/reports/ledger?shopId=${shop.id}`);
      if (res.ok) {
        setLedgerData(await res.json());
      } else {
        toast({ title: 'Error', description: 'Could not load ledger', variant: 'destructive' });
        setLedgerOpen(false);
      }
    } catch {
      toast({ title: 'Error', description: 'Network error loading ledger', variant: 'destructive' });
      setLedgerOpen(false);
    } finally {
      setLedgerLoading(false);
    }
  };

  // ─── Edit phone / owner helpers ────────────────────────────────
  const openEditDialog = (shop: TallyShop) => {
    setEditShop(shop);
    setEditPhone(shop.phone || '');
    setEditOwner(shop.ownerName || '');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editShop) return;
    const trimmedPhone = editPhone.trim();
    const trimmedOwner = editOwner.trim();

    // Validation — phone (if provided) must match the same regex as the API.
    if (trimmedPhone && !/^[\d+\-\s()]{7,15}$/.test(trimmedPhone)) {
      toast({ title: 'Invalid Phone', description: 'Use 7–15 digits (spaces, +, -, () allowed).', variant: 'destructive' });
      return;
    }

    // Skip if nothing changed.
    const phoneChanged = trimmedPhone !== (editShop.phone || '');
    const ownerChanged = trimmedOwner !== (editShop.ownerName || '');
    if (!phoneChanged && !ownerChanged) {
      toast({ title: 'Nothing to save', description: 'No changes detected.' });
      setEditOpen(false);
      return;
    }

    setEditSaving(true);
    try {
      const body: Record<string, string> = { shopId: editShop.id };
      if (phoneChanged) body.phone = trimmedPhone;
      if (ownerChanged) body.ownerName = trimmedOwner;

      const res = await apiFetch('/api/shops/phone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to update shop', variant: 'destructive' });
        return;
      }
      toast({
        title: 'Updated',
        description: `${editShop.name} details saved.`,
      });
      setEditOpen(false);
      // Reflect the change locally + refetch to keep lastTally etc. in sync.
      setShops((prev) => prev.map((s) =>
        s.id === editShop.id
          ? { ...s, phone: trimmedPhone || null, ownerName: trimmedOwner || null }
          : s,
      ));
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // Summary for today's tallies
  const summary = useMemo(() => {
    const total = todayTallies.length;
    const verified = todayTallies.filter((t) => t.status === 'verified').length;
    const discrepancy = todayTallies.filter((t) => t.status === 'discrepancy').length;
    return { total, verified, discrepancy };
  }, [todayTallies]);

  // Live difference preview in dialog
  const previewDifference = tallyDialogShop
    ? Math.round(((tallyDialogShop.balance || 0) - (parseFloat(shopBalanceInput) || 0)) * 100) / 100
    : 0;
  const previewStatus = previewDifference === 0 ? 'verified' : 'discrepancy';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Market Tally
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compare system balance with shopkeeper&rsquo;s statement.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { fetchShops(); fetchTodayTallies(); }}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Today&rsquo;s Tallies</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{summary.total}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Verified</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">{summary.verified}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Discrepancies</p>
              <p className="text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">{summary.discrepancy}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search shops by name, area, owner, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="sm:w-64">
          <Select value={selectedOBId} onValueChange={setSelectedOBId}>
            <SelectTrigger>
              <SelectValue placeholder="All orderbookers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {orderbookers.map((ob) => (
                <SelectItem key={ob.id} value={ob.id}>
                  {ob.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Shops Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            Shops Available for Tally
            <Badge variant="secondary" className="ml-1">{filteredShops.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Store className="h-10 w-10 mb-2 opacity-40" />
              <p className="font-medium text-sm">No shops found</p>
              <p className="text-xs mt-1">
                {searchTerm
                  ? 'Try a different search term.'
                  : selectedOBId !== 'all'
                    ? 'No shops assigned to this orderbooker.'
                    : 'No shops available for tally.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto sidebar-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[200px]">Shop</TableHead>
                    <TableHead className="min-w-[140px]">Area</TableHead>
                    <TableHead className="min-w-[120px]">Orderbooker</TableHead>
                    <TableHead className="min-w-[140px] text-right">System Balance</TableHead>
                    <TableHead className="min-w-[160px]">Last Tally</TableHead>
                    <TableHead className="text-right min-w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShops.map((shop) => (
                    <TableRow key={shop.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm leading-tight">{shop.name}</p>
                          {shop.ownerName ? (
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <User className="h-2.5 w-2.5" /> {shop.ownerName}
                            </p>
                          ) : null}
                          {shop.phone ? (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5" /> {shop.phone}
                            </p>
                          ) : (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                              No phone — click edit to add
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {shop.area ? (
                          <div className="flex items-center gap-1 text-xs">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span>{shop.area}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{shop.orderbookerName || '—'}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${
                          shop.balance > 0
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}>
                          {formatPKR(shop.balance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {shop.lastTally ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {formatLocalDateTime(new Date(shop.lastTally.tallyDate))}
                            </span>
                            <Badge
                              className={`text-[9px] w-fit ${
                                shop.lastTally.status === 'verified'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'
                              }`}
                            >
                              {shop.lastTally.status === 'verified'
                                ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                                : <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                              {shop.lastTally.status === 'verified' ? 'Verified' : `Diff ${formatPKR(shop.lastTally.difference)}`}
                            </Badge>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            <Calendar className="h-2.5 w-2.5 mr-1" />
                            Never
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => openLedger(shop)}
                            title="View ledger"
                          >
                            <BookOpen className="h-3.5 w-3.5 mr-1" />
                            Ledger
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => openEditDialog(shop)}
                            title="Edit phone / owner name"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            className="bg-primary hover:bg-primary/90 text-white text-xs h-7"
                            onClick={() => openTallyDialog(shop)}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                            Tally
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Tallies */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Today&rsquo;s Tally History
            <Badge variant="secondary" className="ml-1">{todayTallies.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {talliesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : todayTallies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <ClipboardCheck className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm font-medium">No tallies recorded today</p>
              <p className="text-xs mt-1">Tallied shops will appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto sidebar-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[160px]">Shop</TableHead>
                    <TableHead className="min-w-[140px]">Time</TableHead>
                    <TableHead className="text-right min-w-[120px]">System</TableHead>
                    <TableHead className="text-right min-w-[120px]">Shop</TableHead>
                    <TableHead className="text-right min-w-[120px]">Diff</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayTallies.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{t.shopName}</p>
                          {t.shopArea && (
                            <p className="text-[10px] text-muted-foreground">{t.shopArea}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {formatLocalDateTime(new Date(t.tallyDate))}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums">{formatPKR(t.systemBalance)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums">{formatPKR(t.shopBalance)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${
                          t.difference === 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : t.difference > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {t.difference > 0 ? '+' : ''}{formatPKR(t.difference)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${
                            t.status === 'verified'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {t.status === 'verified'
                            ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            : <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                          {t.status === 'verified' ? 'Verified' : 'Discrepancy'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tally Dialog */}
      <Dialog open={!!tallyDialogShop} onOpenChange={(open) => !open && setTallyDialogShop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Record Tally
            </DialogTitle>
            <DialogDescription>
              Enter the balance as stated by the shopkeeper.
            </DialogDescription>
          </DialogHeader>

          {tallyDialogShop && (
            <div className="space-y-4 py-2">
              {/* Shop info */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{tallyDialogShop.name}</p>
                  <Badge variant="outline" className="text-[10px]">
                    <MapPin className="h-2.5 w-2.5 mr-1" />
                    {tallyDialogShop.area || 'No area'}
                  </Badge>
                </div>
                {tallyDialogShop.ownerName && (
                  <p className="text-xs text-muted-foreground">{tallyDialogShop.ownerName}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  OB: {tallyDialogShop.orderbookerName || '—'}
                </p>
              </div>

              {/* System balance */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                  System Balance (current)
                </Label>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                    {formatPKR(tallyDialogShop.balance)}
                  </p>
                </div>
              </div>

              {/* Shopkeeper stated balance */}
              <div className="space-y-2">
                <Label htmlFor="shopBalanceInput" className="text-xs flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  Shopkeeper&rsquo;s Stated Balance *
                </Label>
                <Input
                  id="shopBalanceInput"
                  type="number"
                  step="any"
                  value={shopBalanceInput}
                  onChange={(e) => setShopBalanceInput(e.target.value)}
                  placeholder="Enter the balance told by shopkeeper"
                  autoFocus
                />
              </div>

              {/* Difference preview */}
              <div className={`p-3 rounded-lg border ${
                previewStatus === 'verified'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    {previewStatus === 'verified'
                      ? <Equal className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      : previewDifference > 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        : <TrendingDown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                    Difference (System &minus; Shop)
                  </span>
                  <span className={`text-base font-bold tabular-nums ${
                    previewStatus === 'verified'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {previewDifference > 0 ? '+' : ''}{formatPKR(previewDifference)}
                  </span>
                </div>
                <Badge
                  className={`text-[10px] ${
                    previewStatus === 'verified'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'
                  }`}
                >
                  {previewStatus === 'verified'
                    ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                    : <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                  {previewStatus === 'verified' ? 'Will be marked Verified' : 'Will be marked Discrepancy'}
                </Badge>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notesInput" className="text-xs">Notes (optional)</Label>
                <Textarea
                  id="notesInput"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Add any remarks about this tally..."
                  rows={2}
                  maxLength={1000}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTallyDialogShop(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleTallySubmit} disabled={submitting || !shopBalanceInput}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Tally
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Ledger Dialog ─────────────────────────────────────── */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {ledgerShop?.name} — Ledger
            </DialogTitle>
            <DialogDescription>
              {ledgerShop?.area || 'No area'}
              {ledgerShop?.orderbookerName ? ` • ${ledgerShop.orderbookerName}` : ''}
            </DialogDescription>
          </DialogHeader>

          {ledgerLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : ledgerData ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-1">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Credit</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.totalCredit)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Recovery</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.totalRecovery)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Claims</p>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">{formatPKR(ledgerData.summary.totalClaims || 0)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.currentBalance)}</p>
                </div>
              </div>

              {/* Company balances (if any) */}
              {(ledgerData.companyBalances || []).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap px-1">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">Company balances:</span>
                  {(ledgerData.companyBalances || []).map((cb) => (
                    <Badge key={cb.companyId} variant="outline" className="text-[10px]">
                      {cb.companyName}: {formatPKR(cb.balance)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Transactions */}
              <div className="flex-1 overflow-y-auto sidebar-scroll -mx-1 px-1">
                {ledgerData.transactions.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No transactions yet</div>
                ) : (
                  <div className="divide-y divide-border">
                    {[...ledgerData.transactions].reverse().map((txn) => (
                      <div key={txn.id} className="py-2.5 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : txn.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'}`}>
                                {txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : 'Recovery'}
                              </Badge>
                              {txn.company && (
                                <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400">
                                  {txn.company.name}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{txn.description || '—'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={`font-bold text-sm ${txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Bal: {formatPKR(txn.newBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Failed to load ledger data</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Phone / Owner Dialog ─────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Shop Details
            </DialogTitle>
            <DialogDescription>
              Update phone number and owner name for {editShop?.name}.
            </DialogDescription>
          </DialogHeader>

          {editShop && (
            <div className="space-y-4 py-2">
              {/* Shop info */}
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1">
                <p className="font-semibold text-sm">{editShop.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {editShop.area || 'No area'}
                  </span>
                  <span>OB: {editShop.orderbookerName || '—'}</span>
                </div>
              </div>

              {/* Owner Name */}
              <div className="space-y-2">
                <Label htmlFor="editOwner" className="text-xs flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Owner Name {editShop.ownerName ? '(update)' : '(add)'}
                </Label>
                <Input
                  id="editOwner"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  placeholder="Enter owner name"
                  maxLength={120}
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="editPhone" className="text-xs flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  Phone Number {editShop.phone ? '(update)' : '(add)'}
                </Label>
                <Input
                  id="editPhone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="03xx-xxxxxxx"
                  inputMode="tel"
                  maxLength={20}
                />
                <p className="text-[10px] text-muted-foreground">
                  7–15 digits. Spaces, +, -, () are allowed.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
