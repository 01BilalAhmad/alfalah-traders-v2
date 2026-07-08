'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installPromptEvent: BeforeInstallPromptEvent | null = null;

function checkInstallState(): { isInstalled: boolean; dismissed: boolean } {
  if (typeof window === 'undefined') return { isInstalled: false, dismissed: false };
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
  const wasDismissed = localStorage.getItem('pwa-install-dismissed');
  let dismissed = false;
  if (wasDismissed && !isInstalled) {
    const dismissedTime = new Date(wasDismissed);
    const now = new Date();
    const daysSinceDismissed = (now.getTime() - dismissedTime.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < 3) {
      dismissed = true;
    }
  }
  return { isInstalled, dismissed };
}

export function usePWAInstall() {
  const initialState = checkInstallState();
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled] = useState(initialState.isInstalled);
  const [dismissed, setDismissed] = useState(initialState.dismissed);

  useEffect(() => {
    if (initialState.isInstalled) return;

    // Capture the install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      installPromptEvent = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installedHandler = () => {
      installPromptEvent = null;
      setCanInstall(false);
      toast({
        title: 'App Installed! 🎉',
        description: 'Finexa has been added to your home screen',
      });
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [initialState.isInstalled]);

  const promptInstall = useCallback(async () => {
    if (!installPromptEvent) return;

    try {
      await installPromptEvent.prompt();
      const result = await installPromptEvent.userChoice;
      if (result.outcome === 'dismissed') {
        localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
        setDismissed(true);
      }
      installPromptEvent = null;
      setCanInstall(false);
    } catch (error) {
      console.error('PWA install error:', error);
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    setDismissed(true);
  }, []);

  return {
    canInstall: canInstall && !dismissed && !isInstalled,
    isInstalled,
    promptInstall,
    dismissPrompt,
  };
}

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration.scope);

          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // Check every hour
        })
        .catch((error) => {
          console.log('SW registration failed:', error);
        });
    });
  }
}

// Store a recovery for offline sync
export async function storeOfflineRecovery(data: Record<string, unknown>) {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('finexa-offline', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('offline-recoveries')) {
          db.createObjectStore('offline-recoveries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline-credits')) {
          db.createObjectStore('offline-credits', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction('offline-recoveries', 'readwrite');
    const store = tx.objectStore('offline-recoveries');
    await store.add({
      id: `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      data,
      timestamp: new Date().toISOString(),
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

// Store a credit for offline sync
export async function storeOfflineCredit(data: Record<string, unknown>) {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('finexa-offline', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('offline-recoveries')) {
          db.createObjectStore('offline-recoveries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline-credits')) {
          db.createObjectStore('offline-credits', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction('offline-credits', 'readwrite');
    const store = tx.objectStore('offline-credits');
    await store.add({
      id: `credit-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      data,
      timestamp: new Date().toISOString(),
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

// Get pending offline items count
export async function getPendingOfflineCount(): Promise<number> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('finexa-offline', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('offline-recoveries')) {
          db.createObjectStore('offline-recoveries', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline-credits')) {
          db.createObjectStore('offline-credits', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const recoveries = await new Promise<number>((resolve) => {
      const tx = db.transaction('offline-recoveries', 'readonly');
      const store = tx.objectStore('offline-recoveries');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });

    const credits = await new Promise<number>((resolve) => {
      const tx = db.transaction('offline-credits', 'readonly');
      const store = tx.objectStore('offline-credits');
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });

    db.close();
    return recoveries + credits;
  } catch {
    return 0;
  }
}
