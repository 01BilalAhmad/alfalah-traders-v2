'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useSessionRehydrate } from '@/lib/use-session-rehydrate';
import TellerLayout from '@/components/alfalah/TellerLayout';

/**
 * Minimal layout for the /tally route (teller-only access).
 * - Tellers are allowed.
 * - Admins are redirected to /market-tally (the admin variant under (admin)).
 * - Orderbookers are redirected to /ob.
 * - Unauthenticated users are redirected to / (login).
 */
export default function TallyLayoutWrapper({ children }: { children: React.ReactNode }) {
  useSessionRehydrate();

  const { isAuthenticated, user, isHydrated } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated) return;

    if (!isAuthenticated || !user) {
      router.replace('/');
      return;
    }
    if (user.role === 'admin') {
      router.replace('/market-tally');
      return;
    }
    if (user.role === 'orderbooker') {
      router.replace('/ob');
      return;
    }
    // user.role === 'teller' → allowed, fall through
  }, [isAuthenticated, user, isHydrated, router]);

  if (!isHydrated) return null;
  if (!isAuthenticated || !user) return null;
  if (user.role !== 'teller') return null;

  return <TellerLayout>{children}</TellerLayout>;
}
