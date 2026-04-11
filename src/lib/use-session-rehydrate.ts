'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

const STORAGE_KEY = 'alfalah-session';

function loadSessionFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.user) {
        return parsed.user;
      }
    }
  } catch {
    // ignore parse errors
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

  useEffect(() => {
    const user = loadSessionFromStorage();
    if (user) {
      setUser(user);
    }
  }, [setUser]);
}
