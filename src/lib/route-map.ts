/**
 * Route mapping utility for URL-based routing.
 * Maps between old Zustand currentView IDs and Next.js route paths.
 */

// Admin view ID → route path
export const viewToRoute: Record<string, string> = {
  'admin-dashboard': '/dashboard',
  'admin-credit': '/credit-posting',
  'admin-credit-posting-summary': '/credit-posting-summary',
  'admin-claims': '/claims',
  'admin-recovery': '/recovery',
  'admin-approve-recovery': '/approve-recovery',
  'admin-transactions': '/transactions',
  'admin-shops': '/shops',
  'admin-shop-detail': '/shops', // actual route is /shops/[id], handled specially
  'admin-orderbookers': '/orderbookers',
  'admin-companies': '/companies',
  'admin-area-management': '/area-management',
  'admin-reconciliation': '/reconciliation',
  'admin-audit': '/audit',
  'admin-settings': '/settings',
  'admin-ob-analytics': '/analytics',
  'admin-monthly-summary': '/monthly-summary',
  'admin-credit-recovery-analysis': '/credit-recovery-analysis',
  'admin-daily-targets': '/recovery-targets',
  'admin-credit-targets': '/credit-targets',
  'admin-overdue-shops': '/overdue-shops',
  'admin-activity': '/activity',
  'admin-sms-tracking': '/sms-tracking',
  'admin-whatsapp-settings': '/whatsapp-settings',
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
  // Market Tally System (admin views)
  'admin-teller-management': '/teller-management',
  'admin-market-tally': '/market-tally',
  'admin-tally-report': '/tally-report',
  'admin-discrepancy-analytics': '/discrepancy-analytics',
  'admin-overdue-tallies': '/overdue-tallies',
  'admin-teller-sessions': '/teller-sessions',
  // Orderbooker views
  'orderbooker-dashboard': '/ob',
  'orderbooker-history': '/ob/history',
  'orderbooker-ledger': '/ob/ledger',
  'orderbooker-profile': '/ob/profile',
  // Teller (minimal layout — no admin sidebar)
  'tally': '/tally',
  // Login
  'login': '/',
};

// Route path → view ID (for determining active nav state from URL)
export const routeToView: Record<string, string> = {
  '/dashboard': 'admin-dashboard',
  '/credit-posting': 'admin-credit',
  '/credit-posting-summary': 'admin-credit-posting-summary',
  '/claims': 'admin-claims',
  '/recovery': 'admin-recovery',
  '/approve-recovery': 'admin-approve-recovery',
  '/transactions': 'admin-transactions',
  '/shops': 'admin-shops',
  '/orderbookers': 'admin-orderbookers',
  '/companies': 'admin-companies',
  '/area-management': 'admin-area-management',
  '/reconciliation': 'admin-reconciliation',
  '/audit': 'admin-audit',
  '/settings': 'admin-settings',
  '/analytics': 'admin-ob-analytics',
  '/monthly-summary': 'admin-monthly-summary',
  '/credit-recovery-analysis': 'admin-credit-recovery-analysis',
  '/recovery-targets': 'admin-daily-targets',
  '/credit-targets': 'admin-credit-targets',
  '/overdue-shops': 'admin-overdue-shops',
  '/activity': 'admin-activity',
  '/sms-tracking': 'admin-sms-tracking',
  '/whatsapp-settings': 'admin-whatsapp-settings',
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
  // Market Tally System (admin routes)
  '/teller-management': 'admin-teller-management',
  '/market-tally': 'admin-market-tally',
  '/tally-report': 'admin-tally-report',
  '/discrepancy-analytics': 'admin-discrepancy-analytics',
  '/overdue-tallies': 'admin-overdue-tallies',
  '/teller-sessions': 'admin-teller-sessions',
  // Orderbooker routes
  '/ob': 'orderbooker-dashboard',
  '/ob/history': 'orderbooker-history',
  '/ob/ledger': 'orderbooker-ledger',
  '/ob/profile': 'orderbooker-profile',
  // Teller route (minimal layout)
  '/tally': 'tally',
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
