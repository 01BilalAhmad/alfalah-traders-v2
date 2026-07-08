'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  AlertTriangle,
  Store,
  TrendingDown,
  CheckCheck,
  ExternalLink,
  BellOff,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AppNotification,
  generateNotifications,
  getNotificationColorClasses,
} from '@/lib/notifications';
import { apiFetch } from '@/lib/api';
import { getViewRoute } from '@/lib/route-map';
import { getLocalDateString } from '@/lib/utils';

// ── Icon per notification type ──────────────────────────────
function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const colors = getNotificationColorClasses(type as AppNotification['type']);
  switch (type) {
    case 'high_balance':
      return (
        <div className={`rounded-full p-1.5 ${colors.iconBg}`}>
          <AlertTriangle className={`h-3.5 w-3.5 ${colors.iconText}`} />
        </div>
      );
    case 'zero_recovery':
      return (
        <div className={`rounded-full p-1.5 ${colors.iconBg}`}>
          <TrendingDown className={`h-3.5 w-3.5 ${colors.iconText}`} />
        </div>
      );
    case 'new_shop':
      return (
        <div className={`rounded-full p-1.5 ${colors.iconBg}`}>
          <Store className={`h-3.5 w-3.5 ${colors.iconText}`} />
        </div>
      );
    default:
      return (
        <div className="rounded-full p-1.5 bg-muted">
          <Bell className={`h-3.5 w-3.5 text-muted-foreground ${className}`} />
        </div>
      );
  }
}

// ── Single notification row ─────────────────────────────────
function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: AppNotification;
  onNavigate: (route: string) => void;
}) {
  const colors = getNotificationColorClasses(notification.type);
  const timeAgo = formatRelativeTime(notification.timestamp);

  const handleClick = () => {
    onNavigate(notification.actionRoute);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-150 hover:shadow-sm group ${
        notification.read
          ? 'bg-background border-border hover:bg-muted/50'
          : `${colors.bg} ${colors.border} hover:brightness-95 dark:hover:brightness-110`
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">
          <NotificationIcon type={notification.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p
              className={`text-xs font-semibold truncate ${
                notification.read ? 'text-muted-foreground' : 'text-foreground'
              }`}
            >
              {notification.title}
            </p>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
              {timeAgo}
            </span>
          </div>
          <p
            className={`text-[11px] leading-relaxed mt-0.5 line-clamp-2 ${
              notification.read ? 'text-muted-foreground/70' : 'text-muted-foreground'
            }`}
          >
            {notification.description}
          </p>
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">View details</span>
          </div>
        </div>
        {!notification.read && (
          <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${colors.dot}`} />
        )}
      </div>
    </button>
  );
}

// ── Relative time formatter ────────────────────────────────
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main NotificationPanel Component ───────────────────────
export default function NotificationPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Fetch notification data ───────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const [shopsRes, obsRes, recoveryRes] = await Promise.all([
        apiFetch('/api/shops?includeInactive=true'),
        apiFetch('/api/orderbookers'),
        apiFetch(`/api/reports/recovery-summary?date=${getLocalDateString()}`),
      ]);

      const shops = shopsRes.ok ? await shopsRes.json() : [];
      const orderbookers = obsRes.ok ? await obsRes.json() : [];
      const recoveryData = recoveryRes.ok ? await recoveryRes.json() : null;

      // Preserve existing read state
      const existingReadMap = new Map<string, boolean>();
      notifications.forEach((n) => existingReadMap.set(n.id, n.read));

      const fresh = generateNotifications(
        Array.isArray(orderbookers) ? orderbookers : [],
        Array.isArray(shops) ? shops : [],
        recoveryData
      );

      // Merge: if notification existed before, keep its read state
      const merged = fresh.map((n) => ({
        ...n,
        read: existingReadMap.get(n.id) ?? false,
      }));

      setNotifications(merged);
      setLastFetched(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // Silent fail – notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [notifications]);

  // Use a ref to hold the latest fetch function for the interval
  // so we don't need to re-create the interval when fetchNotifications changes
  const fetchRef = useRef(fetchNotifications);
  fetchRef.current = fetchNotifications;

  // Initial fetch (delayed to avoid competing with dashboard API calls) + 60-second polling
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRef.current();
    }, 3000);
    const interval = setInterval(() => fetchRef.current(), 60000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // ── Mark all as read ──────────────────────────────────────
  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  // ── Navigate on notification click ────────────────────────
  const handleNavigate = (route: string) => {
    router.push(getViewRoute(route));
    setOpen(false);
  };

  // ── View All → navigate to dashboard ──
  const handleViewAll = () => {
    router.push('/dashboard');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
            type="button"
          variant="ghost"
          size="icon"
          className="relative text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:text-white dark:hover:bg-white/10 dark:focus-visible:ring-white/30"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5">
              {/* Ping animation ring */}
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
              {/* Solid dot */}
              <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[380px] p-0 shadow-xl border-border/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-100"
              >
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {lastFetched && (
              <span className="text-[10px] text-muted-foreground mr-1">
                Updated {lastFetched}
              </span>
            )}
            {unreadCount > 0 && (
              <Button
            type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 px-4">
              <div className="rounded-full bg-muted p-3">
                <BellOff className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                All caught up!
              </p>
              <p className="text-[11px] text-muted-foreground/70 text-center max-w-[240px]">
                No new alerts. High balance alerts, zero recovery warnings, and new shop
                notifications will appear here.
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1.5">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2.5">
              <Button
            type="button"
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs text-muted-foreground hover:text-foreground justify-center"
                onClick={handleViewAll}
              >
                View All Notifications
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
