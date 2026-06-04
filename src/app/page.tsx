'use client';

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
import AdminApproveRecovery from '@/components/alfalah/AdminApproveRecovery';
import OrderbookerLayout from '@/components/alfalah/OrderbookerLayout';
import AdminDailyTargets from '@/components/alfalah/AdminDailyTargets';
import AdminOverdueShops from '@/components/alfalah/AdminOverdueShops';
import AdminVisitTracking from '@/components/alfalah/AdminVisitTracking';
import AdminMapView from '@/components/alfalah/AdminMapView';
import AdminCalendarView from '@/components/alfalah/AdminCalendarView';
import AdminExportData from '@/components/alfalah/AdminExportData';
import AdminCompanies from '@/components/alfalah/AdminCompanies';
import AdminBalanceReport from '@/components/alfalah/AdminBalanceReport';
import AdminOBRecoveryReport from '@/components/alfalah/AdminOBRecoveryReport';
import AdminCompanyReport from '@/components/alfalah/AdminCompanyReport';
import AdminRouteTracker from '@/components/alfalah/AdminRouteTracker';
import AdminSettings from '@/components/alfalah/AdminSettings';

function AdminRouter() {
  const { currentView } = useAppStore();

  switch (currentView) {
    case 'admin-dashboard':
      return <AdminDashboard />;
    case 'admin-credit':
      return <AdminCreditPosting />;
    case 'admin-recovery':
      return <AdminRecoveryReport />;
    case 'admin-approve-recovery':
      return <AdminApproveRecovery />;
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
    case 'admin-settings':
      return <AdminSettings />;
    case 'admin-ob-analytics':
      return <AdminOBAnalytics />;
    case 'admin-monthly-summary':
      return <AdminMonthlySummary />;
    case 'admin-shop-detail':
      return <ShopDetailAnalytics />;
    case 'admin-activity':
      return <ActivityTimeline />;
    case 'admin-daily-targets':
      return <AdminDailyTargets />;
    case 'admin-overdue-shops':
      return <AdminOverdueShops />;
    case 'admin-visit-tracking':
      return <AdminVisitTracking />;
    case 'admin-map-view':
      return <AdminMapView />;
    case 'admin-calendar':
      return <AdminCalendarView />;
    case 'admin-export-data':
      return <AdminExportData />;
    case 'admin-ob-recovery-report':
      return <AdminOBRecoveryReport />;
    case 'admin-companies':
      return <AdminCompanies />;
    case 'admin-balance-report':
      return <AdminBalanceReport />;
    case 'admin-company-report':
      return <AdminCompanyReport />;
    case 'admin-route-tracker':
      return <AdminRouteTracker />;
    default:
      return <AdminDashboard />;
  }
}

export default function Page() {
  useSessionRehydrate();

  const { isAuthenticated, user } = useAppStore();

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
