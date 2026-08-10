'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Users,
  Plus,
  Pencil,
  Loader2,
  Trash2,
  Phone,
  UserCheck,
  CheckCircle,
  XCircle,
  Search,
  UserCog,
  Building2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

interface AssignedOB {
  id: string;
  orderbookerId: string;
  orderbookerName: string;
  orderbookerUsername: string;
  orderbookerStatus: string;
}

interface Teller {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  status: string;
  assignedOBs: AssignedOB[];
  createdAt: string;
}

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  status: string;
}

export default function AdminTellerManagement() {
  const [tellers, setTellers] = useState<Teller[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeller, setEditingTeller] = useState<Teller | null>(null);
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAssignedOBIds, setFormAssignedOBIds] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');

  const [confirmDelete, setConfirmDelete] = useState<Teller | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch tellers
  const fetchTellers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tellers');
      if (res.ok) {
        const data = await res.json();
        setTellers(data.tellers || []);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to load tellers', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch orderbookers (active only)
  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers?status=active');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setOrderbookers(list.map((ob: any) => ({
          id: ob.id,
          name: ob.name,
          username: ob.username,
          status: ob.status,
        })));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchTellers();
    fetchOrderbookers();
  }, [fetchTellers, fetchOrderbookers]);

  const openAddDialog = () => {
    setEditingTeller(null);
    setFormName('');
    setFormUsername('');
    setFormPassword('');
    setFormPhone('');
    setFormAssignedOBIds([]);
    setFormStatus('active');
    setDialogOpen(true);
  };

  const openEditDialog = (teller: Teller) => {
    setEditingTeller(teller);
    setFormName(teller.name);
    setFormUsername(teller.username);
    setFormPassword('');
    setFormPhone(teller.phone || '');
    setFormAssignedOBIds(teller.assignedOBs.map((a) => a.orderbookerId));
    setFormStatus(teller.status === 'inactive' ? 'inactive' : 'active');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    if (!editingTeller) {
      if (!formUsername.trim()) {
        toast({ title: 'Error', description: 'Username is required', variant: 'destructive' });
        return;
      }
      if (!formPassword.trim()) {
        toast({ title: 'Error', description: 'Password is required', variant: 'destructive' });
        return;
      }
      if (!/^[a-z0-9_]+$/.test(formUsername.trim().toLowerCase())) {
        toast({ title: 'Error', description: 'Username can only contain lowercase letters, numbers, and underscores', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        phone: formPhone.trim() || '',
        assignedOBIds: formAssignedOBIds,
      };

      if (editingTeller) {
        payload.status = formStatus;
        if (formPassword.trim()) payload.password = formPassword.trim();
      } else {
        payload.username = formUsername.trim().toLowerCase();
        payload.password = formPassword.trim();
      }

      const url = editingTeller ? `/api/tellers/${editingTeller.id}` : '/api/tellers';
      const method = editingTeller ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to save teller', variant: 'destructive' });
        return;
      }
      toast({
        title: editingTeller ? 'Updated' : 'Created',
        description: `${formName} has been ${editingTeller ? 'updated' : 'created'}`,
      });
      setDialogOpen(false);
      fetchTellers();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (teller: Teller) => {
    const newStatus = teller.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await apiFetch(`/api/tellers/${teller.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast({
          title: newStatus === 'active' ? 'Activated' : 'Deactivated',
          description: `${teller.name} is now ${newStatus}`,
        });
        fetchTellers();
      }
    } catch { /* silent */ }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await apiFetch(`/api/tellers/${confirmDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Deleted', description: `${confirmDelete.name} has been deleted` });
        setConfirmDelete(null);
        fetchTellers();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to delete', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
  };

  const toggleOB = (obId: string) => {
    setFormAssignedOBIds((prev) =>
      prev.includes(obId) ? prev.filter((id) => id !== obId) : [...prev, obId]
    );
  };

  const filteredTellers = tellers.filter((t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.username.toLowerCase().includes(q) ||
      (t.phone || '').toLowerCase().includes(q) ||
      t.assignedOBs.some((ob) => ob.orderbookerName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Teller Management
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tellers.length} teller{tellers.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <Button type="button" onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Teller
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tellers by name, username, phone, or OB..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTellers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <UserCog className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="font-semibold text-muted-foreground text-sm">
              {searchTerm ? 'No tellers match your search' : 'No tellers yet'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              {searchTerm
                ? 'Try a different search term.'
                : 'Add your first teller to start tallying shop balances.'}
            </p>
            {!searchTerm && (
              <button
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                onClick={openAddDialog}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Teller
              </button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto sidebar-scroll">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[180px]">Name</TableHead>
                    <TableHead className="min-w-[140px]">Username</TableHead>
                    <TableHead className="min-w-[140px]">Phone</TableHead>
                    <TableHead className="min-w-[220px]">Assigned Orderbookers</TableHead>
                    <TableHead className="min-w-[110px]">Status</TableHead>
                    <TableHead className="text-right min-w-[160px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTellers.map((teller) => (
                    <TableRow key={teller.id} className={teller.status === 'inactive' ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                            teller.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {teller.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm leading-tight">{teller.name}</p>
                            <p className="text-[10px] text-muted-foreground">Teller</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono text-muted-foreground">@{teller.username}</span>
                      </TableCell>
                      <TableCell>
                        {teller.phone ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3 text-rose-500" />
                            <span>{teller.phone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {teller.assignedOBs.length === 0 ? (
                          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                            No OBs assigned
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {teller.assignedOBs.map((ob) => (
                              <Badge
                                key={ob.orderbookerId}
                                className={`text-[10px] font-medium ${
                                  ob.orderbookerStatus === 'active'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                                    : 'bg-muted text-muted-foreground border-border'
                                }`}
                              >
                                <Users className="h-2.5 w-2.5" />
                                {ob.orderbookerName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] font-semibold ${
                            teller.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {teller.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                          {teller.status.charAt(0).toUpperCase() + teller.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => openEditDialog(teller)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => setConfirmDelete(teller)}
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
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTeller ? 'Edit Teller' : 'Add New Teller'}</DialogTitle>
            <DialogDescription>
              {editingTeller
                ? `Editing ${editingTeller.name}`
                : 'Create a teller account. Tellers can only tally shop balances for assigned orderbookers.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto sidebar-scroll pr-1">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Ahmed Teller"
              />
            </div>

            <div className="space-y-2">
              <Label>Username {!editingTeller && '*'}</Label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="e.g., ahmed_teller"
                disabled={!!editingTeller}
                className={editingTeller ? 'bg-muted text-muted-foreground' : ''}
              />
              <p className="text-[10px] text-muted-foreground">
                Lowercase letters, numbers, and underscores only. Used for login.
                {editingTeller && ' Username cannot be changed after creation.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{editingTeller ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingTeller ? 'Enter new password' : 'Set password'}
              />
            </div>

            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g., 0300-1234567"
              />
            </div>

            {editingTeller && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
                <div>
                  <span className="text-sm font-medium">Account Status</span>
                  <p className="text-xs text-muted-foreground">Inactive tellers cannot log in</p>
                </div>
                <Switch
                  checked={formStatus === 'active'}
                  onCheckedChange={(checked) => setFormStatus(checked ? 'active' : 'inactive')}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Assign Orderbookers</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Teller can only tally shops belonging to these orderbookers.
              </p>
              <div className="border rounded-lg p-3 space-y-1 max-h-56 overflow-y-auto bg-muted/30 sidebar-scroll">
                {orderbookers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <Building2 className="h-6 w-6 mb-1 opacity-50" />
                    <p className="text-xs">No active orderbookers available</p>
                  </div>
                ) : (
                  orderbookers.map((ob) => {
                    const isSelected = formAssignedOBIds.includes(ob.id);
                    return (
                      <label
                        key={ob.id}
                        className={`flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/30'
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOB(ob.id)}
                          className="h-4 w-4 rounded border-primary"
                        />
                        <div className="flex-1 flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <span className="text-sm font-medium">{ob.name}</span>
                            <span className="ml-2 text-[10px] text-muted-foreground">@{ob.username}</span>
                          </div>
                        </div>
                        {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary" />}
                      </label>
                    );
                  })
                )}
              </div>
              {formAssignedOBIds.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {formAssignedOBIds.length} orderbooker{formAssignedOBIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingTeller ? 'Save Changes' : 'Create Teller'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Teller</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{confirmDelete?.name}</strong> (@{confirmDelete?.username})?
              This will permanently remove the teller account and all their orderbooker assignments.
              Past tally records will be preserved for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete Teller
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
