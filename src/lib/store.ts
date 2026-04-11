import { create } from 'zustand';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: string;
  phone?: string;
  status: string;
  createdAt?: string;
}

export interface AppState {
  user: AppUser | null;
  isAuthenticated: boolean;
  currentView: string;
  selectedShopId: string | null;
  selectedShopName: string | null;
  selectedDate: string;
  creditSessionCount: number;
  setUser: (user: AppUser | null) => void;
  logout: () => void;
  setCurrentView: (view: string) => void;
  setSelectedShopId: (id: string | null) => void;
  setSelectedShopName: (name: string | null) => void;
  setSelectedDate: (date: string) => void;
  incrementCreditSessionCount: () => void;
  resetCreditSessionCount: () => void;
}

// Session persistence helpers
const STORAGE_KEY = 'alfalah-session';

function saveSession(user: AppUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

// Hydration-safe: always start unauthenticated so server & client match.
// Rehydration happens via useSessionRehydrate() hook from @/lib/use-session-rehydrate
export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  currentView: 'login',
  selectedShopId: null,
  selectedShopName: null,
  selectedDate: new Date().toISOString().split('T')[0],
  creditSessionCount: 0,
  setUser: (user) => {
    saveSession(user);
    set({ user, isAuthenticated: !!user, currentView: user ? (user.role === 'admin' ? 'admin-dashboard' : 'orderbooker-dashboard') : 'login' });
  },
  logout: () => {
    saveSession(null);
    set({ user: null, isAuthenticated: false, currentView: 'login', selectedShopId: null, selectedShopName: null, creditSessionCount: 0 });
  },
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  setSelectedShopName: (name) => set({ selectedShopName: name }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  incrementCreditSessionCount: () => set((state) => ({ creditSessionCount: state.creditSessionCount + 1 })),
  resetCreditSessionCount: () => set({ creditSessionCount: 0 }),
}));
