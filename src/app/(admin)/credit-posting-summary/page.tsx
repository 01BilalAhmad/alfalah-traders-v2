'use client';
import { useAppStore } from '@/lib/store';
import AdminCreditPostingSummary from '@/components/alfalah/AdminCreditPostingSummary';
export default function CreditPostingSummaryPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <AdminCreditPostingSummary />;
}
