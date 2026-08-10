'use client';

import { useAppStore } from '@/lib/store';
import MarketTally from '@/components/alfalah/MarketTally';

export default function MarketTallyPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  // Admin uses MarketTally with isAdmin=true
  return <MarketTally isAdmin />;
}
