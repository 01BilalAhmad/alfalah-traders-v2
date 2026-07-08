import { create } from 'zustand';
import { getLocalDateString } from '@/lib/utils';
import { getViewFromPathname } from '@/lib/route-map';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: string;
  phone?: string;
  status: string;
  allRoutesEnabled?: boolean;
  companyId?: string | null;
  companyName?: string | null;
  createdAt?: string;
}

export interface AppState {
  user: AppUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  currentView: string;
  selectedShopId: string | null;
  selectedShopName: string | null;
  selectedDate: string;
  creditSessionCount: number;
  setUser: (user: AppUser | null) => void;
  setToken: (token: string | null) => void;
  setAuth: (user: AppUser, token: string) => void;
  logout: () => void;
  setCurrentView: (view: string) => void;
  syncViewFromPathname: (pathname: string) => void;
  setHydrated: () => void;
  setSelectedShopId: (id: string | null) => void;
  setSelectedShopName: (name: string | null) => void;
  setSelectedDate: (date: string) => void;
  incrementCreditSessionCount: () => void;
  resetCreditSessionCount: () => void;
}

// Session persistence helpers
const STORAGE_KEY = 'finexa-session';
const TOKEN_KEY = 'finexa-token';
// Legacy keys for migration
const LEGACY_STORAGE_KEY = 'alfalah-session';
const LEGACY_TOKEN_KEY = 'alfalah-token';

function saveSession(user: AppUser | null, token: string | null = null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
      // Clean up legacy keys
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    // Migration: check legacy key
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return legacyToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Hydration-safe: always start unauthenticated so server & client match.
// Rehydration happens via useSessionRehydrate() hook from @/lib/use-session-rehydrate
export const useAppStore = create<AppState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isHydrated: false,
  currentView: 'login',
  selectedShopId: null,
  selectedShopName: null,
  selectedDate: getLocalDateString(),
  creditSessionCount: 0,
  setUser: (user) => {
    saveSession(user);
    set({ user, isAuthenticated: !!user, currentView: user ? (user.role === 'admin' ? 'admin-dashboard' : 'orderbooker-dashboard') : 'login' });
  },
  setToken: (token) => {
    if (typeof window !== 'undefined') {
      try {
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch { /* ignore */ }
    }
    set({ token });
  },
  setAuth: (user, token) => {
    saveSession(user, token);
    set({
      user,
      token,
      isAuthenticated: true,
      currentView: user.role === 'admin' ? 'admin-dashboard' : 'orderbooker-dashboard',
    });
  },
  logout: () => {
    saveSession(null);
    set({ user: null, token: null, isAuthenticated: false, currentView: 'login', selectedShopId: null, selectedShopName: null, creditSessionCount: 0 });
  },
  setCurrentView: (view) => set({ currentView: view }),
  syncViewFromPathname: (pathname) => set({ currentView: getViewFromPathname(pathname) }),
  setHydrated: () => set({ isHydrated: true }),
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  setSelectedShopName: (name) => set({ selectedShopName: name }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  incrementCreditSessionCount: () => set((state) => ({ creditSessionCount: state.creditSessionCount + 1 })),
  resetCreditSessionCount: () => set({ creditSessionCount: 0 }),
}));
