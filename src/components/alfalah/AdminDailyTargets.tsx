'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Target,
  Users,
  TrendingUp,
  AlertCircle,
  Loader2,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Trophy,
  CheckCircle2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatPKR } from '@/lib/utils';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
}

interface DailyTarget {
  id: string;
  orderbookerId: string;
  target: number;
  month: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface OBTargetInfo {
  ob: Orderbooker;
  target: DailyTarget | null;
  monthRecovery: number;
  progress: number;
}

function TargetsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-5 w-5" />
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDailyTargets() {
  const { user } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [targets, setTargets] = useState<DailyTarget[]>([]);
  const [recoveryMap, setRecoveryMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOB, setEditingOB] = useState<Orderbooker | null>(null);
  const [targetAmount, setTargetAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState<OBTargetInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [obRes, targetRes] = await Promise.all([
        apiFetch('/api/orderbookers'),
        apiFetch(`/api/reports/recovery-summary?month=${selectedMonth}`),
      ]);

      const obs = obRes.ok ? await obRes.json() : [];
      const activeOBs = Array.isArray(obs)
        ? obs.filter((o: Orderbooker) => o.status === 'active')
        : [];
      setOrderbookers(activeOBs);

      // Fetch targets for each OB for selected month
      const targetPromises = activeOBs.map((ob: Orderbooker) =>
        apiFetch(`/api/users/${ob.id}/daily-target?month=${selectedMonth}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );
      const targetResults = await Promise.all(targetPromises);
      const validTargets = targetResults.filter(Boolean) as DailyTarget[];
      setTargets(validTargets);

      // Fetch recovery per OB for the month
      const todayStr = selectedMonth + '-01';
      const [year, month] = selectedMonth.split('-').map(Number);
      const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;

      const recMap: Record<string, number> = {};
      for (const ob of activeOBs) {
        try {
          const res = await apiFetch(
            `/api/transactions?createdBy=${ob.id}&type=recovery&status=approved&dateFrom=${todayStr}&dateTo=${nextMonth}-01&limit=9999`
          );
          if (res.ok) {
            const data = await res.json();
            const total = (data.transactions || []).reduce(
              (s: number, t: { amount: number }) => s + Number(t.amount), 0
            );
            recMap[ob.id] = total;
          }
        } catch {
          recMap[ob.id] = 0;
        }
      }
      setRecoveryMap(recMap);
    } catch {
      toast({ title: 'Error', description: 'Failed to load recovery targets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build combined OB+target info
  const obTargetList: OBTargetInfo[] = useMemo(() => {
    return orderbookers.map(ob => {
      const target = targets.find(t => t.orderbookerId === ob.id) || null;
      const monthRecovery = recoveryMap[ob.id] || 0;
      const progress = target && target.target > 0
        ? Math.min(100, Math.round((monthRecovery / target.target) * 100))
        : 0;
      return { ob, target, monthRecovery, progress };
    }).sort((a, b) => b.progress - a.progress);
  }, [orderbookers, targets, recoveryMap]);

  // Summary KPIs
  const summary = useMemo(() => {
    const withTargets = obTargetList.filter(t => t.target);
    const totalTarget = withTargets.reduce((s, t) => s + (t.target?.target || 0), 0);
    const totalRecovery = obTargetList.reduce((s, t) => s + t.monthRecovery, 0);
    const avgProgress = withTargets.length > 0
      ? Math.round(withTargets.reduce((s, t) => s + t.progress, 0) / withTargets.length)
      : 0;
    const onTrack = withTargets.filter(t => t.progress >= 80).length;
    return {
      totalOBs: orderbookers.length,
      totalTarget,
      totalRecovery,
      avgProgress,
      onTrack,
      withTargetCount: withTargets.length,
    };
  }, [obTargetList, orderbookers]);

  // Generate month options (last 6 months + next 2)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -6; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      options.push({ value: val, label: getMonthLabel(val) });
    }
    return options;
  }, []);

  const handleOpenDialog = (ob: Orderbooker) => {
    setEditingOB(ob);
    const existing = targets.find(t => t.orderbookerId === ob.id);
    setTargetAmount(existing ? String(existing.target) : '');
    setDialogOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!editingOB || !targetAmount) return;
    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid target amount', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/users/${editingOB.id}/daily-target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: amount,
          month: selectedMonth,
          createdBy: user?.id || 'admin',
        }),
      });
      if (res.ok) {
        toast({
          title: 'Target Saved',
          description: `${getMonthLabel(selectedMonth)} target for ${editingOB.name}: ${formatPKR(amount)}`,
        });
        setDialogOpen(false);
        fetchData();
      } else {
        toast({ title: 'Error', description: 'Failed to save target', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTarget = async () => {
    if (!deletingTarget?.target) return;
    setDeleting(true);
    try {
      const res = await apiFetch(
        `/api/users/${deletingTarget.ob.id}/daily-target?month=${selectedMonth}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        toast({ title: 'Target Deleted', description: 'Monthly target has been removed' });
        setDeleteDialogOpen(false);
        setDeletingTarget(null);
        fetchData();
      } else {
        toast({ title: 'Error', description: 'Failed to delete target', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <TargetsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Monthly Recovery Targets
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set and track monthly recovery targets for each orderbooker
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={() => fetchData()}>
            <Loader2 className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : 'hidden'}`} />
            <TrendingUp className={`h-3.5 w-3.5 ${loading ? 'hidden' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shadow-sm">
                <Users className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Orderbookers</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.totalOBs}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shadow-sm">
                <Target className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">{getMonthLabel(selectedMonth)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Target</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{formatPKR(summary.totalTarget)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shadow-sm">
                <TrendingUp className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Recovered</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Recovery</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{formatPKR(summary.totalRecovery)}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated card-hover border border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">On Track</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">OBs On Track (80%+)</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">
              {summary.onTrack}/{summary.withTargetCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* OB Targets Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Orderbooker Targets — {getMonthLabel(selectedMonth)}
            </CardTitle>
            <Badge variant="secondary" className="text-[11px]">
              {summary.withTargetCount} of {summary.totalOBs} have targets
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary hover:bg-transparent">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Monthly Target</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Recovery</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Progress</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {obTargetList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="text-center py-10">
                        <AlertCircle className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground text-sm">No orderbookers found</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Add orderbookers to set recovery targets</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  obTargetList.map((info, idx) => (
                    <TableRow
                      key={info.ob.id}
                      className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                    >
                      <TableCell className="text-sm">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                          idx === 0 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          : idx === 1 ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          : idx === 2 ? 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-300'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{info.ob.name}</p>
                          <p className="text-[11px] text-muted-foreground">{info.ob.phone || info.ob.username}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {info.target ? (
                          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                            {formatPKR(info.target.target)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No target</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                          {formatPKR(info.monthRecovery)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1 min-w-[80px]">
                          <Progress
                            value={info.progress}
                            className="h-2 w-full"
                          />
                          <span className={`text-[11px] font-semibold tabular-nums ${
                            info.progress >= 80 ? 'text-slate-600 dark:text-slate-300' :
                            info.progress >= 50 ? 'text-slate-600 dark:text-slate-300' :
                            info.progress > 0 ? 'text-red-600' : 'text-muted-foreground'
                          }`}>
                            {info.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {info.target ? (
                          info.progress >= 100 ? (
                            <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Achieved
                            </Badge>
                          ) : info.progress >= 80 ? (
                            <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              On Track
                            </Badge>
                          ) : info.progress >= 50 ? (
                            <Badge className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              Behind
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800">
                              Critical
                            </Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="text-[10px]">No Target</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleOpenDialog(info.ob)}
                            title={info.target ? 'Edit Target' : 'Set Target'}
                          >
                            {info.target ? (
                              <Pencil className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                            ) : (
                              <Plus className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                            )}
                          </Button>
                          {info.target && (
                            <Button
            type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => { setDeletingTarget(info); setDeleteDialogOpen(true); }}
                              title="Delete Target"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Set/Edit Target Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {editingOB?.name ? (targets.find(t => t.orderbookerId === editingOB.id) ? 'Edit' : 'Set') : 'Set'} Recovery Target
            </DialogTitle>
            <DialogDescription>
              Set monthly recovery target for {editingOB?.name} — {getMonthLabel(selectedMonth)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Orderbooker</Label>
              <Input value={editingOB?.name || ''} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Month</Label>
              <Input value={getMonthLabel(selectedMonth)} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Target Amount (Rs.)</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="text-lg font-semibold"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Daily average: {targetAmount ? formatPKR(parseFloat(targetAmount) / 30) : '—'}
              </p>
            </div>
            {editingOB && recoveryMap[editingOB.id] > 0 && (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                  Current recovery this month: {formatPKR(recoveryMap[editingOB.id])}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveTarget} disabled={saving || !targetAmount}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Target className="h-4 w-4 mr-1" />}
              {saving ? 'Saving...' : 'Save Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Target Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Target
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the recovery target for {deletingTarget?.ob.name}?
            </DialogDescription>
          </DialogHeader>
          {deletingTarget?.target && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
              <p className="text-sm text-red-700 dark:text-red-400">
                Target: <strong>{formatPKR(deletingTarget.target.target)}</strong> for {getMonthLabel(selectedMonth)}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Recovery so far: {formatPKR(deletingTarget.monthRecovery)} ({deletingTarget.progress}%)
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteTarget} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
