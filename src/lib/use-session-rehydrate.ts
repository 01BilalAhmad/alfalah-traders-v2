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
 *
 * Also listens for the 'finexa:session-expired' custom event dispatched
 * by apiFetch() when the backend returns 401, and automatically logs out
 * the user so they see the login screen instead of cryptic errors.
 */
export function useSessionRehydrate() {
  const setUser = useAppStore((s) => s.setUser);
  const setToken = useAppStore((s) => s.setToken);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const logout = useAppStore((s) => s.logout);

  useEffect(() => {
    const user = loadSessionFromStorage();
    const token = loadTokenFromStorage();
    if (user) {
      setUser(user);
    }
    if (token) {
      setToken(token);
    }
    // Mark hydration as complete so layouts can safely check auth
    setHydrated();

    // Listen for session-expired events from apiFetch (401 responses)
    const handleSessionExpired = () => {
      logout();
    };
    window.addEventListener('finexa:session-expired', handleSessionExpired);

    return () => {
      window.removeEventListener('finexa:session-expired', handleSessionExpired);
    };
  }, [setUser, setToken, setHydrated, logout]);
}
