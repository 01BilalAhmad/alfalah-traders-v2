import { formatPKR } from '@/lib/utils';

// ====== Notification Types & Generation Utility ======

export type NotificationType = 'high_balance' | 'zero_recovery' | 'new_shop' | 'credit_limit_exceeded';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string; // ISO string
  read: boolean;
  actionRoute: string; // view ID to navigate to
  meta?: Record<string, string | number>; // extra data for display
}

// Data shapes we receive from API routes
interface OrderbookerData {
  id: string;
  name: string;
  phone?: string | null;
  status: string;
  totalShops?: number;
  totalOutstanding?: number;
}

interface ShopData {
  id: string;
  name: string;
  ownerName?: string | null;
  area?: string | null;
  balance: number;
  creditLimit?: number;
  status: string;
  orderbookerId: string;
  orderbooker?: { id: string; name: string };
  createdAt: string;
}

interface TransactionData {
  id: string;
  type: string;
  amount: number;
  shopId: string;
  shop?: { id: string; name: string; area?: string | null };
  creator?: { id: string; name: string; role: string };
  createdAt: string;
}

interface RecoverySummaryData {
  orderbookerId: string;
  orderbookerName: string;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  shops: { shopId: string; shopName: string; visited: boolean }[];
}

interface RecoverySummaryResponse {
  date: string;
  grandTotalRecovery: number;
  orderbookers: RecoverySummaryData[];
}

const BALANCE_THRESHOLD = 50000;

/**
 * Generates notifications from current app data.
 *
 * @param orderbookers  - List of orderbookers (from /api/orderbookers)
 * @param shops         - List of shops (from /api/shops?includeInactive=true)
 * @param todayRecovery - Today's recovery summary (from /api/reports/recovery-summary)
 * @returns Array of AppNotification objects
 */
export function generateNotifications(
  orderbookers: OrderbookerData[],
  shops: ShopData[],
  todayRecovery: RecoverySummaryResponse | null
): AppNotification[] {
  const notifications: AppNotification[] = [];
  const now = new Date().toISOString();

  // ── 1. High Balance Alerts ──────────────────────────────────
  const highBalanceShops = shops.filter(
    (s) => s.status === 'active' && s.balance > BALANCE_THRESHOLD
  );

  // Sort by balance descending, take top 10
  highBalanceShops
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10)
    .forEach((shop) => {
      const formattedBalance = formatPKR(shop.balance);
      notifications.push({
        id: `high-balance-${shop.id}`,
        type: 'high_balance',
        title: 'High Balance Alert',
        description: `${shop.name} has an outstanding balance of ${formattedBalance}`,
        timestamp: now,
        read: false,
        actionRoute: 'admin-shops',
        meta: {
          shopName: shop.name,
          balance: shop.balance,
          shopId: shop.id,
        },
      });
    });

  // If there are more than 10, add a summary notification
  if (highBalanceShops.length > 10) {
    const totalOverThreshold = highBalanceShops.reduce((s, sh) => s + sh.balance, 0);
    notifications.push({
      id: 'high-balance-summary',
      type: 'high_balance',
      title: 'High Balance Summary',
      description: `${highBalanceShops.length} shops exceed ${formatPKR(BALANCE_THRESHOLD)} (total: ${formatPKR(totalOverThreshold)})`,
      timestamp: now,
      read: false,
      actionRoute: 'admin-shops',
      meta: {
        totalShops: highBalanceShops.length,
        totalBalance: totalOverThreshold,
      },
    });
  }

  // ── 2. Zero Recovery Today ──────────────────────────────────
  if (todayRecovery && todayRecovery.orderbookers) {
    todayRecovery.orderbookers.forEach((ob) => {
      if (ob.totalRecovery === 0 && ob.totalShops > 0) {
        notifications.push({
          id: `zero-recovery-${ob.orderbookerId}`,
          type: 'zero_recovery',
          title: 'Zero Recovery Today',
          description: `${ob.orderbookerName} has not collected any recovery today (${ob.totalShops} shops assigned)`,
          timestamp: now,
          read: false,
          actionRoute: 'admin-recovery',
          meta: {
            orderbookerName: ob.orderbookerName,
            orderbookerId: ob.orderbookerId,
            totalShops: ob.totalShops,
          },
        });
      }
    });
  }

  // ── 3. New Shops (created in last 24 hours) ─────────────────
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const newShops = shops.filter((s) => {
    const created = new Date(s.createdAt);
    return created >= twentyFourHoursAgo;
  });

  newShops
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .forEach((shop) => {
      const obName = shop.orderbooker?.name || 'Unassigned';
      const timeAgo = getTimeAgo(new Date(shop.createdAt));
      notifications.push({
        id: `new-shop-${shop.id}`,
        type: 'new_shop',
        title: 'New Shop Added',
        description: `${shop.name} was added ${timeAgo}, assigned to ${obName}`,
        timestamp: shop.createdAt,
        read: false,
        actionRoute: 'admin-shops',
        meta: {
          shopName: shop.name,
          orderbookerName: obName,
          shopId: shop.id,
        },
      });
    });

  // ── 4. Credit Limit Exceeded ─────────────────────────────────
  const creditLimitExceededShops = shops.filter(
    (s) => s.status === 'active' && s.creditLimit && s.creditLimit > 0 && s.balance > s.creditLimit
  );

  creditLimitExceededShops
    .sort((a, b) => (b.balance - (b.creditLimit || 0)) - (a.balance - (a.creditLimit || 0)))
    .slice(0, 10)
    .forEach((shop) => {
      const overAmount = shop.balance - (shop.creditLimit || 0);
      notifications.push({
        id: `credit-limit-${shop.id}`,
        type: 'credit_limit_exceeded',
        title: 'Credit Limit Exceeded',
        description: `${shop.name} has exceeded its limit by ${formatPKR(overAmount)} (Balance: ${formatPKR(shop.balance)}, Limit: ${formatPKR(shop.creditLimit || 0)})`,
        timestamp: now,
        read: false,
        actionRoute: 'admin-shops',
        meta: {
          shopName: shop.name,
          balance: shop.balance,
          creditLimit: shop.creditLimit || 0,
          overAmount,
          shopId: shop.id,
        },
      });
    });

  if (creditLimitExceededShops.length > 10) {
    notifications.push({
      id: 'credit-limit-summary',
      type: 'credit_limit_exceeded',
      title: 'Credit Limit Summary',
      description: `${creditLimitExceededShops.length} shops have exceeded their credit limits`,
      timestamp: now,
      read: false,
      actionRoute: 'admin-shops',
      meta: { totalShops: creditLimitExceededShops.length },
    });
  }

  // Sort all notifications by timestamp descending (newest first)
  notifications.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return notifications;
}

// ── Helpers ────────────────────────────────────────────────────

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Returns the display color classes for a notification type.
 */
export function getNotificationColorClasses(type: NotificationType) {
  switch (type) {
    case 'high_balance':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        border: 'border-amber-200 dark:border-amber-800/50',
        iconBg: 'bg-amber-100 dark:bg-amber-900/50',
        iconText: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
      };
    case 'zero_recovery':
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        border: 'border-red-200 dark:border-red-800/50',
        iconBg: 'bg-red-100 dark:bg-red-900/50',
        iconText: 'text-red-600 dark:text-red-400',
        dot: 'bg-red-500',
      };
    case 'new_shop':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        border: 'border-emerald-200 dark:border-emerald-800/50',
        iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
        iconText: 'text-emerald-600 dark:text-emerald-400',
        dot: 'bg-emerald-500',
      };
    case 'credit_limit_exceeded':
      return {
        bg: 'bg-orange-50 dark:bg-orange-950/30',
        border: 'border-orange-200 dark:border-orange-800/50',
        iconBg: 'bg-orange-100 dark:bg-orange-900/50',
        iconText: 'text-orange-600 dark:text-orange-400',
        dot: 'bg-orange-500',
      };
  }
}
