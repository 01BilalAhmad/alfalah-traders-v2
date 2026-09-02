'use client';

/**
 * API Cache — lightweight stale-while-revalidate layer for GET requests.
 *
 * WHY: pages like Shop Management load the same 700+ shop list on every
 * single visit (and every filter change). This module serves cached data
 * INSTANTLY on repeat visits and revalidates in the background —
 * cutting repeat API calls/payload dramatically.
 *
 * Semantics (per key = URL):
 *  - Cache age < TTL        → serve cache, NO network call at all
 *  - Cache age >= TTL       → serve cache instantly + background refresh
 *  - No cache / refresh()   → network call with loading=true
 *
 * Storage:
 *  - In-memory Map (per tab, survives SPA navigation)
 *  - sessionStorage mirror (survives page reload in the same tab; auto-cleared
 *    when the tab closes — no stale cross-session data)
 *  - Namespaced by the logged-in user's id so data never leaks between
 *    accounts sharing a tab
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface UseApiCacheResult<T> {
  data: T | null;
  loading: boolean;   // true only on the very first load (no cache yet)
  refreshing: boolean; // true during a background revalidate
  refresh: () => Promise<void>; // force network call, bypass TTL
}

interface CacheEntry {
  data: unknown;
  ts: number;
}

const SESSION_KEY = 'finexa-api-cache';
const USER_SESSION_KEY = 'finexa-session';

// ── Memory layer ────────────────────────────────────────────────────────────
const memory = new Map<string, CacheEntry>();

// ── Per-user namespace ──────────────────────────────────────────────────────
function currentUserId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = parsed?.user?.id;
      if (typeof id === 'string' && id) return id;
    }
  } catch { /* ignore */ }
  return 'anon';
}

function fullKey(key: string): string {
  return `${currentUserId()}::${key}`;
}

// ── sessionStorage mirror ───────────────────────────────────────────────────
let persistedLoaded = false;
function ensurePersistedLoaded(): void {
  if (persistedLoaded || typeof window === 'undefined') return;
  persistedLoaded = true;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [k, v] of Object.entries(parsed)) {
        if (!memory.has(k)) memory.set(k, v);
      }
    }
  } catch { /* corrupt mirror — ignore */ }
}

function persistKey(fk: string, entry: CacheEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
    parsed[fk] = entry;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // Quota exceeded / private mode — memory cache still works; just drop the mirror.
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
}

function dropPersistedKey(fk: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    delete parsed[fk];
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(parsed));
  } catch { /* ignore */ }
}

// ── Public cache operations ─────────────────────────────────────────────────

/** Remove entries whose key starts with the given prefix (e.g. '/api/shops'). */
export function invalidateApiCache(keyPrefix: string): void {
  ensurePersistedLoaded();
  const prefix = `${currentUserId()}::${keyPrefix}`;
  for (const k of Array.from(memory.keys())) {
    if (k.startsWith(prefix)) {
      memory.delete(k);
      dropPersistedKey(k);
    }
  }
}

/** Clear the whole cache (used on logout). */
export function clearApiCache(): void {
  memory.clear();
  if (typeof window !== 'undefined') {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }
}

// ── The hook ────────────────────────────────────────────────────────────────

/**
 * Cached GET via apiFetch. `cacheKey` is the URL (with query params).
 * Pass `null` to skip fetching entirely (e.g. dialog not open yet).
 */
export function useApiCache<T = unknown>(
  cacheKey: string | null,
  options: { ttl?: number } = {}
): UseApiCacheResult<T> {
  const { ttl = 60_000 } = options;
  const reqIdRef = useRef(0);
  const keyRef = useRef(cacheKey);

  const [state, setState] = useState<{ data: T | null; loading: boolean; refreshing: boolean }>(() => {
    if (!cacheKey) return { data: null, loading: false, refreshing: false };
    ensurePersistedLoaded();
    const entry = memory.get(fullKey(cacheKey));
    if (entry) return { data: entry.data as T, loading: false, refreshing: false };
    return { data: null, loading: true, refreshing: false };
  });

  const revalidate = useCallback(
    async (force: boolean) => {
      const key = keyRef.current;
      if (!key) {
        setState({ data: null, loading: false, refreshing: false });
        return;
      }

      ensurePersistedLoaded();
      const fk = fullKey(key);
      const entry = memory.get(fk);
      const now = Date.now();

      // Fresh cache and not forced → pure cache hit, zero network calls
      if (!force && entry && now - entry.ts < ttl) {
        setState({ data: entry.data as T, loading: false, refreshing: false });
        return;
      }

      // Stale cache → serve it instantly, refresh in the background
      if (entry) {
        setState({ data: entry.data as T, loading: false, refreshing: true });
      } else {
        setState((prev) => ({ ...prev, loading: true }));
      }

      const id = ++reqIdRef.current;
      try {
        const res = await apiFetch(key);
        if (id !== reqIdRef.current) return; // a newer call superseded us
        if (res.ok) {
          const data = (await res.json()) as T;
          const newEntry = { data, ts: Date.now() };
          memory.set(fk, newEntry);
          persistKey(fk, newEntry);
          setState({ data, loading: false, refreshing: false });
        } else {
          // Network error → keep serving whatever cache we have
          setState({
            data: entry ? (entry.data as T) : null,
            loading: false,
            refreshing: false,
          });
        }
      } catch {
        if (id !== reqIdRef.current) return;
        setState({
          data: entry ? (entry.data as T) : null,
          loading: false,
          refreshing: false,
        });
      }
    },
    [ttl]
  );

  // Track key changes (e.g. filter params changed)
  useEffect(() => {
    keyRef.current = cacheKey;
    // Reset local state for the new key before revalidating
    if (cacheKey) {
      ensurePersistedLoaded();
      const entry = memory.get(fullKey(cacheKey));
      setState(
        entry
          ? { data: entry.data as T, loading: false, refreshing: false }
          : { data: null, loading: true, refreshing: false }
      );
    }
    revalidate(false);
  }, [cacheKey, revalidate]);

  const refresh = useCallback(() => revalidate(true), [revalidate]);

  return { data: state.data, loading: state.loading, refreshing: state.refreshing, refresh };
}
