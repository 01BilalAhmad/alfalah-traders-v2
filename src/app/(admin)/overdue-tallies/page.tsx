'use client';
import { useAppStore } from '@/lib/store';
import OverdueTallies from '@/components/alfalah/OverdueTallies';

export default function OverdueTalliesPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <OverdueTallies />;
}
