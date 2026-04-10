'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
}

interface BackupData {
  users?: unknown[];
  shops?: unknown[];
  transactions?: unknown[];
  auditLogs?: unknown[];
  exportDate?: string;
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

  // Fetch backup stats when dialog opens
  useEffect(() => {
    if (!open) return;

    async function fetchStats() {
      setStatsLoading(true);
      try {
        const res = await fetch('/api/backup');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object') {
            setStats({
              users: data.users ?? 0,
              shops: data.shops ?? 0,
              transactions: data.transactions ?? 0,
              auditLogs: data.auditLogs ?? 0,
            });
          }
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
    }
  }, [open]);

  // ── Export / Download Backup ──────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/backup');
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
      const statsRes = await fetch('/api/backup');
      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data && typeof data === 'object') {
          setStats({
            users: data.users ?? 0,
            shops: data.shops ?? 0,
            transactions: data.transactions ?? 0,
            auditLogs: data.auditLogs ?? 0,
          });
        }
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

      const hasAnyData =
        (Array.isArray(backupData.users) && backupData.users.length > 0) ||
        (Array.isArray(backupData.shops) && backupData.shops.length > 0) ||
        (Array.isArray(backupData.transactions) && backupData.transactions.length > 0) ||
        (Array.isArray(backupData.auditLogs) && backupData.auditLogs.length > 0);

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

      const res = await fetch('/api/backup', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (res.ok) {
        setRestoreProgress(100);
        const data = await res.json();
        const imported = data.imported || data;

        const parts: string[] = [];
        if (imported.users > 0) parts.push(`${imported.users} user(s)`);
        if (imported.shops > 0) parts.push(`${imported.shops} shop(s)`);
        if (imported.transactions > 0) parts.push(`${imported.transactions} transaction(s)`);
        if (imported.auditLogs > 0) parts.push(`${imported.auditLogs} audit log(s)`);

        toast({
          title: 'Restore Complete',
          description: parts.length > 0
            ? `Imported: ${parts.join(', ')}.`
            : 'Backup file processed. No new records were imported.',
        });

        setRestoreFile(null);

        // Refresh stats
        const statsRes = await fetch('/api/backup');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData && typeof statsData === 'object') {
            setStats({
              users: statsData.users ?? 0,
              shops: statsData.shops ?? 0,
              transactions: statsData.transactions ?? 0,
              auditLogs: statsData.auditLogs ?? 0,
            });
          }
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: 'Restore Failed',
          description:
            (errorData as { error?: string }).error ||
            'Could not restore backup. Please ensure the file is a valid Al-Falah backup.',
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
              <div className="h-10 w-10 rounded-xl alfalah-gradient flex items-center justify-center shadow-md">
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
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 space-y-5">
          {/* Google Drive Instructions Card */}
          <Card className="overflow-hidden border-0 shadow-md">
            <CardContent className="p-0">
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <Cloud className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Save to Google Drive</h3>
                </div>
                <ol className="space-y-1.5 text-emerald-50 text-xs leading-relaxed">
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
                <p className="text-[10px] text-emerald-200/70 mt-3 leading-relaxed">
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
                <div className="grid grid-cols-2 gap-3">
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
                    label="Transactions"
                    value={formatNumber(stats.transactions)}
                    color="bg-amber-50 dark:bg-amber-950/50 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
                  />
                  <StatItem
                    icon={FileText}
                    label="Audit Logs"
                    value={formatNumber(stats.auditLogs)}
                    color="bg-purple-50 dark:bg-purple-950/50 [&>svg]:text-purple-600 dark:[&>svg]:text-purple-400"
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
              onClick={handleExport}
              disabled={exporting}
              className="w-full h-12 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-xl font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all duration-200 disabled:opacity-60"
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

          {/* Import / Restore Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center">
                <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Restore from Backup</h3>
            </div>

            {/* Warning Card */}
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 px-3.5 py-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                  Important Notice
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed mt-0.5">
                  Restore will add missing records. Existing data won&apos;t be deleted.
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

          {/* Footer Info */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            <Badge
              variant="secondary"
              className="text-[10px] font-medium bg-muted/80 text-muted-foreground"
            >
              v1.0
            </Badge>
            <span className="text-[10px] text-muted-foreground/60">
              Al-Falah Traders Backup System
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
