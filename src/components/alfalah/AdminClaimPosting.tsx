'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useBusinessName } from '@/lib/use-business-name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  ShieldAlert,
  Search,
  Loader2,
  Wallet,
  CheckCircle2,
  ArrowDownCircle,
  Building2,
  History,
  Calendar,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { getLocalDateString } from '@/lib/utils';
import { downloadClaimReceiptPDF, type ClaimReceiptData } from '@/lib/report-generator';
import ClaimHistoryReport from './ClaimHistoryReport';

// ─── Types ────────────────────────────────────────────────────────────

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

interface Company {
  id: string;
  name: string;
  description: string | null;
  status: string;
}

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string };
  companyBalances?: { companyId: string; companyName: string; balance: number; creditLimit: number }[];
}

interface ClaimRecord {
  id: string;
  shopId: string;
  shopName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  companyName: string | null;
  createdAt: string;
  creator?: { name: string };
}

// ─── Component ────────────────────────────────────────────────────────

export default function AdminClaimPosting() {
  const { user } = useAppStore();
  const businessName = useBusinessName();

  // State
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [selectedOB, setSelectedOB] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [orderbookerCompanyIds, setOrderbookerCompanyIds] = useState<string[] | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [filteredShops, setFilteredShops] = useState<Shop[]>([]);
  const [shopSearch, setShopSearch] = useState('');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [claimAmount, setClaimAmount] = useState('');
  const [claimReason, setClaimReason] = useState('');
  const [claimDate, setClaimDate] = useState<string>(getLocalDateString());
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recentClaims, setRecentClaims] = useState<ClaimRecord[]>([]);

  // ─── Derived: filtered companies based on selected OB ──────────────────
  const filteredCompanies = orderbookerCompanyIds
    ? companies.filter((c) => orderbookerCompanyIds.includes(c.id))
    : companies;

  // ─── Get the relevant balance for the selected shop ────────────────
  const getShopDisplayBalance = useCallback((): number => {
    if (!selectedShop) return 0;
    if (selectedCompany && selectedShop.companyBalances?.length) {
      const compBalance = selectedShop.companyBalances.find(
        (cb) => cb.companyId === selectedCompany
      );
      return compBalance ? compBalance.balance : selectedShop.balance;
    }
    return selectedShop.balance;
  }, [selectedShop, selectedCompany]);

  // ─── Fetch Orderbookers ──────────────────────────────────────────────

  useEffect(() => {
    async function fetchOBs() {
      try {
        const res = await apiFetch('/api/orderbookers?status=active');
        if (res.ok) {
          const data = await res.json();
          setOrderbookers(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
    }
    fetchOBs();
  }, []);

  // ─── Fetch Companies ────────────────────────────────────────────────

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await apiFetch('/api/companies?status=active');
        if (res.ok) {
          const data = await res.json();
          const comps = data.companies || [];
          setCompanies(comps);
          // Auto-select first company if available
          if (comps.length > 0) {
            setSelectedCompany(comps[0].id);
          }
        }
      } catch { /* ignore */ }
    }
    fetchCompanies();
  }, []);

  // ─── Fetch OB's assigned companies when OB changes ──────────────────

  useEffect(() => {
    if (!selectedOB) {
      setOrderbookerCompanyIds(null);
      return;
    }

    async function fetchOBCompanies() {
      try {
        const res = await apiFetch(`/api/companies?userId=${selectedOB}`);
        if (res.ok) {
          const data = await res.json();
          const assignedIds: string[] = Array.isArray(data)
            ? data.map((uc: { companyId: string }) => uc.companyId)
            : [];
          setOrderbookerCompanyIds(assignedIds);
          // Auto-select first assigned company
          if (assignedIds.length > 0) {
            setSelectedCompany(assignedIds[0]);
          }
        } else {
          setOrderbookerCompanyIds(null);
        }
      } catch {
        setOrderbookerCompanyIds(null);
      }
    }
    fetchOBCompanies();
  }, [selectedOB]);

  // ─── Fetch Shops when OB selected ────────────────────────────────────

  useEffect(() => {
    if (!selectedOB) {
      setShops([]);
      setFilteredShops([]);
      setSelectedShop(null);
      return;
    }

    async function fetchShops() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/shops?orderbookerId=${selectedOB}&showZeroBalance=true`);
        if (res.ok) {
          const data = await res.json();
          setShops(Array.isArray(data) ? data : []);
          setFilteredShops(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchShops();
  }, [selectedOB]);

  // ─── Filter shops on search ──────────────────────────────────────────

  useEffect(() => {
    if (!shopSearch.trim()) {
      setFilteredShops(shops);
      return;
    }
    const q = shopSearch.toLowerCase();
    setFilteredShops(
      shops.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.ownerName || '').toLowerCase().includes(q) ||
          (s.area || '').toLowerCase().includes(q)
      )
    );
  }, [shopSearch, shops]);

  // ─── Post Claim ──────────────────────────────────────────────────────

  const handlePostClaim = useCallback(async () => {
    if (!selectedShop || !claimAmount || !user?.id) return;

    // FIX C5: Company selection is required for claims
    if (!selectedCompany) {
      toast({ title: 'Company Required', description: 'Please select a company before posting a claim.', variant: 'destructive' });
      return;
    }

    setPosting(true);
    try {
      const res = await apiFetch('/api/transactions/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          amount: parseFloat(claimAmount),
          description: claimReason || 'Claim posting',
          createdBy: user.id,
          companyId: selectedCompany || undefined,
          // Send custom date if different from today (allows back-dating)
          customDate: claimDate && claimDate !== getLocalDateString() ? claimDate : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to post claim');
      }

      const claimData = await res.json();

      // Find company name
      const companyName = selectedCompany
        ? companies.find((c) => c.id === selectedCompany)?.name || null
        : null;

      // Add to recent claims
      const newClaim: ClaimRecord = {
        id: claimData.id,
        shopId: selectedShop.id,
        shopName: selectedShop.name,
        amount: parseFloat(claimAmount),
        previousBalance: claimData.previousBalance,
        newBalance: claimData.newBalance,
        description: claimReason || 'Claim posting',
        companyName,
        createdAt: new Date().toISOString(),
        creator: { name: user.name },
      };
      setRecentClaims((prev) => [newClaim, ...prev].slice(0, 10));

      toast({
        title: 'Claim Posted',
        description: `Rs. ${parseFloat(claimAmount).toLocaleString()} claim deducted from ${selectedShop.name}${companyName ? ` (${companyName})` : ''}`,
      });

      // Auto-generate receipt
      try {
        const receiptData: ClaimReceiptData = {
          claimId: claimData.id,
          shopName: selectedShop.name,
          shopOwner: selectedShop.ownerName,
          shopArea: selectedShop.area,
          orderbookerName: selectedShop.orderbooker?.name || '—',
          amount: parseFloat(claimAmount),
          previousBalance: claimData.previousBalance,
          newBalance: claimData.newBalance,
          description: claimReason || 'Claim posting',
          createdAt: claimData.createdAt || new Date().toISOString(),
          adminName: user.name,
          companyName,
        };
        await downloadClaimReceiptPDF(receiptData);
      } catch { /* receipt generation non-blocking */ }

      // Reset form
      setClaimAmount('');
      setClaimReason('');
      setClaimDate(getLocalDateString());
      setSelectedShop(null);
      setConfirmOpen(false);

      // Refresh shops list
      const shopRes = await apiFetch(`/api/shops?orderbookerId=${selectedOB}&showZeroBalance=true`);
      if (shopRes.ok) {
        const data = await shopRes.json();
        setShops(Array.isArray(data) ? data : []);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to post claim',
        variant: 'destructive',
      });
    } finally {
      setPosting(false);
    }
  }, [selectedShop, claimAmount, claimReason, user, selectedOB, selectedCompany, companies]);

  // ─── Format currency ─────────────────────────────────────────────────

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(amount);
  };

  // ─── Get shop balance for display ──────────────────────────────────
  const shopBalance = getShopDisplayBalance();

  // ─── Active Tab ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('post');

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-7 w-7 text-red-500" />
            Claim Posting
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Post claims to deduct balance from shops (expiry returns, damaged goods, etc.)
          </p>
        </div>
      </div>

      {/* Tabs: Post Claim | Claim History */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="post" className="gap-1.5">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            Post Claim
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Claim History & Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="post" className="mt-6 space-y-6">
      {/* Claim Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-red-500" />
            New Claim
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Select Orderbooker */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">1. Select Orderbooker</Label>
            <Select value={selectedOB} onValueChange={(val) => { setSelectedOB(val); setSelectedShop(null); setShopSearch(''); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an orderbooker..." />
              </SelectTrigger>
              <SelectContent>
                {orderbookers.map((ob) => (
                  <SelectItem key={ob.id} value={ob.id}>
                    {ob.name} {ob.phone ? `(${ob.phone})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Select Company */}
          {selectedOB && filteredCompanies.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                2. Select Company
              </Label>
              <div className="flex flex-wrap gap-2">
                {filteredCompanies.map((company) => (
                  <button
                    key={company.id}
                    onClick={() => setSelectedCompany(company.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCompany === company.id
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:text-red-400'
                    }`}
                  >
                    {company.name}
                  </button>
                ))}
              </div>
              {selectedCompany && (
                <p className="text-xs text-muted-foreground">
                  Claim will be deducted from <span className="font-semibold text-red-600 dark:text-red-400">{companies.find(c => c.id === selectedCompany)?.name}</span> balance
                </p>
              )}
            </div>
          )}

          {/* Step 3: Search & Select Shop */}
          {selectedOB && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{filteredCompanies.length > 0 ? '3' : '2'}. Select Shop</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search shop by name, owner, or area..."
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading shops...</span>
                </div>
              ) : filteredShops.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No shops found</p>
              ) : (
                <ScrollArea className="h-[220px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Shop Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Area</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredShops.map((shop) => {
                        // Show company-specific balance if company selected
                        const displayBalance = selectedCompany && shop.companyBalances?.length
                          ? (shop.companyBalances.find(cb => cb.companyId === selectedCompany)?.balance ?? shop.balance)
                          : shop.balance;
                        return (
                          <TableRow
                            key={shop.id}
                            className={`cursor-pointer hover:bg-muted/50 ${selectedShop?.id === shop.id ? 'bg-red-50 dark:bg-red-950/20 border-l-2 border-l-red-500' : ''}`}
                            onClick={() => setSelectedShop(shop)}
                          >
                            <TableCell>
                              <input
                                type="radio"
                                name="shop"
                                checked={selectedShop?.id === shop.id}
                                onChange={() => setSelectedShop(shop)}
                                className="accent-red-500"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{shop.name}</TableCell>
                            <TableCell>{shop.ownerName || '—'}</TableCell>
                            <TableCell>{shop.area || '—'}</TableCell>
                            <TableCell className="text-right font-mono">
                              <span className={displayBalance > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                {formatAmount(displayBalance)}
                              </span>
                              {selectedCompany && shop.companyBalances?.length ? (
                                <span className="block text-[10px] text-muted-foreground">
                                  Total: {formatAmount(shop.balance)}
                                </span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          )}

          {/* Step 4: Claim Details */}
          {selectedShop && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Selected Shop</p>
                  <p className="font-semibold">{selectedShop.name}</p>
                  {selectedCompany && (
                    <p className="text-xs text-muted-foreground">
                      Company: <span className="font-medium text-red-600 dark:text-red-400">{companies.find(c => c.id === selectedCompany)?.name}</span>
                    </p>
                  )}
                  <p className="text-sm">
                    {selectedCompany ? 'Company' : 'Current'} Balance:{' '}
                    <span className={`font-mono font-bold ${shopBalance > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                      {formatAmount(shopBalance)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-red-600 dark:text-red-400">
                    {filteredCompanies.length > 0 ? '4' : '3'}. Claim Amount (to deduct)
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max={shopBalance}
                    placeholder="Enter claim amount..."
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    className="border-red-200 dark:border-red-800 focus-visible:ring-red-500"
                  />
                  {claimAmount && parseFloat(claimAmount) > shopBalance && (
                    <p className="text-xs text-red-500">Amount exceeds current balance!</p>
                  )}
                  {claimAmount && parseFloat(claimAmount) > 0 && parseFloat(claimAmount) <= shopBalance && (
                    <p className="text-xs text-muted-foreground">
                      Balance after claim: <span className="font-mono font-bold text-red-600 dark:text-red-400">
                        {formatAmount(shopBalance - parseFloat(claimAmount))}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{filteredCompanies.length > 0 ? '5' : '4'}. Reason / Description</Label>
                  <Textarea
                    placeholder="e.g. Expiry stock return, damaged goods..."
                    value={claimReason}
                    onChange={(e) => setClaimReason(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>

              {/* Claim Date (allows back-dating) */}
              <div className="space-y-2 max-w-xs">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {filteredCompanies.length > 0 ? '6' : '5'}. Claim Date
                  <span className="text-[10px] text-muted-foreground font-normal">(change for back-date)</span>
                </Label>
                <Input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                  max={getLocalDateString()}
                  className="h-9"
                />
                {claimDate && claimDate !== getLocalDateString() && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ⚠ Back-dated claim — will be recorded for {new Date(claimDate + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <Button
            type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={
                    !claimAmount ||
                    parseFloat(claimAmount) <= 0 ||
                    parseFloat(claimAmount) > shopBalance ||
                    posting
                  }
                  className="bg-red-600 hover:bg-red-700 text-white gap-2"
                >
                  <ShieldAlert className="h-4 w-4" />
                  Post Claim
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Claims */}
      {recentClaims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Recent Claims
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shop</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Claim Amount</TableHead>
                  <TableHead className="text-right">Previous Balance</TableHead>
                  <TableHead className="text-right">New Balance</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentClaims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">{claim.shopName}</TableCell>
                    <TableCell>
                      {claim.companyName ? (
                        <Badge variant="outline" className="text-[10px] border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                          {claim.companyName}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600 dark:text-red-400 font-bold">
                      -{formatAmount(claim.amount)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(claim.previousBalance)}</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(claim.newBalance)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{claim.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(claim.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              Confirm Claim Posting
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Are you sure you want to post this claim?</p>
                <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <p><strong>Shop:</strong> {selectedShop?.name}</p>
                  {selectedCompany && (
                    <p><strong>Company:</strong> <span className="text-red-600 dark:text-red-400 font-semibold">{companies.find(c => c.id === selectedCompany)?.name}</span></p>
                  )}
                  <p><strong>Claim Amount:</strong> <span className="text-red-600 dark:text-red-400 font-bold">{formatAmount(parseFloat(claimAmount) || 0)}</span></p>
                  <p><strong>Reason:</strong> {claimReason || 'Claim posting'}</p>
                  <p><strong>Balance Before:</strong> {formatAmount(shopBalance)}</p>
                  <p><strong>Balance After:</strong> <span className="font-bold">{formatAmount(shopBalance - (parseFloat(claimAmount) || 0))}</span></p>
                </div>
                <p className="text-red-500 font-medium">This action will deduct the amount from the shop&apos;s {selectedCompany ? 'company ' : ''}balance.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={posting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePostClaim}
              disabled={posting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Claim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <ClaimHistoryReport orderbookers={orderbookers} companies={companies} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
