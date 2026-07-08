'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { getLocalDateString, getYesterdayDateString, formatPKR } from '@/lib/utils';
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
  Receipt,
  Search,
  Plus,
  Pencil,
  Loader2,
  Download,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ArrowDownLeft,
  Banknote,
  CalendarDays,
  AlertTriangle,
  Trash2,
  Store,
  ShieldAlert,
  Printer,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/csv-export';

// ─── Helpers ───
function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Interfaces ───
interface Transaction {
  id: string;
  type: string;
  status: string; // 'pending', 'approved', 'rejected'
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  rejectReason: string | null;
  createdAt: string;
  shop: { id: string; name: string; area: string | null; ownerName?: string | null };
  creator: { id: string; name: string; role: string } | null;
  company?: { id: string; name: string } | null;
}

interface OrderbookerOption {
  id: string;
  name: string;
  status: string;
}

interface ShopOption {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string } | null;
  companyBalances: { companyId: string; companyName: string; balance: number; creditLimit: number }[];
}

type DatePreset = '' | 'today' | 'yesterday' | 'this-week' | 'this-month';
type TypeFilter = 'all' | 'credit' | 'recovery' | 'claim';
type StatusFilter = 'all' | 'approved' | 'pending' | 'rejected';

// ─── Skeleton ───
function TransactionsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-52 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="skeleton-shimmer h-9 w-24" />
          <Skeleton className="skeleton-shimmer h-9 w-24" />
        </div>
      </div>
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="skeleton-shimmer h-10 w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-8 w-20 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardContent className="p-0">
          <div className="p-5 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="skeleton-shimmer h-4 w-8" />
                <Skeleton className="skeleton-shimmer h-4 w-28 hidden sm:block" />
                <Skeleton className="skeleton-shimmer h-4 w-20" />
                <Skeleton className="skeleton-shimmer h-5 w-14 rounded-full" />
                <Skeleton className="skeleton-shimmer h-4 w-20" />
                <Skeleton className="skeleton-shimmer h-4 w-16 hidden md:block" />
                <Skeleton className="skeleton-shimmer h-4 w-16 hidden md:block" />
                <Skeleton className="skeleton-shimmer h-4 w-24 hidden lg:block" />
                <Skeleton className="skeleton-shimmer h-4 w-16 hidden sm:block" />
                <div className="flex gap-1 ml-auto">
                  <Skeleton className="skeleton-shimmer h-8 w-8 rounded" />
                  <Skeleton className="skeleton-shimmer h-8 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ───
export default function AdminTransactions() {
  const { user } = useAppStore();

  // Transaction list state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedOBFilter, setSelectedOBFilter] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DatePreset>('');
  const [customDate, setCustomDate] = useState('');

  // Dropdowns
  const [orderbookers, setOrderbookers] = useState<OrderbookerOption[]>([]);
  const [shops, setShops] = useState<ShopOption[]>([]);

  // Companies for add dialog
  interface CompanyOption {
    id: string;
    name: string;
    status: string;
  }
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTransaction, setEditTransaction] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTransaction, setDeleteTransaction] = useState<Transaction | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Add transaction dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addTab, setAddTab] = useState<'recovery' | 'credit'>('recovery');
  const [addOrderbookerId, setAddOrderbookerId] = useState('');
  const [addShopId, setAddShopId] = useState('');
  const [addCompanyId, setAddCompanyId] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addShopSearch, setAddShopSearch] = useState('');
  const [addShopsLoading, setAddShopsLoading] = useState(false);

  const limit = 50;

  // ─── Data Fetching ───
  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        setOrderbookers(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchShops = useCallback(async () => {
    try {
      const res = await apiFetch('/api/shops');
      if (res.ok) {
        const data = await res.json();
        setShops(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/companies?status=active');
      if (res.ok) {
        const data = await res.json();
        setCompanies(Array.isArray(data.companies) ? data.companies : []);
      }
    } catch { /* silent */ }
  }, []);

  // Fetch shops for a specific orderbooker in the add dialog
  const fetchAddDialogShops = useCallback(async (obId: string) => {
    if (!obId) return;
    setAddShopsLoading(true);
    setAddShopId('');
    setAddShopSearch('');
    setAddCompanyId('');
    try {
      const res = await apiFetch(`/api/shops?orderbookerId=${obId}&showZeroBalance=true&includeInactive=true`);
      if (res.ok) {
        const data = await res.json();
        setShops(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    finally {
      setAddShopsLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));

      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (selectedOBFilter) params.set('orderbookerId', selectedOBFilter);

      // Date handling
      if (datePreset === 'today') {
        params.set('date', getLocalDateString());
      } else if (datePreset === 'yesterday') {
        params.set('date', getYesterdayDateString());
      } else if (datePreset === 'this-week') {
        const today = new Date();
        const dayOfWeek = today.getDay();
        // Monday = start of week
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - diff);
        const startStr = monday.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        params.set('startDate', startStr);
      } else if (datePreset === 'this-month') {
        const today = new Date();
        const startStr = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        params.set('startDate', startStr);
      } else if (customDate) {
        params.set('date', customDate);
      }

      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to fetch transactions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, selectedOBFilter, datePreset, customDate]);

  // Client-side search filter (shop name)
  const filteredTransactions = searchQuery.trim()
    ? transactions.filter((t) =>
        (t.shop?.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : transactions;

  useEffect(() => { fetchOrderbookers(); fetchCompanies(); }, [fetchOrderbookers, fetchCompanies]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [typeFilter, statusFilter, selectedOBFilter, datePreset, customDate]);

  // Computed stats
  const totalCredits = filteredTransactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalClaims = filteredTransactions.filter((t) => t.type === 'claim').reduce((s, t) => s + t.amount, 0);
  const totalRecoveries = filteredTransactions.filter((t) => t.type === 'recovery').reduce((s, t) => s + t.amount, 0);

  const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || selectedOBFilter || datePreset || customDate || searchQuery;

  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setSelectedOBFilter('');
    setDatePreset('');
    setCustomDate('');
  };

  // ─── Edit Handlers ───
  const openEditDialog = (txn: Transaction) => {
    setEditTransaction(txn);
    setEditAmount(String(txn.amount));
    setEditDescription(txn.description || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTransaction || !user) return;
    const newAmount = parseFloat(editAmount);
    if (!newAmount || newAmount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }
    setEditSaving(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editTransaction.id,
          amount: newAmount,
          description: editDescription.trim() || null,
          updatedBy: user.id,
        }),
      });
      if (res.ok) {
        toast({ title: 'Updated', description: 'Transaction updated successfully' });
        setEditDialogOpen(false);
        setEditTransaction(null);
        fetchTransactions();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update transaction', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update transaction', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete Handlers ───
  const openDeleteDialog = (txn: Transaction) => {
    setDeleteTransaction(txn);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTransaction || !user) return;
    setDeleteSaving(true);
    try {
      const res = await apiFetch(`/api/transactions?id=${deleteTransaction.id}&deletedBy=${user.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: 'Transaction deleted successfully' });
        setDeleteDialogOpen(false);
        setDeleteTransaction(null);
        fetchTransactions();
        fetchShops(); // Refresh shop balances
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to delete transaction', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete transaction', variant: 'destructive' });
    } finally {
      setDeleteSaving(false);
    }
  };

  // ─── Add Transaction Handlers ───
  const openAddDialog = () => {
    setAddTab('recovery');
    setAddOrderbookerId('');
    setAddShopId('');
    setAddCompanyId('');
    setAddAmount('');
    setAddDescription('');
    setAddShopSearch('');
    setShops([]); // Clear shops until orderbooker is selected
    setAddDialogOpen(true);
  };

  const handleAddSubmit = async () => {
    if (!addShopId || !addAmount || !user) return;
    const amount = parseFloat(addAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }
    setAddSaving(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: addShopId,
          type: addTab,
          amount,
          description: addDescription.trim() || undefined,
          createdBy: user.id,
          companyId: addCompanyId || undefined,
        }),
      });
      if (res.ok) {
        toast({
          title: 'Transaction Created',
          description: `${addTab === 'credit' ? 'Credit' : 'Recovery'} of ${formatPKR(amount)} recorded`,
        });
        setAddDialogOpen(false);
        fetchTransactions();
        fetchShops();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to create transaction', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create transaction', variant: 'destructive' });
    } finally {
      setAddSaving(false);
    }
  };

  // ─── CSV Export ───
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: 'No Data', description: 'No transactions to export', variant: 'destructive' });
      return;
    }
    const rows = filteredTransactions.map((t) => ({
      Date: formatDateTime(t.createdAt),
      Shop: t.shop?.name || 'Unknown',
      Type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
      Amount: t.amount,
      'Previous Balance': t.previousBalance,
      'New Balance': t.newBalance,
      Description: t.description || '',
      'Created By': t.creator?.name || 'System',
    }));
    exportToCSV(rows, `transactions-${getLocalDateString()}`, [
      'Date', 'Shop', 'Type', 'Amount', 'Previous Balance', 'New Balance', 'Description', 'Created By',
    ]);
    toast({ title: 'Exported', description: `${filteredTransactions.length} transactions exported` });
  };

  // ─── Shop filtering for add dialog ───
  const filteredShopOptions = addShopSearch.trim()
    ? shops.filter((s) =>
        s.name.toLowerCase().includes(addShopSearch.trim().toLowerCase()) ||
        (s.area && s.area.toLowerCase().includes(addShopSearch.trim().toLowerCase())) ||
        (s.ownerName && s.ownerName.toLowerCase().includes(addShopSearch.trim().toLowerCase()))
      )
    : shops;

  // Selected shop details
  const selectedShopDetails = addShopId ? shops.find((s) => s.id === addShopId) : null;

  // ─── Pagination helpers ───
  const startIdx = (page - 1) * limit;
  const endIdx = Math.min(startIdx + limit, total);

  if (loading && transactions.length === 0) {
    return <TransactionsSkeleton />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Transaction Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} transaction{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            onClick={openAddDialog}
            className="bg-primary hover:bg-primary/90 text-white "
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Transaction
          </Button>
          {filteredTransactions.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={handleExportCSV} className="">
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { fetchTransactions(); fetchShops(); }}
            disabled={loading}
            className=""
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" /> Refresh</>}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
        <Card className="card-hover " style={{ animationDelay: '0ms' }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
              <ArrowDownLeft className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Credits</p>
              <p className="text-xl font-bold text-foreground animate-live-pulse number-display">
                {formatPKR(totalCredits)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover " style={{ animationDelay: '50ms' }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Recoveries</p>
              <p className="text-xl font-bold text-foreground animate-live-pulse number-display">
                {formatPKR(totalRecoveries)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover " style={{ animationDelay: '100ms' }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Claims</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400 animate-live-pulse number-display">
                {formatPKR(totalClaims)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover " style={{ animationDelay: '150ms' }}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Net Effect</p>
              <p className={`text-xl font-bold number-display ${totalCredits - totalRecoveries - totalClaims >= 0 ? 'text-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
                {totalCredits - totalRecoveries - totalClaims >= 0 ? '+' : ''}{formatPKR(totalCredits - totalRecoveries - totalClaims)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="divider-gradient" />

      {/* Filters Card */}
      <Card className="card-elevated animate-fade-in">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by shop name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Orderbooker Filter */}
            <Select value={selectedOBFilter} onValueChange={(v) => setSelectedOBFilter(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All Orderbookers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Orderbookers</SelectItem>
                {orderbookers.filter((ob) => ob.status === 'active').map((ob) => (
                  <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type filter buttons */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { value: 'all' as TypeFilter, label: 'All', icon: <Receipt className="h-3.5 w-3.5" /> },
              { value: 'credit' as TypeFilter, label: 'Credits', icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
              { value: 'recovery' as TypeFilter, label: 'Recoveries', icon: <TrendingUp className="h-3.5 w-3.5" /> },
              { value: 'claim' as TypeFilter, label: 'Claims', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setTypeFilter(tab.value)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  typeFilter === tab.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {/* Separator */}
            <div className="w-px bg-border mx-1 shrink-0" />

            {/* Status filter */}
            {[
              { value: 'all' as StatusFilter, label: 'All Status' },
              { value: 'approved' as StatusFilter, label: 'Approved' },
              { value: 'pending' as StatusFilter, label: 'Pending' },
              { value: 'rejected' as StatusFilter, label: 'Rejected' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  statusFilter === tab.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {/* Separator */}
            <div className="w-px bg-border mx-1 shrink-0" />

            {/* Date presets */}
            {[
              { value: '' as DatePreset, label: 'All Time' },
              { value: 'today' as DatePreset, label: 'Today' },
              { value: 'yesterday' as DatePreset, label: 'Yesterday' },
              { value: 'this-week' as DatePreset, label: 'This Week' },
              { value: 'this-month' as DatePreset, label: 'This Month' },
            ].map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  setDatePreset(preset.value);
                  if (preset.value) setCustomDate('');
                }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  datePreset === preset.value && !customDate
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {preset.label}
              </button>
            ))}

            {/* Custom date input */}
            <div className="relative shrink-0">
              <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) setDatePreset('');
                }}
                className="h-8 pl-8 w-36 text-xs"
              />
            </div>
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground animate-fade-in">
                Showing <span className="font-semibold text-foreground">{filteredTransactions.length}</span> of {total} transactions
                {searchQuery && (
                  <span className="ml-1">
                    matching &ldquo;<span className="font-medium text-primary">{searchQuery}</span>&rdquo;
                  </span>
                )}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground text-xs">
                <X className="h-3.5 w-3.5 mr-1" /> Reset Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Table */}
      <Card className="card-elevated animate-fade-in">
        <CardContent className="p-0">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <div className="empty-state-illustration mx-auto mb-4 h-20 w-20">
                <div className="relative z-10 h-20 w-20 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Receipt className="h-9 w-9 text-blue-600 dark:text-blue-400 animate-gentle-float" />
                </div>
              </div>
              <p className="font-semibold text-muted-foreground text-sm">No transactions found</p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                {hasActiveFilters
                  ? 'Try adjusting your filters to find transactions.'
                  : 'Transactions will appear here once credits are posted or recoveries collected.'}
              </p>
              {hasActiveFilters && (
                <button
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors "
                  onClick={resetFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-indigo-800 dark:bg-indigo-950 hover:bg-indigo-800 dark:hover:bg-indigo-950">
                    <TableHead className="text-white font-semibold text-xs w-10">#</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Date & Time</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Shop</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Type</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Amount</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right hidden md:table-cell">Prev Bal</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right hidden md:table-cell">New Bal</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Description</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Created By</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((txn, idx) => (
                    <TableRow
                      key={txn.id}
                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} hover-scale-102 transition-colors ${txn.status === 'rejected' ? 'opacity-50' : ''} ${txn.type === 'claim' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {startIdx + idx + 1}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(txn.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{txn.shop?.name || 'Unknown'}</p>
                          <p className="text-[10px] text-muted-foreground sm:hidden">
                            {txn.shop?.area || ''} &bull; {txn.creator?.name || ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {txn.type === 'credit' ? (
                            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-[10px] w-fit">
                              <ArrowDownLeft className="h-3 w-3 mr-0.5" />
                              Credit
                            </Badge>
                          ) : txn.type === 'claim' ? (
                            <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800 text-[10px] w-fit">
                              <ShieldAlert className="h-3 w-3 mr-0.5" />
                              Claim
                            </Badge>
                          ) : txn.type === 'supplier_collection' ? (
                            <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border-orange-200 dark:border-orange-800 text-[10px] w-fit">
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                              Supp. Coll.
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] w-fit">
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                              Recovery
                            </Badge>
                          )}
                          {txn.status === 'pending' && (
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 text-[9px] w-fit">
                              Pending
                            </Badge>
                          )}
                          {txn.status === 'rejected' && (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[9px] w-fit">
                              Rejected
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold ${txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : txn.type === 'credit' ? 'text-foreground' : 'text-foreground'}`}>
                          {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground hidden md:table-cell">
                        {formatPKR(txn.previousBalance)}
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className={`text-sm font-medium ${txn.newBalance > txn.previousBalance ? 'text-foreground' : txn.newBalance < txn.previousBalance ? 'text-foreground' : ''}`}>
                          {formatPKR(txn.newBalance)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <p className="text-xs text-muted-foreground max-w-[200px] truncate" title={txn.description || ''}>
                          {txn.description || '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {txn.creator?.name || 'System'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 action-btn-group">
                          <Button
            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Generate receipt"
                            onClick={async () => {
                              try {
                                const { downloadClaimReceiptPDF: dlClaim } = await import('@/lib/report-generator');
                                const { downloadRecoveryReceipt } = await import('@/lib/pdf-generator');
                                if (txn.type === 'claim') {
                                  const receiptData = {
                                    claimId: txn.id,
                                    shopName: txn.shop?.name || 'Unknown',
                                    shopOwner: txn.shop?.ownerName || null,
                                    shopArea: txn.shop?.area || null,
                                    orderbookerName: txn.creator?.name || '—',
                                    amount: txn.amount,
                                    previousBalance: txn.previousBalance,
                                    newBalance: txn.newBalance,
                                    description: txn.description || '',
                                    createdAt: txn.createdAt,
                                    adminName: txn.creator?.name || 'Admin',
                                    companyName: txn.company?.name || null,
                                  };
                                  await dlClaim(receiptData);
                                } else {
                                  // For credit/recovery, use existing receipt system
                                  await downloadRecoveryReceipt({
                                    id: txn.id,
                                    shopName: txn.shop?.name || 'Unknown',
                                    shopArea: txn.shop?.area || null,
                                    orderbookerName: txn.creator?.name || '',
                                    amount: txn.amount,
                                    previousBalance: txn.previousBalance,
                                    newBalance: txn.newBalance,
                                    type: txn.type,
                                    description: txn.description || '',
                                    createdAt: txn.createdAt,
                                  });
                                }
                                toast({ title: 'Receipt Generated', description: `Receipt for ${txn.shop?.name || 'Unknown'}` });
                              } catch {
                                toast({ title: 'Error', description: 'Failed to generate receipt', variant: 'destructive' });
                              }
                            }}
                            title="Generate Receipt"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 "
                            aria-label="Edit transaction"
                            onClick={() => openEditDialog(txn)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8  text-muted-foreground hover:text-destructive"
                            aria-label="Delete transaction"
                            onClick={() => openDeleteDialog(txn)}
                            title="Delete"
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
          )}
        </CardContent>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-border/50 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{startIdx + 1}</span> to <span className="font-semibold text-foreground">{endIdx}</span> of <span className="font-semibold text-foreground">{total}</span> transactions
            </p>
            <div className="flex items-center gap-1">
              <Button
            type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <Button
            type="button"
                    key={pageNum}
                    variant={page === pageNum ? 'default' : 'outline'}
                    size="icon"
                    className="h-8 w-8 text-xs"
                    aria-label={`Page ${pageNum}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              {totalPages > 5 && page < totalPages - 2 && (
                <span className="text-muted-foreground text-xs px-1">...</span>
              )}
              {totalPages > 5 && page < totalPages - 2 && (
                <Button
            type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-xs"
                  aria-label={`Page ${totalPages}`}
                  onClick={() => setPage(totalPages)}
                >
                  {totalPages}
                </Button>
              )}
              <Button
            type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Edit Dialog ─── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Transaction
            </DialogTitle>
            <DialogDescription>
              Modify the transaction details. The shop balance will be recalculated automatically.
            </DialogDescription>
          </DialogHeader>
          {editTransaction && (
            <div className="space-y-4">
              {/* Shop name (read-only) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Shop</Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm font-medium">
                  {editTransaction.shop?.name || 'Unknown'}
                  {editTransaction.shop?.area && (
                    <span className="text-muted-foreground text-xs">({editTransaction.shop.area})</span>
                  )}
                </div>
              </div>

              {/* Type (read-only badge) */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <div>
                  {editTransaction.type === 'credit' ? (
                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">Credit</Badge>
                  ) : editTransaction.type === 'claim' ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800">Claim</Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">Recovery</Badge>
                  )}
                </div>
              </div>

              {/* Current amount */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Current Amount</Label>
                <p className={`text-sm font-semibold ${editTransaction.type === 'credit' ? 'text-foreground' : 'text-foreground'}`}>
                  {formatPKR(editTransaction.amount)}
                </p>
              </div>

              {/* New amount */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-amount">New Amount <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Enter new amount"
                  className="tabular-nums"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a note (optional)"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleEditSave}
              disabled={editSaving || !editAmount || parseFloat(editAmount) <= 0}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {editSaving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving...</> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Transaction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete this transaction? This action cannot be undone.
                </p>
                {deleteTransaction && (
                  <div className="rounded-lg border bg-destructive/5 dark:bg-destructive/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Shop</span>
                      <span className="text-sm font-medium">{deleteTransaction.shop?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Type</span>
                      <Badge className={`text-[10px] ${deleteTransaction.type === 'credit' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : deleteTransaction.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'}`}>
                        {deleteTransaction.type.charAt(0).toUpperCase() + deleteTransaction.type.slice(1)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Amount</span>
                      <span className={`text-sm font-bold ${deleteTransaction.type === 'credit' ? 'text-foreground' : 'text-foreground'}`}>
                        {formatPKR(deleteTransaction.amount)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-2.5">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    This will reverse the balance change on the shop. The shop&apos;s current balance will be adjusted accordingly.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleteSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteSaving}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleteSaving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting...</> : <><Trash2 className="h-4 w-4 mr-1.5" /> Delete</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Add Transaction Dialog ─── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Add Transaction
            </DialogTitle>
            <DialogDescription>
              Create a new credit or recovery transaction for a shop.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setAddTab('recovery')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                addTab === 'recovery'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Recovery
            </button>
            <button
              onClick={() => setAddTab('credit')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                addTab === 'credit'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4" />
              Credit
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Step 1: Orderbooker Selection */}
            <div className="space-y-1.5">
              <Label>Orderbooker <span className="text-destructive">*</span></Label>
              <Select
                value={addOrderbookerId}
                onValueChange={(v) => {
                  setAddOrderbookerId(v);
                  if (v) {
                    fetchAddDialogShops(v);
                  } else {
                    setShops([]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select orderbooker first..." />
                </SelectTrigger>
                <SelectContent>
                  {orderbookers.filter((ob) => ob.status === 'active').map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Shop Selection (only after orderbooker is selected) */}
            {addOrderbookerId && (
            <div className="space-y-1.5">
              <Label htmlFor="add-shop">Shop <span className="text-destructive">*</span></Label>

              {addShopsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading shops...</span>
                </div>
              ) : (
              <>
              {/* Selected shop card */}
              {selectedShopDetails && !addShopSearch ? (
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
            type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setAddShopId('');
                        setAddShopSearch('');
                        setAddCompanyId('');
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Banknote className="h-3 w-3 text-muted-foreground" />
                      Balance: <span className="font-bold text-foreground">{formatPKR(selectedShopDetails.balance)}</span>
                    </span>
                    {selectedShopDetails.orderbooker && (
                      <span className="text-muted-foreground">
                        OB: {selectedShopDetails.orderbooker.name}
                      </span>
                    )}
                  </div>
                  {/* Company balances for this shop */}
                  {selectedShopDetails.companyBalances && selectedShopDetails.companyBalances.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground font-medium mb-1">Company Balances:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedShopDetails.companyBalances.map((cb) => (
                          <span key={cb.companyId} className="inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            {cb.companyName}: <span className="font-bold text-foreground">{formatPKR(cb.balance)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Recovery warning: if amount > balance */}
                  {addTab === 'recovery' && addAmount && parseFloat(addAmount) > selectedShopDetails.balance && (
                    <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      Amount exceeds shop balance ({formatPKR(selectedShopDetails.balance)})
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="add-shop"
                      placeholder="Type to search shops by name, area or owner..."
                      value={addShopSearch}
                      onChange={(e) => {
                        setAddShopSearch(e.target.value);
                        if (addShopId) setAddShopId(''); // Clear selection when searching again
                      }}
                      className="pl-9"
                      autoFocus
                    />
                    {addShopSearch && (
                      <Button
            type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                        onClick={() => { setAddShopSearch(''); setAddShopId(''); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="max-h-52 border rounded-lg">
                    <div className="p-1">
                      {filteredShopOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3 text-center">No shops found</p>
                      ) : (
                        filteredShopOptions.map((shop) => (
                          <button
                            key={shop.id}
                            onClick={() => {
                              setAddShopId(shop.id);
                              setAddShopSearch(''); // Clear search to show selected card
                              // Auto-select company if shop has only one company balance
                              if (shop.companyBalances && shop.companyBalances.length === 1) {
                                setAddCompanyId(shop.companyBalances[0].companyId);
                              } else {
                                setAddCompanyId('');
                              }
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm transition-colors ${
                              addShopId === shop.id
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="text-left min-w-0">
                                <p className="font-medium truncate">{shop.name}</p>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  {shop.area && <span>{shop.area}</span>}
                                  {shop.orderbooker && <span>OB: {shop.orderbooker.name}</span>}
                                </div>
                              </div>
                            </div>
                            <span className={`text-xs font-bold tabular-nums shrink-0 ${shop.balance > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {formatPKR(shop.balance)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  {filteredShopOptions.length > 20 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      Scroll to see all {filteredShopOptions.length} shops
                    </p>
                  )}
                  {filteredShopOptions.length > 0 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      {filteredShopOptions.length} shop{filteredShopOptions.length !== 1 ? 's' : ''} found
                    </p>
                  )}
                </>
              )}
              </>
              )}
            </div>
            )}

            {/* Step 3: Company Selection (only for credit, when shop is selected) */}
            {addShopId && addTab === 'credit' && companies.length > 0 && (
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Select
                value={addCompanyId}
                onValueChange={(v) => setAddCompanyId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select company (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Company</SelectItem>
                  {companies.map((co) => (
                    <SelectItem key={co.id} value={co.id}>{co.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Step 4: Amount - only show when shop is selected */}
            {addShopId && (
            <>
            <div className="space-y-1.5">
              <Label htmlFor="add-amount">
                {addTab === 'recovery' ? 'Recovery Amount (Rs.)' : 'Credit Amount (Rs.)'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-amount"
                type="number"
                min="1"
                step="1"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder={addTab === 'recovery' ? 'Enter recovery amount' : 'Enter credit amount'}
                className="tabular-nums text-base h-11"
              />
              {/* Quick preset amounts */}
              <div className="flex gap-1.5 flex-wrap">
                {[500, 1000, 2000, 5000, 10000, 20000].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAddAmount(String(preset))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      addAmount === String(preset)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {preset >= 1000 ? `${preset / 1000}K` : preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="add-desc">Description (optional)</Label>
              <Textarea
                id="add-desc"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Add a note..."
                rows={2}
              />
            </div>
            </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addSaving}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleAddSubmit}
              disabled={addSaving || !addOrderbookerId || !addShopId || !addAmount || parseFloat(addAmount) <= 0}
              className={addTab === 'credit' ? 'bg-slate-700 hover:bg-slate-800 text-white' : 'bg-slate-600 hover:bg-slate-700 text-white'}
            >
              {addSaving ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1.5" /> Add {addTab === 'credit' ? 'Credit' : 'Recovery'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
