'use client';

import { useAppStore } from '@/lib/store';
import AdminCreditRecoveryAnalysis from '@/components/alfalah/AdminCreditRecoveryAnalysis';

export default function CreditRecoveryAnalysisPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <AdminCreditRecoveryAnalysis />;
}
