'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from './store';

// ─── Constants ─────────────────────────────────────────────────────────────────
const IDLE_TIMEOUT = 30 * 60 * 1000;       // 30 minutes
const WARNING_BEFORE = 5 * 60 * 1000;      // 5 minutes before timeout
const CHECK_INTERVAL = 30 * 1000;           // check every 30s
const COUNTDOWN_INTERVAL = 1000;            // countdown every 1s

const STORAGE_KEY = 'finexa_last_activity';

// ─── Helper: get/set last activity from localStorage ──────────────────────────
function getLastActivity(): number {
  if (typeof window === 'undefined') return Date.now();
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? parseInt(stored, 10) : Date.now();
}

function setLastActivity(): void {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

function clearLastActivity(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Hook Return Type ──────────────────────────────────────────────────────────
interface SessionState {
  /** Whether the user is currently in the idle warning state */
  showWarning: boolean;
  /** Seconds remaining until auto-logout (only meaningful when showWarning is true) */
  countdownSeconds: number;
  /** Manually reset the idle timer */
  resetTimer: () => void;
  /** Manually trigger logout */
  logout: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────
export function useSessionManager(): SessionState {
  const { isAuthenticated, logout: storeLogout } = useAppStore();
  const [showWarning, setShowWarning] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(WARNING_BEFORE / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use refs to avoid stale closures in intervals
  const isAuthenticatedRef = useRef(isAuthenticated);
  const showWarningRef = useRef(showWarning);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  });

  useEffect(() => {
    showWarningRef.current = showWarning;
  });

  // ─── Clear all intervals ──────────────────────────────────────────────────
  const clearAllIntervals = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (checkRef.current) {
      clearInterval(checkRef.current);
      checkRef.current = null;
    }
  }, []);

  // ─── Perform logout ───────────────────────────────────────────────────────
  const logout = useCallback(() => {
    clearAllIntervals();
    setShowWarning(false);
    clearLastActivity();
    storeLogout();
  }, [storeLogout, clearAllIntervals]);

  // ─── Reset the idle timer ─────────────────────────────────────────────────
  const resetTimer = useCallback(() => {
    if (!isAuthenticatedRef.current) return;
    setLastActivity();
    setShowWarning(false);
    setCountdownSeconds(WARNING_BEFORE / 1000);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // ─── Activity event handler ───────────────────────────────────────────────
  const handleActivity = useCallback(() => {
    if (!isAuthenticatedRef.current) return;
    // If already showing warning, user responded — reset timer
    if (showWarningRef.current) {
      resetTimer();
      return;
    }
    setLastActivity();
  }, [resetTimer]);

  // ─── Main effect: manage intervals and event listeners ────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      clearAllIntervals();
      return;
    }

    // Check if already expired on mount (way past timeout)
    const lastActivity = getLastActivity();
    const elapsed = Date.now() - lastActivity;
    if (elapsed >= IDLE_TIMEOUT) {
      // Already timed out — auto-logout silently
      clearLastActivity();
      storeLogout();
      return;
    }

    // Set initial activity timestamp on mount
    setLastActivity();

    // ─── Periodic idle check (every 30s) ───────────────────────────────────
    checkRef.current = setInterval(() => {
      if (!isAuthenticatedRef.current) return;

      const last = getLastActivity();
      const elapsedNow = Date.now() - last;

      // If already in warning state, the countdown interval handles it
      if (showWarningRef.current) return;

      if (elapsedNow >= IDLE_TIMEOUT) {
        // Way past timeout — auto-logout
        clearLastActivity();
        storeLogout();
      } else if (elapsedNow >= (IDLE_TIMEOUT - WARNING_BEFORE)) {
        // Enter warning state — show dialog with countdown
        const remainingMs = IDLE_TIMEOUT - elapsedNow;
        setCountdownSeconds(Math.ceil(remainingMs / 1000));
        setShowWarning(true);
      }
    }, CHECK_INTERVAL);

    // ─── Countdown interval (runs only when warning is shown) ───────────────
    // This is handled in a separate effect below

    // ─── Activity event listeners ──────────────────────────────────────────
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const;
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearAllIntervals();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isAuthenticated, storeLogout, handleActivity, clearAllIntervals]);

  // ─── Countdown effect: tick every second when warning is shown ────────────
  useEffect(() => {
    if (!showWarning) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          // Time's up — auto-logout
          if (isAuthenticatedRef.current) {
            clearLastActivity();
            storeLogout();
          }
          return 0;
        }
        return prev - 1;
      });
    }, COUNTDOWN_INTERVAL);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [showWarning, storeLogout]);

  // Only show warning when user is still authenticated
  const effectiveShowWarning = showWarning && isAuthenticated;

  return { showWarning: effectiveShowWarning, countdownSeconds, resetTimer, logout };
}
