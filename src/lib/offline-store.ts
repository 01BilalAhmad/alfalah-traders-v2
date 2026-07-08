/**
 * Offline Storage Utility for Orderbooker App
 * Uses localStorage to cache shops and queue pending transactions
 * When offline, shops load from cache; recovery gets queued
 * When back online, queued transactions auto-sync to server
 */

import { apiFetch } from '@/lib/api';

const SHOP_CACHE_KEY = 'finexa-offline-shops';
const PENDING_QUEUE_KEY = 'finexa-pending-txns';
const CACHE_TIMESTAMP_KEY = 'finexa-offline-ts';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedShop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  phone: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbookerId: string;
  orderbookerName: string;
  companyId: string | null;
  companyName: string | null;
  distributorPhone: string | null;
  companyBalances?: { companyId: string; companyName: string; balance: number; creditLimit: number; distributorPhone?: string | null }[];
}

export interface PendingTransaction {
  id: string;           // unique local ID
  shopId: string;
  shopName: string;     // cached for display
  type: 'recovery';
  amount: number;
  description: string;
  createdBy: string;
  gpsLat: number | null;
  gpsLng: number | null;
  createdAt: string;    // ISO timestamp when created offline
  synced: boolean;
  syncError: string | null;
  distributorPhone?: string | null;  // cached for receipt/SMS
  companyName?: string | null;       // cached for receipt/SMS
}

// ─── Shop Cache ─────────────────────────────────────────────────────────────

export function cacheShops(shops: CachedShop[]): void {
  try {
    localStorage.setItem(SHOP_CACHE_KEY, JSON.stringify(shops));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, String(Date.now()));
  } catch { /* storage full or unavailable */ }
}

export function getCachedShops(): CachedShop[] {
  try {
    const raw = localStorage.getItem(SHOP_CACHE_KEY);
    if (!raw) return [];
    const shops = JSON.parse(raw) as CachedShop[];
    // Check if cache is too old
    const ts = Number(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0');
    if (Date.now() - ts > CACHE_MAX_AGE) {
      return shops; // still return old data, but it might be stale
    }
    return shops;
  } catch {
    return [];
  }
}

export function hasCachedShops(): boolean {
  try {
    return !!localStorage.getItem(SHOP_CACHE_KEY);
  } catch {
    return false;
  }
}

export function getCacheAge(): string {
  try {
    const ts = Number(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0');
    if (ts === 0) return 'Never cached';
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  } catch {
    return 'Unknown';
  }
}

// ─── Pending Transaction Queue ─────────────────────────────────────────────

export function addPendingTransaction(txn: Omit<PendingTransaction, 'id' | 'createdAt' | 'synced' | 'syncError'>): PendingTransaction {
  const pending: PendingTransaction = {
    ...txn,
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    synced: false,
    syncError: null,
  };
  const queue = getPendingTransactions();
  queue.push(pending);
  savePendingQueue(queue);
  return pending;
}

export function getPendingTransactions(): PendingTransaction[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PendingTransaction[];
  } catch {
    return [];
  }
}

export function getUnsyncedCount(): number {
  return getPendingTransactions().filter(t => !t.synced).length;
}

export function savePendingQueue(queue: PendingTransaction[]): void {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full */ }
}

export function clearSyncedTransactions(): void {
  const queue = getPendingTransactions().filter(t => !t.synced);
  savePendingQueue(queue);
}

export function markTransactionSynced(localId: string, success: boolean, error?: string): void {
  const queue = getPendingTransactions();
  const idx = queue.findIndex(t => t.id === localId);
  if (idx >= 0) {
    queue[idx].synced = success;
    queue[idx].syncError = success ? null : (error || 'Unknown error');
    savePendingQueue(queue);
  }
}

export function removeTransaction(localId: string): void {
  const queue = getPendingTransactions().filter(t => t.id !== localId);
  savePendingQueue(queue);
}

// ─── Sync Engine ─────────────────────────────────────────────────────────────

export async function syncPendingTransactions(): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  const queue = getPendingTransactions().filter(t => !t.synced);
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // Get auth token for API calls
  let authToken: string | null = null;
  try { authToken = localStorage.getItem('finexa-token') || localStorage.getItem('alfalah-token'); } catch { /* ignore */ }

  for (const txn of queue) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const res = await apiFetch('/api/transactions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          shopId: txn.shopId,
          type: txn.type,
          amount: txn.amount,
          description: txn.description + ' [synced from offline]',
          createdBy: txn.createdBy,
          gpsLat: txn.gpsLat || undefined,
          gpsLng: txn.gpsLng || undefined,
        }),
      });

      if (res.ok) {
        markTransactionSynced(txn.id, true);
        synced++;
      } else {
        const data = await res.json().catch(() => ({}));
        const errMsg = data.error || `Server error ${res.status}`;
        markTransactionSynced(txn.id, false, errMsg);
        failed++;
        errors.push(`${txn.shopName}: ${errMsg}`);
      }
    } catch (err) {
      markTransactionSynced(txn.id, false, 'Network error');
      failed++;
      errors.push(`${txn.shopName}: Network error`);
    }
  }

  if (synced > 0) {
    clearSyncedTransactions();
  }

  return { synced, failed, errors };
}
