'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
  AlertCircle,
  Loader2,
  User,
  Smartphone,
  Phone,
  Inbox,
  CalendarDays,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getLocalDateString } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

// ─── Types ───
type SmsStatus = 'sent' | 'failed' | 'skipped';
type SmsMethod = 'sms' | 'whatsapp';

interface SmsLog {
  id: string;
  shopId: string | null;
  shopName: string | null;
  shopPhone: string | null;
  orderbookerId: string | null;
  orderbookerName: string | null;
  transactionId: string | null;
  method: SmsMethod;
  status: SmsStatus;
  message: string | null;
  errorMessage: string | null;
  sentAt: string;
}

interface SmsSummary {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  smsCount: number;
  whatsappCount: number;
}

interface PerObStat {
  orderbookerId: string;
  orderbookerName: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  sms: number;
  whatsapp: number;
}

interface SmsTrackingResponse {
  logs: SmsLog[];
  summary: SmsSummary;
  perOB: PerObStat[];
}

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

// ─── Helpers ───
function formatLogTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function StatusBadge({ status }: { status: SmsStatus }) {
  switch (status) {
    case 'sent':
      return (
        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 font-semibold gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Sent
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 font-semibold gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    case 'skipped':
      return (
        <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800 font-semibold gap-1">
          <MinusCircle className="h-3 w-3" />
          Skipped
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function MethodBadge({ method }: { method: SmsMethod }) {
  if (method === 'whatsapp') {
    return (
      <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-300 dark:border-green-800 font-semibold gap-1">
        <Smartphone className="h-3 w-3" />
        WhatsApp
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 font-semibold gap-1">
      <MessageSquare className="h-3 w-3" />
      SMS
    </Badge>
  );
}

// ─── Skeleton ───
function SmsTrackingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="skeleton-shimmer h-9 w-40" />
          <Skeleton className="skeleton-shimmer h-9 w-32" />
          <Skeleton className="skeleton-shimmer h-9 w-32" />
          <Skeleton className="skeleton-shimmer h-9 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-44" />
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-9 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-52" />
        </CardHeader>
        <CardContent className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3 border-t border-border/60">
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-16" />
              <Skeleton className="skeleton-shimmer h-4 w-16" />
              <Skeleton className="skeleton-shimmer h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ───
export default function AdminSmsTracking() {
  const today = useMemo(() => getLocalDateString(), []);
  const [date, setDate] = useState<string>(today);
  const [orderbookerId, setOrderbookerId] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [method, setMethod] = useState<string>('all');

  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [summary, setSummary] = useState<SmsSummary | null>(null);
  const [perOB, setPerOB] = useState<PerObStat[]>([]);

  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load orderbookers once for the filter dropdown ───
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/orderbookers');
        if (res.ok) {
          const data = await res.json();
          const obs: Orderbooker[] = Array.isArray(data) ? data : data.orderbookers || [];
          if (!cancelled) {
            setOrderbookers(obs.filter((o) => o.status === 'active' || o.status === 'ACTIVE'));
          }
        }
      } catch {
        /* silent — dropdown just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Fetch SMS logs whenever filters change ───
  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('date', date);
      if (orderbookerId !== 'all') params.set('orderbookerId', orderbookerId);
      if (status !== 'all') params.set('status', status);
      if (method !== 'all') params.set('method', method);

      const res = await apiFetch(`/api/reports/sms-tracking?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Request failed (${res.status})`);
      }
      const data: SmsTrackingResponse = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setSummary(data.summary || null);
      setPerOB(Array.isArray(data.perOB) ? data.perOB : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load SMS logs';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, orderbookerId, status, method]);

  useEffect(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // ─── Derived values ───
  const safeSummary: SmsSummary = summary || {
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    smsCount: 0,
    whatsappCount: 0,
  };

  const sentPct = safeSummary.total > 0 ? Math.round((safeSummary.sent / safeSummary.total) * 100) : 0;

  // ─── Loading ───
  if (loading) {
    return (
      <div className="space-y-6 page-transition">
        <SmsTrackingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-transition">
      {/* ─── Page Header + Filters ─── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              SMS Tracking
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor SMS &amp; WhatsApp messages sent by orderbookers
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              onClick={() => fetchLogs(true)}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              className="h-9 w-[160px] text-sm"
            />
          </div>

          <Select value={orderbookerId} onValueChange={setOrderbookerId}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All Orderbookers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {orderbookers.map((ob) => (
                <SelectItem key={ob.id} value={ob.id}>
                  {ob.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Error State ─── */}
      {error && (
        <Card className="border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Failed to load SMS logs
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 gap-1.5 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/40"
                  onClick={() => fetchLogs(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Summary Cards ─── */}
      {!error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <Card className="card-hover border border-border hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-sm">
                  <MessageSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {date === today ? 'Today' : 'Selected'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total SMS</p>
              <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{safeSummary.total}</p>
            </CardContent>
          </Card>

          <Card className="card-hover border border-border hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 font-semibold">
                  {sentPct}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Sent</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums number-animate">
                {safeSummary.sent}
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover border border-border hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border-red-200 dark:border-red-800 font-medium">
                  {safeSummary.total > 0
                    ? `${Math.round((safeSummary.failed / safeSummary.total) * 100)}%`
                    : '0%'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Failed</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums number-animate">
                {safeSummary.failed}
              </p>
            </CardContent>
          </Card>

          <Card className="card-hover border border-border hover-scale-102">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                  <MinusCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-medium">
                  {safeSummary.total > 0
                    ? `${Math.round((safeSummary.skipped / safeSummary.total) * 100)}%`
                    : '0%'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Skipped</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums number-animate">
                {safeSummary.skipped}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Per-OB Breakdown ─── */}
      {!error && perOB.length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Breakdown by Orderbooker
              <Badge variant="secondary" className="text-[11px] ml-1">
                {perOB.length} OBs
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800 dark:bg-slate-950 hover:bg-slate-800 dark:hover:bg-slate-950">
                    <TableHead className="text-white font-semibold text-xs">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Total</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Sent</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Failed</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Skipped</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">SMS</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perOB.map((ob, idx) => (
                    <TableRow
                      key={ob.orderbookerId || `ob-${idx}`}
                      className={idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}
                    >
                      <TableCell>
                        <p className="text-sm font-medium text-foreground">{ob.orderbookerName || '—'}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-semibold tabular-nums">{ob.total}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                          {ob.sent}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums text-red-600 dark:text-red-400 font-medium">
                          {ob.failed}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums text-amber-600 dark:text-amber-400 font-medium">
                          {ob.skipped}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums">{ob.sms}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums">{ob.whatsapp}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Detailed Logs Table ─── */}
      {!error && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                SMS Logs
                <Badge variant="secondary" className="text-[11px] ml-1">
                  {logs.length} {logs.length === 1 ? 'record' : 'records'}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Showing {logs.length} of {safeSummary.total} {safeSummary.total === 1 ? 'log' : 'logs'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-800 dark:bg-slate-950 hover:bg-slate-800 dark:hover:bg-slate-950">
                    <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Phone</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Orderbooker</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Method</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Time</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Error / Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="text-center py-12">
                          <Inbox className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="font-medium text-muted-foreground text-sm">No SMS logs for this date</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Try selecting a different date or adjusting the filters
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log, idx) => (
                      <TableRow
                        key={log.id}
                        className={idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">
                            {log.shopName || '—'}
                          </p>
                          {log.shopName && (
                            <p className="text-[11px] text-muted-foreground sm:hidden">{log.orderbookerName || '—'}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {log.shopPhone ? (
                            <a
                              href={`tel:${log.shopPhone}`}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                            >
                              <Phone className="h-3 w-3" />
                              {log.shopPhone}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">{log.orderbookerName || '—'}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <MethodBadge method={log.method} />
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatLogTime(log.sentAt)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-xs">
                          {log.status === 'failed' && log.errorMessage ? (
                            <p className="text-xs text-red-600 dark:text-red-400 truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </p>
                          ) : log.message ? (
                            <p className="text-xs text-muted-foreground truncate" title={log.message}>
                              {log.message}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {logs.length > 0 && (
              <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {logs.length} of {safeSummary.total} {safeSummary.total === 1 ? 'log' : 'logs'}
                </span>
                <span className="hidden sm:inline">
                  SMS: {safeSummary.smsCount} · WhatsApp: {safeSummary.whatsappCount}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
