'use client';

import { useAppStore } from '@/lib/store';
import AdminTellerManagement from '@/components/alfalah/AdminTellerManagement';

export default function TellerManagementPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <AdminTellerManagement />;
}
