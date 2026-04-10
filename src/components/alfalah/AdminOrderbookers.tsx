'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
  createdAt: string;
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

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function AdminOrderbookers() {
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

  const fetchOrderbookers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orderbookers');
      if (res.ok) setOrderbookers(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrderbookers(); }, [fetchOrderbookers]);

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
      const res = await fetch(`/api/orderbookers/check-username?${params}`);
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
      const payload: Record<string, string> = {};
      if (editingOB) {
        payload.id = editingOB.id;
        payload.name = formName.trim();
        payload.phone = formPhone.trim() || '';
        if (formPassword.trim()) payload.password = formPassword.trim();
      } else {
        payload.name = formName.trim();
        payload.username = formUsername.trim();
        payload.password = formPassword.trim();
        payload.phone = formPhone.trim() || '';
      }

      const method = editingOB ? 'PATCH' : 'POST';
      const res = await fetch('/api/orderbookers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
      const res = await fetch('/api/orderbookers', {
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
        <Button onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white focus-glow">
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
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors focus-glow"
              onClick={openAddDialog}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Orderbooker
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {orderbookers.map((ob) => (
            <Card key={ob.id} className={`alfalah-card-hover hover-lift ${ob.status === 'inactive' ? 'opacity-60' : ''} animate-card-entrance`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-full flex items-center justify-center ${ob.status === 'active' ? 'bg-primary/10' : 'bg-muted'}`}>
                      <span className={`text-sm font-bold ${ob.status === 'active' ? 'text-primary' : 'text-muted-foreground'}`}>
                        {ob.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{ob.name}</p>
                      <p className="text-xs text-muted-foreground">@{ob.username}</p>
                    </div>
                  </div>
                  <Badge className={`text-[10px] animate-badge-pop ${ob.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>
                    {ob.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {ob.status.charAt(0).toUpperCase() + ob.status.slice(1)}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  {ob.phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{ob.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Store className="h-3.5 w-3.5" />
                    <span>{ob.totalShops} active shops</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="font-semibold text-red-600">{formatCurrency(ob.totalOutstanding)}</span>
                    <span>outstanding</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs hover-glow-primary" onClick={() => openEditDialog(ob)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {ob.status === 'active' && (
                    <Button variant="outline" size="sm" className="text-xs text-destructive hover:text-destructive hover-glow-red" onClick={() => setConfirmDeactivate(ob)}>
                      <UserMinus className="h-3.5 w-3.5 mr-1" /> Deactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Muhammad Ahmed" className="input-enhanced" />
            </div>
            {!editingOB && (
              <div className="space-y-2">
                <Label>Username *</Label>
                <div className="relative">
                  <Input
                    value={formUsername}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="e.g., ahmed"
                    className={`input-enhanced pr-9 ${
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
              <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder={editingOB ? 'Enter new password' : 'Set password'} className="input-enhanced" />
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
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="e.g., 0300-1234567" className="input-enhanced" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !canSubmit} className="bg-primary hover:bg-primary/90 focus-glow">
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
    </div>
  );
}
