'use client';
import { useAppStore } from '@/lib/store';
import TellerSessions from '@/components/alfalah/TellerSessions';

export default function TellerSessionsPage() {
  const { user } = useAppStore();
  if (!user || user.role !== 'admin') return null;
  return <TellerSessions />;
}
