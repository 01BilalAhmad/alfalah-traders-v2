'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useSessionRehydrate } from '@/lib/use-session-rehydrate';
import LoginView from '@/components/alfalah/LoginView';
import AdminLayout from '@/components/alfalah/AdminLayout';
import AdminDashboard from '@/components/alfalah/AdminDashboard';
import AdminCreditPosting from '@/components/alfalah/AdminCreditPosting';
import AdminRecoveryReport from '@/components/alfalah/AdminRecoveryReport';
import AdminShops from '@/components/alfalah/AdminShops';
import AdminOrderbookers from '@/components/alfalah/AdminOrderbookers';
import AdminReconciliation from '@/components/alfalah/AdminReconciliation';
import AdminAuditLog from '@/components/alfalah/AdminAuditLog';
import AdminOBAnalytics from '@/components/alfalah/AdminOBAnalytics';
import AdminMonthlySummary from '@/components/alfalah/AdminMonthlySummary';
import AdminTransactions from '@/components/alfalah/AdminTransactions';
import ShopDetailAnalytics from '@/components/alfalah/ShopDetailAnalytics';
import ActivityTimeline from '@/components/alfalah/ActivityTimeline';
import OrderbookerLayout from '@/components/alfalah/OrderbookerLayout';

function AdminRouter() {
  const { currentView } = useAppStore();

  switch (currentView) {
    case 'admin-dashboard':
      return <AdminDashboard />;
    case 'admin-credit':
      return <AdminCreditPosting />;
    case 'admin-recovery':
      return <AdminRecoveryReport />;
    case 'admin-transactions':
      return <AdminTransactions />;
    case 'admin-shops':
      return <AdminShops />;
    case 'admin-orderbookers':
      return <AdminOrderbookers />;
    case 'admin-reconciliation':
      return <AdminReconciliation />;
    case 'admin-audit':
      return <AdminAuditLog />;
    case 'admin-ob-analytics':
      return <AdminOBAnalytics />;
    case 'admin-monthly-summary':
      return <AdminMonthlySummary />;
    case 'admin-shop-detail':
      return <ShopDetailAnalytics />;
    case 'admin-activity':
      return <ActivityTimeline />;
    default:
      return <AdminDashboard />;
  }
}

export default function Page() {
  const [mounted, setMounted] = useState(false);

  // Rehydrate auth from localStorage AFTER mount
  useSessionRehydrate();

  const { isAuthenticated, user } = useAppStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Before mount, render a blank shell matching login page background to prevent hydration mismatch
  if (!mounted) {
    return (
      <div
        className="min-h-screen"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 25%, #1E40AF 50%, #1E3A8A 75%, #0F172A 100%)' }}
      />
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  if (user.role === 'admin') {
    return (
      <AdminLayout>
        <AdminRouter />
      </AdminLayout>
    );
  }

  if (user.role === 'orderbooker') {
    return <OrderbookerLayout />;
  }

  return <LoginView />;
}
