'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
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
  Zap,
  BarChart3,
  AlertTriangle,
  Pencil,
  Trash2,
  Clock,
  Building2,
  ArrowRightLeft,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { WORKING_DAYS, getTodayRouteDay, validateTransaction, TRANSACTION_RULES, getCreditLimitStatus } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

const ROUTE_DAYS = [...WORKING_DAYS];

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string };
  companyBalances?: { companyId: string; companyName: string; balance: number; creditLimit: number }[];
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

interface CreditLimitWarning {
  limit: number;
  currentBalance: number;
  exceeded: boolean;
}

interface EditableTransaction {
  id: string;
  amount: string;
  description: string;
  createdAt: string;
  companyId: string | null;
  companyName: string | null;
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

/** Highlight matching text in shop name */
function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-primary">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

interface Company {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

export default function AdminCreditPosting() {
  const { user, creditSessionCount, incrementCreditSessionCount } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedOrderbooker, setSelectedOrderbooker] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
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

  // Quick Post Mode state
  const [quickPostMode, setQuickPostMode] = useState(false);
  const [quickPostShops, setQuickPostShops] = useState(0);
  const [quickPostTotal, setQuickPostTotal] = useState(0);
  const [quickPostJustPosted, setQuickPostJustPosted] = useState(false);

  // Credit limit warning state
  const [creditLimitWarning, setCreditLimitWarning] = useState<CreditLimitWarning | null>(null);

  // Duplicate credit detection state
  const [duplicateCreditWarning, setDuplicateCreditWarning] = useState<{ shopName: string; todayTotal: number } | null>(null);

  // Validation state
  const [amountError, setAmountError] = useState<string>('');
  const [descriptionError, setDescriptionError] = useState<string>('');
  const [shopTodayCredits, setShopTodayCredits] = useState(0);
  const [dailyCapOverrideOpen, setDailyCapOverrideOpen] = useState(false);
  const [pendingOverrideAmount, setPendingOverrideAmount] = useState(0);

  // Session timer state
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Edit transaction state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTransactions, setEditTransactions] = useState<EditableTransaction[]>([]);
  const [editShopName, setEditShopName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editConfirmIndex, setEditConfirmIndex] = useState(-1);

  // Delete transaction state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TodaySummaryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const quickPostTimerRef = useRef<NodeJS.Timeout | null>(null);

  const todayDay = getTodayRouteDay();

  // Total shops for current filter (without search)
  const totalShopsForFilter = selectedDay
    ? (dayCounts[selectedDay] || 0)
    : Object.values(dayCounts).reduce((a, b) => a + b, 0);

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        setOrderbookers(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/companies?status=active');
      if (res.ok) {
        const data = await res.json();
        const comps = data.companies || [];
        setCompanies(comps);
        // Auto-select first company if available
        if (comps.length > 0 && !selectedCompany) {
          setSelectedCompany(comps[0].id);
        }
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
      params.set('balanceOnly', 'false'); // Admin credit posting needs all shops including zero balance
      const res = await apiFetch(`/api/shops?${params.toString()}`);
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
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
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
      params.set('balanceOnly', 'false'); // Admin needs all shops
      const res = await apiFetch(`/api/shops?${params.toString()}`);
      if (res.ok) {
        const data: Shop[] = await res.json();
        const counts: Record<string, number> = {};
        ROUTE_DAYS.forEach((d) => { counts[d] = 0; });
        data.forEach((s) => {
          for (const day of s.routeDays) {
            if (!counts[day]) counts[day] = 0;
            counts[day]++;
          }
        });
        setDayCounts(counts);
      }
    } catch { /* silent */ }
  }, [selectedOrderbooker]);

  // Session timer - starts on mount, shows elapsed time
  useEffect(() => {
    sessionTimerRef.current = setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, []);

  const sessionMinutes = Math.floor(sessionSeconds / 60);
  const sessionHrs = Math.floor(sessionMinutes / 60);
  const sessionMins = sessionMinutes % 60;
  const sessionSecs = sessionSeconds % 60;
  const sessionTimeString = sessionHrs > 0
    ? `${sessionHrs}:${String(sessionMins).padStart(2, '0')}:${String(sessionSecs).padStart(2, '0')}`
    : `${String(sessionMins).padStart(2, '0')}:${String(sessionSecs).padStart(2, '0')}`;

  useEffect(() => {
    fetchOrderbookers();
    fetchCompanies();
  }, [fetchOrderbookers, fetchCompanies]);

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
  const averageBalance = shops.length > 0 ? totalOutstanding / shops.length : 0;

  const checkDuplicateCreditToday = useCallback(async (shop: Shop) => {
    try {
      const todayDate = getTodayDateString();
      const params = new URLSearchParams();
      params.set('shopId', shop.id);
      params.set('date', todayDate);
      params.set('type', 'credit');
      params.set('limit', '100');
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const txns = data.transactions || [];
        const totalToday = txns.reduce((s: number, t: { amount: number }) => s + t.amount, 0);
        setShopTodayCredits(totalToday);
        if (txns.length > 0) {
          setDuplicateCreditWarning({ shopName: shop.name, todayTotal: totalToday });
        } else {
          setDuplicateCreditWarning(null);
        }
      }
    } catch {
      setDuplicateCreditWarning(null);
      setShopTodayCredits(0);
    }
  }, []);

  const handleOpenCreditDialog = (shop: Shop) => {
    setSelectedShop(shop);
    setCreditAmount('');
    setCreditDescription('');
    setQuickPostJustPosted(false);
    setCreditLimitWarning(null);
    setDuplicateCreditWarning(null);
    setAmountError('');
    setDescriptionError('');
    setShopTodayCredits(0);
    setCreditDialogOpen(true);
    checkDuplicateCreditToday(shop);
  };

  // Format amount as currency string while typing
  const formatAmountDisplay = (value: string): string => {
    const num = parseFloat(value);
    if (isNaN(num) || value === '') return '';
    return `Rs. ${num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Validate amount input and set inline error
  const validateAmountInput = (value: string): string => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return '';
    if (num < TRANSACTION_RULES.MIN_AMOUNT) {
      return `Minimum amount is Rs. ${TRANSACTION_RULES.MIN_AMOUNT.toLocaleString()}`;
    }
    if (num > TRANSACTION_RULES.MAX_AMOUNT) {
      return `Maximum amount is Rs. ${TRANSACTION_RULES.MAX_AMOUNT.toLocaleString()}`;
    }
    return '';
  };

  // Handle daily cap override confirmed
  const handleDailyCapOverrideConfirm = async () => {
    setDailyCapOverrideOpen(false);
    await submitCreditPost(pendingOverrideAmount);
  };

  // Actual API call for posting credit
  const submitCreditPost = async (amount: number) => {
    if (!selectedShop || !user) return;

    setPostingCredit(true);
    try {
      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          type: 'credit',
          amount,
          description: creditDescription.trim() || 'Goods supplied',
          createdBy: user.id,
          companyId: selectedCompany || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to post credit', variant: 'destructive' });
        return;
      }

      const txn = await res.json();
      const desc = creditDescription.trim() || 'Goods supplied';

      // Handle warnings from API (e.g., inactive orderbooker)
      if (txn.warnings && Array.isArray(txn.warnings)) {
        txn.warnings.forEach((w: string) => {
          toast({ title: 'Warning', description: w });
        });
      }

      // Handle credit limit warning from API
      if (txn.creditLimitWarning) {
        setCreditLimitWarning(txn.creditLimitWarning);
      } else {
        setCreditLimitWarning(null);
      }

      incrementCreditSessionCount();

      if (quickPostMode) {
        // Quick Post Mode: stay in dialog, clear amount, show checkmark
        setQuickPostShops((prev) => prev + 1);
        setQuickPostTotal((prev) => prev + amount);
        setCreditAmount('');
        setCreditDescription('');
        setAmountError('');
        setDescriptionError('');
        setQuickPostJustPosted(true);

        // Clear checkmark after 1.5s
        if (quickPostTimerRef.current) clearTimeout(quickPostTimerRef.current);
        quickPostTimerRef.current = setTimeout(() => {
          setQuickPostJustPosted(false);
        }, 1500);

        // Refresh data in background
        fetchShops();
        fetchTodaySummary();
        // Don't close dialog — stay ready for next input
      } else {
        // Normal mode: show receipt dialog
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

        setCreditDialogOpen(false);
        setReceiptDialogOpen(true);

        fetchShops();
        fetchTodaySummary();
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setPostingCredit(false);
    }
  };

  const handlePostCredit = async () => {
    if (!selectedShop || !creditAmount || parseFloat(creditAmount) <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!user) return;

    // Require company selection when companies exist
    if (companies.length > 0 && !selectedCompany) {
      toast({ title: 'Company Required', description: 'Please select a company at the top before posting credit', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(creditAmount);

    // Client-side validation
    // 1. Amount range
    const amtError = validateAmountInput(creditAmount);
    if (amtError) {
      setAmountError(amtError);
      toast({ title: 'Validation Error', description: amtError, variant: 'destructive' });
      return;
    }
    setAmountError('');

    // 2. Description max length (optional field)
    if (creditDescription.trim() && creditDescription.trim().length > TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH) {
      setDescriptionError(`Description must be ${TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH} characters or less`);
      toast({ title: 'Validation Error', description: `Description must be ${TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH} characters or less`, variant: 'destructive' });
      return;
    }
    setDescriptionError('');

    // 3. Client-side daily credit cap check (with override option)
    const combinedToday = shopTodayCredits + amount;
    if (combinedToday > TRANSACTION_RULES.DAILY_CREDIT_CAP) {
      setPendingOverrideAmount(amount);
      setDailyCapOverrideOpen(true);
      return;
    }

    // 4. Run the validateTransaction utility for any additional checks
    const validation = validateTransaction({
      amount,
      type: 'credit',
      shopBalance: selectedShop.balance,
      shopCreditLimit: selectedShop.creditLimit > 0 ? selectedShop.creditLimit : null,
      todayShopCredits: shopTodayCredits,
    });

    if (validation.errors.length > 0) {
      toast({ title: 'Validation Error', description: validation.errors[0], variant: 'destructive' });
      return;
    }

    if (validation.warnings.length > 0) {
      // Show warnings but proceed
      validation.warnings.forEach((w) => {
        toast({ title: 'Warning', description: w });
      });
    }

    await submitCreditPost(amount);
  };

  const handleExitQuickPost = () => {
    setQuickPostMode(false);
    setQuickPostShops(0);
    setQuickPostTotal(0);
    setQuickPostJustPosted(false);
    setCreditDialogOpen(false);
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  // Edit transaction handlers
  const handleOpenEditDialog = async (item: TodaySummaryItem) => {
    try {
      const todayDate = getTodayDateString();
      const params = new URLSearchParams();
      params.set('shopId', item.shopId);
      params.set('date', todayDate);
      params.set('type', 'credit');
      params.set('limit', '100');
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const txns = data.transactions || [];
        setEditTransactions(txns.map((t: { id: string; amount: number; description: string; createdAt: string; companyId?: string | null; company?: { id: string; name: string } | null }) => ({
          id: t.id,
          amount: String(t.amount),
          description: t.description,
          createdAt: t.createdAt,
          companyId: t.companyId || (t.company?.id) || null,
          companyName: t.company?.name || null,
        })));
        setEditShopName(item.shopName);
        setEditDialogOpen(true);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load transactions', variant: 'destructive' });
    }
  };

  const handleUpdateTransactionAmount = (index: number, value: string) => {
    setEditTransactions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount: value };
      return updated;
    });
  };

  const handleUpdateTransactionDescription = (index: number, value: string) => {
    setEditTransactions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], description: value };
      return updated;
    });
  };

  const handleUpdateTransactionCompany = (index: number, companyId: string) => {
    setEditTransactions((prev) => {
      const updated = [...prev];
      const companyName = companies.find(c => c.id === companyId)?.name || null;
      updated[index] = { ...updated[index], companyId, companyName };
      return updated;
    });
  };

  const handleEditSave = () => {
    const txn = editTransactions[editConfirmIndex];
    if (!txn || !user) return;

    const newAmount = parseFloat(txn.amount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid amount', variant: 'destructive' });
      return;
    }

    setEditLoading(true);
    const patchBody: Record<string, unknown> = {
      id: txn.id,
      updatedBy: user.id,
      newCompanyId: txn.companyId,
    };

    // Include amount and description in the patch
    patchBody.amount = newAmount;
    patchBody.description = txn.description.trim() || 'Goods supplied';

    apiFetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d: { error?: string }) => { throw new Error(d.error || 'Failed to update'); });
        return res.json();
      })
      .then(() => {
        toast({ title: 'Updated', description: `Transaction for ${editShopName} updated successfully` });
        setEditConfirmOpen(false);
        setEditDialogOpen(false);
        fetchTodaySummary();
        fetchShops();
      })
      .catch((err: Error) => {
        toast({ title: 'Error', description: err.message || 'Failed to update transaction', variant: 'destructive' });
      })
      .finally(() => {
        setEditLoading(false);
      });
  };

  // Delete transaction handlers
  const handleOpenDeleteDialog = (item: TodaySummaryItem) => {
    setDeleteTarget(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !user) return;

    setDeleting(true);
    try {
      const todayDate = getTodayDateString();
      const params = new URLSearchParams();
      params.set('shopId', deleteTarget.shopId);
      params.set('date', todayDate);
      params.set('type', 'credit');
      params.set('limit', '100');
      const res = await apiFetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const txns = data.transactions || [];

        // Delete each transaction for this shop today
        const deletePromises = txns.map((t: { id: string }) =>
          apiFetch(`/api/transactions?id=${t.id}&deletedBy=${user!.id}`, { method: 'DELETE' })
        );
        await Promise.all(deletePromises);

        toast({ title: 'Deleted', description: `All credit entries for ${deleteTarget.shopName} have been removed` });
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        fetchTodaySummary();
        fetchShops();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete transactions', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const isSearchActive = debouncedSearch.trim().length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Credit Posting</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Post credit entries for shops</p>
      </div>

      {/* Company Selector Banner (if companies exist) */}
      {companies.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Company:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => setSelectedCompany(company.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCompany === company.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {company.name}
                  </button>
                ))}
              </div>
              {selectedCompany && (
                <p className="text-xs text-muted-foreground ml-auto">
                  Credits will be posted under <span className="font-semibold text-primary">{companies.find(c => c.id === selectedCompany)?.name}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards + Quick Post Toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
              <PackagePlus className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Posted This Session</p>
              <p className="text-xl font-bold text-foreground tabular-nums number-animate">{creditSessionCount}</p>
            </div>
            {/* Session Timer */}
            <div className="flex flex-col items-end shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-[10px] font-medium">Session</span>
              </div>
              <p className="text-sm font-mono font-bold text-foreground/70 tabular-nums">{sessionTimeString}</p>
            </div>
            {/* Quick Post Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                id="quickPostToggle"
                checked={quickPostMode}
                onCheckedChange={(checked) => {
                  setQuickPostMode(checked);
                  if (!checked) {
                    setQuickPostShops(0);
                    setQuickPostTotal(0);
                    setQuickPostJustPosted(false);
                  }
                }}
                className="data-[state=checked]:bg-emerald-500"
              />
              <label
                htmlFor="quickPostToggle"
                className="flex items-center gap-1 text-xs font-semibold cursor-pointer select-none text-muted-foreground"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500" />
                Quick Post
              </label>
            </div>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
              <p className="text-xl font-bold text-foreground tabular-nums number-animate">{formatCurrency(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="alfalah-card-hover">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Shops Listed</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{shops.length}</p>
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
            {/* Enhanced Search Input */}
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search shop by name or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-9 pr-8 h-10 text-sm transition-all ${
                  isSearchActive
                    ? 'border-primary/50 bg-primary/[0.02] ring-2 ring-primary/10 focus-visible:border-primary focus-visible:ring-primary/20'
                    : ''
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Search result count */}
          {isSearchActive && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in">
              <Search className="h-3 w-3" />
              <span>
                Showing <span className="font-semibold text-foreground">{shops.length}</span> of{' '}
                <span className="font-semibold text-foreground">{totalShopsForFilter}</span> shops
                {debouncedSearch.trim() && (
                  <>
                    {' '}matching &ldquo;<span className="font-medium text-primary">{debouncedSearch.trim()}</span>&rdquo;
                  </>
                )}
              </span>
            </div>
          )}

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
            {/* Non-working days (e.g., Friday) */}
            {Object.entries(dayCounts).filter(([d]) => !ROUTE_DAYS.includes(d)).map(([day, count]) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border border-dashed border-amber-300 dark:border-amber-700 ${
                  selectedDay === day
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                }`}
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

      {/* Credit Posting Stats Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 justify-between">
            <div className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">Stats</span>
            </div>
            <div className="flex items-center gap-5 sm:gap-6 text-xs">
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-muted-foreground font-medium">Total Shops</span>
                <span className="font-bold text-foreground text-sm tabular-nums">{totalShopsForFilter}</span>
              </div>
              <div className="w-px h-7 bg-border hidden sm:block" />
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-muted-foreground font-medium">Outstanding</span>
                <span className="font-bold text-red-600 dark:text-red-400 text-sm tabular-nums">{formatCurrency(totalOutstanding)}</span>
              </div>
              <div className="w-px h-7 bg-border hidden sm:block" />
              <div className="flex flex-col items-center sm:items-start">
                <span className="text-muted-foreground font-medium">Avg Balance</span>
                <span className="font-bold text-foreground text-sm tabular-nums">{formatCurrency(Math.round(averageBalance))}</span>
              </div>
            </div>
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
            <div className="overflow-x-auto">
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
                          <p className="font-medium text-sm">
                            {isSearchActive
                              ? highlightMatch(shop.name, debouncedSearch)
                              : shop.name}
                          </p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            {isSearchActive && shop.area
                              ? highlightMatch(shop.area, debouncedSearch)
                              : (shop.area || '—')}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {isSearchActive && shop.area
                          ? highlightMatch(shop.area, debouncedSearch)
                          : (shop.area || '—')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-[10px] font-medium">{shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                {selectedCompany ? (
                  // Show company-specific balance when a company is selected
                  (() => {
                    const companyBal = shop.companyBalances?.find(cb => cb.companyId === selectedCompany);
                    const displayBalance = companyBal ? companyBal.balance : 0;
                    return (
                      <span className={`font-semibold text-sm ${displayBalance > 0 ? 'text-red-600 dark:text-red-400' : displayBalance < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(displayBalance)}
                      </span>
                    );
                  })()
                ) : (
                  <>
                    {shop.creditLimit > 0 && (
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        /{formatCurrency(shop.creditLimit)}
                      </span>
                    )}
                    <span className={`font-semibold text-sm ${shop.balance > 0 ? 'text-red-600 dark:text-red-400' : shop.balance < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                            {formatCurrency(shop.balance)}
                    </span>
                  </>
                )}
              </div>
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
            </div>
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
                    <p className="text-lg font-bold text-amber-700 dark:text-amber-300 number-animate">{formatCurrency(todayTotal)}</p>
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
                      <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todaySummary.map((item, idx) => (
                      <TableRow key={item.shopId} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} transition-colors`}>
                        <TableCell className="text-xs text-muted-foreground font-medium">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{item.shopName}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.shopArea || '—'}</TableCell>
                        <TableCell className="hidden sm:table-cell text-center text-sm text-muted-foreground">{item.transactionCount}</TableCell>
                        <TableCell className="text-right font-semibold text-sm text-red-600 dark:text-red-400">{formatCurrency(item.totalAmount)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleOpenEditDialog(item)}
                              aria-label={`Edit credit for ${item.shopName}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleOpenDeleteDialog(item)}
                              aria-label={`Delete credit for ${item.shopName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Post Floating Summary */}
      {quickPostMode && quickPostShops > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up lg:left-64 mb-14">
          <div className="mx-auto max-w-3xl px-4 pb-4">
            <div className="flex items-center justify-between rounded-xl bg-emerald-600 dark:bg-emerald-700 px-5 py-3 shadow-2xl text-white">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-white/70 font-medium">Quick Post Session</p>
                  <p className="text-sm font-bold">
                    Posted <span className="tabular-nums">{quickPostShops}</span> shop{quickPostShops > 1 ? 's' : ''}, Total: <span className="tabular-nums">{formatCurrency(quickPostTotal)}</span>
                  </p>
                </div>
              </div>
              <Button
                onClick={handleExitQuickPost}
                size="sm"
                variant="ghost"
                className="text-white/90 hover:text-white hover:bg-white/20 h-9 gap-1.5 font-semibold"
              >
                <CheckCircle2 className="h-4 w-4" />
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={(open) => {
        if (!open && quickPostMode) return; // Prevent closing in quick post mode via overlay
        setCreditDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md no-print" onInteractOutside={(e) => {
          if (quickPostMode) e.preventDefault(); // Prevent closing in quick post mode
        }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {quickPostMode ? 'Quick Post Credit' : 'Post Credit'}
              {quickPostMode && (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] ml-1">
                  <Zap className="h-2.5 w-2.5 mr-0.5" />
                  Quick Mode
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Add credit entry for <span className="font-semibold text-foreground">{selectedShop?.name}</span>
            </DialogDescription>
          </DialogHeader>

          {/* Quick Post Success Indicator */}
          {quickPostJustPosted && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 animate-fade-in">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Credit Posted!</p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Enter next amount or close to pick another shop</p>
              </div>
            </div>
          )}

          {/* Duplicate Credit Warning Banner */}
          {duplicateCreditWarning && !quickPostJustPosted && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 animate-fade-in">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  ⚠ Credit already posted to {duplicateCreditWarning.shopName} today
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                  Total today: {formatCurrency(duplicateCreditWarning.todayTotal)}. You can still proceed with posting.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4 py-3">
            {selectedShop && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-muted-foreground">Current Balance</span>
                  <span className="font-bold text-sm">{formatCurrency(selectedShop.balance)}</span>
                </div>
                {selectedShop.creditLimit > 0 && (() => {
                  const limitStatus = getCreditLimitStatus(selectedShop.balance, selectedShop.creditLimit);
                  const projectedBalance = selectedShop.balance + (parseFloat(creditAmount) || 0);
                  const projectedStatus = getCreditLimitStatus(projectedBalance, selectedShop.creditLimit);
                  return (
                    <div className="p-3 rounded-lg border border-border/60 space-y-2 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Credit Limit Usage</span>
                        <span className={`text-xs font-bold ${limitStatus.className}`}>
                          {limitStatus.percentage}% — {limitStatus.label}
                        </span>
                      </div>
                      <div className="credit-limit-bar">
                        <div
                          className="credit-limit-bar-fill"
                          style={{
                            width: `${Math.min(limitStatus.percentage, 100)}%`,
                            backgroundColor: limitStatus.color,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{formatCurrency(selectedShop.balance)} of {formatCurrency(selectedShop.creditLimit)}</span>
                        {creditAmount && !amountError && (
                          <span className="text-foreground/60">
                            → {formatCurrency(projectedBalance)} ({projectedStatus.percentage}%)
                          </span>
                        )}
                      </div>
                      {creditAmount && !amountError && projectedStatus.status === 'exceeded' && (
                        <p className="text-[10px] text-destructive font-medium flex items-center gap-1 animate-fade-in">
                          <AlertTriangle className="h-3 w-3" />
                          This credit will exceed the limit by {formatCurrency(projectedBalance - selectedShop.creditLimit)}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Credit Limit Warning Banner */}
            {creditLimitWarning && creditLimitWarning.exceeded && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 animate-fade-in">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Credit Limit Exceeded!
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    This shop&apos;s balance ({formatCurrency(creditLimitWarning.currentBalance)}) exceeds its credit limit ({formatCurrency(creditLimitWarning.limit)}). The credit has been posted.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="creditAmount">Amount (Rs.)</Label>
                {creditAmount && !amountError && (
                  <span className="text-xs font-medium text-primary">{formatAmountDisplay(creditAmount)}</span>
                )}
              </div>
              <Input
                id="creditAmount"
                type="number"
                placeholder={`Min: ${TRANSACTION_RULES.MIN_AMOUNT.toLocaleString()} — Max: ${TRANSACTION_RULES.MAX_AMOUNT.toLocaleString()}`}
                value={creditAmount}
                onChange={(e) => {
                  setCreditAmount(e.target.value);
                  setAmountError(validateAmountInput(e.target.value));
                }}
                min={TRANSACTION_RULES.MIN_AMOUNT}
                max={TRANSACTION_RULES.MAX_AMOUNT}
                step="1"
                autoFocus={!quickPostJustPosted}
                disabled={postingCredit}
                className={amountError ? 'border-destructive focus-visible:ring-destructive/30' : ''}
              />
              {amountError && (
                <p className="text-xs text-destructive font-medium animate-fade-in">{amountError}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Allowed range: Rs. {TRANSACTION_RULES.MIN_AMOUNT.toLocaleString()} — Rs. {TRANSACTION_RULES.MAX_AMOUNT.toLocaleString()}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="creditDesc">Description <span className="text-destructive">*</span></Label>
                <span className={`text-[10px] font-medium ${creditDescription.length > TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {creditDescription.length} / {TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH}
                </span>
              </div>
              <Textarea
                id="creditDesc"
                placeholder="e.g., Goods supplied - Rice 10kg x 5"
                value={creditDescription}
                onChange={(e) => {
                  setCreditDescription(e.target.value);
                  setDescriptionError('');
                }}
                maxLength={TRANSACTION_RULES.MAX_DESCRIPTION_LENGTH}
                rows={2}
                disabled={postingCredit}
                className={descriptionError ? 'border-destructive focus-visible:ring-destructive/30' : ''}
              />
              {descriptionError && (
                <p className="text-xs text-destructive font-medium animate-fade-in">{descriptionError}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 no-print">
            {!quickPostMode && (
              <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>Cancel</Button>
            )}
            {quickPostMode && (
              <Button variant="outline" onClick={handleExitQuickPost} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Done
              </Button>
            )}
            <Button
              onClick={handlePostCredit}
              disabled={postingCredit || !creditAmount || parseFloat(creditAmount) <= 0 || !!amountError || !creditDescription.trim()}
              className={`btn-ripple hover:opacity-90 focus-glow ${quickPostMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-primary hover:bg-primary/90'}`}
            >
              {postingCredit ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : quickPostMode ? (
                <Zap className="h-4 w-4 mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {postingCredit ? 'Posting...' : quickPostMode ? 'Quick Post' : 'Post Credit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Credit Cap Override Confirmation Dialog */}
      <AlertDialog open={dailyCapOverrideOpen} onOpenChange={setDailyCapOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Daily Credit Cap Exceeded
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Posting <span className="font-bold">{formatCurrency(pendingOverrideAmount)}</span> to this shop
                  will exceed the daily credit cap of <span className="font-bold">{formatCurrency(TRANSACTION_RULES.DAILY_CREDIT_CAP)}</span>.
                </p>
                <div className="p-2 rounded-md bg-muted text-sm">
                  <p>Today&apos;s credits: <span className="font-semibold">{formatCurrency(shopTodayCredits)}</span></p>
                  <p>This entry: <span className="font-semibold">{formatCurrency(pendingOverrideAmount)}</span></p>
                  <p>Combined: <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(shopTodayCredits + pendingOverrideAmount)}</span></p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The server will also reject this if it exceeds the cap. Do you want to try posting anyway?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDailyCapOverrideConfirm}>
              Post Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Edit Transaction Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Credit Entries
            </DialogTitle>
            <DialogDescription>
              Modify credit transactions for <span className="font-semibold text-foreground">{editShopName}</span>
            </DialogDescription>
          </DialogHeader>

          {editTransactions.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading transactions...</span>
            </div>
          ) : (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-2">
                {editTransactions.map((txn, idx) => (
                  <div key={txn.id} className="p-4 rounded-lg border bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Entry #{idx + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(txn.createdAt)}
                      </span>
                    </div>
                    {/* Company Selector */}
                    {companies.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" />
                          Company
                        </Label>
                        <Select
                          value={txn.companyId || 'none'}
                          onValueChange={(val) => handleUpdateTransactionCompany(idx, val === 'none' ? '' : val)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Company</SelectItem>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {txn.companyName && (
                          <p className="text-[11px] text-muted-foreground">
                            Currently under: <span className="font-semibold text-primary">{txn.companyName}</span>
                          </p>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor={`edit-amount-${idx}`} className="text-xs">Amount (Rs.)</Label>
                      <Input
                        id={`edit-amount-${idx}`}
                        type="number"
                        value={txn.amount}
                        onChange={(e) => handleUpdateTransactionAmount(idx, e.target.value)}
                        min="1"
                        step="1"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`edit-desc-${idx}`} className="text-xs">Description</Label>
                      <Textarea
                        id={`edit-desc-${idx}`}
                        value={txn.description}
                        onChange={(e) => handleUpdateTransactionDescription(idx, e.target.value)}
                        rows={2}
                        className="resize-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setEditConfirmIndex(idx);
                          setEditConfirmOpen(true);
                        }}
                        disabled={!txn.amount || parseFloat(txn.amount) <= 0}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Confirm AlertDialog */}
      <AlertDialog open={editConfirmOpen} onOpenChange={setEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Edit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update this credit entry for <span className="font-semibold text-foreground">{editShopName}</span>?
              {editConfirmIndex >= 0 && editTransactions[editConfirmIndex] && (
                <>
                  {(() => {
                    const txn = editTransactions[editConfirmIndex];
                    const isCompanyChange = txn.companyName !== null && companies.find(c => c.id === txn.companyId)?.name !== txn.companyName;
                    return isCompanyChange ? (
                      <span className="block mt-2 text-amber-600 dark:text-amber-400 font-medium">
                        <ArrowRightLeft className="h-4 w-4 inline mr-1" />
                        Company will be changed — balances will be adjusted accordingly.
                      </span>
                    ) : (
                      <span className="block mt-1">The shop&apos;s balance will be recalculated based on the new amount.</span>
                    );
                  })()}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={editLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEditSave}
              disabled={editLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {editLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Yes, Update'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) setDeleteTarget(null);
        setDeleteDialogOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete Credit Entry
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p>
                Are you sure you want to delete this credit entry of{' '}
                <span className="font-bold text-foreground">
                  {deleteTarget ? formatCurrency(deleteTarget.totalAmount) : ''}
                </span>{' '}
                from <span className="font-semibold text-foreground">{deleteTarget?.shopName}</span>?
                {deleteTarget && deleteTarget.transactionCount > 1 && (
                  <span className="block mt-1 text-xs">
                    This will delete {deleteTarget.transactionCount} transaction{deleteTarget.transactionCount > 1 ? 's' : ''}.
                  </span>
                )}
                <span className="block mt-1">
                  This will reverse the amount from the shop&apos;s balance.
                </span>
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Yes, Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
