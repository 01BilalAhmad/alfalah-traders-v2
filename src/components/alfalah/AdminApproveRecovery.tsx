'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import {
  ShieldCheck,
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
} from 'lucide-react';

interface PendingRecovery {
  id: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAddress: string | null;
  createdAt: string;
  shop: { id: string; name: string; area: string | null; balance: number };
  creator: { id: string; name: string; phone: string | null };
}

interface OrderbookerGroup {
  orderbooker: { id: string; name: string; phone: string | null };
  transactions: PendingRecovery[];
  totalAmount: number;
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recoveries?status=pending');
      if (res.ok) {
        const data = await res.json();
        setAllTransactions(data.transactions || []);
        setGrouped(data.grouped || []);
        setTotalPending(data.totalPending || 0);
        setTotalAmount(data.totalAmount || 0);
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load pending recoveries', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000); // auto-refresh every 30s
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
      const res = await fetch('/api/recoveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', transactionIds: txnIds, approvedBy: user.id }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({
          title: 'Approved!',
          description: `${data.processed} recovery(ies) approved — balances updated`,
        });
        setSelectedIds(new Set());
        fetchPending();
      } else {
        const err = await res.json();
        toast({ title: 'Error', description: err.error || 'Failed to approve', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectId) return;
    setActionLoading(rejectId);
    try {
      const res = await fetch('/api/recoveries', {
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

  const displayTxns = selectedOB
    ? allTransactions.filter(t => t.creator.id === selectedOB)
    : allTransactions;

  const selectedTxnsList = allTransactions.filter(t => selectedIds.has(t.id));
  const selectedTotal = selectedTxnsList.reduce((s, t) => s + t.amount, 0);

  // Auto-expand OB when selected
  useEffect(() => {
    if (selectedOB && !expandedOBs.has(selectedOB)) {
      setExpandedOBs(prev => new Set([...prev, selectedOB]));
    }
  }, [selectedOB, expandedOBs]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Approve Recovery</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review and approve orderbooker recovery submissions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="hover-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-orange-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Pending</p>
                <p className="text-lg font-bold text-orange-600 tabular-nums">{totalPending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center">
                <Banknote className="h-4.5 w-4.5 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Total Amount</p>
                <p className="text-lg font-bold text-green-600 tabular-nums">{formatCurrency(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-lift">
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Smartphone className="h-4.5 w-4.5 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Orderbookers</p>
                <p className="text-lg font-bold text-blue-600 tabular-nums">{grouped.length}</p>
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
                <p className="text-[10px] font-medium text-muted-foreground">Selected</p>
                <p className="text-lg font-bold text-primary tabular-nums">{selectedIds.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OB Selector + Bulk Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* OB Filter */}
            <div className="flex-1 w-full">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
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
                    {g.orderbooker.name} ({g.transactions.length})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedIds.size > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{selectedIds.size}</span> selected —{' '}
                  <span className="font-bold text-green-600">{formatCurrency(selectedTotal)}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : displayTxns.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CircleCheck className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-sm font-bold text-foreground">All Clear!</p>
            <p className="text-xs text-muted-foreground mt-1">
              No pending recoveries to review. Everything is approved.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {displayGroups.map(group => {
            const isExpanded = expandedOBs.has(group.orderbooker.id);
            const allGroupSelected = group.transactions.every(t => selectedIds.has(t.id));

            return (
              <Card key={group.orderbooker.id} className="overflow-hidden">
                {/* OB Header */}
                <button
                  onClick={() => toggleExpand(group.orderbooker.id)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{group.orderbooker.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {group.orderbooker.phone || 'No phone'}
                          </span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {group.transactions.length} entries
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600 tabular-nums">
                          {formatCurrency(group.totalAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">pending</p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Transactions */}
                {isExpanded && (
                  <div className="border-t">
                    <div className="px-4 py-2 bg-muted/30 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          onChange={() => toggleSelectAll(group.transactions)}
                          className="rounded border-muted-foreground/30"
                        />
                        Select All
                      </label>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-[10px] h-7 px-3"
                        onClick={() => handleApprove(group.transactions.map(t => t.id))}
                        disabled={actionLoading !== null}
                      >
                        {actionLoading === `bulk-approve` ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        )}
                        Approve All ({group.transactions.length})
                      </Button>
                    </div>

                    <div className="divide-y">
                      {group.transactions.map(txn => {
                        const isSelected = selectedIds.has(txn.id);
                        const hasGPS = txn.gpsLat !== null && txn.gpsLng !== null;
                        const isLoading = actionLoading === txn.id;

                        return (
                          <div
                            key={txn.id}
                            className={`px-4 py-3 transition-colors ${
                              isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'
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
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {txn.shop.name}
                                  </span>
                                  {txn.shop.area && (
                                    <>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                        <MapPin className="h-2.5 w-2.5" />{txn.shop.area}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Timer className="h-2.5 w-2.5" />{getTimeAgo(txn.createdAt)}
                                  </span>
                                  {hasGPS ? (
                                    <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                                      <CheckCircle2 className="h-2.5 w-2.5" />GPS
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-red-500 font-medium flex items-center gap-0.5">
                                      <XCircle className="h-2.5 w-2.5" />No GPS
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    Shop Balance: {formatCurrency(txn.shop.balance)}
                                  </span>
                                </div>
                                {txn.description && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                                    &quot;{txn.description}&quot;
                                  </p>
                                )}
                                {hasGPS && txn.gpsAddress && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                                    📍 {txn.gpsAddress}
                                  </p>
                                )}
                              </div>

                              {/* Amount + Actions */}
                              <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                                <p className="text-sm font-bold text-green-600 tabular-nums">
                                  {formatCurrency(txn.amount)}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApprove([txn.id])}
                                    disabled={isLoading}
                                    className="flex items-center gap-1 rounded-md bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-[10px] font-bold px-2 py-1 transition-colors active:scale-95"
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
                                    className="flex items-center gap-1 rounded-md bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-600 text-[10px] font-bold px-2 py-1 transition-colors active:scale-95"
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
              Are you sure you want to reject this recovery? The shop balance will NOT be affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Reason (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Amount doesn't match, incorrect shop..."
                className="w-full min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading !== null}
            >
              {actionLoading === rejectId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject Recovery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
