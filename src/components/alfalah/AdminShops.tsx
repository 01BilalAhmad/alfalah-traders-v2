'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Store,
  Search,
  Plus,
  Pencil,
  Loader2,
  UserMinus,
  CheckCircle,
  XCircle,
  BookOpen,
  Download,
  ArrowLeft,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';

const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  routeDay: string;
  balance: number;
  status: string;
  orderbooker: { id: string; name: string };
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AdminShops() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('');
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
          if (counts[s.routeDay] !== undefined) {
            counts[s.routeDay]++;
          }
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

  const filteredShops = selectedDay
    ? shops.filter((s) => s.routeDay === selectedDay)
    : shops;

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
        <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Shop
        </Button>
      </div>

      {/* Filters */}
      <Card>
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
            <Button
              variant={showInactive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              className={showInactive ? 'bg-primary text-white' : ''}
            >
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedDay('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!selectedDay ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              All Days ({allShops.length})
            </button>
            {ROUTE_DAYS.map((day) => (
              <button key={day} onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedDay === day ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)} ({dayCounts[day] || 0})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shops Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-20 hidden sm:block" />
                  <Skeleton className="h-5 w-24 hidden md:block" />
                  <Skeleton className="h-5 w-16 hidden lg:block" />
                  <Skeleton className="h-5 w-24 hidden lg:block" />
                  <div className="flex-1" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-6 w-14" />
                  <div className="flex gap-1">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredShops.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No shops found</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[520px]">
              <Table>
                <TableHeader>
                  <TableRow className="data-table-header hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Owner</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Area</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Route</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Status</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShops.map((shop, idx) => (
                    <TableRow key={shop.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} ${shop.status === 'inactive' ? 'opacity-60' : ''} transition-colors`}>
                      <TableCell>
                        <p className="font-medium text-sm">{shop.name}</p>
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
                        <Badge className={`text-[10px] ${shop.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                          {shop.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(shop)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLedger(shop)} title="View Ledger">
                            <BookOpen className="h-3.5 w-3.5" />
                          </Button>
                          {shop.status === 'active' && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeactivate(shop)} title="Deactivate">
                              <UserMinus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Ali General Store" />
              </div>
              <div className="space-y-2">
                <Label>Owner Name</Label>
                <Input value={formOwner} onChange={(e) => setFormOwner(e.target.value)} placeholder="e.g., Muhammad Ali" />
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Input value={formArea} onChange={(e) => setFormArea(e.target.value)} placeholder="e.g., Gulshan-e-Iqbal" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g., 0300-1234567" />
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
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim() || !formRouteDay || !formOrderbookerId} className="bg-primary hover:bg-primary/90">
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
                    <Skeleton className="h-5 w-14 rounded" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-4 w-20" />
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
