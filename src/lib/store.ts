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

const DEFAULT_ADMIN: AppUser = {
  id: 'cmnsqo2y20000qmvm6cwgsvmz',
  username: 'al-falah trader',
  name: 'AL-FALAH TRADER',
  role: 'admin',
  phone: '0300-0000001',
  status: 'active',
  createdAt: '2026-04-10T10:04:10.346Z',
};

export const useAppStore = create<AppState>((set) => ({
  user: DEFAULT_ADMIN,
  isAuthenticated: true,
  currentView: 'admin-dashboard',
  selectedShopId: null,
  selectedShopName: null,
  selectedDate: new Date().toISOString().split('T')[0],
  creditSessionCount: 0,
  setUser: (user) => set({ user, isAuthenticated: !!user, currentView: user ? (user.role === 'admin' ? 'admin-dashboard' : 'orderbooker-dashboard') : 'login' }),
  logout: () => set({ user: null, isAuthenticated: false, currentView: 'login', selectedShopId: null, selectedShopName: null, creditSessionCount: 0 }),
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  setSelectedShopName: (name) => set({ selectedShopName: name }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  incrementCreditSessionCount: () => set((state) => ({ creditSessionCount: state.creditSessionCount + 1 })),
  resetCreditSessionCount: () => set({ creditSessionCount: 0 }),
}));
