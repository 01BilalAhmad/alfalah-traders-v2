'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  CreditCard,
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
  AnimatePresence,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { downloadLedgerPDF, type LedgerData } from '@/lib/pdf-generator';

const ROUTE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  routeDay: string;
  balance: number;
  status: string;
  orderbooker: { id: string; name: string };
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
        className="relative bg-card rounded-2xl shadow-2xl p-6 mx-6 text-center pointer-events-auto animate-fade-in"
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      >
        <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Recovery Collected!</h3>
        <p className="text-sm text-muted-foreground mb-2">{shopName}</p>
        <p className="text-2xl font-bold text-green-600">{formatCurrency(parseFloat(amount))}</p>
      </div>
    </div>
  );
}

export default function OrderbookerLayout() {
  const { user, currentView, setCurrentView } = useAppStore();

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="alfalah-header sticky top-0 z-50 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          {currentView === 'orderbooker-ledger' && (
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8" onClick={() => setCurrentView('orderbooker-dashboard')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
            <Store className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">Al-Falah Traders</h1>
            <p className="text-[9px] text-blue-200 leading-tight hidden sm:block">Orderbooker Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-white">{user.name}</p>
            <p className="text-[9px] text-blue-200">Orderbooker</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white sm:hidden">
            {user.name.charAt(0)}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {currentView === 'orderbooker-dashboard' && <OrderbookerDashboard />}
        {currentView === 'orderbooker-ledger' && <LedgerView />}
      </main>

      {/* Bottom Nav (only on dashboard) */}
      {currentView === 'orderbooker-dashboard' && (
        <nav className="sticky bottom-0 bg-card border-t border-border z-40">
          <div className="flex items-center justify-around py-2">
            <button className="flex flex-col items-center gap-0.5 px-3 py-1 text-primary">
              <MapPin className="h-5 w-5" />
              <span className="text-[10px] font-medium">My Route</span>
            </button>
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground"
              onClick={() => setCurrentView('orderbooker-ledger')}
            >
              <FileText className="h-5 w-5" />
              <span className="text-[10px] font-medium">My Ledger</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

function OrderbookerDashboard() {
  const { user } = useAppStore();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Success overlay state
  const [showSuccess, setShowSuccess] = useState(false);
  const [successShopName, setSuccessShopName] = useState('');
  const [successAmount, setSuccessAmount] = useState('');

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

  useEffect(() => { fetchShops(); }, [fetchShops]);

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
    setGpsLat(null);
    setGpsLng(null);
    setRecoveryDialogOpen(true);
  };

  const handlePostRecovery = async () => {
    if (!selectedShop || !user || !recoveryAmount || parseFloat(recoveryAmount) <= 0) {
      toast({ title: 'Error', description: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setPosting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopId: selectedShop.id,
          type: 'recovery',
          amount: parseFloat(recoveryAmount),
          description: 'Cash collected by orderbooker',
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

  return (
    <div className="space-y-4 p-4">
      {/* Success Overlay */}
      <SuccessOverlay
        show={showSuccess}
        shopName={successShopName}
        amount={successAmount}
        onClose={() => setShowSuccess(false)}
      />

      {/* Day Header */}
      <div className="alfalah-gradient rounded-xl p-4 text-white">
        <p className="text-xs text-blue-200">Today&apos;s Route</p>
        <h2 className="text-lg font-bold">{todayDay.charAt(0).toUpperCase() + todayDay.slice(1)}</h2>
        <p className="text-xs text-blue-100 mt-1">{shops.length} shops scheduled</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Total Shops</span>
            </div>
            <p className="text-xl font-bold">{shops.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-red-500" />
              <span className="text-[10px] text-muted-foreground font-medium">Outstanding</span>
            </div>
            <p className="text-lg font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

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
            <Card key={shop.id} className="alfalah-card-hover overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{shop.name}</h3>
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
                    className="flex-1 h-9 bg-primary hover:bg-primary/90 text-white text-xs font-medium"
                    onClick={() => openRecoveryDialog(shop)}
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
        gpsLat={gpsLat}
        gpsLng={gpsLng}
        gpsLoading={gpsLoading}
        onCaptureGPS={captureGPS}
        onPost={handlePostRecovery}
        posting={posting}
      />
    </div>
  );
}

function RecoveryDialog({
  open,
  onOpenChange,
  shop,
  amount,
  setAmount,
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
        <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />
        {shop && (
          <>
            <h3 className="font-bold text-base mb-1">Collect Recovery</h3>
            <p className="text-sm text-muted-foreground mb-4">{shop.name} &bull; Current: {formatCurrency(shop.balance)}</p>

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
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Credit</p>
              <p className="text-sm font-bold text-amber-700">{formatCurrency(ledger.summary.totalCredit)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Recovery</p>
              <p className="text-sm font-bold text-green-700">{formatCurrency(ledger.summary.totalRecovery)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">Balance</p>
              <p className="text-sm font-bold text-blue-700">{formatCurrency(ledger.summary.currentBalance)}</p>
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
