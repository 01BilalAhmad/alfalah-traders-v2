'use client';

import { useAppStore } from '@/lib/store';
import TallyReport from '@/components/alfalah/TallyReport';

export default function TallyReportPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <TallyReport />;
}
