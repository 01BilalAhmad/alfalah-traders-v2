'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { WORKING_DAYS, formatPKR } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Store,
  Users,
  MapPin,
  Wallet,
  Clock,
  ExternalLink,
  Calendar,
  Briefcase,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  getDay,
  isSameDay,
  isToday,
  isSameMonth,
} from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Shop {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: { id: string; name: string } | null;
}

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  totalShops: number;
  totalOutstanding: number;
}

interface DaySchedule {
  routeDays: string[];
  shops: Shop[];
  orderbookers: { id: string; name: string; shopCount: number; totalOutstanding: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUTE_DAY_COLORS: Record<string, { bg: string; text: string; border: string; light: string; dot: string }> = {
  saturday: {
    bg: 'bg-cyan-100 dark:bg-cyan-900/40',
    text: 'text-cyan-700 dark:text-cyan-300',
    border: 'border-cyan-200 dark:border-cyan-800',
    light: 'bg-cyan-50 dark:bg-cyan-900/30',
    dot: 'bg-cyan-500',
  },
  sunday: {
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
    text: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-200 dark:border-indigo-800',
    light: 'bg-indigo-50 dark:bg-indigo-900/30',
    dot: 'bg-indigo-500',
  },
  monday: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    light: 'bg-emerald-50 dark:bg-emerald-900/30',
    dot: 'bg-emerald-500',
  },
  tuesday: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    light: 'bg-amber-50 dark:bg-amber-900/30',
    dot: 'bg-amber-500',
  },
  wednesday: {
    bg: 'bg-violet-100 dark:bg-violet-900/40',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-800',
    light: 'bg-violet-50 dark:bg-violet-900/30',
    dot: 'bg-violet-500',
  },
  thursday: {
    bg: 'bg-rose-100 dark:bg-rose-900/40',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800',
    light: 'bg-rose-50 dark:bg-rose-900/30',
    dot: 'bg-rose-500',
  },
  friday: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
    light: 'bg-blue-50 dark:bg-blue-900/30',
    dot: 'bg-blue-500',
  },
};

// Map JS getDay() index to route day name
const JS_DAY_TO_ROUTE: Record<number, string> = {
  6: 'saturday',  // Saturday
  0: 'sunday',    // Sunday
  1: 'monday',    // Monday
  2: 'tuesday',   // Tuesday
  3: 'wednesday', // Wednesday
  4: 'thursday',  // Thursday
  5: 'friday',    // Friday (off day)
};

const DAY_HEADER_LABELS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRouteDayForDate(date: Date): string {
  const jsDay = getDay(date);
  return JS_DAY_TO_ROUTE[jsDay] || '';
}

function isWorkingDay(date: Date): boolean {
  const routeDay = getRouteDayForDate(date);
  return WORKING_DAYS.includes(routeDay as typeof WORKING_DAYS[number]);
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-48 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="skeleton-shimmer h-9 w-9 rounded-lg" />
          <Skeleton className="skeleton-shimmer h-9 w-32 rounded-lg" />
          <Skeleton className="skeleton-shimmer h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="skeleton-shimmer h-10 w-10 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="skeleton-shimmer h-3 w-20 mb-2" />
                <Skeleton className="skeleton-shimmer h-5 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar grid skeleton */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-7 gap-1">
            {DAY_HEADER_LABELS.map((_, i) => (
              <div key={i} className="text-center py-2">
                <Skeleton className="skeleton-shimmer h-3 w-8 mx-auto" />
              </div>
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-24 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminCalendarView() {
  const router = useRouter();

  // State
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [shopsByDay, setShopsByDay] = useState<Record<string, Shop[]>>({});
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [dayShopsLoading, setDayShopsLoading] = useState(false);
  const [dayShops, setDayShops] = useState<Shop[]>([]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch orderbookers
      const obRes = await apiFetch('/api/orderbookers');
      const obs: Orderbooker[] = obRes.ok ? await obRes.json() : [];

      // Fetch shops for each working day in parallel
      const dayFetches = WORKING_DAYS.map(async (day) => {
        try {
          const res = await apiFetch(`/api/shops?routeDay=${day}&includeInactive=false`);
          if (res.ok) {
            const data: Shop[] = await res.json();
            return { day, shops: data };
          }
          return { day, shops: [] };
        } catch {
          return { day, shops: [] };
        }
      });

      const results = await Promise.all(dayFetches);
      const grouped: Record<string, Shop[]> = {};
      results.forEach(({ day, shops }) => {
        grouped[day] = shops;
      });

      setShopsByDay(grouped);
      setOrderbookers(obs.filter(ob => ob.status === 'active'));
    } catch {
      toast({ title: 'Error', description: 'Failed to load calendar data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // ─── Calendar Calculations ──────────────────────────────────────────────────

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);
  const daysInMonth = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd]
  );

  // Calculate the offset for the first day (0=Sat, 1=Sun, ..., 6=Fri)
  // JS getDay: 0=Sun, 1=Mon, ..., 6=Sat
  // We need: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  const firstDayOffset = useMemo(() => {
    const jsDay = getDay(monthStart);
    // Convert JS day to our calendar offset (Sat=0)
    // JS: Sat=6, Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
    return (jsDay + 1) % 7;
  }, [monthStart]);

  // Total cells needed (offset + days in month, rounded up to full weeks)
  const totalCells = useMemo(() => {
    const total = firstDayOffset + daysInMonth.length;
    return Math.ceil(total / 7) * 7;
  }, [firstDayOffset, daysInMonth.length]);

  // ─── Computed Stats ─────────────────────────────────────────────────────────

  const workingDaysInMonth = useMemo(
    () => daysInMonth.filter((d) => isWorkingDay(d)).length,
    [daysInMonth]
  );

  const totalScheduledVisits = useMemo(() => {
    // Count how many times each route day appears in this month
    let total = 0;
    daysInMonth.forEach((date) => {
      const routeDay = getRouteDayForDate(date);
      if (WORKING_DAYS.includes(routeDay as typeof WORKING_DAYS[number])) {
        const shops = shopsByDay[routeDay] || [];
        total += shops.length;
      }
    });
    return total;
  }, [daysInMonth, shopsByDay]);

  const obWithMostAssignments = useMemo(() => {
    // Count shops per OB across all route days
    const obCounts: Record<string, { name: string; count: number }> = {};
    Object.values(shopsByDay).forEach((shops) => {
      shops.forEach((shop) => {
        if (shop.orderbooker) {
          if (!obCounts[shop.orderbooker.id]) {
            obCounts[shop.orderbooker.id] = { name: shop.orderbooker.name, count: 0 };
          }
          obCounts[shop.orderbooker.id].count++;
        }
      });
    });
    const sorted = Object.values(obCounts).sort((a, b) => b.count - a.count);
    return sorted[0] || null;
  }, [shopsByDay]);

  // ─── Day Detail ─────────────────────────────────────────────────────────────

  const handleDayClick = async (date: Date) => {
    const routeDay = getRouteDayForDate(date);
    if (routeDay === 'friday') return; // Don't open detail for Friday

    setSelectedDate(date);
    setDetailOpen(true);
    setDayShopsLoading(true);

    try {
      const res = await apiFetch(`/api/shops?routeDay=${routeDay}&includeInactive=false`);
      if (res.ok) {
        setDayShops(await res.json());
      } else {
        setDayShops([]);
      }
    } catch {
      setDayShops([]);
      toast({ title: 'Error', description: 'Failed to load day details', variant: 'destructive' });
    } finally {
      setDayShopsLoading(false);
    }
  };

  // Group day shops by orderbooker for the detail view
  const dayShopsByOB = useMemo(() => {
    const grouped: Record<string, { ob: { id: string; name: string }; shops: Shop[] }> = {};
    dayShops.forEach((shop) => {
      const obId = shop.orderbooker?.id || 'unassigned';
      if (!grouped[obId]) {
        grouped[obId] = {
          ob: shop.orderbooker || { id: 'unassigned', name: 'Unassigned' },
          shops: [],
        };
      }
      grouped[obId].shops.push(shop);
    });
    return Object.values(grouped);
  }, [dayShops]);

  // ─── Month Navigation ───────────────────────────────────────────────────────

  const goToPrevMonth = () => setCurrentMonth((prev) => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth((prev) => addMonths(prev, 1));
  const goToToday = () => setCurrentMonth(new Date());

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  const getDayCellContent = (date: Date) => {
    const routeDay = getRouteDayForDate(date);
    const isFriday = routeDay === 'friday';
    const isWorkDay = !isFriday;
    const colors = ROUTE_DAY_COLORS[routeDay] || ROUTE_DAY_COLORS.friday;
    const shops = isWorkDay ? (shopsByDay[routeDay] || []) : [];

    // Get unique OBs for this route day
    const uniqueOBs = new Map<string, string>();
    shops.forEach((s) => {
      if (s.orderbooker) {
        uniqueOBs.set(s.orderbooker.id, s.orderbooker.name);
      }
    });

    return { routeDay, isFriday, isWorkDay, colors, shops, uniqueOBs };
  };

  // ─── Loading State ──────────────────────────────────────────────────────────

  if (loading) {
    return <CalendarSkeleton />;
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const selectedRouteDay = selectedDate ? getRouteDayForDate(selectedDate) : '';
  const selectedColors = ROUTE_DAY_COLORS[selectedRouteDay] || ROUTE_DAY_COLORS.friday;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Route Calendar
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage scheduled visits across the month
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={goToPrevMonth} className="h-9 w-9 " aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" onClick={goToToday} className="text-xs font-semibold px-3 h-9 ">
            {format(currentMonth, 'MMMM yyyy')}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={goToNextMonth} className="h-9 w-9 " aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        {/* Working Days */}
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Working Days</p>
              <p className="text-lg font-bold text-foreground">{workingDaysInMonth}</p>
            </div>
            <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
              This Month
            </Badge>
          </CardContent>
        </Card>

        {/* Total Scheduled Visits */}
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Scheduled Visits</p>
              <p className="text-lg font-bold text-foreground">{totalScheduledVisits.toLocaleString()}</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
              / month
            </Badge>
          </CardContent>
        </Card>

        {/* OB with Most Assignments */}
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium">Top Orderbooker</p>
              <p className="text-sm font-bold text-foreground truncate">
                {obWithMostAssignments?.name || '—'}
              </p>
            </div>
            {obWithMostAssignments && (
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-violet-200 dark:border-violet-800 text-[10px] font-bold">
                {obWithMostAssignments.count} shops
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Route Day Legend */}
      <Card className="card-elevated">
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted-foreground mr-1">Route Days:</span>
            {WORKING_DAYS.map((day) => {
              const colors = ROUTE_DAY_COLORS[day];
              const shopCount = (shopsByDay[day] || []).length;
              return (
                <TooltipProvider key={day}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${colors.bg} ${colors.text} border ${colors.border} cursor-default`}
                      >
                        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                        {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                        <span className="opacity-70">({shopCount})</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs font-medium">
                        {day.charAt(0).toUpperCase() + day.slice(1)}: {shopCount} shop{shopCount !== 1 ? 's' : ''} scheduled
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-muted/40 text-muted-foreground border border-gray-200 dark:border-gray-700 cursor-default">
              <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
              Fri (Off)
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop Calendar Grid (hidden on mobile) */}
      <Card className="card-elevated hidden md:block">
        <CardContent className="p-3">
          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_HEADER_LABELS.map((label, i) => {
              const routeDay = JS_DAY_TO_ROUTE[i === 6 ? 5 : i === 0 ? 6 : i] || '';
              const isFriday = label === 'Fri';
              const colors = ROUTE_DAY_COLORS[routeDay] || ROUTE_DAY_COLORS.friday;
              return (
                <div
                  key={label}
                  className={`text-center py-2 text-xs font-bold rounded-t-lg ${
                    isFriday
                      ? 'text-gray-400 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20'
                      : `${colors.text} ${colors.light}`
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>

          {/* Calendar Cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: totalCells }).map((_, idx) => {
              const dayIndex = idx - firstDayOffset;
              const date = dayIndex >= 0 && dayIndex < daysInMonth.length ? daysInMonth[dayIndex] : null;

              if (!date) {
                return <div key={`empty-${idx}`} className="h-28 rounded-lg bg-muted/30" />;
              }

              const { routeDay, isFriday, isWorkDay, colors, shops, uniqueOBs } = getDayCellContent(date);
              const today = isToday(date);
              const dayNum = format(date, 'd');

              return (
                <button
                  key={format(date, 'yyyy-MM-dd')}
                  onClick={() => isWorkDay && handleDayClick(date)}
                  disabled={isFriday}
                  className={`h-28 rounded-lg border text-left p-1.5 transition-colors relative overflow-hidden ${
                    isFriday
                      ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-800/60 cursor-default'
                      : today
                        ? `border-primary ring-2 ring-primary/30 ${colors.light} hover:bg-accent/50 cursor-pointer`
                        : `border-border/60 ${colors.light} hover:bg-accent/50 cursor-pointer`
                  }`}
                >
                  {/* Date Number */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold inline-flex items-center justify-center min-w-[20px] h-5 rounded-full ${
                        today
                          ? 'bg-primary text-primary-foreground px-1.5'
                          : isFriday
                            ? 'text-gray-400 dark:text-gray-400'
                            : 'text-foreground'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {today && !isFriday && (
                      <span className="text-[8px] font-semibold text-primary uppercase tracking-wide">Today</span>
                    )}
                  </div>

                  {isFriday ? (
                    <div className="flex items-center justify-center h-16">
                      <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">Off Day</span>
                    </div>
                  ) : (
                    <div className="space-y-0.5 overflow-hidden">
                      {/* OB name pills */}
                      {uniqueOBs.size > 0 ? (
                        Array.from(uniqueOBs.entries()).slice(0, 3).map(([obId, obName]) => (
                          <div
                            key={obId}
                            className={`text-[9px] font-medium px-1 py-0.5 rounded truncate ${colors.bg} ${colors.text}`}
                          >
                            {obName.split(' ').pop()}
                          </div>
                        ))
                      ) : (
                        <span className="text-[9px] text-muted-foreground/60 italic px-1">No shops</span>
                      )}
                      {uniqueOBs.size > 3 && (
                        <span className="text-[8px] text-muted-foreground px-1">+{uniqueOBs.size - 3} more</span>
                      )}
                      {/* Shop count badge */}
                      {shops.length > 0 && (
                        <div className="flex items-center gap-0.5 mt-0.5 px-1">
                          <Store className="h-2.5 w-2.5 text-muted-foreground/60" />
                          <span className="text-[8px] text-muted-foreground/70 font-semibold">{shops.length}</span>
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Mobile List View (hidden on desktop) */}
      <div className="md:hidden space-y-2">
        {/* Month Nav for Mobile */}
        <Card className="card-elevated">
          <CardContent className="p-3 flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" onClick={goToPrevMonth} className="h-8 w-8" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-bold text-foreground">{format(currentMonth, 'MMMM yyyy')}</span>
            <Button type="button" variant="ghost" size="icon" onClick={goToNextMonth} className="h-8 w-8" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Day List */}
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {daysInMonth.map((date) => {
            const { routeDay, isFriday, isWorkDay, colors, shops, uniqueOBs } = getDayCellContent(date);
            const today = isToday(date);

            return (
              <button
                key={format(date, 'yyyy-MM-dd')}
                onClick={() => isWorkDay && handleDayClick(date)}
                disabled={isFriday}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isFriday
                    ? 'bg-gray-50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-800/60 opacity-60'
                    : today
                      ? `border-primary ring-2 ring-primary/30 ${colors.light} hover:bg-accent/50`
                      : `border-border/60 bg-card hover:bg-accent/50`
                } ${isWorkDay ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-9 w-9 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                        today
                          ? 'bg-primary text-primary-foreground'
                          : isFriday
                            ? 'bg-muted text-gray-400 dark:text-gray-400'
                            : `${colors.bg} ${colors.text}`
                      }`}
                    >
                      <span className="text-[10px] font-bold leading-none">{format(date, 'EEE')}</span>
                      <span className="text-sm font-bold leading-none mt-0.5">{format(date, 'd')}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isFriday ? 'text-gray-400 dark:text-gray-400' : ''}`}>
                        {format(date, 'EEEE, MMM d')}
                        {today && <span className="ml-1.5 text-xs text-primary font-bold">(Today)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isFriday
                          ? 'Weekly off day'
                          : `${routeDay.charAt(0).toUpperCase() + routeDay.slice(1)} route · ${shops.length} shop${shops.length !== 1 ? 's' : ''} · ${uniqueOBs.size} OB${uniqueOBs.size !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  {!isFriday && shops.length > 0 && (
                    <Badge className={`text-[10px] font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
                      {shops.length}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg dialog-content-animate">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDate && (
                <>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${selectedColors.bg}`}>
                    <CalendarDays className={`h-4 w-4 ${selectedColors.text}`} />
                  </div>
                  <div>
                    <span>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
                    {isToday(selectedDate) && (
                      <Badge className="ml-2 bg-primary text-primary-foreground text-[10px]">Today</Badge>
                    )}
                  </div>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedDate && (
                <>
                  {selectedRouteDay.charAt(0).toUpperCase() + selectedRouteDay.slice(1)} route schedule
                  {' · '}
                  {dayShops.length} shop{dayShops.length !== 1 ? 's' : ''} assigned
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {dayShopsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dayShops.length === 0 ? (
            <div className="text-center py-8">
              <div className="empty-state-illustration mx-auto mb-3 h-16 w-16">
                <div className="relative z-10 h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                  <Store className="h-7 w-7 text-primary/50" />
                </div>
              </div>
              <p className="text-sm font-medium text-muted-foreground">No shops scheduled</p>
              <p className="text-xs text-muted-foreground/70 mt-1">No shops are assigned to this route day yet.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {dayShopsByOB.map(({ ob, shops: obShops }) => {
                const obTotalOutstanding = obShops.reduce((sum, s) => sum + s.balance, 0);
                return (
                  <div key={ob.id} className="space-y-2">
                    {/* OB Header */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center ${selectedColors.bg}`}>
                          <Users className={`h-3.5 w-3.5 ${selectedColors.text}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{ob.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {obShops.length} shop{obShops.length !== 1 ? 's' : ''} · {formatPKR(obTotalOutstanding)} outstanding
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Shops List */}
                    <div className="space-y-1 ml-3">
                      {obShops.map((shop) => (
                        <div
                          key={shop.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/40 border border-border/40 hover:bg-muted/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{shop.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {shop.area || 'No area'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs font-bold ${shop.balance > 0 ? 'text-foreground' : 'text-emerald-500 dark:text-emerald-400'}`}
                          >
                            {formatPKR(shop.balance)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Navigate to Manage Shops */}
          {selectedDate && selectedRouteDay && (
            <div className="border-t pt-3 mt-2">
              <Button
            type="button"
                variant="outline"
                className="w-full text-xs "
                onClick={() => {
                  setDetailOpen(false);
                  // Store the selected route day so AdminShops can filter by it
                  sessionStorage.setItem('finexa-calendar-filter-day', selectedRouteDay);
                  router.push('/shops');
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Manage Shops for {selectedRouteDay.charAt(0).toUpperCase() + selectedRouteDay.slice(1)}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
