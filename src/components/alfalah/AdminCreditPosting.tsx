'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import {
  CreditCard,
  TrendingUp,
  Store,
  Search,
  Plus,
  Loader2,
  Wallet,
  PackagePlus,
  Printer,
  CheckCircle2,
  CalendarDays,
  Users,
  Receipt,
  X,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
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
  totalShops: number;
  totalOutstanding: number;
}

interface PostedReceipt {
  shopName: string;
  shopArea: string | null;
  amount: number;
  description: string;
  newBalance: number;
  previousBalance: number;
  postedAt: string;
  postedBy: string;
}

interface TodaySummaryItem {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  totalAmount: number;
  transactionCount: number;
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) + ' at ' + d.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function AdminCreditPosting() {
  const { user, creditSessionCount, incrementCreditSessionCount } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedOrderbooker, setSelectedOrderbooker] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [postingCredit, setPostingCredit] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');

  // Receipt state
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [postedReceipt, setPostedReceipt] = useState<PostedReceipt | null>(null);

  // Today's summary state
  const [todaySummary, setTodaySummary] = useState<TodaySummaryItem[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayUniqueShops, setTodayUniqueShops] = useState(0);
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false);

  // Day counts for badges
  const [dayCounts, setDayCounts] = useState<Record<string, number>>({});

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const todayDay = ROUTE_DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await fetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        setOrderbookers(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchShops = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOrderbooker && selectedOrderbooker !== 'all') {
        params.set('orderbookerId', selectedOrderbooker);
      }
      if (selectedDay) {
        params.set('routeDay', selectedDay);
      }
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim());
      }
      const res = await fetch(`/api/shops?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setShops(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedOrderbooker, selectedDay, debouncedSearch]);

  // Fetch today's posting summary
  const fetchTodaySummary = useCallback(async () => {
    setTodaySummaryLoading(true);
    try {
      const todayDate = getTodayDateString();
      const params = new URLSearchParams();
      params.set('date', todayDate);
      params.set('limit', '100');
      params.set('type', 'credit');
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const txns = data.transactions || [];

        // Aggregate by shop
        const shopMap = new Map<string, TodaySummaryItem>();
        let total = 0;

        txns.forEach((txn: { shop: { id: string; name: string; area: string | null }; amount: number }) => {
          const existing = shopMap.get(txn.shop.id);
          if (existing) {
            existing.totalAmount += txn.amount;
            existing.transactionCount += 1;
          } else {
            shopMap.set(txn.shop.id, {
              shopId: txn.shop.id,
              shopName: txn.shop.name,
              shopArea: txn.shop.area,
              totalAmount: txn.amount,
              transactionCount: 1,
            });
          }
          total += txn.amount;
        });

        const summaryItems = Array.from(shopMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
        setTodaySummary(summaryItems);
        setTodayTotal(total);
        setTodayUniqueShops(shopMap.size);
      }
    } catch {
      // silent
    } finally {
      setTodaySummaryLoading(false);
    }
  }, []);

  // Debounced search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  // Fetch day counts when orderbooker changes
  const fetchDayCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedOrderbooker && selectedOrderbooker !== 'all') {
        params.set('orderbookerId', selectedOrderbooker);
      }
      const res = await fetch(`/api/shops?${params.toString()}`);
      if (res.ok) {
        const data: Shop[] = await res.json();
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
  }, [selectedOrderbooker]);

  useEffect(() => {
    fetchOrderbookers();
  }, [fetchOrderbookers]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  useEffect(() => {
    fetchDayCounts();
  }, [fetchDayCounts]);

  useEffect(() => {
    fetchTodaySummary();
  }, [fetchTodaySummary]);

  const totalOutstanding = shops.reduce((sum, s) => sum + s.balance, 0);

  const handleOpenCreditDialog = (shop: Shop) => {
    setSelectedShop(shop);
    setCreditAmount('');
    setCreditDescription('');
    setCreditDialogOpen(true);
  };

  const handlePostCredit = async () => {
    if (!selectedShop || !creditAmount || parseFloat(creditAmount) <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!user) return;

    setPostingCredit(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          type: 'credit',
          amount: parseFloat(creditAmount),
          description: creditDescription.trim() || 'Goods supplied',
          createdBy: user.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to post credit', variant: 'destructive' });
        return;
      }

      const txn = await res.json();
      const amount = parseFloat(creditAmount);
      const desc = creditDescription.trim() || 'Goods supplied';

      incrementCreditSessionCount();

      // Build receipt data
      setPostedReceipt({
        shopName: selectedShop.name,
        shopArea: selectedShop.area,
        amount,
        description: desc,
        previousBalance: txn.previousBalance ?? selectedShop.balance,
        newBalance: txn.newBalance ?? (selectedShop.balance + amount),
        postedAt: new Date().toISOString(),
        postedBy: user.name || 'Admin',
      });

      // Close credit dialog, open receipt dialog
      setCreditDialogOpen(false);
      setReceiptDialogOpen(true);

      // Refresh data
      fetchShops();
      fetchTodaySummary();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setPostingCredit(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Credit Posting</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Post credit entries for shops</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <PackagePlus className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Posted This Session</p>
              <p className="text-xl font-bold text-foreground">{creditSessionCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Shops Listed</p>
              <p className="text-xl font-bold text-foreground">{shops.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedOrderbooker} onValueChange={setSelectedOrderbooker}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Select Orderbooker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orderbookers</SelectItem>
                {orderbookers.map((ob) => (
                  <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shop by name or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Day Tabs with counts */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedDay('')}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                !selectedDay
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              All Days
            </button>
            {ROUTE_DAYS.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedDay === day
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
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
          </div>
        </CardContent>
      </Card>

      {/* Shop List */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Shops
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shops.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No shops found matching your criteria</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow className="data-table-header hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Area</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Route</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shops.map((shop, idx) => (
                    <TableRow key={shop.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} transition-colors`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{shop.name}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{shop.area || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{shop.area || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-[10px] font-medium">{shop.routeDay.charAt(0).toUpperCase() + shop.routeDay.slice(1)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold text-sm ${shop.balance > 0 ? 'text-red-600' : shop.balance < 0 ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatCurrency(shop.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                          onClick={() => handleOpenCreditDialog(shop)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Credit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Today's Posting Summary */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Today&apos;s Posting Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {todaySummaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : todaySummary.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-9 w-9 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No credit postings today yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30">
                  <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                    <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Total Credit Posted</p>
                    <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{formatCurrency(todayTotal)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/10 dark:border-primary/20">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-primary dark:text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">Unique Shops Credited</p>
                    <p className="text-lg font-bold text-primary dark:text-primary-foreground">{todayUniqueShops}</p>
                  </div>
                </div>
              </div>

              {/* Shop-wise breakdown */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="data-table-header hover:bg-transparent">
                      <TableHead className="text-white font-semibold text-xs">#</TableHead>
                      <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                      <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Area</TableHead>
                      <TableHead className="text-white font-semibold text-xs text-center hidden sm:table-cell">Entries</TableHead>
                      <TableHead className="text-white font-semibold text-xs text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todaySummary.map((item, idx) => (
                      <TableRow key={item.shopId} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} transition-colors`}>
                        <TableCell className="text-xs text-muted-foreground font-medium">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{item.shopName}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.shopArea || '—'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-center text-sm text-muted-foreground">{item.transactionCount}</TableCell>
                        <TableCell className="text-right font-semibold text-sm text-red-600">{formatCurrency(item.totalAmount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-md no-print">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Post Credit
            </DialogTitle>
            <DialogDescription>
              Add credit entry for <span className="font-semibold text-foreground">{selectedShop?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            {selectedShop && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Current Balance</span>
                <span className="font-bold text-sm">{formatCurrency(selectedShop.balance)}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="creditAmount">Amount (Rs.)</Label>
              <Input
                id="creditAmount"
                type="number"
                placeholder="Enter amount"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                min="1"
                step="1"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditDesc">Description</Label>
              <Textarea
                id="creditDesc"
                placeholder="e.g., Goods supplied - Rice 10kg x 5"
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 no-print">
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePostCredit}
              disabled={postingCredit || !creditAmount || parseFloat(creditAmount) <= 0}
              className="bg-primary hover:bg-primary/90"
            >
              {postingCredit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Post Credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Confirmation Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="no-print">
            <DialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Credit Posted Successfully
            </DialogTitle>
            <DialogDescription>
              Credit has been recorded. You can print a receipt for this transaction.
            </DialogDescription>
          </DialogHeader>

          {/* Receipt Content - visible on screen AND during print */}
          {postedReceipt && (
            <div className="receipt-content">
              {/* === Screen-only success badge === */}
              <div className="no-print flex items-center justify-center gap-2 py-3 mb-2">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <div>
                  <p className="font-semibold text-green-700 dark:text-green-400 text-sm">Transaction Successful</p>
                  <p className="text-xs text-muted-foreground">Credit has been recorded</p>
                </div>
              </div>

              {/* === Print-optimized receipt === */}
              <div className="print-only">
                <div className="text-center mb-4">
                  <p className="text-xs text-muted-foreground mb-1">— Credit Receipt —</p>
                </div>
              </div>

              {/* Navy blue branded header */}
              <div className="alfalah-gradient rounded-t-lg px-5 py-4 text-white">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Store className="h-5 w-5 text-white" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-lg tracking-wide">AL-FALAH TRADERS</h3>
                    <p className="text-white/70 text-xs">Credit Posting Receipt</p>
                  </div>
                </div>
              </div>

              {/* Receipt details table */}
              <div className="border-x border-b border-border/60 bg-white dark:bg-card">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border/40">
                      <td className="px-5 py-2.5 text-muted-foreground font-medium w-2/5">Shop Name</td>
                      <td className="px-5 py-2.5 font-semibold text-right">{postedReceipt.shopName}</td>
                    </tr>
                    {postedReceipt.shopArea && (
                      <tr className="border-b border-border/40">
                        <td className="px-5 py-2.5 text-muted-foreground font-medium">Area</td>
                        <td className="px-5 py-2.5 text-right text-sm">{postedReceipt.shopArea}</td>
                      </tr>
                    )}
                    <tr className="border-b border-border/40">
                      <td className="px-5 py-2.5 text-muted-foreground font-medium">Previous Balance</td>
                      <td className="px-5 py-2.5 font-medium text-right">{formatCurrency(postedReceipt.previousBalance)}</td>
                    </tr>
                    <tr className="border-b border-border/40 bg-amber-50 dark:bg-amber-950/20">
                      <td className="px-5 py-3 text-amber-800 dark:text-amber-300 font-semibold">Credit Amount</td>
                      <td className="px-5 py-3 text-right font-bold text-amber-700 dark:text-amber-300 text-base">{formatCurrency(postedReceipt.amount)}</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="px-5 py-2.5 text-muted-foreground font-medium">New Balance</td>
                      <td className="px-5 py-2.5 font-bold text-right text-red-600 dark:text-red-400">{formatCurrency(postedReceipt.newBalance)}</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="px-5 py-2.5 text-muted-foreground font-medium">Description</td>
                      <td className="px-5 py-2.5 text-right text-sm">{postedReceipt.description}</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="px-5 py-2.5 text-muted-foreground font-medium">Date &amp; Time</td>
                      <td className="px-5 py-2.5 text-right text-sm">{formatDateTime(postedReceipt.postedAt)}</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-2.5 text-muted-foreground font-medium">Posted By</td>
                      <td className="px-5 py-2.5 text-right text-sm font-medium">{postedReceipt.postedBy}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="border-t border-dashed border-border/60 px-5 py-3 text-center">
                <p className="text-xs text-muted-foreground italic">Thank you for your business!</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">Al-Falah Traders — Smart Credit Management</p>
              </div>

              {/* Print-only decorative bottom */}
              <div className="print-only">
                <div className="text-center mt-4 pt-3 border-t border-dashed border-gray-300">
                  <p className="text-[10px] text-gray-400">This is a computer-generated receipt and does not require a signature.</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 no-print">
            <Button variant="outline" onClick={() => setReceiptDialogOpen(false)} className="gap-1.5">
              <X className="h-4 w-4" />
              Close
            </Button>
            <Button onClick={handlePrintReceipt} className="bg-primary hover:bg-primary/90 gap-1.5">
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
