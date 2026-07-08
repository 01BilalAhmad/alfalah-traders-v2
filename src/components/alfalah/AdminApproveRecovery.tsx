'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Smartphone,
  MapPin,
  Timer,
  Loader2,
  AlertTriangle,
  CircleCheck,
  Ban,
  ChevronDown,
  ChevronUp,
  Warehouse,
  Banknote,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface PendingRecovery {
  id: string;
  type: string; // 'credit' or 'recovery'
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAddress: string | null;
  createdAt: string;
  createdBy: string;
  shop: { id: string; name: string; area: string | null; balance: number };
  creator: { id: string; name: string; phone: string | null };
}

interface OrderbookerGroup {
  orderbooker: { id: string; name: string; phone: string | null };
  transactions: PendingRecovery[];
  totalAmount: number;
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHrs < 24) return `${diffHrs} hr ago`;
  return `${diffDays}d ago`;
}

export default function AdminApproveRecovery() {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<PendingRecovery[]>([]);
  const [grouped, setGrouped] = useState<OrderbookerGroup[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [selectedOB, setSelectedOB] = useState<string | null>(null);
  const [expandedOBs, setExpandedOBs] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setLastError(null);
    try {
      // Fetch BOTH pending recoveries AND pending credits
      const res = await apiFetch('/api/recoveries?status=pending&type=all');

      if (!res.ok) {
        const errText = await res.text();
        console.error('[ApproveRecovery] API error:', res.status, errText);
        setLastError(`Server error: ${res.status}`);
        return;
      }

      const data = await res.json();
      console.log('[ApproveRecovery] API response:', data.totalPending, 'pending, Rs.', data.totalAmount);
      setAllTransactions(data.transactions || []);
      setGrouped(data.grouped || []);
      setTotalPending(data.totalPending || 0);
      setTotalAmount(data.totalAmount || 0);
      setLastFetched(new Date().toLocaleTimeString());

      // Auto-expand all OBs on first load
      const obIds = (data.grouped || []).map((g: OrderbookerGroup) => g.orderbooker.id);
      if (obIds.length > 0) {
        setExpandedOBs(new Set(obIds));
      }
    } catch (err) {
      console.error('[ApproveRecovery] Fetch error:', err);
      setLastError('Network error — check your connection');
      toast({ title: 'Error', description: 'Failed to load pending recoveries', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const toggleExpand = (obId: string) => {
    setExpandedOBs(prev => {
      const next = new Set(prev);
      if (next.has(obId)) next.delete(obId);
      else next.add(obId);
      return next;
    });
  };

  const toggleSelect = (txnId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(txnId)) next.delete(txnId);
      else next.add(txnId);
      return next;
    });
  };

  const toggleSelectAll = (txns: PendingRecovery[]) => {
    const txnIds = txns.map(t => t.id);
    const allSelected = txnIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        txnIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...txnIds]));
    }
  };

  const handleApprove = async (txnIds: string[]) => {
    if (!user) return;
    setActionLoading(txnIds.length === 1 ? txnIds[0] : 'bulk-approve');
    try {
      const res = await apiFetch('/api/recoveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', transactionIds: txnIds, approvedBy: user.id }),
      });

      if (res.ok) {
        const data = await res.json();
        toast({
          title: '✅ Approved!',
          description: `${data.processed} transaction(s) approved — shop balances updated`,
        });
        setSelectedIds(new Set());
        fetchPending();
      } else {
        const err = await res.json();
        toast({ title: '❌ Error', description: err.error || 'Failed to approve', variant: 'destructive' });
      }
    } catch {
      toast({ title: '❌ Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectId) return;
    setActionLoading(rejectId);
    try {
      const res = await apiFetch('/api/recoveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          transactionIds: [rejectId],
          approvedBy: user.id,
          rejectReason: rejectReason || undefined,
        }),
      });

      if (res.ok) {
        toast({ title: 'Rejected', description: 'Recovery rejected — balance unchanged' });
        setRejectDialogOpen(false);
        setRejectId(null);
        setRejectReason('');
        fetchPending();
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.error || 'Failed to reject', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // Filter by selected OB
  const displayGroups = selectedOB
    ? grouped.filter(g => g.orderbooker.id === selectedOB)
    : grouped;

  const selectedTxnsList = allTransactions.filter(t => selectedIds.has(t.id));
  const selectedTotal = selectedTxnsList.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            Approve Transactions
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review &amp; approve pending recovery submissions and credit entries before updating shop balances
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Updated: {lastFetched}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchPending}
            disabled={loading}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {lastError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">Failed to load data</p>
            <p className="text-xs text-red-500 dark:text-red-400">{lastError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchPending} className="text-xs border-red-200">
            Retry
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Clock className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Pending</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{totalPending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Banknote className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total Amount</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{formatPKR(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                <Smartphone className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Orderbookers</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{grouped.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Warehouse className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Selected</p>
                <p className="text-lg font-bold text-primary tabular-nums">{selectedIds.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OB Selector */}
      {grouped.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Filter by Orderbooker
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedOB(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  !selectedOB
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                All ({allTransactions.length})
              </button>
              {grouped.map(g => (
                <button
                  key={g.orderbooker.id}
                  onClick={() => setSelectedOB(g.orderbooker.id === selectedOB ? null : g.orderbooker.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedOB === g.orderbooker.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {g.orderbooker.name}
                  <span className="ml-1 opacity-70">({g.transactions.length})</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="rounded-lg border border-border bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 animate-fade-in">
          <p className="text-sm text-foreground">
            <span className="font-bold">{selectedIds.size}</span> selected —{' '}
            <span className="font-bold">{formatPKR(selectedTotal)}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
            type="button"
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
              disabled={actionLoading !== null}
              onClick={() => handleApprove(Array.from(selectedIds))}
            >
              {actionLoading === 'bulk-approve' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Approve Selected ({selectedIds.size})
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Recovery List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !lastError && displayGroups.length === 0 ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
              <CircleCheck className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-foreground">All Clear!</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              No pending transactions to review. When orderbookers submit recovery from the app, or credit entries need approval, they will appear here.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={fetchPending} className="mt-4 text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Check Again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayGroups.map(group => {
            const isExpanded = expandedOBs.has(group.orderbooker.id);
            const allGroupSelected = group.transactions.every(t => selectedIds.has(t.id));

            return (
              <Card key={group.orderbooker.id} className="overflow-hidden">
                {/* OB Header - Clickable to expand/collapse */}
                <button
                  onClick={() => toggleExpand(group.orderbooker.id)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{group.orderbooker.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {group.orderbooker.phone && (
                            <span className="text-[10px] text-muted-foreground">{group.orderbooker.phone}</span>
                          )}
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {group.transactions.length} {group.transactions.length === 1 ? 'entry' : 'entries'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{formatPKR(group.totalAmount)}</p>
                        <p className="text-[10px] text-muted-foreground">pending approval</p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Transactions List */}
                {isExpanded && (
                  <div className="border-t">
                    {/* Select All + Approve All bar */}
                    <div className="px-4 py-2 bg-muted/30 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          onChange={() => toggleSelectAll(group.transactions)}
                          className="rounded border-muted-foreground/30"
                        />
                        Select All ({group.transactions.length})
                      </label>
                      <Button
            type="button"
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-[11px] h-7 px-3"
                        onClick={() => handleApprove(group.transactions.map(t => t.id))}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === `bulk-approve` ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        Approve All
                      </Button>
                    </div>

                    {/* Individual transactions */}
                    <div className="divide-y">
                      {group.transactions.map(txn => {
                        const isSelected = selectedIds.has(txn.id);
                        const hasGPS = txn.gpsLat !== null && txn.gpsLng !== null;
                        const isLoading = actionLoading === txn.id;

                        return (
                          <div
                            key={txn.id}
                            className={`px-4 py-3 transition-colors ${
                              isSelected ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted/30'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(txn.id)}
                                className="mt-1 rounded border-muted-foreground/30"
                              />

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-foreground">
                                    {txn.shop.name}
                                  </span>
                                  {/* Type badge */}
                                  <Badge variant={txn.type === 'credit' ? 'default' : 'secondary'} className={`text-[9px] h-4 px-1.5 ${txn.type === 'credit' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'}`}>
                                    {txn.type === 'credit' ? 'CREDIT' : 'RECOVERY'}
                                  </Badge>
                                  {txn.shop.area && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <MapPin className="h-2.5 w-2.5" />{txn.shop.area}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Timer className="h-2.5 w-2.5" />{getTimeAgo(txn.createdAt)}
                                  </span>
                                  {hasGPS ? (
                                    <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-0.5">
                                      <CheckCircle2 className="h-2.5 w-2.5" />GPS
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-red-400 font-medium flex items-center gap-0.5">
                                      <XCircle className="h-2.5 w-2.5" />No GPS
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    Balance: {formatPKR(txn.shop.balance)}
                                  </span>
                                </div>
                                {txn.description && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                                    &quot;{txn.description}&quot;
                                  </p>
                                )}
                              </div>

                              {/* Amount + Actions */}
                              <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                                <p className="text-sm font-bold text-foreground tabular-nums">
                                  +{formatPKR(txn.amount)}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApprove([txn.id])}
                                    disabled={isLoading}
                                    className="flex items-center gap-1 rounded-md bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-[10px] font-bold px-2.5 py-1 transition-colors active:scale-95"
                                  >
                                    {isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3 w-3" />
                                    )}
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRejectId(txn.id);
                                      setRejectDialogOpen(true);
                                    }}
                                    disabled={isLoading}
                                    className="flex items-center gap-1 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 disabled:opacity-50 text-red-600 text-[10px] font-bold px-2.5 py-1 transition-colors active:scale-95"
                                  >
                                    <Ban className="h-3 w-3" />
                                    Reject
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" />
              Reject Recovery
            </DialogTitle>
            <DialogDescription>
              Are you sure? The shop balance will NOT be changed.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Amount doesn't match, wrong shop..."
              className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
            type="button"
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading !== null}
            >
              {actionLoading === rejectId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
