/**
 * Route mapping utility for URL-based routing.
 * Maps between old Zustand currentView IDs and Next.js route paths.
 */

// Admin view ID → route path
export const viewToRoute: Record<string, string> = {
  'admin-dashboard': '/dashboard',
  'admin-credit': '/credit-posting',
  'admin-claims': '/claims',
  'admin-recovery': '/recovery',
  'admin-approve-recovery': '/approve-recovery',
  'admin-transactions': '/transactions',
  'admin-shops': '/shops',
  'admin-shop-detail': '/shops', // actual route is /shops/[id], handled specially
  'admin-orderbookers': '/orderbookers',
  'admin-companies': '/companies',
  'admin-reconciliation': '/reconciliation',
  'admin-audit': '/audit',
  'admin-settings': '/settings',
  'admin-ob-analytics': '/analytics',
  'admin-monthly-summary': '/monthly-summary',
  'admin-daily-targets': '/recovery-targets',
  'admin-credit-targets': '/credit-targets',
  'admin-overdue-shops': '/overdue-shops',
  'admin-activity': '/activity',
  'admin-sms-tracking': '/sms-tracking',
  'admin-aging-report': '/aging-report',
  'admin-area-distribution': '/area-distribution',
  'admin-shop-ratio': '/shop-ratio',
  'admin-visit-tracking': '/visit-tracking',
  'admin-map-view': '/map',
  'admin-calendar': '/calendar',
  'admin-export-data': '/export',
  'admin-ob-recovery-report': '/ob-recovery',
  'admin-balance-report': '/balance-report',
  'admin-company-report': '/company-report',
  'admin-route-tracker': '/route-tracker',
  // Orderbooker views
  'orderbooker-dashboard': '/ob',
  'orderbooker-history': '/ob/history',
  'orderbooker-ledger': '/ob/ledger',
  'orderbooker-profile': '/ob/profile',
  // Login
  'login': '/',
};

// Route path → view ID (for determining active nav state from URL)
export const routeToView: Record<string, string> = {
  '/dashboard': 'admin-dashboard',
  '/credit-posting': 'admin-credit',
  '/claims': 'admin-claims',
  '/recovery': 'admin-recovery',
  '/approve-recovery': 'admin-approve-recovery',
  '/transactions': 'admin-transactions',
  '/shops': 'admin-shops',
  '/orderbookers': 'admin-orderbookers',
  '/companies': 'admin-companies',
  '/reconciliation': 'admin-reconciliation',
  '/audit': 'admin-audit',
  '/settings': 'admin-settings',
  '/analytics': 'admin-ob-analytics',
  '/monthly-summary': 'admin-monthly-summary',
  '/recovery-targets': 'admin-daily-targets',
  '/credit-targets': 'admin-credit-targets',
  '/overdue-shops': 'admin-overdue-shops',
  '/activity': 'admin-activity',
  '/sms-tracking': 'admin-sms-tracking',
  '/aging-report': 'admin-aging-report',
  '/area-distribution': 'admin-area-distribution',
  '/shop-ratio': 'admin-shop-ratio',
  '/visit-tracking': 'admin-visit-tracking',
  '/map': 'admin-map-view',
  '/calendar': 'admin-calendar',
  '/export': 'admin-export-data',
  '/ob-recovery': 'admin-ob-recovery-report',
  '/balance-report': 'admin-balance-report',
  '/company-report': 'admin-company-report',
  '/route-tracker': 'admin-route-tracker',
  // Orderbooker routes
  '/ob': 'orderbooker-dashboard',
  '/ob/history': 'orderbooker-history',
  '/ob/ledger': 'orderbooker-ledger',
  '/ob/profile': 'orderbooker-profile',
  // Login
  '/': 'login',
};

/**
 * Convert a view ID to a route path.
 * For shop-detail, pass the shopId to get the full /shops/[id] path.
 */
export function getViewRoute(viewId: string, shopId?: string): string {
  if (viewId === 'admin-shop-detail' && shopId) {
    return `/shops/${shopId}`;
  }
  return viewToRoute[viewId] || '/dashboard';
}

/**
 * Derive the view ID from a pathname.
 * Handles dynamic routes like /shops/[id] → admin-shop-detail
 */
export function getViewFromPathname(pathname: string): string {
  // Handle dynamic shop detail route
  if (pathname.match(/^\/shops\/[^/]+$/)) {
    return 'admin-shop-detail';
  }
  // Exact match
  if (routeToView[pathname]) {
    return routeToView[pathname];
  }
  // Try prefix match for nested routes
  const sortedKeys = Object.keys(routeToView).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (pathname.startsWith(key)) {
      return routeToView[key];
    }
  }
  return 'admin-dashboard';
}

/**
 * Check if a nav item ID matches the current pathname.
 * Used for highlighting active sidebar items.
 */
export function isNavActive(viewId: string, pathname: string): boolean {
  if (viewId === 'admin-shop-detail') {
    // Shop detail page - highlight the "shops" nav item
    return pathname.startsWith('/shops');
  }
  const route = viewToRoute[viewId];
  if (!route) return false;
  return pathname === route || pathname.startsWith(route + '/');
}
