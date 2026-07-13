'use client';

import { useAppStore } from '@/lib/store';
import AdminAreaManagement from '@/components/alfalah/AdminAreaManagement';

export default function AreaManagementPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <AdminAreaManagement />;
}
