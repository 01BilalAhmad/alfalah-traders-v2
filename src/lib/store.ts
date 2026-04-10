import { create } from 'zustand';

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: string;
  phone?: string;
  status: string;
}

export interface AppState {
  user: AppUser | null;
  isAuthenticated: boolean;
  currentView: string;
  selectedShopId: string | null;
  selectedDate: string;
  creditSessionCount: number;
  setUser: (user: AppUser | null) => void;
  logout: () => void;
  setCurrentView: (view: string) => void;
  setSelectedShopId: (id: string | null) => void;
  setSelectedDate: (date: string) => void;
  incrementCreditSessionCount: () => void;
  resetCreditSessionCount: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isAuthenticated: false,
  currentView: 'login',
  selectedShopId: null,
  selectedDate: new Date().toISOString().split('T')[0],
  creditSessionCount: 0,
  setUser: (user) => set({ user, isAuthenticated: !!user, currentView: user ? (user.role === 'admin' ? 'admin-dashboard' : 'orderbooker-dashboard') : 'login' }),
  logout: () => set({ user: null, isAuthenticated: false, currentView: 'login', selectedShopId: null, creditSessionCount: 0 }),
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  incrementCreditSessionCount: () => set((state) => ({ creditSessionCount: state.creditSessionCount + 1 })),
  resetCreditSessionCount: () => set({ creditSessionCount: 0 }),
}));
