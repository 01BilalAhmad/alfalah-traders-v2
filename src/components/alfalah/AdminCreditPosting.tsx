'use client';

import { useState, useEffect, useCallback } from 'react';
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

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AdminCreditPosting() {
  const { user, creditSessionCount, incrementCreditSessionCount } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedOrderbooker, setSelectedOrderbooker] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [postingCredit, setPostingCredit] = useState(false);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');

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
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
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
  }, [selectedOrderbooker, selectedDay, searchQuery]);

  useEffect(() => {
    fetchOrderbookers();
  }, [fetchOrderbookers]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

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

      incrementCreditSessionCount();
      toast({
        title: 'Credit Posted',
        description: `Rs. ${parseFloat(creditAmount).toLocaleString()} credit posted to ${selectedShop.name}`,
      });
      setCreditDialogOpen(false);
      fetchShops();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setPostingCredit(false);
    }
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

          {/* Day Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedDay('')}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
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
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  selectedDay === day
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)}
                {day === todayDay && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
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
                  {shops.map((shop) => (
                    <TableRow key={shop.id} className="hover:bg-muted/50 transition-colors">
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

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
          <DialogFooter className="gap-2">
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
    </div>
  );
}
