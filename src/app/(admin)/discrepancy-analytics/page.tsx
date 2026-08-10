'use client';
import { useAppStore } from '@/lib/store';
import DiscrepancyAnalytics from '@/components/alfalah/DiscrepancyAnalytics';

export default function DiscrepancyAnalyticsPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <DiscrepancyAnalytics />;
}
