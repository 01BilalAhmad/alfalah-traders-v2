'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useTheme } from 'next-themes';
import { useHydrated } from '@/lib/use-hydrated';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Settings,
  User,
  Palette,
  Database,
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
  Phone,
  Pencil,
  Check,
  X,
  Mail,
  Server,
  Send,
  Info,
  Cog,
} from 'lucide-react';

export default function AdminSettings() {
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

  // Reset shop data state
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetUnlocked, setResetUnlocked] = useState(false);
  const versionTapCount = useRef(0);
  const versionTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Business name state (admin-only)
  const [businessName, setBusinessNameState] = useState('');
  const [editingBusinessName, setEditingBusinessName] = useState(false);
  const [savingBusinessName, setSavingBusinessName] = useState(false);

  // Business phone state (admin-only)
  const [businessPhone, setBusinessPhoneState] = useState('');
  const [editingBusinessPhone, setEditingBusinessPhone] = useState(false);
  const [savingBusinessPhone, setSavingBusinessPhone] = useState(false);

  // Username & Name edit state
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  // Distributor phone state (admin-only)
  const [distributorPhones, setDistributorPhones] = useState<{ companyId: string; companyName: string; distributorPhone: string | null }[]>([]);
  const [editingDistPhone, setEditingDistPhone] = useState<string | null>(null);
  const [distPhoneInput, setDistPhoneInput] = useState('');
  const [savingDistPhone, setSavingDistPhone] = useState(false);

  // Email config state (admin-only)
  const [emailConfig, setEmailConfig] = useState<{
    id?: string; smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string;
    fromName: string; useTLS: boolean; isConfigured: boolean; hasPassword?: boolean; updatedAt?: string;
  } | null>(null);
  const [emailConfigLoaded, setEmailConfigLoaded] = useState(false);
  const [savingEmailConfig, setSavingEmailConfig] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [savingAdminEmail, setSavingAdminEmail] = useState(false);

  // Derived
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

  // ─── Lifecycle ───────────────────────────────────────────

  // Load last backup date from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('finexa-last-backup') || localStorage.getItem('alfalah-last-backup');
    if (saved) setLastBackupDate(saved);
  }, []);

  // Load compact mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('finexa-compact-mode') || localStorage.getItem('alfalah-compact-mode');
    if (saved === 'true') {
      setCompactMode(true);
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
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
    if (user?.role === 'admin') {
      fetchDistributorPhones();
      fetchEmailConfig();
      fetchAdminEmail();
      fetchBusinessName();
    }
  }, [user?.role]);

  // ─── Compact Mode ────────────────────────────────────────

  const handleCompactToggle = useCallback((checked: boolean) => {
    setCompactMode(checked);
    localStorage.setItem('finexa-compact-mode', String(checked));
    toast({
      title: checked ? 'Compact Mode Enabled' : 'Compact Mode Disabled',
      description: checked ? 'UI will use tighter spacing.' : 'UI will use default spacing.',
    });
  }, []);

  // ─── Business Name ──────────────────────────────────────

  const fetchBusinessName = async () => {
    try {
      const res = await apiFetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setBusinessNameState(data.config?.businessName || 'AL-FALAH TRADERS');
        setBusinessPhoneState(data.config?.businessPhone || '');
      }
    } catch { /* silent */ }
  };

  const handleSaveBusinessName = async () => {
    if (!businessName.trim()) {
      toast({ title: 'Error', description: 'Business name cannot be empty.', variant: 'destructive' });
      return;
    }
    setSavingBusinessName(true);
    try {
      const res = await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'businessName', value: businessName.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Business Name Updated', description: 'Name will appear on receipts, reports, and header.' });
        setEditingBusinessName(false);
        // Update localStorage immediately so PDF/print shows new name
        localStorage.setItem('finexa-business-name', businessName.trim());
        // Dispatch event so header updates immediately
        window.dispatchEvent(new Event('business-name-updated'));
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingBusinessName(false);
    }
  };

  // ─── Business Phone ──────────────────────────────────────

  const handleSaveBusinessPhone = async () => {
    setSavingBusinessPhone(true);
    try {
      const res = await apiFetch('/api/admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'businessPhone', value: businessPhone.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Phone Number Updated', description: 'Phone number will appear on receipts, reports, and header.' });
        setEditingBusinessPhone(false);
        // Update localStorage immediately so PDF/print shows new phone
        localStorage.setItem('finexa-business-phone', businessPhone.trim());
        // Dispatch event so header updates immediately
        window.dispatchEvent(new Event('business-name-updated'));
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingBusinessPhone(false);
    }
  };

  // ─── Username & Name Edit ────────────────────────────────────

  const handleSaveUsername = async () => {
    if (!usernameInput.trim() || usernameInput.trim().length < 3) {
      toast({ title: 'Error', description: 'Username must be at least 3 characters.', variant: 'destructive' });
      return;
    }
    setSavingUsername(true);
    try {
      const res = await apiFetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Username Updated', description: `Your login username is now: ${usernameInput.trim()}` });
        setEditingUsername(false);
        // Update the store user object
        if (user) {
          const storeModule = await import('@/lib/store');
          const state = storeModule.useAppStore.getState();
          state.setUser({ ...state.user!, username: usernameInput.trim() });
        }
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update username', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingUsername(false);
    }
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) {
      toast({ title: 'Error', description: 'Name cannot be empty.', variant: 'destructive' });
      return;
    }
    setSavingName(true);
    try {
      const res = await apiFetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Name Updated', description: 'Your display name has been changed.' });
        setEditingName(false);
        // Update the store user object
        if (user) {
          const storeModule = await import('@/lib/store');
          const state = storeModule.useAppStore.getState();
          state.setUser({ ...state.user!, name: nameInput.trim() });
        }
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update name', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingName(false);
    }
  };

  // ─── User Phone Edit ────────────────────────────────────────

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      const res = await apiFetch('/api/users/phone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, phone: phoneInput.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Phone Updated', description: 'Your phone number has been saved.' });
        setEditingPhone(false);
        // Update the store user object
        if (user) {
          const storeModule = await import('@/lib/store');
          const state = storeModule.useAppStore.getState();
          state.setUser({ ...state.user!, phone: phoneInput.trim() });
        }
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update phone', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingPhone(false);
    }
  };

  // ─── Distributor Phones ──────────────────────────────────

  const fetchDistributorPhones = async () => {
    try {
      const res = await apiFetch('/api/companies?status=active');
      if (res.ok) {
        const data = await res.json();
        const companies = (data.companies || []).map((c: { id: string; name: string; distributorPhone: string | null }) => ({
          companyId: c.id,
          companyName: c.name,
          distributorPhone: c.distributorPhone || null,
        }));
        setDistributorPhones(companies);
      }
    } catch { /* silent */ }
  };

  const handleSaveDistPhone = async (companyId: string) => {
    setSavingDistPhone(true);
    try {
      const res = await apiFetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorPhone: distPhoneInput.trim() || null }),
      });
      if (res.ok) {
        toast({ title: 'Distributor Number Updated', description: 'Receipt par ab ye number show hoga' });
        setEditingDistPhone(null);
        setDistPhoneInput('');
        fetchDistributorPhones();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingDistPhone(false);
    }
  };

  // ─── Email Config ────────────────────────────────────────

  const fetchEmailConfig = async () => {
    try {
      const res = await apiFetch('/api/admin/email-config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setEmailConfig({
            id: data.config.id,
            smtpHost: data.config.smtpHost || '',
            smtpPort: data.config.smtpPort || 587,
            smtpUser: data.config.smtpUser || '',
            smtpPass: '',
            fromName: data.config.fromName || '',
            useTLS: data.config.useTLS !== false,
            isConfigured: data.config.isConfigured || false,
            hasPassword: data.config.hasPassword || false,
            updatedAt: data.config.updatedAt,
          });
        } else {
          setEmailConfig({
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: '',
            smtpPass: '',
            fromName: 'Finexa',
            useTLS: true,
            isConfigured: false,
          });
        }
      } else {
        setEmailConfig({
          smtpHost: 'smtp.gmail.com',
          smtpPort: 587,
          smtpUser: '',
          smtpPass: '',
          fromName: 'Finexa',
          useTLS: true,
          isConfigured: false,
        });
      }
    } catch {
      setEmailConfig({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        fromName: 'Finexa',
        useTLS: true,
        isConfigured: false,
      });
    }
    setEmailConfigLoaded(true);
  };

  const fetchAdminEmail = async () => {
    try {
      if (user?.id) {
        const res = await apiFetch(`/api/users/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setAdminEmail(data.email || '');
        }
      }
    } catch { /* silent */ }
  };

  const handleSaveEmailConfig = async () => {
    if (!emailConfig) return;
    if (!emailConfig.smtpHost || !emailConfig.smtpPort || !emailConfig.smtpUser) {
      toast({ title: 'Missing Fields', description: 'SMTP Host, Port, and User are required.', variant: 'destructive' });
      return;
    }
    if (!emailConfig.hasPassword && !emailConfig.smtpPass) {
      toast({ title: 'Missing Password', description: 'SMTP App Password is required for new configuration.', variant: 'destructive' });
      return;
    }

    setSavingEmailConfig(true);
    try {
      const body: Record<string, unknown> = {
        smtpHost: emailConfig.smtpHost,
        smtpPort: emailConfig.smtpPort,
        smtpUser: emailConfig.smtpUser,
        fromName: emailConfig.fromName || null,
        useTLS: emailConfig.useTLS,
      };
      if (emailConfig.smtpPass) {
        body.smtpPass = emailConfig.smtpPass;
      }

      const res = await apiFetch('/api/admin/email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Email Configuration Saved', description: 'SMTP settings updated successfully.' });
        fetchEmailConfig();
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to save', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingEmailConfig(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress) {
      toast({ title: 'Missing Email', description: 'Enter an email address to send test.', variant: 'destructive' });
      return;
    }

    setTestingEmail(true);
    try {
      const res = await apiFetch('/api/admin/email-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: testEmailAddress.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Test Email Sent!', description: `Check ${testEmailAddress} for the test email.` });
      } else {
        toast({ title: 'Test Failed', description: data.error || 'Could not send test email.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSaveAdminEmail = async () => {
    if (!adminEmail.trim()) {
      toast({ title: 'Missing Email', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }

    setSavingAdminEmail(true);
    try {
      const res = await apiFetch(`/api/users/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail.trim() }),
      });

      if (res.ok) {
        toast({ title: 'Email Saved', description: 'Your recovery email has been updated.' });
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to save email.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSavingAdminEmail(false);
    }
  };

  // ─── Export All Data ─────────────────────────────────────

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const [shopRes, obRes] = await Promise.all([
        apiFetch('/api/shops?includeInactive=true'),
        apiFetch('/api/orderbookers'),
      ]);

      const wb = XLSX.utils.book_new();
      let shopsCount = 0;
      let obsCount = 0;

      if (shopRes.ok) {
        const shops = await shopRes.json();
        if (Array.isArray(shops) && shops.length > 0) {
          shopsCount = shops.length;
          const shopSheetData = shops.map((s: Record<string, unknown>) => {
            const companyBalances = Array.isArray(s.companyBalances)
              ? (s.companyBalances as Record<string, unknown>[]).map((cb: Record<string, unknown>) =>
                  `${cb.companyName || ''}: ${cb.balance || 0}/${cb.creditLimit || 0}`
                ).join('; ')
              : '';
            const assignedOBs = Array.isArray(s.assignedOrderbookers)
              ? (s.assignedOrderbookers as Record<string, unknown>[]).map((a: Record<string, unknown>) =>
                  `${a.orderbookerName || ''} (${a.companyName || ''}) [${Array.isArray(a.routeDays) ? (a.routeDays as string[]).join(',') : a.routeDays || ''}]`
                ).join('; ')
              : '';

            return {
              Name: s.name || '',
              Owner: s.ownerName || '',
              Area: s.area || '',
              Phone: s.phone || '',
              Route: Array.isArray(s.routeDays) ? (s.routeDays as string[]).join(', ') : '',
              PrimaryOrderbooker: (s.orderbooker as Record<string, string>)?.name || '',
              CompanyBalances: companyBalances,
              Balance: s.balance || 0,
              CreditLimit: s.creditLimit || 0,
              Status: s.status || '',
              AssignedOrderbookers: assignedOBs,
            };
          });
          const shopWs = XLSX.utils.json_to_sheet(shopSheetData);
          const shopCols = Object.keys(shopSheetData[0] || {}).map((key) => {
            const maxLen = Math.max(
              key.length,
              ...shopSheetData.map((row) => String(row[key as keyof typeof row] ?? '').length)
            );
            return { wch: Math.min(maxLen + 2, 50) };
          });
          shopWs['!cols'] = shopCols;
          XLSX.utils.book_append_sheet(wb, shopWs, 'Shops');
        }
      }

      if (obRes.ok) {
        const obs = await obRes.json();
        if (Array.isArray(obs) && obs.length > 0) {
          obsCount = obs.length;
          const obSheetData = obs.map((o: Record<string, unknown>) => ({
            Name: o.name || '',
            Username: o.username || '',
            Phone: o.phone || '',
            Company: o.companyName || '',
            Status: o.status || '',
            TotalShops: o.totalShops || 0,
            TotalOutstanding: o.totalOutstanding || 0,
          }));
          const obWs = XLSX.utils.json_to_sheet(obSheetData);
          const obCols = Object.keys(obSheetData[0] || {}).map((key) => {
            const maxLen = Math.max(
              key.length,
              ...obSheetData.map((row) => String(row[key as keyof typeof row] ?? '').length)
            );
            return { wch: Math.min(maxLen + 2, 40) };
          });
          obWs['!cols'] = obCols;
          XLSX.utils.book_append_sheet(wb, obWs, 'Orderbookers');
        }
      }

      if (wb.SheetNames.length > 0) {
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Finexa_AllData_${dateStr}.xlsx`);
        toast({
          title: 'Export Complete',
          description: `Exported ${shopsCount} shops and ${obsCount} orderbookers to Excel file.`,
        });
      } else {
        toast({
          title: 'No Data',
          description: 'No data found to export.',
          variant: 'destructive',
        });
      }
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

  // ─── Backup ──────────────────────────────────────────────

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
      localStorage.setItem('finexa-last-backup', now);
      toast({ title: 'Backup Downloaded', description: 'Full database backup saved successfully.' });
    } catch {
      toast({ title: 'Backup Failed', description: 'Network error. Please try again.', variant: 'destructive' });
    } finally {
      setBackingUp(false);
    }
  }, []);

  // ─── Reset Shops ─────────────────────────────────────────

  const handleResetShops = useCallback(async () => {
    setResetting(true);
    try {
      const res = await apiFetch('/api/admin/reset-shops', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast({
          title: 'Shop Data Reset Complete',
          description: `Deleted ${data.deleted.shops} shops, ${data.deleted.transactions} transactions. ${data.kept.users} users and ${data.kept.companies} companies preserved.`,
        });
        setResetDialogOpen(false);
        setSystemStats(prev => prev ? { ...prev, shops: 0 } : null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: 'Reset Failed',
          description: (data as { error?: string }).error || 'Could not reset shop data.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Reset Failed',
        description: 'Network error. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResetting(false);
    }
  }, []);

  // ─── Restore ─────────────────────────────────────────────

  const handleRestoreFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
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
    e.target.value = '';
  }, []);

  const handleRestore = useCallback(async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreProgress(10);
    setPreviewDialogOpen(false);
    setConfirmDialogOpen(false);
    try {
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

  // ─── Clear Cache ─────────────────────────────────────────

  const handleClearCache = useCallback(() => {
    setClearingCache(true);
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('finexa-') || key.startsWith('alfalah-'))) {
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

  // ─── Password Change ─────────────────────────────────────

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing Fields', description: 'Please fill in all password fields.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Weak Password', description: 'New password must be at least 8 characters.', variant: 'destructive' });
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
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Password Changed', description: 'Your password has been updated successfully.' });
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

  // ─── Version Tap Unlock ──────────────────────────────────

  const handleVersionTap = useCallback(() => {
    if (resetUnlocked) return;
    versionTapCount.current += 1;
    const tapsLeft = 5 - versionTapCount.current;
    if (tapsLeft > 0 && tapsLeft <= 3) {
      toast({
        title: `${tapsLeft} more tap${tapsLeft > 1 ? 's' : ''} to unlock reset`,
        description: 'Keep tapping the version number.',
      });
    }
    if (versionTapCount.current >= 5) {
      setResetUnlocked(true);
      versionTapCount.current = 0;
      toast({
        title: 'Reset Option Unlocked',
        description: 'The Reset Shop Data option is now visible in the System tab.',
      });
    }
    if (versionTapTimer.current) clearTimeout(versionTapTimer.current);
    versionTapTimer.current = setTimeout(() => {
      versionTapCount.current = 0;
    }, 3000);
  }, [resetUnlocked]);

  // ─── Determine default tab ───────────────────────────────

  const defaultTab = 'profile';

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background">
      <Tabs defaultValue={defaultTab} className="flex flex-col lg:flex-row min-h-screen">
        {/* ─── Sidebar Tabs (Desktop) / Horizontal Tabs (Mobile) ─── */}
        <div className="lg:w-64 lg:min-w-64 lg:border-r lg:border-border bg-muted/30">
          {/* Page Header */}
          <div className="p-6 pb-4 lg:pb-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-md shrink-0">
                <Settings className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Settings</h1>
                <p className="text-xs text-muted-foreground">Manage your preferences</p>
              </div>
            </div>
          </div>

          {/* Mobile: horizontal scrollable tabs */}
          <TabsList className="lg:hidden flex w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0 h-auto gap-0">
            <TabsTrigger value="profile" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
              <User className="h-3.5 w-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="display" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
              <Palette className="h-3.5 w-3.5" /> Display
            </TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="email" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
                <Mail className="h-3.5 w-3.5" /> Email
              </TabsTrigger>
            )}
            <TabsTrigger value="data" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
              <Database className="h-3.5 w-3.5" /> Data
            </TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="company" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
                <Building2 className="h-3.5 w-3.5" /> Company
              </TabsTrigger>
            )}
            <TabsTrigger value="system" className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3 text-xs font-medium whitespace-nowrap">
              <Cog className="h-3.5 w-3.5" /> System
            </TabsTrigger>
          </TabsList>

          {/* Desktop: vertical tabs */}
          <TabsList className="hidden lg:flex flex-col items-stretch gap-1 p-3 rounded-none bg-transparent h-auto w-full">
            <TabsTrigger value="profile" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
              <User className="h-4 w-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="display" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
              <Palette className="h-4 w-4" /> Display
            </TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="email" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
                <Mail className="h-4 w-4" /> Email & Recovery
              </TabsTrigger>
            )}
            <TabsTrigger value="data" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
              <Database className="h-4 w-4" /> Data
            </TabsTrigger>
            {user?.role === 'admin' && (
              <TabsTrigger value="company" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
                <Building2 className="h-4 w-4" /> Company
              </TabsTrigger>
            )}
            <TabsTrigger value="system" className="flex items-center gap-3 justify-start rounded-lg px-3 py-2.5 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm w-full">
              <Cog className="h-4 w-4" /> System
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Content Area ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

            {/* ═══ PROFILE TAB ═══ */}
            <TabsContent value="profile" className="space-y-6 mt-0">
              {/* User Info Card */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    User Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-xl font-bold text-primary border-2 border-primary/20 shrink-0">
                      {userInitials}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-lg text-foreground truncate">{user?.name || 'Unknown User'}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs font-medium">
                          {roleLabel}
                        </Badge>
                        {user?.username && (
                          <span className="text-xs text-muted-foreground">@{user.username}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Full Name</p>
                      {editingName ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="Enter name"
                            className="h-7 text-sm flex-1"
                            disabled={savingName}
                          />
                          <Button type="button" size="sm" onClick={handleSaveName} disabled={savingName} className="h-7 px-2">
                            {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)} disabled={savingName} className="h-7 px-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{user?.name || '—'}</p>
                          <button onClick={() => { setNameInput(user?.name || ''); setEditingName(true); }} className="text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Username</p>
                      {editingUsername ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            placeholder="Enter username"
                            className="h-7 text-sm flex-1"
                            disabled={savingUsername}
                          />
                          <Button type="button" size="sm" onClick={handleSaveUsername} disabled={savingUsername} className="h-7 px-2">
                            {savingUsername ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingUsername(false)} disabled={savingUsername} className="h-7 px-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{user?.username || '—'}</p>
                          <button onClick={() => { setUsernameInput(user?.username || ''); setEditingUsername(true); }} className="text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Role</p>
                      <p className="text-sm font-medium">{roleLabel}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground mb-0.5">Phone</p>
                      {editingPhone ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value)}
                            placeholder="03XXXXXXXXX"
                            className="h-7 text-sm flex-1"
                            maxLength={15}
                            disabled={savingPhone}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSavePhone();
                              if (e.key === 'Escape') setEditingPhone(false);
                            }}
                            autoFocus
                          />
                          <Button type="button" size="sm" onClick={handleSavePhone} disabled={savingPhone} className="h-7 px-2">
                            {savingPhone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingPhone(false)} disabled={savingPhone} className="h-7 px-2">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{user?.phone || '—'}</p>
                          <button onClick={() => { setPhoneInput(user?.phone || ''); setEditingPhone(true); }} className="text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Admin Recovery Email */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    Recovery Email
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Password reset link will be sent to this email address.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="h-9 text-sm flex-1"
                      disabled={savingAdminEmail}
                    />
                    <Button
            type="button"
                      size="sm"
                      onClick={handleSaveAdminEmail}
                      disabled={savingAdminEmail}
                      className="h-9 text-xs shrink-0"
                    >
                      {savingAdminEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Change Password (inline) */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Change Password
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Enter your current password and choose a new one. Minimum 6 characters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Password */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Current Password</Label>
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="h-9 pr-10"
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
                    <Label className="text-sm font-medium">New Password</Label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-9 pr-10"
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
                    {newPassword.length > 0 && newPassword.length < 8 && (
                      <p className="text-[11px] text-red-500 dark:text-red-400">Password must be at least 8 characters</p>
                    )}
                    {newPassword.length >= 8 && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Password strength: OK</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-9 pr-10"
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
                      <p className="text-[11px] text-red-500 dark:text-red-400">Passwords do not match</p>
                    )}
                    {confirmPassword.length > 0 && newPassword === confirmPassword && newPassword.length >= 8 && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Passwords match</p>
                    )}
                  </div>

                  <Button
            type="button"
                    onClick={handleChangePassword}
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="h-9"
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ DISPLAY TAB ═══ */}
            <TabsContent value="display" className="space-y-6 mt-0">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Palette className="h-4 w-4 text-primary" />
                    Appearance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
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
                        className={`h-8 w-8 rounded-md flex items-center justify-center transition-all duration-150 ${
                          hydrated && resolvedTheme === 'light'
                            ? 'bg-background shadow-sm text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Light mode"
                      >
                        <Sun className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`h-8 w-8 rounded-md flex items-center justify-center transition-all duration-150 ${
                          hydrated && resolvedTheme === 'dark'
                            ? 'bg-background shadow-sm text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="Dark mode"
                      >
                        <Moon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setTheme('system')}
                        className={`h-8 w-8 rounded-md flex items-center justify-center transition-all duration-150 ${
                          hydrated && theme === 'system'
                            ? 'bg-background shadow-sm text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title="System default"
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <Separator />
                  {/* Compact Mode Toggle */}
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
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
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══ EMAIL & RECOVERY TAB (Admin Only) ═══ */}
            {user?.role === 'admin' && (
              <TabsContent value="email" className="space-y-6 mt-0">
                {emailConfigLoaded && (
                  <>
                    {/* Status Banner */}
                    <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                      emailConfig?.isConfigured
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50'
                    }`}>
                      <div className={`h-3 w-3 rounded-full shrink-0 ${emailConfig?.isConfigured ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      <div>
                        <p className={`text-sm font-medium ${emailConfig?.isConfigured ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                          {emailConfig?.isConfigured ? 'Email Configured' : 'Email Not Configured'}
                        </p>
                        <p className={`text-xs ${emailConfig?.isConfigured ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                          {emailConfig?.isConfigured ? 'Forgot Password feature is active.' : 'Forgot Password feature is disabled. Configure SMTP below.'}
                        </p>
                      </div>
                    </div>

                    {/* SMTP Settings Card */}
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Server className="h-4 w-4 text-primary" />
                          SMTP Settings
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Configure SMTP to enable &quot;Forgot Password&quot; recovery for admin accounts. Gmail users: use an App Password (not your regular password).
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* SMTP Host */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">SMTP Host</Label>
                          <Input
                            value={emailConfig?.smtpHost || ''}
                            onChange={(e) => setEmailConfig(prev => prev ? { ...prev, smtpHost: e.target.value } : null)}
                            placeholder="smtp.gmail.com"
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* SMTP Port + TLS */}
                        <div className="flex items-end gap-4">
                          <div className="space-y-1.5 flex-1">
                            <Label className="text-sm font-medium">Port</Label>
                            <Input
                              type="number"
                              value={emailConfig?.smtpPort || 587}
                              onChange={(e) => setEmailConfig(prev => prev ? { ...prev, smtpPort: parseInt(e.target.value) || 587 } : null)}
                              placeholder="587"
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2 pb-1">
                            <Switch
                              checked={emailConfig?.useTLS !== false}
                              onCheckedChange={(checked) => setEmailConfig(prev => prev ? { ...prev, useTLS: checked } : null)}
                            />
                            <Label className="text-sm font-medium">TLS</Label>
                          </div>
                        </div>

                        {/* Sender Email */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Sender Email</Label>
                          <Input
                            type="email"
                            value={emailConfig?.smtpUser || ''}
                            onChange={(e) => setEmailConfig(prev => prev ? { ...prev, smtpUser: e.target.value } : null)}
                            placeholder="yourapp@gmail.com"
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* App Password */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">App Password</Label>
                          <p className="text-[11px] text-muted-foreground">
                            {emailConfig?.hasPassword
                              ? 'Leave empty to keep existing password. Enter new to update.'
                              : 'For Gmail: Go to My Account → Security → 2-Step Verification → App Passwords'}
                          </p>
                          <div className="relative">
                            <Input
                              type={showSmtpPass ? 'text' : 'password'}
                              value={emailConfig?.smtpPass || ''}
                              onChange={(e) => setEmailConfig(prev => prev ? { ...prev, smtpPass: e.target.value } : null)}
                              placeholder={emailConfig?.hasPassword ? '•••••••• (existing)' : 'Enter App Password'}
                              className="h-9 text-sm pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSmtpPass(!showSmtpPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* From Name */}
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">From Name (Optional)</Label>
                          <Input
                            value={emailConfig?.fromName || ''}
                            onChange={(e) => setEmailConfig(prev => prev ? { ...prev, fromName: e.target.value } : null)}
                            placeholder="Finexa"
                            className="h-9 text-sm"
                          />
                        </div>

                        {/* Save Button */}
                        <Button
            type="button"
                          onClick={handleSaveEmailConfig}
                          disabled={savingEmailConfig}
                          className="w-full h-9"
                        >
                          {savingEmailConfig ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Server className="h-4 w-4 mr-1.5" />}
                          {savingEmailConfig ? 'Saving...' : 'Save SMTP Settings'}
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Test Email Card */}
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Send className="h-4 w-4 text-primary" />
                          Test Email
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Send a test email to verify your SMTP settings are correct.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="email"
                            value={testEmailAddress}
                            onChange={(e) => setTestEmailAddress(e.target.value)}
                            placeholder="test@example.com"
                            className="h-9 text-sm flex-1"
                            disabled={testingEmail || !emailConfig?.isConfigured}
                          />
                          <Button
            type="button"
                            size="sm"
                            variant="outline"
                            onClick={handleTestEmail}
                            disabled={testingEmail || !emailConfig?.isConfigured}
                            className="h-9 text-xs shrink-0"
                          >
                            {testingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                            Test
                          </Button>
                        </div>
                        {!emailConfig?.isConfigured && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">Save SMTP settings first before testing.</p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            )}

            {/* ═══ DATA TAB ═══ */}
            <TabsContent value="data" className="space-y-6 mt-0">
              {/* Export All Data */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Export All Data
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Download shops &amp; orderbookers as an Excel file.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
            type="button"
                    variant="outline"
                    onClick={handleExportAll}
                    disabled={exporting}
                    className="h-9"
                  >
                    {exporting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Download className="h-4 w-4 mr-1.5" />
                    )}
                    {exporting ? 'Exporting...' : 'Export to Excel'}
                  </Button>
                </CardContent>
              </Card>

              {/* Clear Cache */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                    Clear Cache
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Remove local cached data from your browser.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
            type="button"
                    variant="outline"
                    onClick={handleClearCache}
                    disabled={clearingCache}
                    className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50 border-red-200 dark:border-red-900"
                  >
                    {clearingCache ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1.5" />
                    )}
                    Clear Cache
                  </Button>
                </CardContent>
              </Card>

              {/* Backup & Restore — Admin Only */}
              {user?.role === 'admin' && (
                <>
                  {/* Download Backup */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <HardDrive className="h-4 w-4 text-primary" />
                        Download Backup
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Export all data as a JSON file. Includes users, shops, transactions, and audit logs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
            type="button"
                        variant="outline"
                        onClick={handleBackup}
                        disabled={backingUp}
                        className="h-9"
                      >
                        {backingUp ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <Download className="h-4 w-4 mr-1.5" />
                        )}
                        {backingUp ? 'Exporting...' : 'Download Backup'}
                      </Button>
                      {lastBackupDate && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          Last backup: {lastBackupDate}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Import / Restore */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        Import / Restore Data
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Restore from a backup file.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Warning banner */}
                      <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2.5">
                        <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                          <span className="font-semibold">Warning:</span> Restoring will replace ALL current orderbooker data, shops, transactions, and audit logs. This action cannot be undone.
                        </p>
                      </div>

                      {/* File upload area */}
                      <label
                        className={`flex items-center justify-center gap-2 h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
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
                            <FileJson className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mx-auto" />
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 font-medium">{restoreFile.name}</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
                            <p className="text-xs text-muted-foreground mt-1">Click to select .json backup file</p>
                          </div>
                        )}
                      </label>

                      {/* Progress bar during restore */}
                      {restoring && (
                        <div className="space-y-1.5">
                          <Progress value={restoreProgress} className="h-2" />
                          <p className="text-[11px] text-muted-foreground text-center">
                            {restoreProgress < 90 ? 'Restoring data...' : 'Finalizing...'}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ═══ COMPANY TAB (Admin Only) ═══ */}
            {user?.role === 'admin' && (
              <TabsContent value="company" className="space-y-6 mt-0">
                {/* Business Name Card */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Business Name
                    </CardTitle>
                    <CardDescription className="text-xs">
                      This name appears on receipts, reports, and PDF exports.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {editingBusinessName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={businessName}
                          onChange={(e) => setBusinessNameState(e.target.value)}
                          placeholder="Enter business name"
                          className="h-9 text-sm flex-1"
                          disabled={savingBusinessName}
                        />
                        <Button
            type="button"
                          size="sm"
                          onClick={handleSaveBusinessName}
                          disabled={savingBusinessName}
                          className="h-9 text-xs shrink-0"
                        >
                          {savingBusinessName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
            type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingBusinessName(false);
                            fetchBusinessName(); // reset to saved value
                          }}
                          disabled={savingBusinessName}
                          className="h-9 text-xs shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{businessName || 'AL-FALAH TRADERS'}</p>
                        <Button
            type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingBusinessName(true)}
                          className="h-8 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Business Phone Card */}
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      Business Phone Number
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ye number receipts, reports aur header mein show hoga. Customer isi number pe contact kar sakta hai.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {editingBusinessPhone ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={businessPhone}
                          onChange={(e) => setBusinessPhoneState(e.target.value)}
                          placeholder="03XXXXXXXXX"
                          className="h-9 text-sm flex-1"
                          maxLength={15}
                          disabled={savingBusinessPhone}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveBusinessPhone();
                            if (e.key === 'Escape') {
                              setEditingBusinessPhone(false);
                              fetchBusinessName(); // reset to saved value
                            }
                          }}
                          autoFocus
                        />
                        <Button
            type="button"
                          size="sm"
                          onClick={handleSaveBusinessPhone}
                          disabled={savingBusinessPhone}
                          className="h-9 text-xs shrink-0"
                        >
                          {savingBusinessPhone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
            type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingBusinessPhone(false);
                            fetchBusinessName(); // reset to saved value
                          }}
                          disabled={savingBusinessPhone}
                          className="h-9 text-xs shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <p className="text-sm font-medium text-foreground">{businessPhone || 'Not set'}</p>
                          {!businessPhone && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">Add karein</span>
                          )}
                        </div>
                        <Button
            type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingBusinessPhone(true)}
                          className="h-8 text-xs"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Phone className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      Distributor Phone Numbers
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ye number receipt par show hoga. Customer isi number pe contact kar sakta hai.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {distributorPhones.length === 0 ? (
                      <div className="text-center py-6">
                        <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Koi company nahi mili. Pehle Manage Companies mein company add karein.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {distributorPhones.map((comp) => (
                          <div key={comp.companyId} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Building2 className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium">{comp.companyName}</span>
                            </div>
                            {editingDistPhone === comp.companyId ? (
                              <div className="flex items-center gap-2 pl-5">
                                <Input
                                  value={distPhoneInput}
                                  onChange={(e) => setDistPhoneInput(e.target.value)}
                                  placeholder="03XXXXXXXXX"
                                  className="h-8 text-sm flex-1"
                                  maxLength={15}
                                  disabled={savingDistPhone}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveDistPhone(comp.companyId);
                                    if (e.key === 'Escape') { setEditingDistPhone(null); setDistPhoneInput(''); }
                                  }}
                                  autoFocus
                                />
                                <Button
            type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50"
                                  aria-label="Save distributor phone"
                                  onClick={() => handleSaveDistPhone(comp.companyId)}
                                  disabled={savingDistPhone}
                                >
                                  {savingDistPhone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
            type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                                  aria-label="Cancel edit"
                                  onClick={() => { setEditingDistPhone(null); setDistPhoneInput(''); }}
                                  disabled={savingDistPhone}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between pl-5">
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                  <span className="text-sm font-medium text-foreground">
                                    {comp.distributorPhone || 'Not set'}
                                  </span>
                                  {!comp.distributorPhone && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">Add karein</span>
                                  )}
                                </div>
                                <Button
            type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 rounded-full text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/50"
                                  aria-label="Edit distributor phone"
                                  onClick={() => {
                                    setDistPhoneInput(comp.distributorPhone || '');
                                    setEditingDistPhone(comp.companyId);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* ═══ SYSTEM TAB ═══ */}
            <TabsContent value="system" className="space-y-6 mt-0">
              {/* System Info Card */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    System Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {/* Version — Tap 5 times to unlock Reset option */}
                  <div className="flex items-center justify-between py-3">
                    <span className="text-sm text-muted-foreground">Version</span>
                    <span
                      className="text-sm font-medium cursor-default select-none"
                      onClick={handleVersionTap}
                    >
                      v1.0
                    </span>
                  </div>
                  <Separator />
                  {/* Total Shops */}
                  <div className="flex items-center justify-between py-3">
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
                  <div className="flex items-center justify-between py-3">
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
                  <div className="flex items-center justify-between py-3">
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
                </CardContent>
              </Card>

              {/* About Card */}
              <Card>
                <CardContent className="py-6">
                  <div className="text-center space-y-3">
                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mx-auto shadow-md">
                      <Building2 className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-bold text-base text-foreground">Finexa</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Smart Credit &amp; Route Management v1.0
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Built with Next.js 16, Prisma, and Tailwind CSS
                    </p>
                    <Separator />
                    <p className="text-[11px] text-muted-foreground">
                      &copy; 2026 Finexa. All rights reserved. Unauthorized copying, reverse engineering, modification, or distribution of this software is strictly prohibited and punishable under Copyright Ordinance 1962 &amp; PECA 2016.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Reset Shop Data — Hidden by default, unlock by tapping version 5 times */}
              {resetUnlocked && (
                <Card className="border-red-200 dark:border-red-900/50">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
                      <Trash2 className="h-4 w-4" />
                      Danger Zone
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Danger warning */}
                    <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                        <span className="font-semibold">Danger:</span> This will permanently delete ALL shops, transactions, notes, visits, and company balances. Users and companies will be preserved. Make sure you have a backup first!
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Reset Shop Data</p>
                        <p className="text-xs text-muted-foreground">Delete all shops &amp; transactions</p>
                      </div>
                      <Button
            type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setResetDialogOpen(true)}
                        disabled={resetting}
                        className="h-9 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Reset
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

          </div>
        </div>
      </Tabs>

      {/* ─── Dialogs (rendered outside tabs for proper z-index) ─── */}

      {/* Restore Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => {
        setPreviewDialogOpen(open);
        if (!open) { setRestoreFile(null); setRestorePreview(null); }
      }}>
        <DialogContent className="sm:max-w-md">
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
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                <span className="text-sm text-muted-foreground">Backup Date</span>
                <span className="text-sm font-medium">
                  {new Date(restorePreview.exportDate).toLocaleDateString('en-PK', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
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
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                  This will permanently replace all current data. Make sure you have a backup of your current data before proceeding.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setPreviewDialogOpen(false); setRestoreFile(null); setRestorePreview(null); }}>
              Cancel
            </Button>
            <Button
            type="button"
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

      {/* Reset Shop Data Confirmation AlertDialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500 dark:text-red-400" />
              Reset All Shop Data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete ALL shops, transactions, shop notes, visits, and company balances.
              <strong className="text-foreground"> Users (orderbookers) and companies will be preserved.</strong>
              <br /><br />
              Make sure you have downloaded a backup first! This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetShops}
              disabled={resetting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {resetting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Yes, Delete All Shop Data'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
