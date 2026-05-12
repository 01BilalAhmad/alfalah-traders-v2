'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Users,
  Plus,
  Pencil,
  Loader2,
  UserMinus,
  Phone,
  Store,
  Wallet,
  CheckCircle,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Layers,
  Target,
  Flame,
  Building2,
  TrendingUp,
  Shield,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatPKR } from '@/lib/utils';

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
  allRoutesEnabled: boolean;
  companyId: string | null;
  companyName: string | null;
  totalShops: number;
  totalOutstanding: number;
  createdAt: string;
}

interface VisitStreak {
  currentStreak: number;
  longestStreak: number;
  lastVisitDate: string | null;
}

interface MonthlyTarget {
  target: number;
  month: string;
  achieved: number;
}

interface UsernameCheckResult {
  available: boolean;
  message: string;
  existingUser?: {
    name: string;
    username: string;
    status: string;
  };
}

export default function AdminOrderbookers() {
  const { user } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOB, setEditingOB] = useState<Orderbooker | null>(null);
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Username validation state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const usernameCheckRef = useRef<NodeJS.Timeout | null>(null);

  // Confirmation dialog state
  const [confirmDeactivate, setConfirmDeactivate] = useState<Orderbooker | null>(null);

  // Visit streak state
  const [visitStreaks, setVisitStreaks] = useState<Record<string, VisitStreak>>({});
  const [streaksLoading, setStreaksLoading] = useState(true);

  // Monthly target state
  const [monthlyTargets, setMonthlyTargets] = useState<Record<string, MonthlyTarget>>({});
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetOB, setTargetOB] = useState<Orderbooker | null>(null);
  const [targetMonth, setTargetMonth] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetSaving, setTargetSaving] = useState(false);

  // Company assignment state
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [formCompanyId, setFormCompanyId] = useState<string>('');
  const [formAllRoutesEnabled, setFormAllRoutesEnabled] = useState(false);

  const fetchOrderbookers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/orderbookers');
      if (res.ok) setOrderbookers(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrderbookers(); fetchCompanies(); }, [fetchOrderbookers]);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/companies?status=active');
      if (res.ok) {
        const data = await res.json();
        setCompanies((data.companies || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch { /* silent */ }
  }, []);

  // Fetch visit streaks for all orderbookers
  useEffect(() => {
    async function fetchStreaks() {
      if (orderbookers.length === 0) return;
      setStreaksLoading(true);
      const streakMap: Record<string, VisitStreak> = {};
      await Promise.all(
        orderbookers.map(async (ob) => {
          try {
            const res = await apiFetch(`/api/users/${ob.id}/visit-streak`);
            if (res.ok) {
              streakMap[ob.id] = await res.json();
            }
          } catch { /* silent */ }
        })
      );
      setVisitStreaks(streakMap);
      setStreaksLoading(false);
    }
    fetchStreaks();
  }, [orderbookers]);

  // Fetch monthly targets for all orderbookers
  useEffect(() => {
    async function fetchTargets() {
      if (orderbookers.length === 0) return;
      setTargetsLoading(true);
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const targetMap: Record<string, MonthlyTarget> = {};
      await Promise.all(
        orderbookers.map(async (ob) => {
          try {
            const [targetRes, recoveryRes] = await Promise.all([
              apiFetch(`/api/users/${ob.id}/daily-target?month=${currentMonth}`),
              apiFetch(`/api/reports/recovery-summary?date=${now.toISOString().split('T')[0]}`),
            ]);
            if (targetRes.ok) {
              const targetData = await targetRes.json();
              let achieved = 0;
              if (recoveryRes.ok) {
                const recoveryData = await recoveryRes.json();
                // Get this OB's recovery for the month
                const obRecovery = recoveryData.byOrderbooker?.find((b: { orderbookerId: string; total: number }) => b.orderbookerId === ob.id);
                achieved = obRecovery?.total || 0;
              }
              targetMap[ob.id] = {
                target: targetData.target || 0,
                month: currentMonth,
                achieved,
              };
            }
          } catch { /* silent */ }
        })
      );
      setMonthlyTargets(targetMap);
      setTargetsLoading(false);
    }
    fetchTargets();
  }, [orderbookers]);

  const openTargetDialog = (ob: Orderbooker) => {
    setTargetOB(ob);
    const now = new Date();
    setTargetMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const existing = monthlyTargets[ob.id];
    setTargetAmount(existing?.target ? String(existing.target) : '');
    setTargetDialogOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!targetOB || !targetMonth || !targetAmount) return;
    setTargetSaving(true);
    try {
      const res = await apiFetch(`/api/users/${targetOB.id}/daily-target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: Number(targetAmount),
          month: targetMonth,
          createdBy: user?.id || 'admin',
        }),
      });
      if (res.ok) {
        toast({ title: 'Target Set', description: `Monthly target of ${formatPKR(Number(targetAmount))} set for ${targetOB.name}` });
        setTargetDialogOpen(false);
        // Update local state
        setMonthlyTargets(prev => ({
          ...prev,
          [targetOB.id]: {
            target: Number(targetAmount),
            month: targetMonth,
            achieved: prev[targetOB.id]?.achieved || 0,
          },
        }));
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to set target', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setTargetSaving(false);
    }
  };

  // Real-time username validation with debounce
  const checkUsername = useCallback(async (username: string, excludeId?: string) => {
    const trimmed = username.trim().toLowerCase();

    if (trimmed.length === 0) {
      setUsernameStatus('idle');
      setUsernameMessage('');
      return;
    }

    if (trimmed.length < 2) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username must be at least 2 characters');
      return;
    }

    // Only allow alphanumeric and underscores
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Only lowercase letters, numbers, and underscores allowed');
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    try {
      const params = new URLSearchParams({ username: trimmed });
      if (excludeId) params.set('excludeId', excludeId);
      const res = await apiFetch(`/api/orderbookers/check-username?${params}`);
      if (res.ok) {
        const data: UsernameCheckResult = await res.json();
        setUsernameStatus(data.available ? 'available' : 'taken');
        setUsernameMessage(data.message);
      }
    } catch {
      setUsernameStatus('idle');
      setUsernameMessage('');
    }
  }, []);

  const handleUsernameChange = (value: string) => {
    setFormUsername(value);
    if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
    usernameCheckRef.current = setTimeout(() => {
      checkUsername(value, editingOB?.id);
    }, 400);
  };

  const openAddDialog = () => {
    setEditingOB(null);
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormPhone('');
    setFormCompanyId('');
    setFormAllRoutesEnabled(false);
    setUsernameStatus('idle');
    setUsernameMessage('');
    setDialogOpen(true);
  };

  const openEditDialog = (ob: Orderbooker) => {
    setEditingOB(ob);
    setFormName(ob.name);
    setFormUsername(ob.username);
    setFormPassword('');
    setFormPhone(ob.phone || '');
    setFormCompanyId(ob.companyId || '');
    setFormAllRoutesEnabled(ob.allRoutesEnabled ?? false);
    setUsernameStatus('idle');
    setUsernameMessage('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!editingOB && (!formUsername.trim() || !formPassword.trim())) {
      toast({ title: 'Error', description: 'Username and password are required', variant: 'destructive' });
      return;
    }
    // Block submit if username is taken
    if (!editingOB && usernameStatus === 'taken') {
      toast({ title: 'Error', description: 'Please choose a different username', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (editingOB) {
        payload.id = editingOB.id;
        payload.name = formName.trim();
        payload.phone = formPhone.trim() || '';
        payload.companyId = formCompanyId || null;
        payload.allRoutesEnabled = formAllRoutesEnabled;
        if (formPassword.trim()) payload.password = formPassword.trim();
      } else {
        payload.name = formName.trim();
        payload.username = formUsername.trim();
        payload.password = formPassword.trim();
        payload.phone = formPhone.trim() || '';
        payload.companyId = formCompanyId || null;
        payload.allRoutesEnabled = formAllRoutesEnabled;
      }

      const method = editingOB ? 'PATCH' : 'POST';
      const res = await apiFetch('/api/orderbookers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: editingOB ? 'Updated' : 'Created', description: `${formName} has been ${editingOB ? 'updated' : 'created'}` });
      setDialogOpen(false);
      fetchOrderbookers();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate || confirmDeactivate.status === 'inactive') return;
    try {
      const res = await apiFetch('/api/orderbookers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDeactivate.id, status: 'inactive' }),
      });
      if (res.ok) {
        toast({ title: 'Deactivated', description: `${confirmDeactivate.name} has been deactivated` });
        setConfirmDeactivate(null);
        fetchOrderbookers();
      }
    } catch { /* silent */ }
  };

  const handleToggleAllRoutes = async (ob: Orderbooker) => {
    try {
      const newValue = !ob.allRoutesEnabled;
      const res = await apiFetch('/api/orderbookers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ob.id, allRoutesEnabled: newValue }),
      });
      if (res.ok) {
        toast({
          title: newValue ? 'All Routes Enabled' : 'All Routes Disabled',
          description: `${ob.name} can ${newValue ? 'now' : 'no longer'} see all days' shops at once`,
        });
        fetchOrderbookers();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    }
  };

  const canSubmit = formName.trim() && (editingOB ? true : (formUsername.trim() && formPassword.trim() && usernameStatus !== 'taken'));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Manage Orderbookers
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{orderbookers.length} orderbookers registered</p>
        </div>
        <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white ">
          <Plus className="h-4 w-4 mr-2" /> Add Orderbooker
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orderbookers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="empty-state-illustration mx-auto mb-4 h-20 w-20">
              <div className="relative z-10 h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-blue-100 dark:from-primary/20 dark:to-blue-900/30 flex items-center justify-center">
                <Users className="h-9 w-9 text-primary/50 animate-gentle-float" />
              </div>
            </div>
            <p className="font-semibold text-muted-foreground text-sm">No orderbookers found</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Add your first orderbooker to start managing credit routes.
            </p>
            <button
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors "
              onClick={openAddDialog}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Orderbooker
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger-children">
          {orderbookers.map((ob) => {
            const targetPct = monthlyTargets[ob.id]?.target
              ? Math.min((monthlyTargets[ob.id].achieved / monthlyTargets[ob.id].target) * 100, 100)
              : 0;
            const targetMet = monthlyTargets[ob.id]?.target && monthlyTargets[ob.id].achieved >= monthlyTargets[ob.id].target;

            return (
            <Card key={ob.id} className={`group relative overflow-hidden card-hover ${ob.status === 'inactive' ? 'opacity-60 grayscale-[30%]' : ''}`}>
              {/* Top accent gradient bar */}
              <div className={`h-1.5 w-full ${ob.status === 'active' ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700'}`} />

              <CardContent className="p-5 pt-4">
                {/* Header: Avatar + Name + Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`relative h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${ob.status === 'active' ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 dark:from-indigo-500/30 dark:to-purple-500/30' : 'bg-muted'}`}>
                      <span className={`text-base font-bold ${ob.status === 'active' ? 'bg-gradient-to-br from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent' : 'text-muted-foreground'}`}>
                        {ob.name.charAt(0).toUpperCase()}
                      </span>
                      {ob.status === 'active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{ob.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">@{ob.username}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] font-semibold animate-badge-pop shadow-sm ${ob.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {ob.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {ob.status.charAt(0).toUpperCase() + ob.status.slice(1)}
                  </Badge>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-xl bg-muted/60 dark:bg-muted/30 border border-border/50 p-2.5 hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Store className="h-3 w-3 text-indigo-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Shops</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums">{ob.totalShops}</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 dark:bg-muted/30 border border-border/50 p-2.5 hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wallet className="h-3 w-3 text-red-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Outstanding</span>
                    </div>
                    <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">{formatPKR(ob.totalOutstanding)}</p>
                  </div>
                </div>

                {/* Detail Row */}
                <div className="space-y-2 mb-3">
                  {ob.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{ob.phone}</span>
                    </div>
                  )}
                  {ob.companyName && (
                    <div className="flex items-center gap-2 text-xs">
                      <Building2 className="h-3.5 w-3.5 text-purple-500" />
                      <Badge className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800 text-[10px] font-semibold gap-1">
                        <Shield className="h-2.5 w-2.5" />
                        {ob.companyName}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Visit Streak Badge */}
                <div className="flex items-center gap-2 mb-3">
                  {streaksLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : visitStreaks[ob.id] && visitStreaks[ob.id].currentStreak > 0 ? (
                    <Badge className="bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 border-orange-200 dark:from-orange-900/30 dark:to-amber-900/30 dark:text-orange-400 dark:border-orange-800 text-[10px] font-bold gap-1 shadow-sm">
                      <Flame className="h-3 w-3" />
                      {visitStreaks[ob.id].currentStreak} Day Streak
                      {visitStreaks[ob.id].currentStreak >= 7 && <Sparkles className="h-2.5 w-2.5 text-amber-500" />}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] font-medium">
                      No Streak
                    </Badge>
                  )}
                </div>

                {/* Monthly Recovery Target Progress */}
                {monthlyTargets[ob.id] && monthlyTargets[ob.id].target > 0 && (
                  <div className={`mb-3 p-3 rounded-xl border transition-colors ${targetMet ? 'bg-green-50/80 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-muted/50 border-border/50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Monthly Target
                      </span>
                      <span className="text-[10px] font-bold tabular-nums">
                        {formatPKR(monthlyTargets[ob.id].achieved)} / {formatPKR(monthlyTargets[ob.id].target)}
                      </span>
                    </div>
                    <Progress
                      value={targetPct}
                      className={`h-2 ${targetMet ? '[&>div]:bg-green-500' : ''}`}
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px] text-muted-foreground">
                        {Math.round(targetPct)}% achieved
                      </span>
                      <span className={`text-[9px] font-semibold ${
                        targetMet
                          ? 'text-green-600 dark:text-green-400'
                          : monthlyTargets[ob.id].achieved >= monthlyTargets[ob.id].target * 0.7
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}>
                        {targetMet
                          ? 'Target met!'
                          : `${formatPKR(monthlyTargets[ob.id].target - monthlyTargets[ob.id].achieved)} remaining`}
                      </span>
                    </div>
                  </div>
                )}

                {/* All Routes Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <Layers className="h-3.5 w-3.5 text-indigo-500" />
                    </div>
                    <div>
                      <span className="text-xs font-medium">All Routes Access</span>
                      <p className="text-[10px] text-muted-foreground">Show all days&apos; shops at once</p>
                    </div>
                  </div>
                  <Switch
                    checked={ob.allRoutesEnabled}
                    onCheckedChange={() => handleToggleAllRoutes(ob)}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 dark:hover:border-indigo-800 transition-colors" onClick={() => openEditDialog(ob)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 dark:hover:bg-purple-900/20 dark:hover:text-purple-400 dark:hover:border-purple-800 transition-colors" onClick={() => openTargetDialog(ob)}>
                    <Target className="h-3.5 w-3.5 mr-1" /> Target
                  </Button>
                  {ob.status === 'active' && (
                    <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" onClick={() => setConfirmDeactivate(ob)}>
                      <UserMinus className="h-3.5 w-3.5 mr-1" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setUsernameStatus('idle');
          setUsernameMessage('');
          if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
        }
        setDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-md dialog-content-animate">
          <DialogHeader>
            <DialogTitle>{editingOB ? 'Edit Orderbooker' : 'Add New Orderbooker'}</DialogTitle>
            <DialogDescription>
              {editingOB ? `Editing ${editingOB.name}` : 'Fill in orderbooker details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Muhammad Ahmed" className="" />
            </div>
            {!editingOB && (
              <div className="space-y-2">
                <Label>Username *</Label>
                <div className="relative">
                  <Input
                    value={formUsername}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="e.g., ahmed"
                    className={` pr-9 ${
                      usernameStatus === 'available' ? 'border-green-500 focus-visible:ring-green-500/20' :
                      usernameStatus === 'taken' ? 'border-destructive focus-visible:ring-destructive/20' :
                      usernameStatus === 'invalid' ? 'border-amber-500 focus-visible:ring-amber-500/20' :
                      ''
                    }`}
                    autoComplete="off"
                  />
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {usernameStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {usernameStatus === 'taken' && <XCircle className="h-4 w-4 text-destructive" />}
                    {usernameStatus === 'invalid' && <AlertCircle className="h-4 w-4 text-amber-500" />}
                  </div>
                </div>
                {usernameMessage && usernameStatus !== 'idle' && (
                  <p className={`text-xs flex items-center gap-1 ${
                    usernameStatus === 'available' ? 'text-green-600' :
                    usernameStatus === 'taken' ? 'text-destructive' :
                    usernameStatus === 'checking' ? 'text-muted-foreground' :
                    'text-amber-600'
                  }`}>
                    {usernameMessage}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">Lowercase letters, numbers, and underscores only. This will be their login username.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{editingOB ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
              <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder={editingOB ? 'Enter new password' : 'Set password'} className="" />
              {!editingOB && formPassword && (
                <div className="flex items-center gap-2">
                  <div className={`h-1 flex-1 rounded-full ${formPassword.length < 4 ? 'bg-red-500' : formPassword.length < 6 ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <span className="text-[10px] text-muted-foreground">
                    {formPassword.length < 4 ? 'Too short' : formPassword.length < 6 ? 'Weak' : 'Strong'}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g., 0300-1234567" className="" />
            </div>
            <div className="space-y-2">
              <Label>Assign Company</Label>
              <select
                value={formCompanyId}
                onChange={(e) => setFormCompanyId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">No Company (All Companies)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                If assigned, this orderbooker will only see their company&apos;s credit data.
              </p>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <div>
                  <span className="text-xs font-medium">All Routes Access</span>
                  <p className="text-[10px] text-muted-foreground">Show all days&apos; shops at once</p>
                </div>
              </div>
              <Switch
                checked={formAllRoutesEnabled}
                onCheckedChange={() => setFormAllRoutesEnabled(!formAllRoutesEnabled)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit} className="bg-primary hover:bg-primary/90 ">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingOB ? 'Update' : 'Create'}
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

      {/* Set Target Dialog */}
      <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
        <DialogContent className="sm:max-w-md dialog-content-animate">
          <DialogHeader>
            <DialogTitle>Set Monthly Target</DialogTitle>
            <DialogDescription>
              Set recovery target for {targetOB?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Month (YYYY-MM)</Label>
              <Input
                value={targetMonth}
                onChange={(e) => setTargetMonth(e.target.value)}
                placeholder="e.g., 2025-03"
                className=""
              />
              <p className="text-[10px] text-muted-foreground">Format: Year-Month (e.g., 2025-03)</p>
            </div>
            <div className="space-y-2">
              <Label>Target Amount (Rs.)</Label>
              <Input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="e.g., 500000"
                className=""
              />
              {targetAmount && (
                <p className="text-xs text-muted-foreground">Target: {formatPKR(Number(targetAmount))}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTargetDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTarget} disabled={targetSaving || !targetMonth || !targetAmount} className="bg-primary hover:bg-primary/90 ">
              {targetSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Set Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
