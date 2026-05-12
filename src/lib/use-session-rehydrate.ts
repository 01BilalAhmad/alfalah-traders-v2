'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

const STORAGE_KEY = 'finexa-session';
const TOKEN_KEY = 'finexa-token';
// Legacy keys for migration
const LEGACY_STORAGE_KEY = 'alfalah-session';
const LEGACY_TOKEN_KEY = 'alfalah-token';

function loadSessionFromStorage() {
  try {
    // Try new key first
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.user) {
        return parsed.user;
      }
    }
    // Migration: check legacy key
    const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacySaved) {
      const parsed = JSON.parse(legacySaved);
      if (parsed.user) {
        // Migrate to new key
        localStorage.setItem(STORAGE_KEY, legacySaved);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        return parsed.user;
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function loadTokenFromStorage(): string | null {
  try {
    // Try new key first
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    // Migration: check legacy key
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return legacyToken;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Rehydrates auth state from localStorage after mount.
 * Uses useEffect so it only runs on the client AFTER hydration,
 * preventing server/client HTML mismatch (hydration error).
 */
export function useSessionRehydrate() {
  const setUser = useAppStore((s) => s.setUser);
  const setToken = useAppStore((s) => s.setToken);

  useEffect(() => {
    const user = loadSessionFromStorage();
    const token = loadTokenFromStorage();
    if (user) {
      setUser(user);
    }
    if (token) {
      setToken(token);
    }
  }, [setUser, setToken]);
}
