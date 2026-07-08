'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall, getPendingOfflineCount } from '@/lib/pwa-register';
import { Download, X, Smartphone, WifiOff, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PWAInstallPromptProps {
  /** Show as a floating bottom banner instead of inline */
  floating?: boolean;
  /** Additional class names */
  className?: string;
}

export default function PWAInstallPrompt({ floating = true, className = '' }: PWAInstallPromptProps) {
  const { canInstall, promptInstall, dismissPrompt } = usePWAInstall();
  const [isVisible, setIsVisible] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  // Show install prompt after a short delay
  useEffect(() => {
    if (canInstall) {
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [canInstall]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' });
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check pending offline items periodically
  useEffect(() => {
    const checkPending = async () => {
      const count = await getPendingOfflineCount();
      setPendingCount(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    dismissPrompt();
  };

  const handleInstall = async () => {
    await promptInstall();
    setIsVisible(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' });
    }
    // Trigger service worker sync
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('sync-recoveries');
        await reg.sync.register('sync-credits');
      } catch {
        // Background sync not supported, try manual sync
      }
    }
    // Wait a bit then check pending count
    setTimeout(async () => {
      const count = await getPendingOfflineCount();
      setPendingCount(count);
      setIsSyncing(false);
      if (count === 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3000);
      }
    }, 2000);
  };

  // Offline indicator bar
  if (!isOnline) {
    return (
      <div className={`fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-slide-down ${className}`}>
        <WifiOff className="h-4 w-4 animate-pulse" />
        <span>You are offline. Data will sync when connection is restored.</span>
        {pendingCount > 0 && (
          <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>
    );
  }

  // Pending sync bar (when online but have pending items)
  if (pendingCount > 0 && !isVisible) {
    return (
      <div className={`fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-[90] bg-primary text-white rounded-xl shadow-2xl p-4 flex items-center gap-3 animate-slide-up ${className}`}>
        <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{pendingCount} Pending Item{pendingCount > 1 ? 's' : ''}</p>
          <p className="text-xs text-white/70">Tap to sync offline data</p>
        </div>
        <Button
            type="button"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="bg-card text-primary hover:bg-white/90 dark:hover:bg-slate-700 shrink-0"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : justSynced ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            'Sync'
          )}
        </Button>
      </div>
    );
  }

  // Install prompt banner
  if (!isVisible || !canInstall) return null;

  if (floating) {
    return (
      <div className={`fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[90] bg-card rounded-xl shadow-2xl border border-border/50 p-4 animate-slide-up ${className}`}>
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
            <Smartphone className="h-6 w-6 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground">Install Finexa App</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Add to your home screen for quick access and offline support!
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
            type="button"
                size="sm"
                onClick={handleInstall}
                className="bg-primary hover:bg-primary/90 text-white h-8 text-xs font-semibold"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Install App
              </Button>
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>

        {/* Features preview */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-[10px]">⚡</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Fast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="text-[10px]">📡</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Offline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <span className="text-[10px]">📱</span>
            </div>
            <span className="text-[10px] text-muted-foreground">App-like</span>
          </div>
        </div>
      </div>
    );
  }

  // Inline variant
  return (
    <div className={`bg-gradient-to-r from-primary/10 to-blue-50 dark:from-primary/5 dark:to-slate-800/50 rounded-xl border border-primary/20 p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Install Finexa App</h3>
          <p className="text-xs text-muted-foreground">Quick access + offline support</p>
        </div>
        <Button type="button" size="sm" onClick={handleInstall} className="bg-primary text-white">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Install
        </Button>
        <button onClick={handleDismiss} className="p-1 rounded-full hover:bg-muted">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
