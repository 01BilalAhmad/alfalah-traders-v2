'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const ShopCharts = dynamic(() => import('./ShopCharts'), { ssr: false, loading: () => <div className="h-28 animate-pulse bg-muted/20 rounded-lg" /> });
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  FileSpreadsheet,
  X,
  TrendingUp,
  AlertTriangle,
  StickyNote,
  Trash2,
  MessageSquare,
  CalendarDays,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';
import { exportToCSV } from '@/lib/csv-export';
import { WORKING_DAYS, getTodayRouteDay, formatPKR } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import AdminBulkImport from './AdminBulkImport';

const ROUTE_DAYS = [...WORKING_DAYS];

// Off days not in working days (e.g., Friday)
const OFF_DAYS = ['friday'];

function formatRouteDays(days: string[]): string {
  return days.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
}

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
  assignedOrderbookers?: {
    id: string;
    orderbookerId: string;
    orderbookerName: string;
    companyId: string;
    companyName: string;
    routeDays: string[];
  }[];
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops?: number;
  totalOutstanding?: number;
}

export default function AdminShops() {
  const { setSelectedShopId, setSelectedShopName, user } = useAppStore();
  const router = useRouter();
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
  const [formRouteDays, setFormRouteDays] = useState<string[]>([]);
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
  const [ledgerCompanyFilter, setLedgerCompanyFilter] = useState<string>('all');

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
  const [bulkAction, setBulkAction] = useState<'assign' | 'assign-secondary' | 'deactivate' | 'reactivate' | 'route-days' | null>(null);
  const [bulkOrderbookerId, setBulkOrderbookerId] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkRouteDays, setBulkRouteDays] = useState<string[]>([]);

  // Secondary OB assignment state
  const [secondaryOBId, setSecondaryOBId] = useState('');
  const [secondaryCompanyId, setSecondaryCompanyId] = useState('');
  const [secondaryRouteDays, setSecondaryRouteDays] = useState<string[]>([]);
  const [createCompanyBalance, setCreateCompanyBalance] = useState(true);

  // Bulk import dialog state
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string; status: string }[]>([]);

  // Shop notes dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [notesShop, setNotesShop] = useState<Shop | null>(null);
  const [shopNotes, setShopNotes] = useState<{ id: string; note: string; createdBy: string; creatorName: string; createdAt: string }[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Additional orderbooker assignment state
  const [shopAssignments, setShopAssignments] = useState<any[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignOBId, setAssignOBId] = useState('');
  const [assignCompanyId, setAssignCompanyId] = useState('');
  const [assignRouteDays, setAssignRouteDays] = useState<string[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers');
      if (res.ok) {
        const data = await res.json();
        setOrderbookers(data);
      }
    } catch { /* silent */ }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch { /* silent */ }
  }, []);

  const fetchShopAssignments = useCallback(async (shopId: string) => {
    try {
      const res = await apiFetch(`/api/shops/assign-orderbooker?shopId=${shopId}`);
      if (res.ok) {
        const data = await res.json();
        setShopAssignments(data);
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
      const res = await apiFetch(`/api/shops?${params.toString()}`);
      if (res.ok) setShops(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [searchQuery, selectedDay, showInactive]);

  const fetchAllShopsForCounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/shops');
      if (res.ok) {
        const data: Shop[] = await res.json();
        setAllShops(data);
        const counts: Record<string, number> = {};
        ROUTE_DAYS.forEach((d) => { counts[d] = 0; });
        data.forEach((s) => {
          // Count all days, including non-working days like 'friday'
          // A shop can belong to multiple days, so count it for each day it's in
          for (const day of s.routeDays) {
            if (!counts[day]) counts[day] = 0;
            counts[day]++;
          }
        });
        setDayCounts(counts);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchOrderbookers(); fetchCompanies(); }, [fetchOrderbookers, fetchCompanies]);
  useEffect(() => { fetchShops(); }, [fetchShops]);
  useEffect(() => { fetchAllShopsForCounts(); }, [fetchAllShopsForCounts]);

  const openAddDialog = () => {
    setEditingShop(null);
    setFormName('');
    setFormOwner('');
    setFormArea('');
    setFormAddress('');
    setFormPhone('');
    setFormRouteDays([]);
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
    setFormRouteDays(shop.routeDays || []);
    setFormOrderbookerId(shop.orderbooker.id);
    setFormCreditLimit(shop.creditLimit > 0 ? String(shop.creditLimit) : '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || formRouteDays.length === 0 || !formOrderbookerId) {
      toast({ title: 'Error', description: 'Name, route days, and orderbooker are required', variant: 'destructive' });
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
        routeDays: formRouteDays,
        orderbookerId: formOrderbookerId,
        creditLimit: formCreditLimit ? parseFloat(formCreditLimit) : 0,
      };

      const url = '/api/shops';
      const method = editingShop ? 'PATCH' : 'POST';
      const body = editingShop ? { ...payload, id: editingShop.id } : payload;

      const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
      const res = await apiFetch('/api/shops', {
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

  const openLedger = async (shop: Shop, companyId?: string) => {
    setLedgerShop(shop);
    setLedgerData(null);
    setLedgerCompanyFilter(companyId || 'all');
    setLedgerOpen(true);
    setLedgerLoading(true);
    try {
      const filterId = companyId && companyId !== 'all' ? companyId : '';
      const url = filterId
        ? `/api/reports/ledger?shopId=${shop.id}&companyId=${filterId}`
        : `/api/reports/ledger?shopId=${shop.id}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (filterId) {
          data.filteredCompanyName = companies.find(c => c.id === filterId)?.name || null;
        }
        setLedgerData(data);
      }
    } catch { /* silent */ }
    finally { setLedgerLoading(false); }
  };

  const handleLedgerCompanyChange = async (companyId: string) => {
    setLedgerCompanyFilter(companyId);
    if (!ledgerShop) return;
    setLedgerLoading(true);
    try {
      const filterId = companyId !== 'all' ? companyId : '';
      const url = filterId
        ? `/api/reports/ledger?shopId=${ledgerShop.id}&companyId=${filterId}`
        : `/api/reports/ledger?shopId=${ledgerShop.id}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (filterId) {
          data.filteredCompanyName = companies.find(c => c.id === filterId)?.name || null;
        }
        setLedgerData(data);
      }
    } catch { /* silent */ }
    finally { setLedgerLoading(false); }
  };

  const openNotesDialog = async (shop: Shop) => {
    setNotesShop(shop);
    setShopNotes([]);
    setNewNote('');
    setNotesDialogOpen(true);
    setNotesLoading(true);
    try {
      const res = await apiFetch(`/api/shops/${shop.id}/notes`);
      if (res.ok) {
        const data = await res.json();
        setShopNotes(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    finally { setNotesLoading(false); }
  };

  const handleSaveNote = async () => {
    if (!notesShop || !newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await apiFetch(`/api/shops/${notesShop.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote.trim(), createdBy: user?.id || 'admin' }),
      });
      if (res.ok) {
        toast({ title: 'Note Saved', description: 'Shop note has been saved' });
        setNewNote('');
        // Refresh notes
        const refreshRes = await apiFetch(`/api/shops/${notesShop.id}/notes`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setShopNotes(Array.isArray(data) ? data : []);
        }
      } else {
        toast({ title: 'Error', description: 'Failed to save note', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!notesShop) return;
    try {
      const res = await apiFetch(`/api/shops/${notesShop.id}/notes?noteId=${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Note Deleted', description: 'Note has been removed' });
        setShopNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch { /* silent */ }
  };

  const openShopDetail = async (shop: Shop) => {
    setDetailShop(shop);
    setDetailLedgerData(null);
    setDetailOpen(true);
    setDetailLoading(true);
    setShopAssignments([]);
    fetchShopAssignments(shop.id);
    try {
      const res = await apiFetch(`/api/reports/ledger?shopId=${shop.id}`);
      if (res.ok) {
        setDetailLedgerData(await res.json());
      }
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  };

  const handleAssignOrderbooker = async () => {
    if (!detailShop || !assignOBId || !assignCompanyId) {
      toast({ title: 'Error', description: 'Orderbooker and company are required', variant: 'destructive' });
      return;
    }
    if (assignRouteDays.length === 0) {
      toast({ title: 'Error', description: 'Select at least one route day', variant: 'destructive' });
      return;
    }
    setAssignLoading(true);
    try {
      const res = await apiFetch('/api/shops/assign-orderbooker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: detailShop.id,
          orderbookerId: assignOBId,
          companyId: assignCompanyId,
          routeDays: assignRouteDays,
        }),
      });
      if (res.ok) {
        toast({ title: 'Orderbooker Assigned', description: 'Additional orderbooker has been assigned' });
        setAssignDialogOpen(false);
        fetchShopAssignments(detailShop.id);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to assign orderbooker', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    if (!detailShop) return;
    try {
      const res = await apiFetch(`/api/shops/assign-orderbooker?id=${assignmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Assignment Removed', description: 'Orderbooker assignment has been removed' });
        fetchShopAssignments(detailShop.id);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to remove assignment', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
  };

  const handleDownloadLedgerPDF = async () => {
    if (!ledgerData) return;
    await downloadLedgerPDF(ledgerData);
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
    .filter((s) => !selectedDay || s.routeDays.includes(selectedDay))
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

  const openBulkRouteDays = () => {
    setBulkAction('route-days');
    setBulkRouteDays([]);
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
        const res = await apiFetch('/api/shops/bulk-assign', {
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
        const res = await apiFetch('/api/shops/bulk-status', {
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
        const res = await apiFetch('/api/shops/bulk-status', {
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
      } else if (bulkAction === 'route-days') {
        if (bulkRouteDays.length === 0) {
          toast({ title: 'Error', description: 'Select at least one route day', variant: 'destructive' });
          setBulkLoading(false);
          return;
        }
        const res = await apiFetch('/api/shops/bulk-route-days', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopIds: ids, routeDays: bulkRouteDays }),
        });
        if (res.ok) {
          const data = await res.json();
          toast({ title: 'Route Days Assigned', description: `${data.updated} shops assigned to ${formatRouteDays(bulkRouteDays)}` });
          setBulkDialogOpen(false);
          setBulkAction(null);
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

  const handleBulkAssignSecondary = async () => {
    if (!secondaryOBId || !secondaryCompanyId) return;
    setBulkLoading(true);
    try {
      const shopIds = Array.from(selectedShopIds);
      const res = await apiFetch('/api/shops/bulk-assign-secondary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopIds,
          orderbookerId: secondaryOBId,
          companyId: secondaryCompanyId,
          routeDays: secondaryRouteDays.length > 0 ? secondaryRouteDays : undefined,
          createCompanyBalance,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Secondary OB Assigned', description: `Assigned to ${data.assigned} shops (${data.skipped} skipped)` });
        setBulkDialogOpen(false);
        setBulkAction(null);
        setSecondaryOBId('');
        setSecondaryCompanyId('');
        setSecondaryRouteDays([]);
        clearSelection();
        fetchShops();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to assign secondary orderbooker', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to assign secondary orderbooker', variant: 'destructive' });
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
          <Button type="button" onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white ">
            <Plus className="h-4 w-4 mr-2" /> Add Shop
          </Button>
          <Button type="button" variant="outline" onClick={() => setBulkImportOpen(true)} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Bulk Import
          </Button>
          {filteredShops.length > 0 && (
            <Button
            type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = filteredShops.map((s) => ({
                  Name: s.name,
                  Owner: s.ownerName || '',
                  Area: s.area || '',
                  Phone: s.phone || '',
                  'Route Days': formatRouteDays(s.routeDays),
                  Orderbooker: s.orderbooker.name,
                  Balance: s.balance,
                  Status: s.status.charAt(0).toUpperCase() + s.status.slice(1),
                }));
                exportToCSV(rows, 'shops-list', ['Name', 'Owner', 'Area', 'Phone', 'Route Days', 'Orderbooker', 'Balance', 'Status']);
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
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Active Shops</p>
              <p className="text-lg font-bold text-foreground">{activeShops.length}</p>
            </div>
            <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 text-[10px] font-bold">
              Live
            </Badge>
          </CardContent>
        </Card>

        {/* Total Inactive Shops */}
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Inactive Shops</p>
              <p className="text-lg font-bold text-foreground">{inactiveShops.length}</p>
            </div>
            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[10px] font-bold">
              Off
            </Badge>
          </CardContent>
        </Card>

        {/* Total Outstanding Balance */}
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
              <p className="text-lg font-bold text-foreground">{formatPKR(totalOutstanding)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Average Balance */}
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
              <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Average Balance</p>
              <p className="text-lg font-bold text-foreground">{formatPKR(Math.round(averageBalance))}</p>
            </div>
          </CardContent>
        </Card>

        {/* Highest Balance Shop */}
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
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
              <span className="text-sm font-bold text-foreground whitespace-nowrap">
                {formatPKR(highestBalanceShop.balance)}
              </span>
            )}
          </CardContent>
        </Card>

        {/* Area with Most Shops */}
        <Card className="card-hover border border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
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
              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
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
            type="button"
                variant={showInactive ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowInactive(!showInactive)}
                className={showInactive ? 'bg-primary text-white' : ''}
              >
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </Button>
              {(searchQuery || selectedDay || selectedOBFilter) && (
                <Button
            type="button"
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
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 border border-dashed border-indigo-300 dark:border-indigo-700 ${selectedDay === day ? 'bg-indigo-200 text-indigo-800 dark:bg-indigo-700 dark:text-indigo-200' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-800/50'}`}
              >
                <AlertTriangle className="h-3 w-3" />
                {day.charAt(0).toUpperCase() + day.slice(1)}
                {(count || 0) > 0 && (
                  <span className="inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full text-[10px] font-bold px-1 bg-indigo-200 dark:bg-indigo-700 text-indigo-800 dark:text-indigo-200">
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
        <CardContent className="px-0 pb-0">
          {loading ? (
            <div className="px-4 py-5 space-y-4">
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
                <div className="relative z-10 h-20 w-20 rounded-full bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center">
                  <Store className="h-9 w-9 text-primary/50 animate-gentle-float" />
                </div>
              </div>
              <p className="font-semibold text-muted-foreground text-sm">No shops match your filters</p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
                Try adjusting your search query, day filter, or show inactive shops.
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors "
                  onClick={() => { setSearchQuery(''); setSelectedDay(''); setShowInactive(false); }}
                >
                  Clear Filters
                </button>
                <button
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors "
                  onClick={openAddDialog}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Shop
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800 dark:bg-slate-900 hover:bg-slate-800 dark:hover:bg-slate-900 sticky top-0 z-10 shadow-md">
                    <TableHead className="text-white/90 font-semibold text-xs w-10">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => { if (el) { (el as unknown as HTMLInputElement).indeterminate = someSelected && !allSelected; } }}
                        onCheckedChange={toggleSelectAll}
                        className="border-white/40 data-[state=checked]:bg-white data-[state=checked]:text-slate-700 data-[state=checked]:border-white"
                      />
                    </TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs">Shop</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs hidden lg:table-cell">Route Days</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs hidden lg:table-cell">Orderbooker</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs text-right">Balance</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs">Credit Usage</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs">Status</TableHead>
                    <TableHead className="text-white/90 font-semibold text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShops.map((shop, idx) => {
                    const isSelected = selectedShopIds.has(shop.id);
                    const creditPct = shop.creditLimit > 0 ? Math.min((shop.balance / shop.creditLimit) * 100, 100) : 0;
                    const isOverLimit = shop.creditLimit > 0 && shop.balance > shop.creditLimit;
                    const isNearLimit = shop.creditLimit > 0 && !isOverLimit && shop.balance > shop.creditLimit * 0.8;
                    const progressColor = isOverLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-400' : 'bg-emerald-400';

                    const dayColorMap: Record<string, string> = {
                      monday: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
                      tuesday: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
                      wednesday: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                      thursday: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                      friday: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800',
                      saturday: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
                    };

                    const initial = shop.name.charAt(0).toUpperCase();

                    return (
                    <TableRow key={shop.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} ${shop.status === 'inactive' ? 'opacity-60' : ''} ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : ''} ${isOverLimit ? 'border-l-2 border-l-red-500 bg-red-50/30 dark:bg-red-950/10' : ''} hover-scale-102 transition-colors`}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelectShop(shop.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-xl bg-cyan-600 dark:bg-cyan-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-sm">{initial}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{shop.name}</p>
                            {shop.ownerName && (
                              <p className="text-[11px] text-muted-foreground truncate">{shop.ownerName}</p>
                            )}
                            {shop.area && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <MapPin className="h-2.5 w-2.5 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground/80 truncate">{shop.area}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {shop.routeDays.map(day => {
                            const isToday = day === todayDay;
                            const colors = dayColorMap[day] || 'bg-muted text-muted-foreground border-border';
                            return (
                              <span key={day} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${colors}`}>
                                {isToday && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                                {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                              </span>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-md bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                            <User className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                          </div>
                          <span className="text-sm truncate">{shop.orderbooker.name}</span>
                          {shop.assignedOrderbookers && shop.assignedOrderbookers.length > 0 && (
                            <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[9px] h-4 px-1" title={`${shop.assignedOrderbookers.length} additional orderbooker(s)`}>
                              +{shop.assignedOrderbookers.length}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold text-sm ${shop.balance > 0 ? 'text-foreground' : 'text-emerald-500 dark:text-emerald-400'}`}>{formatPKR(shop.balance)}</span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (!shop.creditLimit || shop.creditLimit <= 0) {
                            return <span className="text-xs text-muted-foreground">—</span>;
                          }
                          return (
                            <div className="flex flex-col gap-1 min-w-[100px]">
                              {isOverLimit ? (
                                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 animate-pulse">OVER LIMIT</span>
                              ) : isNearLimit ? (
                                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Near Limit</span>
                              ) : (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Within Limit</span>
                              )}
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-300 ${progressColor}`} style={{ width: `${isOverLimit ? 100 : creditPct}%` }} />
                              </div>
                              <span className="text-[9px] text-muted-foreground">{formatPKR(shop.balance)} / {formatPKR(shop.creditLimit)}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${shop.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                          <Badge className={`text-[10px] ${shop.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                            {shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30" onClick={() => openShopDetail(shop)} title="View Details" aria-label="View shop details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditDialog(shop)} className="gap-2 text-xs">
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openLedger(shop)} className="gap-2 text-xs">
                                <BookOpen className="h-3.5 w-3.5" /> Ledger
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setSelectedShopId(shop.id);
                                setSelectedShopName(shop.name);
                                router.push(`/shops/${shop.id}`);
                              }} className="gap-2 text-xs">
                                <TrendingUp className="h-3.5 w-3.5" /> Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openNotesDialog(shop)} className="gap-2 text-xs">
                                <StickyNote className="h-3.5 w-3.5" /> Notes
                              </DropdownMenuItem>
                              {shop.status === 'active' && (
                                <DropdownMenuItem onClick={() => setConfirmDeactivate(shop)} className="gap-2 text-xs text-destructive focus:text-destructive">
                                  <UserMinus className="h-3.5 w-3.5" /> Deactivate
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedShopIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up lg:left-64 mb-14">
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
            type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={openBulkAssign}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Assign OB
                </Button>
                <Button
            type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200"
                  onClick={() => { setBulkAction('assign-secondary'); setBulkDialogOpen(true); }}
                >
                  <Users className="h-3.5 w-3.5" />
                  Assign Secondary OB
                </Button>
                <Button
            type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
                  onClick={openBulkRouteDays}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Set Route
                </Button>
                <Button
            type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200"
                  onClick={openBulkDeactivate}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Deactivate
                </Button>
                <Button
            type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200"
                  onClick={openBulkReactivate}
                >
                  <UserX className="h-3.5 w-3.5" />
                  Reactivate
                </Button>
                <Button
            type="button"
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
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-border bg-muted">Inactive</Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkAction(null); }}>
              Cancel
            </Button>
            <Button
            type="button"
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

      {/* Bulk Assign Secondary Orderbooker Dialog */}
      <Dialog open={bulkDialogOpen && bulkAction === 'assign-secondary'} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) setBulkAction(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Assign Secondary Orderbooker
            </DialogTitle>
            <DialogDescription>
              Assign a secondary orderbooker (for a specific company) to {selectedShopIds.size} selected {selectedShopIds.size === 1 ? 'shop' : 'shops'}.
              Secondary orderbookers handle a specific company&apos;s business at a shop.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Orderbooker</Label>
              <Select value={secondaryOBId} onValueChange={setSecondaryOBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an orderbooker..." />
                </SelectTrigger>
                <SelectContent>
                  {orderbookers.map((ob) => (
                    <SelectItem key={ob.id} value={ob.id} disabled={ob.status !== 'active'}>
                      {ob.name} {ob.status !== 'active' ? '(Inactive)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Company</Label>
              <Select value={secondaryCompanyId} onValueChange={setSecondaryCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Route Days (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                  <Badge
                    key={day}
                    variant={secondaryRouteDays.includes(day) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize"
                    onClick={() => {
                      setSecondaryRouteDays(prev => 
                        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                      );
                    }}
                  >
                    {day.slice(0, 3)}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Leave empty to use each shop&apos;s default route days</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="createBalance"
                checked={createCompanyBalance}
                onChange={(e) => setCreateCompanyBalance(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="createBalance" className="text-sm">Auto-create company balance (if not exists)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkAction(null); setSecondaryOBId(''); setSecondaryCompanyId(''); }}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleBulkAssignSecondary}
              disabled={!secondaryOBId || !secondaryCompanyId || bulkLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Assign to {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Route Days Dialog */}
      <Dialog open={bulkDialogOpen && bulkAction === 'route-days'} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) setBulkAction(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Set Route Days
            </DialogTitle>
            <DialogDescription>
              Assign route days to {selectedShopIds.size} selected {selectedShopIds.size === 1 ? 'shop' : 'shops'}.
              A shop can have multiple route days (e.g., Monday &amp; Thursday for twice-a-week visits).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <Label className="text-sm font-medium">Select Route Days</Label>
            <div className="grid grid-cols-3 gap-2">
              {ROUTE_DAYS.map((day) => (
                <label
                  key={day}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-all text-sm font-medium ${
                    bulkRouteDays.includes(day)
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Checkbox
                    checked={bulkRouteDays.includes(day)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setBulkRouteDays([...bulkRouteDays, day]);
                      } else {
                        setBulkRouteDays(bulkRouteDays.filter(d => d !== day));
                      }
                    }}
                  />
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </label>
              ))}
            </div>
            {bulkRouteDays.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Selected:</span>
                <div className="flex gap-1">
                  {bulkRouteDays.map((day) => (
                    <Badge key={day} className="bg-primary/10 text-primary border-primary/20 text-xs">
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => { setBulkDialogOpen(false); setBulkAction(null); }}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleBulkAction}
              disabled={bulkRouteDays.length === 0 || bulkLoading}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {bulkLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Set Route for {selectedShopIds.size} {selectedShopIds.size === 1 ? 'Shop' : 'Shops'}
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
          {/* Shop Header - Professional Slate */}
          <div className="bg-gradient-to-r from-cyan-700 to-indigo-800 dark:from-cyan-900 dark:to-indigo-950 px-6 py-5 shrink-0">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-white text-lg">
                    <Store className="h-5 w-5" />
                    {detailShop?.name || 'Shop Details'}
                  </DialogTitle>
                  <DialogDescription className="text-cyan-200 text-xs mt-1">
                    {detailShop?.area && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {detailShop.area}
                      </span>
                    )}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  {detailShop?.routeDays && detailShop.routeDays.length > 0 && (
                    <Badge className="bg-cyan-800/60 text-cyan-100 border-cyan-700/50 text-[10px]">
                      {formatRouteDays(detailShop.routeDays)}
                    </Badge>
                  )}
                  <Badge className={`text-[10px] ${detailShop?.status === 'active' ? 'bg-emerald-700 text-emerald-100 border-emerald-600' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
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
                    <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Owner</p>
                      <p className="text-sm font-semibold text-foreground truncate">{detailShop.ownerName || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-muted/40 rounded-lg p-3">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
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
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px]">
                        {detailShop.orderbooker.name}
                      </Badge>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${detailShop.balance > 0 ? 'text-foreground' : 'text-emerald-500 dark:text-emerald-400'}`}>
                      {formatPKR(detailShop.balance)}
                    </p>

                    {/* Credit Limit Progress Bar */}
                    {detailShop.creditLimit && detailShop.creditLimit > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground font-medium">Credit Limit</span>
                          <span className="text-[11px] font-semibold text-foreground">{formatPKR(detailShop.creditLimit)}</span>
                        </div>
                        <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              detailShop.balance > detailShop.creditLimit
                                ? 'bg-red-500'
                                : detailShop.balance > detailShop.creditLimit * 0.8
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
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
                                : 'text-emerald-500 dark:text-emerald-400'
                          }`}>
                            {detailShop.balance > detailShop.creditLimit
                              ? `${formatPKR(detailShop.balance)} — Over limit by ${formatPKR(detailShop.balance - detailShop.creditLimit)}`
                              : `${Math.round((detailShop.balance / detailShop.creditLimit) * 100)}% used`
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Assigned Orderbookers Section */}
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        <p className="text-xs text-muted-foreground font-medium">Assigned Orderbookers</p>
                        <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[10px] h-5">
                          {1 + shopAssignments.length}
                        </Badge>
                      </div>
                      <Button
            type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setAssignOBId('');
                          setAssignCompanyId('');
                          setAssignRouteDays(detailShop?.routeDays || []);
                          setAssignDialogOpen(true);
                        }}
                      >
                        <Plus className="h-3 w-3" /> Add Orderbooker
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {/* Primary orderbooker */}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                        <div className="h-7 w-7 rounded-full bg-indigo-200 dark:bg-indigo-700 flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-foreground truncate">{detailShop.orderbooker.name}</p>
                            <Badge className="bg-indigo-700 text-white text-[9px] h-4 px-1.5 font-bold">Primary</Badge>
                          </div>
                        </div>
                      </div>

                      {/* Additional orderbooker assignments */}
                      {shopAssignments.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2">No additional orderbookers assigned</p>
                      ) : (
                        shopAssignments.map((assignment) => (
                          <div key={assignment.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
                            <div className="h-7 w-7 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                              <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-medium text-foreground truncate">{assignment.orderbookerName}</p>
                                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[9px] h-4 px-1.5">
                                  {assignment.companyName}
                                </Badge>
                              </div>
                              {assignment.routeDays && assignment.routeDays.length > 0 && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{formatRouteDays(assignment.routeDays)}</p>
                              )}
                            </div>
                            <Button
            type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-600"
                              onClick={() => handleRemoveAssignment(assignment.id)}
                              title="Remove assignment"
                              aria-label="Remove orderbooker assignment"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Mini Balance Trend Sparkline */}
                {detailLedgerData.transactions.length > 0 && (
                  <ShopCharts transactions={detailLedgerData.transactions} />
                )}

                {/* Quick Actions Row */}
                <div className="grid grid-cols-3 gap-2">
                  <Button
            type="button"
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
            type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => {
                      setDetailOpen(false);
                      router.push('/credit-posting');
                    }}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Post Credit
                  </Button>
                  <Button
            type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={async () => {
                      await downloadLedgerPDF(detailLedgerData);
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
                        <TableRow className="bg-indigo-800 dark:bg-indigo-950 hover:bg-indigo-800 dark:hover:bg-indigo-950">
                          <TableHead className="text-white font-semibold text-[10px]">Type</TableHead>
                          <TableHead className="text-white font-semibold text-[10px]">Amount</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] hidden sm:table-cell">Description</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] hidden md:table-cell">Date</TableHead>
                          <TableHead className="text-white font-semibold text-[10px] text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...detailLedgerData.transactions].reverse().slice(0, 10).map((txn, idx) => (
                          <TableRow key={txn.id} className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} hover-scale-102 transition-colors ${txn.type === 'claim' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                            <TableCell>
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' : txn.type === 'claim' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'}`}>
                                {txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : 'Recovery'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs font-bold ${txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                                {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
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
                                {formatPKR(txn.newBalance)}
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
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Ali General Store" className="" />
              </div>
              <div className="space-y-2">
                <Label>Owner Name</Label>
                <Input value={formOwner} onChange={(e) => setFormOwner(e.target.value)} placeholder="e.g., Muhammad Ali" className="" />
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Input value={formArea} onChange={(e) => setFormArea(e.target.value)} placeholder="e.g., Gulshan-e-Iqbal" className="" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g., 0300-1234567" className="" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Full address" rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Route Days *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {WORKING_DAYS.map(day => (
                    <label key={day} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formRouteDays.includes(day)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormRouteDays([...formRouteDays, day]);
                          } else {
                            setFormRouteDays(formRouteDays.filter(d => d !== day));
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-sm">{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                    </label>
                  ))}
                </div>
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
                    className="pl-9 "
                    min="0"
                    step="1000"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Leave 0 for no credit limit</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving || !formName.trim() || formRouteDays.length === 0 || !formOrderbookerId} className="bg-primary hover:bg-primary/90 ">
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
                <Button type="button" variant="outline" size="sm" onClick={handleDownloadLedgerPDF}>
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
              {/* Company Filter */}
              {companies.length > 0 && (
                <div className="px-1 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">Filter:</span>
                    <button
                      onClick={() => handleLedgerCompanyChange('all')}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        ledgerCompanyFilter === 'all'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      All
                    </button>
                    {(ledgerData.companyBalances || []).map((cb) => (
                      <button
                        key={cb.companyId}
                        onClick={() => handleLedgerCompanyChange(cb.companyId)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                          ledgerCompanyFilter === cb.companyId
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {cb.companyName} ({formatPKR(cb.balance)})
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3 px-1">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Credit</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.totalCredit)}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Recovery</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.totalRecovery)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Total Claims</p>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">{formatPKR(ledgerData.summary.totalClaims || 0)}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Balance</p>
                  <p className="text-sm font-bold text-foreground">{formatPKR(ledgerData.summary.currentBalance)}</p>
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
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm ${txn.type === 'claim' ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatPKR(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Bal: {formatPKR(txn.newBalance)}</p>
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

      {/* Bulk Import Dialog */}
      <AdminBulkImport
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        orderbookers={orderbookers}
        companies={companies}
        onImportComplete={() => { fetchShops(); fetchAllShopsForCounts(); }}
      />

      {/* Add Orderbooker Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Add Orderbooker Assignment
            </DialogTitle>
            <DialogDescription>
              Assign an additional orderbooker to {detailShop?.name} for a specific company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Orderbooker Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Orderbooker</Label>
              <Select value={assignOBId} onValueChange={setAssignOBId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select orderbooker" />
                </SelectTrigger>
                <SelectContent>
                  {orderbookers
                    .filter((ob) => ob.status === 'active' && ob.id !== detailShop?.orderbooker.id)
                    .map((ob) => (
                      <SelectItem key={ob.id} value={ob.id}>
                        {ob.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Company</Label>
              <Select value={assignCompanyId} onValueChange={setAssignCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies
                    .filter((c) => c.status === 'active')
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Route Days Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Route Days</Label>
              <div className="flex flex-wrap gap-2">
                {WORKING_DAYS.map((day) => (
                  <label
                    key={day}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      assignRouteDays.includes(day)
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Checkbox
                      checked={assignRouteDays.includes(day)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setAssignRouteDays([...assignRouteDays, day]);
                        } else {
                          setAssignRouteDays(assignRouteDays.filter((d) => d !== day));
                        }
                      }}
                      className="h-3 w-3"
                    />
                    {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assignLoading}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleAssignOrderbooker}
              disabled={assignLoading || !assignOBId || !assignCompanyId || assignRouteDays.length === 0}
              className="gap-1.5"
            >
              {assignLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
              {assignLoading ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shop Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-amber-600" />
              Notes — {notesShop?.name}
            </DialogTitle>
            <DialogDescription>
              View and manage notes for this shop
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {notesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : shopNotes.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notes yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Add a note about this shop below</p>
              </div>
            ) : (
              shopNotes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{note.note}</p>
                    <Button
            type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-red-500"
                      onClick={() => handleDeleteNote(note.id)}
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{note.creatorName || 'Admin'}</span>
                    <span>·</span>
                    <span>{new Date(note.createdAt).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t pt-3 space-y-2">
            <Textarea
              placeholder="Write a note about this shop..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{newNote.length}/1000</span>
              <Button
            type="button"
                size="sm"
                onClick={handleSaveNote}
                disabled={savingNote || !newNote.trim()}
                className="gap-1.5"
              >
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                {savingNote ? 'Saving...' : 'Add Note'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
