'use client';

import { useState, useEffect, useCallback } from 'react';
import { syncPendingTransactions, getUnsyncedCount } from '@/lib/offline-store';

interface OnlineStatus {
  isOnline: boolean;
  wasOffline: boolean;
  unsyncedCount: number;
  syncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
  sync: () => Promise<void>;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  useEffect(() => {
    // Initial check
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Update unsynced count
      setUnsyncedCount(getUnsyncedCount());
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll unsynced count every 5 seconds
    const interval = setInterval(() => {
      setUnsyncedCount(getUnsyncedCount());
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const sync = useCallback(async () => {
    if (syncing || !isOnline) return;
    setSyncing(true);
    try {
      const result = await syncPendingTransactions();
      setLastSyncResult(result);
      setUnsyncedCount(getUnsyncedCount());
    } catch {
      setLastSyncResult({ synced: 0, failed: 1 });
    } finally {
      setSyncing(false);
    }
  }, [isOnline, syncing]);

  // Auto-sync when coming back online with pending items
  useEffect(() => {
    if (wasOffline && isOnline && unsyncedCount > 0) {
      sync();
      setWasOffline(false);
    }
  }, [wasOffline, isOnline, unsyncedCount, sync]);

  return { isOnline, wasOffline, unsyncedCount, syncing, lastSyncResult, sync };
}
