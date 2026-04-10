'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/lib/use-hydrated';
import { toast } from '@/hooks/use-toast';
import { exportToCSV } from '@/lib/csv-export';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
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
          fetch('/api/shops?includeInactive=true'),
          fetch('/api/orderbookers'),
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
        fetch('/api/shops?includeInactive=true'),
        fetch('/api/orderbookers'),
      ]);

      if (shopRes.ok) {
        const shops = await shopRes.json();
        if (Array.isArray(shops) && shops.length > 0) {
          const shopHeaders = ['name', 'area', 'ownerName', 'phone', 'routeDay', 'creditLimit', 'balance', 'status'];
          exportToCSV(
            shops.map((s: Record<string, unknown>) => ({
              name: s.name || '',
              area: s.area || '',
              ownerName: s.ownerName || '',
              phone: s.phone || '',
              routeDay: s.routeDay || '',
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
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
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
    </Sheet>
  );
}
