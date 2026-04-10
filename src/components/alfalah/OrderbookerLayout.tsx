'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  TrendingUp,
  Store,
  Banknote,
  Wallet,
  MapPin,
  Phone,
  FileText,
  Download,
  ArrowLeft,
  Loader2,
  Navigation,
  ExternalLink,
  CheckCircle,
  Clock,
  CheckCircle2,
  Zap,
  BarChart3,
  CalendarDays,
  MessageSquare,
  X,
  LogOut,
  Settings,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';
import SessionTimeoutDialog from './SessionTimeoutDialog';
import BackupSettingsDialog from './BackupSettingsDialog';
import ShareMenu from './ShareMenu';

const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount);
}

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  phone: string | null;
  routeDay: string;
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string };
}

interface RecoveryTransaction {
  id: string;
  amount: number;
  createdAt: string;
  description: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  shop: {
    id: string;
    name: string;
    area: string | null;
  };
  creator: {
    id: string;
    name: string;
    role: string;
  };
}

interface ShopTransaction {
  id: string;
  type: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdAt: string;
  creator: {
    id: string;
    name: string;
    role: string;
  };
}

function formatNiceDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function SuccessOverlay({
  show,
  shopName,
  amount,
  onClose,
}: {
  show: boolean;
  shopName: string;
  amount: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-card rounded-2xl shadow-2xl p-6 mx-6 text-center pointer-events-auto animate-success-bounce"
      >
        <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Recovery Collected!</h3>
        <p className="text-sm text-muted-foreground mb-2">{shopName}</p>
        <p className="text-2xl font-bold text-green-600 animate-count-up">{formatCurrency(parseFloat(amount))}</p>
      </div>
    </div>
  );
}

// ─── Recovery History View ───────────────────────────────────────────────────

function RecoveryHistory() {
  const { user } = useAppStore();
  const [transactions, setTransactions] = useState<RecoveryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?limit=100&type=recovery&createdBy=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Group by date
  const grouped = transactions.reduce<Record<string, RecoveryTransaction[]>>((acc, txn) => {
    const dateKey = new Date(txn.createdAt).toLocaleDateString('en-PK', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(txn);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped);

  const totalRecovered = transactions.reduce((s, t) => s + t.amount, 0);

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Recovery History</h2>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Banknote className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No recovery history yet</p>
            <p className="text-xs mt-1">Start collecting recovery from shops to see your history here</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Recovery History</h2>
        </div>
        <Badge variant="secondary" className="text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {formatCurrency(totalRecovered)} total
        </Badge>
      </div>

      <ScrollArea className="max-h-[calc(100vh-12rem)]">
        <div className="space-y-4 pb-4">
          {dateKeys.map((dateKey) => {
            const items = grouped[dateKey];
            const dayTotal = items.reduce((s, t) => s + t.amount, 0);
            return (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold">{dateKey}</span>
                    <Badge variant="outline" className="text-[10px]">{items.length} entries</Badge>
                  </div>
                  <span className="text-sm font-bold text-green-600">{formatCurrency(dayTotal)}</span>
                </div>

                {/* Transactions */}
                <div className="space-y-2">
                  {items.map((txn) => (
                    <Card key={txn.id} className="alfalah-card-hover overflow-hidden">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-sm font-semibold truncate">{txn.shop.name}</h4>
                              {txn.gpsLat && txn.gpsLng ? (
                                <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" title="GPS captured" />
                              ) : (
                                <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" title="No GPS" />
                              )}
                            </div>
                            {txn.shop.area && (
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {txn.shop.area}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(txn.createdAt).toLocaleTimeString('en-PK', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-sm font-bold text-green-600">
                              +{formatCurrency(txn.amount)}
                            </p>
                            <div className="flex items-center gap-1 justify-end mt-0.5">
                              <Navigation className="h-2.5 w-2.5 text-muted-foreground" />
                              <span className="text-[9px] text-muted-foreground">
                                {txn.gpsLat && txn.gpsLng ? 'GPS' : 'No GPS'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Day Total */}
                <div className="flex items-center justify-end mt-2 pr-1">
                  <span className="text-[10px] text-muted-foreground">Day total:&nbsp;</span>
                  <span className="text-xs font-bold text-green-600">{formatCurrency(dayTotal)}</span>
                </div>

                <Separator className="mt-3" />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Main Layout ────────────────────────────────────────────────────────────

export default function OrderbookerLayout() {
  const { user, currentView, setCurrentView, logout } = useAppStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast({ title: 'Logged Out', description: 'You have been logged out successfully' });
  };

  if (!user) return null;

  const isDashboard = currentView === 'orderbooker-dashboard';
  const isHistory = currentView === 'orderbooker-history';
  const isLedger = currentView === 'orderbooker-ledger';
  const showBottomNav = isDashboard || isHistory;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 relative flex items-center justify-between px-4 pb-4 pt-[env(safe-area-inset-top,0px)] bg-gradient-to-r from-[#065F46] to-[#047857] shadow-[0_4px_12px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-2.5">
          {isLedger && (
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => setCurrentView('orderbooker-dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Al-Falah Traders</h1>
            <p className="text-[9px] text-blue-200 leading-tight hidden sm:block">
              {isHistory ? 'Recovery History' : isLedger ? 'Shop Ledger' : 'Orderbooker Portal'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white">{user.name}</p>
            <p className="text-[9px] text-blue-200">Orderbooker</p>
          </div>
          <ShareMenu
            title="Share"
            text="Al-Falah Traders - Smart Credit Management System"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 border-0 p-0"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
            onClick={handleLogout}
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white sm:hidden">
            {user.name.charAt(0)}
          </div>
        </div>
        {/* Animated gradient underline - more visible */}
        <div className="absolute bottom-0 left-0 right-0 h-[3px] animate-gradient-underline opacity-100" />
        {/* Current date - mobile - improved visibility */}
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 sm:hidden">
          <span className="text-[10px] text-white/80 font-medium bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm border border-white/20">
            <CalendarDays className="h-3 w-3 inline mr-1 -mt-px" />
            {formatNiceDate()}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto page-transition">
        {isDashboard && <OrderbookerDashboard />}
        {isHistory && <RecoveryHistory />}
        {isLedger && <LedgerView />}
      </main>

      {/* Bottom Nav */}
      {showBottomNav && (
        <nav className="sticky bottom-0 glass-strong border-t border-border/50 z-40 safe-area-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-around py-2">
            <button
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${isDashboard ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setCurrentView('orderbooker-dashboard')}
            >
              <MapPin className="h-5 w-5" />
              <span className="text-[10px] font-medium">My Route</span>
            </button>
            <button
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${isHistory ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setCurrentView('orderbooker-history')}
            >
              <Clock className="h-5 w-5" />
              <span className="text-[10px] font-medium">History</span>
            </button>
            <button
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${isLedger ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setCurrentView('orderbooker-ledger')}
            >
              <FileText className="h-5 w-5" />
              <span className="text-[10px] font-medium">Ledger</span>
            </button>
          </div>
        </nav>
      )}

      {/* Settings & Backup Dialog */}
      <BackupSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Session Timeout Dialog */}
      <SessionTimeoutDialog />
    </div>
  );
}

// ─── Orderbooker Dashboard ──────────────────────────────────────────────────

function OrderbookerDashboard() {
  const { user } = useAppStore();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [recoveryNote, setRecoveryNote] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Success overlay state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successShopName, setSuccessShopName] = useState('');
  const [successAmount, setSuccessAmount] = useState('');

  // Recovery summary state
  const [todayRecovery, setTodayRecovery] = useState<RecoveryTransaction[]>([]);
  const [recoverySummaryLoading, setRecoverySummaryLoading] = useState(true);

  // Shop detail dialog state
  const [shopDetailOpen, setShopDetailOpen] = useState(false);
  const [shopDetailData, setShopDetailData] = useState<Shop | null>(null);
  const [shopTransactions, setShopTransactions] = useState<ShopTransaction[]>([]);
  const [shopTxLoading, setShopTxLoading] = useState(false);

  const todayDay = ROUTE_DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  const fetchShops = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shops?orderbookerId=${user.id}&routeDay=${todayDay}`);
      if (res.ok) setShops(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user, todayDay, refreshKey]);

  const fetchTodayRecovery = useCallback(async () => {
    if (!user) return;
    setRecoverySummaryLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/transactions?date=${today}&limit=50&type=recovery&createdBy=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setTodayRecovery(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setRecoverySummaryLoading(false); }
  }, [user]);

  useEffect(() => { fetchShops(); }, [fetchShops]);
  useEffect(() => { fetchTodayRecovery(); }, [fetchTodayRecovery, refreshKey]);

  // Recovery summary calculations
  const totalRecovered = todayRecovery.reduce((s, t) => s + t.amount, 0);
  const visitedShopIds = new Set(todayRecovery.map((t) => t.shop.id));
  const shopsVisited = visitedShopIds.size;
  const shopsTotal = shops.length;
  const avgRecovery = shopsVisited > 0 ? Math.round(totalRecovered / shopsVisited) : 0;

  const captureGPS = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Error', description: 'Geolocation not supported', variant: 'destructive' });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGpsLoading(false);
        toast({ title: 'Location Captured', description: 'GPS coordinates recorded' });
      },
      (err) => {
        setGpsLoading(false);
        toast({ title: 'GPS Error', description: err.message, variant: 'destructive' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const openRecoveryDialog = (shop: Shop) => {
    setSelectedShop(shop);
    setRecoveryAmount('');
    setRecoveryNote('');
    setGpsLat(null);
    setGpsLng(null);
    setRecoveryDialogOpen(true);
  };

  const openShopDetail = async (shop: Shop) => {
    setShopDetailData(shop);
    setShopDetailOpen(true);
    setShopTxLoading(true);
    setShopTransactions([]);
    try {
      const res = await fetch(`/api/reports/ledger?shopId=${shop.id}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setShopTransactions(data.transactions || []);
      }
    } catch { /* silent */ }
    finally { setShopTxLoading(false); }
  };

  const handlePostRecovery = async () => {
    if (!selectedShop || !user || !recoveryAmount || parseFloat(recoveryAmount) <= 0) {
      toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setPosting(true);
    try {
      const description = recoveryNote?.trim()
        ? `Cash collected by orderbooker. Note: ${recoveryNote.trim()}`
        : 'Cash collected by orderbooker';

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          type: 'recovery',
          amount: parseFloat(recoveryAmount),
          description,
          createdBy: user.id,
          gpsLat: gpsLat || undefined,
          gpsLng: gpsLng || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      // Show success overlay
      setSuccessShopName(selectedShop.name);
      setSuccessAmount(recoveryAmount);
      setRecoveryDialogOpen(false);
      setShowSuccess(true);
      setRefreshKey((k) => k + 1);
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const totalOutstanding = shops.reduce((s, shop) => s + shop.balance, 0);

  // Progress percentage for shop visit progress bar
  const visitProgress = shopsTotal > 0 ? Math.round((shopsVisited / shopsTotal) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      {/* Success Overlay */}
      <SuccessOverlay
        show={showSuccess}
        shopName={successShopName}
        amount={successAmount}
        onClose={() => setShowSuccess(false)}
      />

      {/* Day Header with Progress Bar */}
      <div className="alfalah-gradient rounded-xl p-4 text-white relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute top-2 right-14 w-8 h-8 rounded-full bg-white/8" />
        <div className="absolute bottom-3 left-1/3 w-12 h-12 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/2 right-1/4 w-6 h-6 rounded-full bg-white/[0.06]" />
        <div className="relative z-10">
          <p className="text-xs text-blue-200 uppercase tracking-wider font-medium">Today&apos;s Route</p>
          <h2 className="text-xl font-bold mt-0.5">{todayDay.charAt(0).toUpperCase() + todayDay.slice(1)}</h2>
          <p className="text-xs text-blue-100 mt-1">{shopsTotal} shops scheduled</p>
        </div>

        {/* Shop Visit Progress Bar */}
        {shopsTotal > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-blue-100">
                {shopsVisited} of {shopsTotal} shops visited
              </span>
              <span className="text-[10px] font-medium text-blue-100">{visitProgress}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all duration-500"
                style={{ width: `${visitProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="stat-card-blue animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Store className="h-4 w-4 text-blue-600" />
              <span className="text-[10px] text-muted-foreground font-medium">Total Shops</span>
            </div>
            <p className="text-xl font-bold number-display">{shops.length}</p>
          </CardContent>
        </Card>
        <Card className="stat-card-red animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-red-500" />
              <span className="text-[10px] text-muted-foreground font-medium">Outstanding</span>
            </div>
            <p className="text-lg font-bold text-red-600 number-display">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Recovery Summary */}
      <Card className="overflow-hidden animate-fade-in relative">
        <div className="mesh-gradient absolute inset-0 pointer-events-none" />
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Today&apos;s Recovery</p>
              <p className="text-[9px] text-green-100">Collection performance</p>
            </div>
          </div>
        </div>
        <CardContent className="p-4 glass-card">
          {recoverySummaryLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : todayRecovery.length === 0 ? (
            <div className="text-center py-3">
              <Zap className="h-6 w-6 mx-auto mb-1.5 text-amber-500" />
              <p className="text-xs font-medium text-muted-foreground">No recovery collected yet today</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Start your route and collect from the shops below!
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-around">
              {/* Collected stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
                <p className="text-xs font-bold text-green-600">{formatCurrency(totalRecovered)}</p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Collected</p>
              </div>

              {/* Visited stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-xs font-bold text-blue-600">
                  {shopsVisited}/{shopsTotal}
                  <span className="text-[9px] font-normal text-muted-foreground ml-1">shops</span>
                </p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Visited</p>
              </div>

              {/* Avg stat */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-xs font-bold text-amber-600">{formatCurrency(avgRecovery)}</p>
                <p className="text-[9px] text-muted-foreground badge-bounce">Avg / Shop</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Shop Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shops.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <MapPin className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No shops scheduled for {todayDay}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shops.map((shop) => (
            <Card
              key={shop.id}
              className="alfalah-card-hover hover-lift animate-card-entrance overflow-hidden cursor-pointer"
              style={{ animationDelay: `${Math.min(shops.indexOf(shop) * 40, 300)}ms` }}
              onClick={() => openShopDetail(shop)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-sm truncate">{shop.name}</h3>
                      {visitedShopIds.has(shop.id) && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                    </div>
                    {shop.area && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{shop.area}</span>
                      </div>
                    )}
                    {shop.ownerName && (
                      <p className="text-xs text-muted-foreground mt-0.5">Owner: {shop.ownerName}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`text-lg font-bold ${shop.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(shop.balance)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium hover-glow-primary btn-ripple"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRecoveryDialog(shop);
                    }}
                  >
                    <Banknote className="h-3.5 w-3.5 mr-1.5" />
                    Collect Recovery
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recovery Dialog */}
      <RecoveryDialog
        open={recoveryDialogOpen}
        onOpenChange={setRecoveryDialogOpen}
        shop={selectedShop}
        amount={recoveryAmount}
        setAmount={setRecoveryAmount}
        note={recoveryNote}
        setNote={setRecoveryNote}
        gpsLat={gpsLat}
        gpsLng={gpsLng}
        gpsLoading={gpsLoading}
        onCaptureGPS={captureGPS}
        onPost={handlePostRecovery}
        posting={posting}
      />

      {/* Shop Detail Dialog */}
      <ShopDetailDialog
        open={shopDetailOpen}
        onOpenChange={setShopDetailOpen}
        shop={shopDetailData}
        transactions={shopTransactions}
        loading={shopTxLoading}
        onCollectRecovery={(shop) => {
          setShopDetailOpen(false);
          openRecoveryDialog(shop);
        }}
      />
    </div>
  );
}

// ─── Recovery Dialog ────────────────────────────────────────────────────────

function RecoveryDialog({
  open,
  onOpenChange,
  shop,
  amount,
  setAmount,
  note,
  setNote,
  gpsLat,
  gpsLng,
  gpsLoading,
  onCaptureGPS,
  onPost,
  posting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shop: Shop | null;
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsLoading: boolean;
  onCaptureGPS: () => void;
  onPost: () => void;
  posting: boolean;
}) {
  return (
    <div className={`fixed inset-0 z-50 ${open ? 'block' : 'hidden'}`}>
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="fixed bottom-0 left-0 right-0 bg-card rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto shadow-xl animate-in slide-in-from-bottom duration-200">
        <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-5" />
        {shop && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Banknote className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-base">Collect Recovery</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-5 pl-10">{shop.name} &bull; Current: <span className="font-semibold text-red-600">{formatCurrency(shop.balance)}</span></p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Amount (Rs.)</label>
                <Input
                  type="number"
                  placeholder="Enter recovery amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  autoFocus
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {[500, 1000, 2000, 5000, 10000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        amount === String(preset)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      Rs. {preset.toLocaleString('en-PK')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Recovery Note <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  placeholder="Add a note about this recovery..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="resize-none min-h-[60px] text-sm"
                  rows={2}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">GPS Location</label>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onCaptureGPS}
                  disabled={gpsLoading}
                >
                  {gpsLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : gpsLat && gpsLng ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  ) : (
                    <Navigation className="h-4 w-4 mr-2" />
                  )}
                  {gpsLat && gpsLng ? 'Location Captured' : 'Capture Location'}
                </Button>
                {gpsLat && gpsLng && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}
                    </p>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${gpsLat}&mlon=${gpsLng}#map=17/${gpsLat}/${gpsLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" /> Map
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={onPost}
                disabled={posting || !amount || parseFloat(amount) <= 0}
              >
                {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Collect
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shop Detail Dialog ───────────────────────────────────────────────────

function ShopDetailDialog({
  open,
  onOpenChange,
  shop,
  transactions,
  loading,
  onCollectRecovery,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shop: Shop | null;
  transactions: ShopTransaction[];
  loading: boolean;
  onCollectRecovery: (shop: Shop) => void;
}) {
  if (!open || !shop) return null;

  return (
    <div className="fixed inset-0 z-50 block">
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-x-0 bottom-0 top-12 bg-card rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-200 flex flex-col max-h-[calc(100vh-3rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-bold">Shop Details</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-4 pb-4">
          <div className="space-y-4">
            {/* Shop Info Card */}
            <div className="alfalah-gradient rounded-xl p-4 text-white relative overflow-hidden">
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/10" />
              <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
              <div className="relative z-10">
                <h2 className="text-lg font-bold">{shop.name}</h2>
                {shop.area && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {shop.area}
                  </p>
                )}
                {shop.ownerName && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <Store className="h-3 w-3" /> {shop.ownerName}
                  </p>
                )}
                {shop.phone && (
                  <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {shop.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Balance & Credit Limit */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="stat-card-red">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Current Balance</p>
                  <p className={`text-lg font-bold ${shop.balance > 0 ? 'text-red-600' : 'text-green-600'} tabular-nums`}>
                    {formatCurrency(shop.balance)}
                  </p>
                </CardContent>
              </Card>
              <Card className="stat-card-blue">
                <CardContent className="p-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Credit Limit</p>
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                    {shop.creditLimit > 0 ? formatCurrency(shop.creditLimit) : 'N/A'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Credit Limit Utilization */}
            {shop.creditLimit > 0 && (
              <Card className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium">Limit Used</span>
                    <span className="text-[10px] font-semibold text-foreground tabular-nums">
                      {Math.min(Math.round((shop.balance / shop.creditLimit) * 100), 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        shop.balance > shop.creditLimit
                          ? 'bg-red-500'
                          : shop.balance > shop.creditLimit * 0.8
                            ? 'bg-amber-500'
                            : 'bg-green-500'
                      }`}
                      style={{
                        width: `${Math.min(Math.round((shop.balance / shop.creditLimit) * 100), 100)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-muted-foreground">0</span>
                    <span className="text-[9px] text-muted-foreground">{formatCurrency(shop.creditLimit)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Transactions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  Recent Transactions
                </h3>
                <Badge variant="outline" className="text-[10px]">Last 5</Badge>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : transactions.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-xs">No transactions yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {transactions.map((txn) => (
                    <Card key={txn.id} className="overflow-hidden">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className={`text-[9px] px-1.5 py-0 ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : 'Recovery'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleDateString('en-PK', {
                                  day: '2-digit', month: 'short', year: 'numeric',
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{txn.description || '—'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm tabular-nums ${txn.type === 'credit' ? 'text-amber-600' : 'text-green-600'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">Bal: {formatCurrency(txn.newBalance)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Collect Recovery Button at Bottom */}
        <div className="shrink-0 border-t border-border/50 bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-medium hover-glow-primary btn-ripple"
            onClick={() => onCollectRecovery(shop)}
          >
            <Banknote className="h-4 w-4 mr-2" />
            Collect Recovery
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ledger View ────────────────────────────────────────────────────────────

function LedgerView() {
  const { user, selectedShopId, setSelectedShopId, setCurrentView } = useAppStore();
  const [shops, setShops] = useState<Shop[]>([]);
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [loadingShops, setLoadingShops] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const fetchShops = useCallback(async () => {
    if (!user) return;
    setLoadingShops(true);
    try {
      const res = await fetch(`/api/shops?orderbookerId=${user.id}`);
      if (res.ok) setShops(await res.json());
    } catch { /* silent */ }
    finally { setLoadingShops(false); }
  }, [user]);

  useEffect(() => { fetchShops(); }, [fetchShops]);

  const fetchLedger = useCallback(async (shopId: string) => {
    setLoadingLedger(true);
    setSelectedShopId(shopId);
    try {
      const res = await fetch(`/api/reports/ledger?shopId=${shopId}`);
      if (res.ok) setLedger(await res.json());
    } catch { /* silent */ }
    finally { setLoadingLedger(false); }
  }, [setSelectedShopId]);

  const handleDownloadPDF = () => {
    if (!ledger) return;
    downloadLedgerPDF(ledger);
    toast({ title: 'PDF Downloaded', description: `${ledger.shop.name} ledger saved` });
  };

  const selectedShopName = shops.find((s) => s.id === selectedShopId)?.name;

  return (
    <div className="space-y-4 p-4">
      {selectedShopId && ledger ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedShopId(null); setLedger(null); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold truncate">{ledger.shop.name}</h2>
              <p className="text-xs text-muted-foreground">{ledger.shop.area || 'No area'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="h-3.5 w-3.5 mr-1" /> PDF
            </Button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Credit</p>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatCurrency(ledger.summary.totalCredit)}</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Recovery</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(ledger.summary.totalRecovery)}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Balance</p>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-400">{formatCurrency(ledger.summary.currentBalance)}</p>
            </div>
          </div>

          {/* Transactions */}
          {loadingLedger ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <div className="divide-y divide-border">
                    {[...ledger.transactions].reverse().map((txn) => (
                      <div key={txn.id} className="px-4 py-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[9px] ${txn.type === 'credit' ? 'badge-credit' : 'badge-recovery'}`}>
                                {txn.type === 'credit' ? 'Credit' : 'Recovery'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(txn.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{txn.description || '\u2014'}</p>
                            {txn.creator && (
                              <p className="text-[10px] text-muted-foreground">by {txn.creator.name}</p>
                            )}
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className={`font-bold text-sm ${txn.type === 'credit' ? 'text-amber-600' : 'text-green-600'}`}>
                              {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Bal: {formatCurrency(txn.newBalance)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <h2 className="text-lg font-bold">My Ledger</h2>
          <p className="text-sm text-muted-foreground">Select a shop to view its transaction history</p>

          {loadingShops ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shops.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No shops assigned</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {shops.map((shop) => (
                <Card
                  key={shop.id}
                  className="cursor-pointer alfalah-card-hover"
                  onClick={() => fetchLedger(shop.id)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{shop.name}</p>
                      <p className="text-xs text-muted-foreground">{shop.area || '\u2014'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${shop.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(shop.balance)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
