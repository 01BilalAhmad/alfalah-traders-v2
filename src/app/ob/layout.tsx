'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useSessionRehydrate } from '@/lib/use-session-rehydrate';
import OrderbookerLayout from '@/components/alfalah/OrderbookerLayout';

export default function OrderbookerLayoutWrapper({ children }: { children: React.ReactNode }) {
  useSessionRehydrate();

  const { isAuthenticated, user, isHydrated } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect until hydration is complete
    if (!isHydrated) return;
    
    if (!isAuthenticated || !user) {
      router.replace('/');
    } else if (user.role === 'admin') {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, user, isHydrated, router]);

  // Wait for hydration before making any auth decisions
  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.role === 'admin') {
    return null;
  }

  return <OrderbookerLayout>{children}</OrderbookerLayout>;
}
