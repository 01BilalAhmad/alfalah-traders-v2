'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useSessionRehydrate } from '@/lib/use-session-rehydrate';
import AdminLayout from '@/components/alfalah/AdminLayout';

export default function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  useSessionRehydrate();

  const { isAuthenticated, user, isHydrated } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect until hydration is complete
    if (!isHydrated) return;

    if (!isAuthenticated || !user) {
      router.replace('/');
    } else if (user.role === 'orderbooker') {
      router.replace('/ob');
    } else if (user.role === 'teller') {
      // Tellers must NOT see the admin layout — send them to /tally.
      router.replace('/tally');
    }
  }, [isAuthenticated, user, isHydrated, router]);

  // Wait for hydration before making any auth decisions
  if (!isHydrated) {
    return null;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  // Block orderbookers and tellers from the admin area
  if (user.role === 'orderbooker' || user.role === 'teller') {
    return null;
  }

  return <AdminLayout>{children}</AdminLayout>;
}
