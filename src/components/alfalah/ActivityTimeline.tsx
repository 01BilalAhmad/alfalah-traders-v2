'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Activity,
  CreditCard,
  TrendingDown,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Edit3,
  Loader2,
  RefreshCw,
  Store,
  User,
} from 'lucide-react';

interface ActivityEntry {
  id: string;
  type: 'credit' | 'recovery' | 'edit';
  description: string;
  shopName: string | null;
  shopArea: string | null;
  performedBy: string;
  amount: number | null;
  createdAt: string;
  timeAgo: string;
}

interface TimelineResponse {
  activities: ActivityEntry[];
  counts: {
    all: number;
    credit: number;
    recovery: number;
    edit: number;
  };
  total: number;
  hasMore: boolean;
}

type FilterType = 'all' | 'credit' | 'recovery' | 'edit';

const filterConfig: { key: FilterType; label: string; icon: React.ReactNode; dotColor: string; badgeClass: string }[] = [
  { key: 'all', label: 'All', icon: <Activity className="h-3 w-3" />, dotColor: 'bg-primary', badgeClass: 'bg-primary/10 text-primary' },
  { key: 'credit', label: 'Credit', icon: <CreditCard className="h-3 w-3" />, dotColor: 'bg-slate-500', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
  { key: 'recovery', label: 'Recovery', icon: <TrendingDown className="h-3 w-3" />, dotColor: 'bg-green-500', badgeClass: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300' },
  { key: 'edit', label: 'Edits', icon: <Edit3 className="h-3 w-3" />, dotColor: 'bg-slate-400', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' },
];

function getDotColor(type: string): string {
  switch (type) {
    case 'credit': return 'bg-amber-500';
    case 'recovery': return 'bg-green-500';
    case 'edit': return 'bg-blue-500';
    default: return 'bg-primary';
  }
}

function getTypeBadge(type: string): { label: string; className: string; icon: React.ReactNode } {
  switch (type) {
    case 'credit':
      return { label: 'Credit', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <ArrowUpRight className="h-3 w-3" /> };
    case 'recovery':
      return { label: 'Recovery', className: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300', icon: <ArrowDownRight className="h-3 w-3" /> };
    case 'edit':
      return { label: 'Edit', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Edit3 className="h-3 w-3" /> };
    default:
      return { label: 'Activity', className: 'bg-muted text-muted-foreground', icon: <Activity className="h-3 w-3" /> };
  }
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getDateGroupLabel(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  ) {
    return 'Today';
  }

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-PK', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonTimeline() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {/* Skeleton time */}
          <div className="w-16 flex-shrink-0 pt-1">
            <Skeleton className="h-4 w-12 mb-1" />
            <Skeleton className="h-3 w-14" />
          </div>
          {/* Skeleton dot + line */}
          <div className="relative flex-shrink-0 flex flex-col items-center">
            <Skeleton className="h-3 w-3 rounded-full mt-2" />
            <Skeleton className="w-px flex-1 mt-1" />
          </div>
          {/* Skeleton card */}
          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-border/50 bg-card p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-full mb-2" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Clock className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No activity recorded yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Activity will appear here as credits are posted, recoveries are recorded, and edits are made across the system.
      </p>
    </div>
  );
}

export default function ActivityTimeline() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [counts, setCounts] = useState({ all: 0, credit: 0, recovery: 0, edit: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [hasMore, setHasMore] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchActivities = useCallback(async (append: boolean = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (append) {
      setLoadingMore(true);
    } else if (activities.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const offset = append ? activities.length : 0;
      const params = new URLSearchParams({
        limit: '50',
        offset: String(offset),
        type: activeFilter,
      });

      const res = await apiFetch(`/api/reports/activity-timeline?${params.toString()}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) return;

      const data: TimelineResponse = await res.json();

      if (append) {
        setActivities((prev) => [...prev, ...data.activities]);
      } else {
        setActivities(data.activities);
      }

      setCounts(data.counts);
      setHasMore(data.hasMore);
      setLastRefresh(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Silent fail for auto-refresh
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [activeFilter, activities.length]);

  // Initial fetch
  useEffect(() => {
    setActivities([]);
    setLoading(true);
    fetchActivities();
  }, [activeFilter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => {
      fetchActivities(false);
    }, 30000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchActivities]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleLoadMore = () => {
    fetchActivities(true);
  };

  const handleManualRefresh = () => {
    fetchActivities(false);
  };

  // Group by date
  const groupedActivities = (() => {
    const groups: { label: string; dateKey: string; entries: ActivityEntry[] }[] = [];
    let currentLabel = '';
    let currentGroup: ActivityEntry[] = [];

    for (const entry of activities) {
      const label = getDateGroupLabel(entry.createdAt);
      const dateKey = entry.createdAt.split('T')[0];
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, dateKey: currentGroup[0].createdAt, entries: currentGroup });
        }
        currentLabel = label;
        currentGroup = [entry];
      } else {
        currentGroup.push(entry);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, dateKey: currentGroup[0].createdAt, entries: currentGroup });
    }
    return groups;
  })();

  const activeFilterConfig = filterConfig.find((f) => f.key === activeFilter);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Activity Timeline
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time feed of all system activity
            {lastRefresh && (
              <span className="ml-2 inline-flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                <span className="text-xs">Updated {lastRefresh.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </span>
            )}
          </p>
        </div>
        <Button
            type="button"
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={refreshing || loading}
          className="flex-shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filter Pill Bar */}
      <Card className="card-elevated">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filterConfig.map((filter) => {
              const isActive = activeFilter === filter.key;
              const count = counts[filter.key];
              return (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    transition-all duration-150 whitespace-nowrap flex-shrink-0
                    border
                    ${isActive
                      ? `${filter.badgeClass} border-current/20 shadow-sm`
                      : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
                    }
                  `}
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                  <Badge
                    variant="secondary"
                    className={`h-4 min-w-[18px] px-1 text-[10px] font-bold ${isActive ? 'bg-current/15 text-current' : ''}`}
                  >
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timeline Content */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          {loading ? (
            <div className="px-4 sm:px-6 py-6">
              <SkeletonTimeline />
            </div>
          ) : activities.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <ScrollArea className="max-h-[680px]">
                <div className="px-4 sm:px-6 py-5">
                  {groupedActivities.map((group, groupIdx) => (
                    <div key={group.dateKey} className={groupIdx > 0 ? 'mt-7' : ''}>
                      {/* Date Group Header */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Clock className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{group.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {group.entries.length} {group.entries.length === 1 ? 'activity' : 'activities'}
                            </p>
                          </div>
                        </div>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      {/* Timeline Entries */}
                      <div className="space-y-0">
                        {group.entries.map((entry, entryIdx) => {
                          const typeBadge = getTypeBadge(entry.type);
                          const dotColor = getDotColor(entry.type);
                          const isLast = entryIdx === group.entries.length - 1;
                          const isLastGroup = groupIdx === groupedActivities.length - 1;

                          return (
                            <div
                              key={entry.id}
                              className="relative flex gap-4 pb-5 last:pb-0 animate-fade-in"
                              style={{ animationDelay: `${entryIdx * 40}ms` }}
                            >
                              {/* Left: Time */}
                              <div className="w-14 sm:w-16 flex-shrink-0 pt-1 text-right">
                                <p className="text-xs font-medium text-foreground/80">
                                  {formatTime(entry.createdAt)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {formatDate(entry.createdAt)}
                                </p>
                              </div>

                              {/* Center: Dot + Line */}
                              <div className="relative flex-shrink-0 flex flex-col items-center w-4">
                                <div className={`h-3 w-3 rounded-full ${dotColor} ring-[3px] ring-background shadow-sm mt-2 flex-shrink-0`} />
                                {!(isLast && isLastGroup) && (
                                  <div className="w-px flex-1 bg-border mt-1" />
                                )}
                              </div>

                              {/* Right: Activity Card */}
                              <div className="flex-1 min-w-0 pb-1">
                                <div className="rounded-lg border border-border/50 bg-card p-3 sm:p-3.5 hover:shadow-sm transition-shadow card-hover">
                                  {/* Top: Type badge + time ago */}
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <Badge className={`text-[10px] font-medium gap-1 ${typeBadge.className}`}>
                                      {typeBadge.icon}
                                      {typeBadge.label}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                      {entry.timeAgo}
                                    </span>
                                  </div>

                                  {/* Description */}
                                  <p className="text-sm text-foreground leading-snug mb-2">
                                    {entry.description}
                                  </p>

                                  {/* Meta info */}
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {entry.shopName && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Store className="h-3 w-3 flex-shrink-0" />
                                        <span className="truncate max-w-[180px]">{entry.shopName}</span>
                                        {entry.shopArea && (
                                          <span className="hidden sm:inline text-muted-foreground/60">
                                            &middot; {entry.shopArea}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <User className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate max-w-[140px]">{entry.performedBy}</span>
                                    </span>
                                    {entry.amount != null && (
                                      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                                        entry.type === 'credit' ? 'text-slate-600 dark:text-slate-300' : 'text-slate-600 dark:text-slate-300'
                                      }`}>
                                        {entry.type === 'credit' ? (
                                          <ArrowUpRight className="h-3 w-3" />
                                        ) : (
                                          <ArrowDownRight className="h-3 w-3" />
                                        )}
                                        Rs. {entry.amount.toLocaleString('en-PK')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Load More / Pagination Footer */}
              <div className="border-t border-border px-5 py-3">
                {hasMore && (
                  <div className="flex items-center justify-center">
                    <Button
            type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="gap-2"
                    >
                      {loadingMore ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Activity className="h-3.5 w-3.5" />
                      )}
                      {loadingMore ? 'Loading...' : 'Load More Activities'}
                    </Button>
                  </div>
                )}
                {!hasMore && activities.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    Showing all {activities.length} activities
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
