'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Download,
  Upload,
  Database,
  Cloud,
  Info,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  Users,
  Store,
  ArrowLeftRight,
  FileText,
  LogOut,
  CalendarDays,
  Eye,
  EyeOff,
  Lock,
  Shield,
  KeyRound,
} from 'lucide-react';

interface BackupSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BackupStats {
  users: number;
  shops: number;
  transactions: number;
  auditLogs: number;
  companies: number;
  shopCompanyBalances: number;
  userCompanies: number;
  shopOrderbookers: number;
  dailyTargets: number;
  shopNotes: number;
  shopVisits: number;
}

interface BackupData {
  users?: unknown[];
  shops?: unknown[];
  transactions?: unknown[];
  auditLogs?: unknown[];
  companies?: unknown[];
  shopCompanyBalances?: unknown[];
  userCompanies?: unknown[];
  shopOrderbookers?: unknown[];
  dailyTargets?: unknown[];
  shopNotes?: unknown[];
  shopVisits?: unknown[];
  data?: BackupData;
  exportDate?: string;
  exportedAt?: string;
  version?: string;
}

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toLocaleString();
}

export default function BackupSettingsDialog({ open, onOpenChange }: BackupSettingsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Import / Restore
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [replaceMode, setReplaceMode] = useState(true); // Default to replace mode for clean imports

  // Password Change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Fetch backup stats when dialog opens (using DELETE endpoint for counts)
  useEffect(() => {
    if (!open) return;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const res = await apiFetch('/api/backup', { method: 'DELETE' });
        if (res.ok) {
          const data = await res.json();
          const t = data?.tables || {};
          setStats({
            users: t.users?.count ?? 0,
            shops: t.shops?.count ?? 0,
            transactions: t.transactions?.count ?? 0,
            auditLogs: t.auditLogs?.count ?? 0,
            companies: t.companies?.count ?? 0,
            shopCompanyBalances: t.shopCompanyBalances?.count ?? 0,
            userCompanies: t.userCompanies?.count ?? 0,
            shopOrderbookers: t.shopOrderbookers?.count ?? 0,
            dailyTargets: t.dailyTargets?.count ?? 0,
            shopNotes: t.shopNotes?.count ?? 0,
            shopVisits: t.shopVisits?.count ?? 0,
          });
        }
      } catch {
        // Silent fail — stats are non-critical
      } finally {
        setStatsLoading(false);
      }
    }

    fetchStats();
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setRestoreFile(null);
      setRestoreProgress(0);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  // ── Export / Download Backup ──────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/backup');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: 'Export Failed',
          description: (errorData as { error?: string }).error || 'Could not create backup file.',
          variant: 'destructive',
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const today = new Date().toISOString().split('T')[0];
      link.download = `alfalah-backup-${today}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Backup Exported',
        description: 'Your backup file has been downloaded successfully.',
      });

      // Refresh stats after export
      const statsRes = await apiFetch('/api/backup', { method: 'DELETE' });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const t = statsData?.tables || {};
        setStats({
          users: t.users?.count ?? 0,
          shops: t.shops?.count ?? 0,
          transactions: t.transactions?.count ?? 0,
          auditLogs: t.auditLogs?.count ?? 0,
          companies: t.companies?.count ?? 0,
          shopCompanyBalances: t.shopCompanyBalances?.count ?? 0,
          userCompanies: t.userCompanies?.count ?? 0,
          shopOrderbookers: t.shopOrderbookers?.count ?? 0,
          dailyTargets: t.dailyTargets?.count ?? 0,
          shopNotes: t.shopNotes?.count ?? 0,
          shopVisits: t.shopVisits?.count ?? 0,
        });
      }
    } catch {
      toast({
        title: 'Export Failed',
        description: 'Network error. Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Handle File Selection ─────────────────────────────────
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast({
        title: 'Invalid File',
        description: 'Please select a valid .json backup file.',
        variant: 'destructive',
      });
      e.target.value = '';
      return;
    }

    setRestoreFile(file);
    e.target.value = '';
  }, []);

  // ── Import / Restore Backup ───────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!restoreFile) {
      toast({
        title: 'No File Selected',
        description: 'Please select a backup file first.',
        variant: 'destructive',
      });
      return;
    }

    setRestoring(true);
    setRestoreProgress(10);

    try {
      // Validate file structure before uploading
      const fileText = await restoreFile.text();
      let backupData: BackupData;
      try {
        backupData = JSON.parse(fileText);
      } catch {
        toast({
          title: 'Invalid Backup File',
          description: 'The file does not contain valid JSON data.',
          variant: 'destructive',
        });
        setRestoring(false);
        setRestoreProgress(0);
        return;
      }

      // Validate expected structure
      if (!backupData || typeof backupData !== 'object') {
        toast({
          title: 'Invalid Backup Format',
          description: 'The backup file does not have the expected structure.',
          variant: 'destructive',
        });
        setRestoring(false);
        setRestoreProgress(0);
        return;
      }

      // Support both v1.0 (flat) and v2.0 (nested in data) formats
      const backupDataSection = backupData.data || backupData;
      const hasAnyData =
        (Array.isArray(backupDataSection.users) && backupDataSection.users.length > 0) ||
        (Array.isArray(backupDataSection.shops) && backupDataSection.shops.length > 0) ||
        (Array.isArray(backupDataSection.transactions) && backupDataSection.transactions.length > 0) ||
        (Array.isArray(backupDataSection.auditLogs) && backupDataSection.auditLogs.length > 0) ||
        (Array.isArray(backupDataSection.companies) && backupDataSection.companies.length > 0) ||
        (Array.isArray(backupDataSection.shopCompanyBalances) && backupDataSection.shopCompanyBalances.length > 0);

      if (!hasAnyData) {
        toast({
          title: 'Empty Backup',
          description: 'The backup file contains no data to restore.',
          variant: 'destructive',
        });
        setRestoring(false);
        setRestoreProgress(0);
        return;
      }

      setRestoreProgress(30);

      // Upload to server
      const formData = new FormData();
      formData.append('file', restoreFile);

      // Simulate progress while waiting
      const progressInterval = setInterval(() => {
        setRestoreProgress((prev) => Math.min(prev + Math.random() * 15, 85));
      }, 600);

      const res = await apiFetch(`/api/backup?mode=${replaceMode ? 'replace' : 'merge'}`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (res.ok) {
        setRestoreProgress(100);
        const data = await res.json();
        const imported = data.imported || data;
        const importMode = data.mode || 'unknown';

        const parts: string[] = [];
        if (imported.companies > 0) parts.push(`${imported.companies} companie(s)`);
        if (imported.users > 0) parts.push(`${imported.users} user(s)`);
        if (imported.shops > 0) parts.push(`${imported.shops} shop(s)`);
        if (imported.transactions > 0) parts.push(`${imported.transactions} transaction(s)`);
        if (imported.shopCompanyBalances > 0) parts.push(`${imported.shopCompanyBalances} balance(s)`);
        if (imported.userCompanies > 0) parts.push(`${imported.userCompanies} assignement(s)`);
        if (imported.dailyTargets > 0) parts.push(`${imported.dailyTargets} target(s)`);
        if (imported.shopNotes > 0) parts.push(`${imported.shopNotes} note(s)`);
        if (imported.shopVisits > 0) parts.push(`${imported.shopVisits} visit(s)`);
        if (imported.auditLogs > 0) parts.push(`${imported.auditLogs} audit log(s)`);

        toast({
          title: 'Restore Complete',
          description: parts.length > 0
            ? `${importMode === 'replace' ? 'Replaced' : 'Merged'}: ${parts.join(', ')}.`
            : 'Backup file processed. No new records were imported.',
        });

        setRestoreFile(null);

        // Refresh stats
        const statsRes = await apiFetch('/api/backup', { method: 'DELETE' });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const t = statsData?.tables || {};
          setStats({
            users: t.users?.count ?? 0,
            shops: t.shops?.count ?? 0,
            transactions: t.transactions?.count ?? 0,
            auditLogs: t.auditLogs?.count ?? 0,
            companies: t.companies?.count ?? 0,
            shopCompanyBalances: t.shopCompanyBalances?.count ?? 0,
            userCompanies: t.userCompanies?.count ?? 0,
            shopOrderbookers: t.shopOrderbookers?.count ?? 0,
            dailyTargets: t.dailyTargets?.count ?? 0,
            shopNotes: t.shopNotes?.count ?? 0,
            shopVisits: t.shopVisits?.count ?? 0,
          });
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: 'Restore Failed',
          description:
            (errorData as { error?: string }).error ||
            'Could not restore backup. Please ensure the file is a valid Finexa backup.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Restore Failed',
        description: 'Network error. Please check your connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoring(false);
      setRestoreProgress(0);
    }
  }, [restoreFile]);

  // ── Password Strength Helper ─────────────────────────────
  const getPasswordStrength = (password: string): { score: number; label: string } => {
    if (password.length < 6) return { score: 0, label: 'Too short' };
    let score = 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { score: 1, label: 'Weak — add uppercase, numbers, or symbols' };
    if (score <= 2) return { score: 2, label: 'Medium — try adding more character variety' };
    return { score: 3, label: 'Strong password' };
  };

  // ── Change Password Handler ───────────────────────────────
  const handleChangePassword = useCallback(async () => {
    const currentUser = useAppStore.getState().user;
    if (!currentUser) return;

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing Fields', description: 'Please fill in all password fields.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Weak Password', description: 'New password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Mismatch', description: 'New password and confirmation do not match.', variant: 'destructive' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, currentPassword, newPassword }),
      });

      if (res.ok) {
        toast({ title: 'Password Changed', description: 'Your password has been updated successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Change Failed',
          description: (data as { error?: string }).error || 'Could not change password.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Change Failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  // ── Stat Item Component ───────────────────────────────────
  const StatItem = ({
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number | string;
    color: string;
  }) => (
    <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 border border-border/50">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <span className="text-lg font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </span>
    </div>
  );

  const user = useAppStore((s) => s.user);

  // Compute user initials
  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Format member since date
  const formatMemberSince = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PK', { month: 'short', year: 'numeric' });
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    orderbooker: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 block">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom duration-200 custom-scrollbar">
        {/* Drag Handle */}
        <div className="sticky top-0 z-10 bg-card pt-3 pb-0 px-6 rounded-t-2xl">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-md">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Backup &amp; Restore</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Export and restore your system data
                </p>
              </div>
            </div>
            <Button
            type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-5">
          {/* Profile Card */}
          {user && (
            <Card className="overflow-hidden border-0 shadow-md">
              <CardContent className="p-0">
                <div className="bg-slate-800 dark:bg-slate-900 relative overflow-hidden px-4 py-6">
                  {/* Decorative circles */}
                  <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                  <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />
                  <div className="absolute top-1/2 right-1/4 w-10 h-10 rounded-full bg-white/[0.06] blur-sm" />
                  <div className="relative z-10 flex items-center gap-4">
                    {/* Avatar Circle */}
                    <div className="h-14 w-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center shadow-lg backdrop-blur-sm">
                      <span className="text-lg font-bold text-white">{getUserInitials(user.name)}</span>
                    </div>
                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white truncate">{user.name}</h3>
                      <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
                        <span>@{user.username}</span>
                        <span className="text-slate-400 dark:text-slate-500">·</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/15 backdrop-blur-sm">
                          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
                {/* Member Since */}
                <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-muted/30 border-t border-border/30">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Member since {formatMemberSince(user.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Google Drive Instructions Card */}
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-0">
              <div className="bg-slate-800 dark:bg-slate-900 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Cloud className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Save to Google Drive</h3>
                </div>
                <ol className="space-y-1.5 text-slate-100 text-xs leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                      1
                    </span>
                    <span>Export backup using the button below</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                      2
                    </span>
                    <span>Open the Google Drive app</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                      3
                    </span>
                    <span>Upload the downloaded file to keep it safe</span>
                  </li>
                </ol>
                <p className="text-[10px] text-slate-300 mt-3 leading-relaxed">
                  Your backup file contains all shops, transactions, and account data
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Backup Stats Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-bold text-foreground">Current Data</h3>
                {statsLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
                )}
              </div>

              {stats ? (
                <div className="grid grid-cols-3 gap-2">
                  <StatItem
                    icon={Users}
                    label="Users"
                    value={formatNumber(stats.users)}
                    color="bg-blue-50 dark:bg-blue-950/50 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400"
                  />
                  <StatItem
                    icon={Store}
                    label="Shops"
                    value={formatNumber(stats.shops)}
                    color="bg-emerald-50 dark:bg-emerald-950/50 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400"
                  />
                  <StatItem
                    icon={ArrowLeftRight}
                    label="Txns"
                    value={formatNumber(stats.transactions)}
                    color="bg-amber-50 dark:bg-amber-950/50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
                  />
                  <StatItem
                    icon={Database}
                    label="Companies"
                    value={formatNumber(stats.companies)}
                    color="bg-cyan-50 dark:bg-cyan-950/50 [&>svg]:text-cyan-600 dark:[&>svg]:text-cyan-400"
                  />
                  <StatItem
                    icon={FileText}
                    label="Notes"
                    value={formatNumber(stats.shopNotes)}
                    color="bg-pink-50 dark:bg-pink-950/50 [&>svg]:text-pink-600 dark:[&>svg]:text-pink-400"
                  />
                  <StatItem
                    icon={CalendarDays}
                    label="Visits"
                    value={formatNumber(stats.shopVisits)}
                    color="bg-violet-50 dark:bg-violet-950/50 [&>svg]:text-violet-600 dark:[&>svg]:text-violet-400"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/50 border border-border/50"
                    >
                      <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
                      <div className="h-5 w-12 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Separator className="opacity-50" />

          {/* Export Backup Button */}
          <div className="space-y-2">
            <Button
            type="button"
              onClick={handleExport}
              disabled={exporting}
              className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm shadow-md transition-all duration-200 disabled:opacity-60"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin mr-2" />
                  Exporting Backup...
                </>
              ) : (
                <>
                  <Download className="h-4.5 w-4.5 mr-2" />
                  Export Backup
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Downloads all system data as a JSON file to your device
            </p>
          </div>

          <Separator className="opacity-50" />

          {/* Change Password Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Change Password</h3>
            </div>

            <div className="space-y-3">
              {/* Current Password */}
              <div className="space-y-1.5">
                <Label htmlFor="current-password" className="text-xs font-medium text-muted-foreground">
                  Current Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={changingPassword}
                    className="pl-9 pr-10 h-10 rounded-lg text-sm"
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
                <Label htmlFor="new-password" className="text-xs font-medium text-muted-foreground">
                  New Password
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changingPassword}
                    className="pl-9 pr-10 h-10 rounded-lg text-sm"
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
                {/* Password Strength Indicator */}
                {newPassword.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((level) => {
                        const strength = getPasswordStrength(newPassword);
                        const isActive = strength.score >= level;
                        const barColor = strength.score === 1 ? 'bg-red-500' : strength.score === 2 ? 'bg-amber-500' : 'bg-emerald-500';
                        return (
                          <div
                            key={level}
                            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                              isActive ? barColor : 'bg-muted'
                            }`}
                          />
                        );
                      })}
                    </div>
                    <p className={`text-[10px] font-medium ${
                      newPassword.length < 6
                        ? 'text-red-500'
                        : getPasswordStrength(newPassword).score === 1
                          ? 'text-red-500'
                          : getPasswordStrength(newPassword).score === 2
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                    }`}>
                      {newPassword.length < 6
                        ? `Minimum 6 characters (${newPassword.length}/6)`
                        : getPasswordStrength(newPassword).label}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-medium text-muted-foreground">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={changingPassword}
                    className={`pl-9 pr-10 h-10 rounded-lg text-sm ${
                      confirmPassword.length > 0 && confirmPassword !== newPassword
                        ? 'border-red-500 focus-visible:ring-red-500'
                        : confirmPassword.length > 0 && confirmPassword === newPassword
                          ? 'border-emerald-500 focus-visible:ring-emerald-500'
                          : ''
                    }`}
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
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <p className="text-[10px] text-red-500 font-medium">Passwords do not match</p>
                )}
                {confirmPassword.length > 0 && confirmPassword === newPassword && newPassword.length >= 6 && (
                  <p className="text-[10px] text-emerald-500 font-medium">Passwords match</p>
                )}
              </div>
            </div>

            <Button
            type="button"
              onClick={handleChangePassword}
              disabled={
                changingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword
              }
              className="w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-60"
            >
              {changingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Changing Password...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Change Password
                </>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Use at least 6 characters with a mix of letters and numbers
            </p>
          </div>

          <Separator className="opacity-50" />

          {/* Import / Restore Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Restore from Backup</h3>
            </div>

            {/* Import Mode Toggle */}
            <div className="flex items-center justify-between rounded-xl bg-muted/50 border border-border/50 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {replaceMode ? 'Replace Mode' : 'Merge Mode'}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {replaceMode
                      ? 'Clears all existing data, imports fresh from backup'
                      : 'Adds missing records, keeps existing data'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplaceMode(!replaceMode)}
                disabled={restoring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                  replaceMode ? 'bg-red-500' : 'bg-emerald-500'
                } ${restoring ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                    replaceMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Warning Card */}
            <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
              replaceMode
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50'
            }`}>
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${
                replaceMode ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
              }`} />
              <div>
                <p className={`text-xs font-semibold ${
                  replaceMode ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                }`}>
                  {replaceMode ? 'Warning: Data Will Be Replaced' : 'Important Notice'}
                </p>
                <p className={`text-[11px] leading-relaxed mt-0.5 ${
                  replaceMode ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {replaceMode
                    ? 'All existing data (shops, transactions, users) will be DELETED and replaced with backup data. Your admin account will be preserved.'
                    : 'Restore will add missing records. Existing data won\'t be deleted.'}
                </p>
              </div>
            </div>

            {/* File Upload Area */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              disabled={restoring}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoring}
              className={`w-full flex flex-col items-center justify-center gap-2 h-24 rounded-xl border-2 border-dashed transition-all duration-200 ${
                restoring
                  ? 'pointer-events-none opacity-60 border-muted'
                  : restoreFile
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 hover:border-emerald-400'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50 cursor-pointer'
              }`}
            >
              {restoring ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground font-medium">Restoring data...</p>
                </>
              ) : restoreFile ? (
                <>
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                    {restoreFile.name}
                  </p>
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                    {(restoreFile.size / 1024).toFixed(1)} KB — Tap to change
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-medium">
                    Tap to select backup file
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Supports .json files only
                  </p>
                </>
              )}
            </button>

            {/* Progress Bar During Restore */}
            {restoring && (
              <div className="space-y-1.5">
                <Progress value={restoreProgress} className="h-2" />
                <p className="text-[11px] text-muted-foreground text-center">
                  {restoreProgress < 85
                    ? 'Uploading and restoring data...'
                    : restoreProgress < 100
                      ? 'Finalizing restore...'
                      : 'Complete!'}
                </p>
              </div>
            )}

            {/* Restore Button */}
            <Button
            type="button"
              onClick={handleRestore}
              disabled={!restoreFile || restoring}
              variant="outline"
              className={`w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200 border-2 ${
                !restoreFile || restoring
                  ? 'opacity-50 cursor-not-allowed'
                  : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:text-amber-300 dark:hover:text-amber-200'
              }`}
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Restoring...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Restore from Backup
                </>
              )}
            </Button>
          </div>

          <Separator className="opacity-50" />

          {/* Logout Button */}
          <div className="space-y-2">
            <Button
            type="button"
              onClick={() => {
                useAppStore.getState().logout();
                onOpenChange(false);
                toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
              }}
              className="w-full h-11 rounded-xl font-semibold text-sm transition-all duration-200 border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:hover:bg-red-950/50 dark:text-red-400 dark:hover:text-red-300"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              Sign out of your account
            </p>
          </div>

          {/* Footer Info */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            <Badge
              variant="secondary"
              className="text-[10px] font-medium bg-muted/80 text-muted-foreground"
            >
              v2.0
            </Badge>
            <span className="text-[10px] text-muted-foreground/60">
              Finexa Backup System
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
