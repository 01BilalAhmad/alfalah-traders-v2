'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/lib/use-hydrated';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/csv-export';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Settings,
  User,
  Palette,
  Database,
  Info,
  Download,
  Trash2,
  Moon,
  Sun,
  Monitor,
  Store,
  Users,
  Wifi,
  Loader2,
  Building2,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Upload,
  HardDrive,
  CheckCircle2,
  FileJson,
} from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { user } = useAppStore();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const [compactMode, setCompactMode] = useState(false);
  const [systemStats, setSystemStats] = useState<{ shops: number; orderbookers: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // Backup & Restore state
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{ users: number; shops: number; transactions: number; auditLogs: number; exportDate: string } | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);

  // Password change state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Load last backup date from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('alfalah-last-backup');
    if (saved) setLastBackupDate(saved);
  }, []);

  // Load compact mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('alfalah-compact-mode');
    if (saved === 'true') {
      setCompactMode(true);
    }
  }, []);

  // Save compact mode to localStorage
  const handleCompactToggle = useCallback((checked: boolean) => {
    setCompactMode(checked);
    localStorage.setItem('alfalah-compact-mode', String(checked));
    toast({
      title: checked ? 'Compact Mode Enabled' : 'Compact Mode Disabled',
      description: checked ? 'UI will use tighter spacing.' : 'UI will use default spacing.',
    });
  }, []);

  // Fetch system stats when sheet opens
  useEffect(() => {
    if (!open) return;
    async function fetchStats() {
      try {
        const [shopRes, obRes] = await Promise.all([
          apiFetch('/api/shops?includeInactive=true'),
          apiFetch('/api/orderbookers'),
        ]);
        const shops = shopRes.ok ? await shopRes.json() : [];
        const obs = obRes.ok ? await obRes.json() : [];
        setSystemStats({
          shops: Array.isArray(shops) ? shops.length : 0,
          orderbookers: Array.isArray(obs) ? obs.length : 0,
        });
      } catch {
        // silent fail
      }
    }
    fetchStats();
  }, [open]);

  // Export all data as CSV
  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const [shopRes, obRes] = await Promise.all([
        apiFetch('/api/shops?includeInactive=true'),
        apiFetch('/api/orderbookers'),
      ]);

      if (shopRes.ok) {
        const shops = await shopRes.json();
        if (Array.isArray(shops) && shops.length > 0) {
          const shopHeaders = ['name', 'area', 'ownerName', 'phone', 'routeDays', 'creditLimit', 'balance', 'status'];
          exportToCSV(
            shops.map((s: Record<string, unknown>) => ({
              name: s.name || '',
              area: s.area || '',
              ownerName: s.ownerName || '',
              phone: s.phone || '',
              routeDays: s.routeDays ? s.routeDays.join(', ') : '',
              creditLimit: s.creditLimit || 0,
              balance: s.balance || 0,
              status: s.status || '',
            })),
            'alfalah-shops-export',
            shopHeaders,
          );
        }
      }

      if (obRes.ok) {
        const obs = await obRes.json();
        if (Array.isArray(obs) && obs.length > 0) {
          const obHeaders = ['name', 'username', 'phone', 'status'];
          exportToCSV(
            obs.map((o: Record<string, unknown>) => ({
              name: o.name || '',
              username: o.username || '',
              phone: o.phone || '',
              status: o.status || '',
            })),
            'alfalah-orderbookers-export',
            obHeaders,
          );
        }
      }

      toast({
        title: 'Export Complete',
        description: 'Shops and orderbookers data exported as CSV files.',
      });
    } catch {
      toast({
        title: 'Export Failed',
        description: 'Could not export data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, []);

  // Download backup
  const handleBackup = useCallback(async () => {
    setBackingUp(true);
    try {
      const res = await apiFetch('/api/admin/backup');
      if (!res.ok) {
        toast({ title: 'Backup Failed', description: 'Could not create backup file.', variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const contentDisposition = res.headers.get('content-disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `alfalah-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      const now = new Date().toLocaleString('en-PK');
      setLastBackupDate(now);
      localStorage.setItem('alfalah-last-backup', now);
      toast({ title: 'Backup Downloaded', description: 'Full database backup saved successfully.' });
    } catch {
      toast({ title: 'Backup Failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setBackingUp(false);
    }
  }, []);

  // Handle file selection for restore
  const handleRestoreFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    // Try to read the file for preview
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'X-Restore-Preview': 'true' },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setRestorePreview(data.preview);
        setPreviewDialogOpen(true);
      } else {
        const data = await res.json();
        toast({ title: 'Invalid Backup File', description: data.error || 'Could not read the backup file.', variant: 'destructive' });
        setRestoreFile(null);
      }
    } catch {
      toast({ title: 'Error', description: 'Could not read file.', variant: 'destructive' });
      setRestoreFile(null);
    }
    // Reset the input
    e.target.value = '';
  }, []);

  // Perform restore
  const handleRestore = useCallback(async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreProgress(10);
    setPreviewDialogOpen(false);
    setConfirmDialogOpen(false);
    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setRestoreProgress((prev) => Math.min(prev + Math.random() * 20, 90));
      }, 500);

      const formData = new FormData();
      formData.append('file', restoreFile);
      const res = await apiFetch('/api/admin/restore', {
        method: 'POST',
        body: formData,
      });
      clearInterval(progressInterval);

      if (res.ok) {
        const data = await res.json();
        setRestoreProgress(100);
        const imported = data.imported;
        toast({
          title: 'Restore Complete',
          description: `Imported: ${imported.users} users, ${imported.shops} shops, ${imported.transactions} transactions, ${imported.auditLogs} audit logs.`,
        });
        setRestoreFile(null);
        setRestorePreview(null);
      } else {
        const data = await res.json();
        toast({ title: 'Restore Failed', description: data.error || 'Could not restore data.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Restore Failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setRestoring(false);
      setRestoreProgress(0);
    }
  }, [restoreFile]);

  // Clear localStorage cache
  const handleClearCache = useCallback(() => {
    setClearingCache(true);
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('alfalah-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      toast({
        title: 'Cache Cleared',
        description: `${keysToRemove.length} cached item(s) removed.`,
      });
    } catch {
      toast({
        title: 'Cache Clear Failed',
        description: 'Could not clear cache entries.',
        variant: 'destructive',
      });
    } finally {
      setClearingCache(false);
    }
  }, []);

  // Password change handler
  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing Fields', description: 'Please fill in all password fields.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Weak Password', description: 'New password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords Mismatch', description: 'New password and confirm password do not match.', variant: 'destructive' });
      return;
    }
    if (!user?.username) {
      toast({ title: 'Error', description: 'Could not identify current user.', variant: 'destructive' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Password Changed', description: 'Your password has been updated successfully.' });
        setPasswordDialogOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast({ title: 'Failed', description: data.error || 'Could not change password.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, user?.username]);

  const userInitials = user
    ? user.name
        .split(' ')
        .map((n) => n.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??';

  const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Orderbooker';
  const isDark = hydrated && resolvedTheme === 'dark';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md p-0 w-full overflow-hidden"
      >
        {/* Navy Blue Gradient Header */}
        <div className="alfalah-gradient px-6 pt-8 pb-6 relative">
          <SheetHeader className="text-left space-y-0">
            <SheetTitle className="text-white text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </SheetTitle>
            <SheetDescription className="text-blue-200 text-xs mt-1">
              Manage your preferences and system settings
            </SheetDescription>
          </SheetHeader>

          {/* User Profile Card */}
          <div className="mt-5 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center text-xl font-bold text-white border-2 border-white/30 shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-base truncate">{user?.name || 'Unknown User'}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-white/20 text-white border-white/30 text-[10px] font-medium hover:bg-white/25">
                  {roleLabel}
                </Badge>
                {user?.phone && (
                  <span className="text-blue-200 text-xs">{user.phone}</span>
                )}
              </div>
              {user?.username && (
                <p className="text-blue-300/70 text-xs mt-0.5">@{user.username}</p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6 bg-background">
          {/* Appearance Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
            </div>
            <Card className="py-0 gap-0">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                    {isDark ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-amber-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Theme</p>
                    <p className="text-xs text-muted-foreground">
                      {hydrated ? (theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light') : '...'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setTheme('light')}
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all duration-150 ${
                      hydrated && resolvedTheme === 'light'
                        ? 'bg-background shadow-sm text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Light mode"
                  >
                    <Sun className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all duration-150 ${
                      hydrated && resolvedTheme === 'dark'
                        ? 'bg-background shadow-sm text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Dark mode"
                  >
                    <Moon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setTheme('system')}
                    className={`h-7 w-7 rounded-md flex items-center justify-center transition-all duration-150 ${
                      hydrated && theme === 'system'
                        ? 'bg-background shadow-sm text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="System default"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Separator />
              {/* Compact Mode Toggle */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Compact Mode</p>
                    <p className="text-xs text-muted-foreground">Reduce spacing for denser layout</p>
                  </div>
                </div>
                <Switch
                  checked={compactMode}
                  onCheckedChange={handleCompactToggle}
                />
              </div>
            </Card>
          </section>

          {/* Data Management Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Data Management</h3>
            </div>
            <Card className="py-0 gap-0">
              {/* Export All Data */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
                    <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Export All Data</p>
                    <p className="text-xs text-muted-foreground">Download shops &amp; orderbookers as CSV</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportAll}
                  disabled={exporting}
                  className="h-8 text-xs"
                >
                  {exporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Export
                </Button>
              </div>
              <Separator />
              {/* Clear Cache */}
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
                    <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Clear Cache</p>
                    <p className="text-xs text-muted-foreground">Remove local cached data</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearCache}
                  disabled={clearingCache}
                  className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50 border-red-200 dark:border-red-900"
                >
                  {clearingCache ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Clear
                </Button>
              </div>
            </Card>
          </section>

          {/* Backup & Restore Section - Admin Only */}
          {user?.role === 'admin' && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <HardDrive className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Backup & Restore</h3>
              </div>

              {/* Export Backup */}
              <Card className="py-0 gap-0 mb-3">
                <div className="px-4 py-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                        <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Download Backup</p>
                        <p className="text-xs text-muted-foreground">Export all data as a JSON file</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBackup}
                      disabled={backingUp}
                      className="h-8 text-xs"
                    >
                      {backingUp ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {backingUp ? 'Exporting...' : 'Download'}
                    </Button>
                  </div>
                  {lastBackupDate && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pl-11">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Last backup: {lastBackupDate}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 pl-11 leading-relaxed">
                    Includes users, shops, transactions, and audit logs. Use this to migrate or safeguard your data.
                  </p>
                </div>
              </Card>

              {/* Import / Restore */}
              <Card className="py-0 gap-0">
                <div className="px-4 py-3.5 space-y-3">
                  {/* Warning banner */}
                  <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                      <span className="font-semibold">Warning:</span> Restoring will replace ALL current orderbooker data, shops, transactions, and audit logs. This action cannot be undone.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                        <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Import Data</p>
                        <p className="text-xs text-muted-foreground">Restore from a backup file</p>
                      </div>
                    </div>
                  </div>

                  {/* File upload area */}
                  <div className="pl-11">
                    <label
                      className={`flex items-center justify-center gap-2 h-20 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                        restoreFile
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                      } ${restoring ? 'pointer-events-none opacity-60' : ''}`}
                    >
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleRestoreFileSelect}
                        className="hidden"
                        disabled={restoring}
                      />
                      {restoring ? (
                        <div className="text-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
                          <p className="text-xs text-muted-foreground mt-1">Restoring data...</p>
                        </div>
                      ) : restoreFile ? (
                        <div className="text-center">
                          <FileJson className="h-5 w-5 text-emerald-600 mx-auto" />
                          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">{restoreFile.name}</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
                          <p className="text-xs text-muted-foreground mt-1">Click to select .json backup file</p>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* Progress bar during restore */}
                  {restoring && (
                    <div className="pl-11 space-y-1.5">
                      <Progress value={restoreProgress} className="h-2" />
                      <p className="text-[11px] text-muted-foreground text-center">
                        {restoreProgress < 90 ? 'Restoring data...' : 'Finalizing...'}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </section>
          )}

          {/* Account Security Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Account Security</h3>
            </div>
            <Card className="py-0 gap-0">
              {/* Change Password */}
              <div className="px-4 py-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                      <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Change Password</p>
                      <p className="text-xs text-muted-foreground">Update your account password</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPasswordDialogOpen(true)} className="h-8 text-xs">
                    Change
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          {/* System Info Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">System Info</h3>
            </div>
            <Card className="py-0 gap-0">
              <div className="px-4 py-3.5 space-y-3">
                {/* Version */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">v1.0</span>
                </div>
                <Separator />
                {/* Total Shops */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total Shops</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {systemStats ? systemStats.shops : '...'}
                  </span>
                </div>
                <Separator />
                {/* Total Orderbookers */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Total Orderbookers</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {systemStats ? systemStats.orderbookers : '...'}
                  </span>
                </div>
                <Separator />
                {/* Database Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Database Status</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          {/* About Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">About</h3>
            </div>
            <Card>
              <CardContent className="py-4">
                <div className="text-center space-y-3">
                  <div className="h-12 w-12 rounded-xl alfalah-gradient flex items-center justify-center mx-auto shadow-md">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-base text-foreground">Al-Falah Traders</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Smart Credit &amp; Route Management v1.0
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Built with Next.js 16, Prisma, and Tailwind CSS
                  </p>
                  <Separator />
                  <p className="text-[11px] text-muted-foreground">
                    &copy; {new Date().getFullYear()} Al-Falah Traders. All rights reserved.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </SheetContent>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => {
        setPasswordDialogOpen(open);
        if (!open) {
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Change Password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one. Minimum 6 characters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current Password */}
            <div className="space-y-1.5">
              <Label htmlFor="current-password" className="text-sm font-medium">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-sm font-medium">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword.length > 0 && newPassword.length < 6 && (
                <p className="text-[11px] text-red-500">Password must be at least 6 characters</p>
              )}
              {newPassword.length >= 6 && (
                <p className="text-[11px] text-emerald-600">Password strength: OK</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="text-[11px] text-red-500">Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 6 && (
                <p className="text-[11px] text-emerald-600">Passwords match</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordDialogOpen(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={changingPassword}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Updating...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-1.5" />
                  Update Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Restore Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => {
        setPreviewDialogOpen(open);
        if (!open) { setRestoreFile(null); setRestorePreview(null); }
      }}>
        <DialogContent className="sm:max-w-md dialog-content-animate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <FileJson className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              Restore Preview
            </DialogTitle>
            <DialogDescription>
              Review the contents of this backup file before restoring.
            </DialogDescription>
          </DialogHeader>

          {restorePreview && (
            <div className="space-y-4 py-2">
              {/* Backup date */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Backup Date</span>
                <span className="text-sm font-medium">
                  {new Date(restorePreview.exportDate).toLocaleDateString('en-PK', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>

              {/* Counts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular-nums text-primary">{restorePreview.users}</p>
                  <p className="text-[11px] text-muted-foreground">Users</p>
                </div>
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular-nums text-primary">{restorePreview.shops}</p>
                  <p className="text-[11px] text-muted-foreground">Shops</p>
                </div>
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular-nums text-primary">{restorePreview.transactions}</p>
                  <p className="text-[11px] text-muted-foreground">Transactions</p>
                </div>
                <div className="rounded-lg border px-3 py-2.5 text-center">
                  <p className="text-lg font-bold tabular-nums text-primary">{restorePreview.auditLogs}</p>
                  <p className="text-[11px] text-muted-foreground">Audit Logs</p>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                  This will permanently replace all current data. Make sure you have a backup of your current data before proceeding.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewDialogOpen(false); setRestoreFile(null); setRestorePreview(null); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmDialogOpen(true)}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Restore This Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation AlertDialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              Confirm Data Restore
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-red-600 dark:text-red-400">This action cannot be undone.</span>
              <br />
              All current orderbookers, shops, transactions, and audit logs will be deleted and replaced with data from the backup file. The admin account will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmDialogOpen(false); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Yes, Restore Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
