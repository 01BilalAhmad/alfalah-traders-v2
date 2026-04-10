'use client';

import { useAppStore } from '@/lib/store';
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
    default:
      return <AdminDashboard />;
  }
}

export default function Page() {
  const { isAuthenticated, user, currentView } = useAppStore();

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
