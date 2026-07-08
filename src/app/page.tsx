'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useSessionRehydrate } from '@/lib/use-session-rehydrate';
import LoginView from '@/components/alfalah/LoginView';

export default function Page() {
  useSessionRehydrate();

  const { isAuthenticated, user, isHydrated } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect until hydration is complete
    if (!isHydrated) return;
    
    if (isAuthenticated && user) {
      if (user.role === 'admin') {
        router.replace('/dashboard');
      } else if (user.role === 'orderbooker') {
        router.replace('/ob');
      }
    }
  }, [isAuthenticated, user, isHydrated, router]);

  // Wait for hydration before deciding what to show
  if (!isHydrated) {
    return null;
  }

  // Not authenticated — show login
  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  // Authenticated but redirect hasn't happened yet — show nothing
  return null;
}
