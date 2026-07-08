'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Building2,
  Plus,
  Pencil,
  Loader2,
  Trash2,
  Users,
  Store,
  CheckCircle,
  XCircle,
  Phone,
  Receipt,
  Warehouse,
  Power,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

interface Company {
  id: string;
  name: string;
  description: string | null;
  distributorPhone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    orderbookers: number;
    companyBalances: number;
    transactions: number;
  };
}

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDistributorPhone, setFormDistributorPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const openAddDialog = () => {
    setEditingCompany(null);
    setFormName('');
    setFormDescription('');
    setFormDistributorPhone('');
    setDialogOpen(true);
  };

  const openEditDialog = (company: Company) => {
    setEditingCompany(company);
    setFormName(company.name);
    setFormDescription(company.description || '');
    setFormDistributorPhone(company.distributorPhone || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'Error', description: 'Company name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        distributorPhone: formDistributorPhone.trim() || undefined,
      };

      let res: Response;
      if (editingCompany) {
        res = await apiFetch(`/api/companies/${editingCompany.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await apiFetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to save company', variant: 'destructive' });
        return;
      }

      toast({
        title: editingCompany ? 'Updated' : 'Created',
        description: `${formName} has been ${editingCompany ? 'updated' : 'created'}`,
      });
      setDialogOpen(false);
      fetchCompanies();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await apiFetch(`/api/companies/${confirmDelete.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: `${confirmDelete.name} has been deleted` });
        setConfirmDelete(null);
        fetchCompanies();
      } else {
        const data = await res.json();
        toast({ title: 'Cannot Delete', description: data.error || 'Failed to delete', variant: 'destructive' });
        setConfirmDelete(null);
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    }
  };

  const handleToggleStatus = async (company: Company) => {
    try {
      const newStatus = company.status === 'active' ? 'inactive' : 'active';
      const res = await apiFetch(`/api/companies/${company.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast({
          title: newStatus === 'active' ? 'Activated' : 'Deactivated',
          description: `${company.name} is now ${newStatus}`,
        });
        fetchCompanies();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Manage Companies
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {companies.length} {companies.length === 1 ? 'company' : 'companies'} registered
          </p>
        </div>
        <Button type="button" onClick={openAddDialog} className="bg-primary hover:bg-primary/90 text-white ">
          <Plus className="h-4 w-4 mr-2" /> Add Company
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">Multi-Company Credit System</p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1 leading-relaxed">
                Create companies (e.g., CBL, Cadbury, Shan Foods) and assign orderbookers to them.
                Each orderbooker will only see their assigned company&apos;s balances.
                Shops remain shared — their credit is tracked per company automatically when you post credits.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="h-20 w-20 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mb-4">
              <Building2 className="h-9 w-9 text-violet-600 dark:text-violet-400 animate-gentle-float" />
            </div>
            <p className="font-semibold text-muted-foreground text-sm">No companies yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Create your first company to start managing multi-company credit tracking.
            </p>
            <button
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors "
              onClick={openAddDialog}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Company
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 stagger-children">
          {companies.map((company) => (
            <Card
              key={company.id}
              className={`group relative overflow-hidden card-hover ${company.status === 'inactive' ? 'opacity-60 grayscale-[30%]' : ''}`}
            >
              {/* Top accent gradient bar */}
              <div className={`h-1.5 w-full ${company.status === 'active' ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-700'}`} />

              <CardContent className="p-5 pt-4">
                {/* Header: Avatar + Name + Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`relative h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${company.status === 'active' ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-muted'}`}>
                      <Building2 className={`h-5 w-5 ${company.status === 'active' ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`} />
                      {company.status === 'active' && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-600 dark:bg-emerald-400 border-2 border-white dark:border-gray-900" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{company.name}</p>
                      {company.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{company.description}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-[10px] font-semibold animate-badge-pop shadow-sm ${company.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                    {company.status === 'active' ? <CheckCircle className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {company.status.charAt(0).toUpperCase() + company.status.slice(1)}
                  </Badge>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-xl bg-muted/60 dark:bg-muted/30 border border-border/50 p-2.5 hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-1 mb-1">
                      <Users className="h-3 w-3 text-violet-500" />
                      <span className="text-[9px] text-muted-foreground font-medium">OBs</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums">{company._count?.orderbookers || 0}</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 dark:bg-muted/30 border border-border/50 p-2.5 hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-1 mb-1">
                      <Store className="h-3 w-3 text-cyan-500" />
                      <span className="text-[9px] text-muted-foreground font-medium">Shops</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums">{company._count?.companyBalances || 0}</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 dark:bg-muted/30 border border-border/50 p-2.5 hover:bg-muted/80 transition-colors">
                    <div className="flex items-center gap-1 mb-1">
                      <Receipt className="h-3 w-3 text-amber-500" />
                      <span className="text-[9px] text-muted-foreground font-medium">Txns</span>
                    </div>
                    <p className="text-sm font-bold tabular-nums">{company._count?.transactions || 0}</p>
                  </div>
                </div>

                {/* Distributor Phone */}
                {company.distributorPhone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-900/15 border border-rose-200/50 dark:border-rose-800/30">
                    <div className="h-6 w-6 rounded-lg bg-rose-500/10 flex items-center justify-center">
                      <Phone className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                      <span className="text-[9px] text-rose-600/70 dark:text-rose-400/70 font-medium">Distributor</span>
                      <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{company.distributorPhone}</p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
            type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-400 dark:hover:border-slate-700 transition-colors"
                    onClick={() => openEditDialog(company)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
            type="button"
                    variant="outline"
                    size="sm"
                    className={`flex-1 text-xs transition-colors ${company.status === 'active' ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800' : 'hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 dark:hover:bg-slate-800 dark:hover:text-slate-400 dark:hover:border-slate-700'}`}
                    onClick={() => handleToggleStatus(company)}
                  >
                    <Power className="h-3.5 w-3.5 mr-1" />
                    {company.status === 'active' ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
            type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    onClick={() => setConfirmDelete(company)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dialog-content-animate">
          <DialogHeader>
            <DialogTitle>{editingCompany ? 'Edit Company' : 'Add New Company'}</DialogTitle>
            <DialogDescription>
              {editingCompany
                ? `Editing ${editingCompany.name}`
                : 'Create a new company for multi-company credit tracking'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., CBL, Cadbury, Shan Foods"
                className=""
              />
              <p className="text-[10px] text-muted-foreground">
                This name will be displayed to orderbookers and used for credit tracking.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Continental Biscuits Limited"
                className=""
              />
              <p className="text-[10px] text-muted-foreground">Optional full name or description of the company.</p>
            </div>
            <div className="space-y-2">
              <Label>Distributor Phone <span className="text-muted-foreground text-[10px] font-normal">(optional)</span></Label>
              <Input
                value={formDistributorPhone}
                onChange={(e) => setFormDistributorPhone(e.target.value)}
                placeholder="e.g., 0300-1234567"
                className=""
              />
              <p className="text-[10px] text-muted-foreground">Distributor contact number — will be shown on receipts sent to shops.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
            type="button"
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="bg-primary hover:bg-primary/90 "
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editingCompany ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {confirmDelete?.name}? This action cannot be undone.
              If the company has orderbookers or transactions, you must reassign them first.
              Consider deactivating instead to preserve data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
