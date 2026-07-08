'use client';

import { useAppStore } from '@/lib/store';
import AdminClaimPosting from '@/components/alfalah/AdminClaimPosting';

export default function ClaimsPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <AdminClaimPosting />;
}
