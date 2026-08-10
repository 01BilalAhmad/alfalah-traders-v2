'use client';

import MarketTally from '@/components/alfalah/MarketTally';

export default function TallyPage() {
  // Tellers use MarketTally with isAdmin=false (teller mode)
  return <MarketTally isAdmin={false} />;
}
