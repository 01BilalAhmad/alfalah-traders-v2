'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Shield,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  X,
  Clock,
  TrendingUp,
  ArrowDownRight,
  List,
  LayoutList,
  Users,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { exportToCSV } from '@/lib/csv-export';

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  performedBy: string;
  oldValue: string | null;
  newValue: string | null;
  description: string | null;
  createdAt: string;
  performer: {
    id: string;
    name: string;
    role: string;
  };
}

interface AuditData {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

const actionColors: Record<string, string> = {
  create: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  edit: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  credit_post: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  recovery_entry: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  recovery_approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  recovery_rejected: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800',
  claim_post: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-800',
  company_change: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  edit_pending_recovery: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  status_change: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  login: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
};

const actionDotColors: Record<string, string> = {
  create: 'bg-indigo-500',
  edit: 'bg-amber-500',
  credit_post: 'bg-indigo-500',
  recovery_entry: 'bg-emerald-500',
  recovery_approved: 'bg-emerald-500',
  recovery_rejected: 'bg-red-500',
  claim_post: 'bg-red-500',
  delete: 'bg-red-500',
  company_change: 'bg-amber-500',
  edit_pending_recovery: 'bg-amber-500',
  status_change: 'bg-slate-500',
  login: 'bg-slate-500',
};

const actionLabels: Record<string, string> = {
  create: 'Create',
  edit: 'Edit',
  credit_post: 'Credit',
  recovery_entry: 'Recovery',
  recovery_approved: 'Recovery Approved',
  recovery_rejected: 'Recovery Rejected',
  claim_post: 'Claim',
  delete: 'Delete',
  company_change: 'Company Change',
  edit_pending_recovery: 'Edit Pending',
  status_change: 'Status Change',
  login: 'Login',
};

const entityLabels: Record<string, string> = {
  shop: 'Shop',
  user: 'User',
  transaction: 'Transaction',
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const date = new Date(dateStr);
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

type ViewMode = 'table' | 'timeline';

function getDateLabel(dateStr: string): string {
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
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

export default function AdminAuditLog() {
  const [data, setData] = useState<AuditData>({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await apiFetch(`/api/audit?${params.toString()}`);
      if (res.ok) setData(await res.json());
    } catch {
      toast({ title: 'Error', description: 'Failed to load audit logs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter, debouncedSearch]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  // Summary stats
  const stats = useMemo(() => {
    const todayCount = data.logs.filter((log) => isToday(log.createdAt)).length;
    const creditPosts = data.logs.filter((log) => log.action === 'credit_post').length;
    const recoveryEntries = data.logs.filter((log) => log.action === 'recovery_entry').length;
    return { total: data.total, todayCount, creditPosts, recoveryEntries };
  }, [data.logs, data.total]);

  // Active filters for chips
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; color: string }[] = [];
    if (actionFilter) {
      chips.push({
        key: 'action',
        label: `Action: ${actionLabels[actionFilter] || actionFilter}`,
        color: actionColors[actionFilter] || 'bg-muted text-muted-foreground border-border',
      });
    }
    if (entityFilter) {
      chips.push({
        key: 'entity',
        label: `Entity: ${entityLabels[entityFilter] || entityFilter}`,
        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      });
    }
    if (debouncedSearch) {
      chips.push({
        key: 'search',
        label: `Search: "${debouncedSearch}"`,
        color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      });
    }
    return chips;
  }, [actionFilter, entityFilter, debouncedSearch]);

  const removeFilter = (key: string) => {
    if (key === 'action') setActionFilter('');
    if (key === 'entity') setEntityFilter('');
    if (key === 'search') setSearchQuery('');
    setPage(1);
  };

  const clearAllFilters = () => {
    setActionFilter('');
    setEntityFilter('');
    setSearchQuery('');
    setPage(1);
  };

  // Group timeline entries by date
  const groupedLogs = useMemo(() => {
    const groups: { label: string; dateKey: string; logs: AuditLogEntry[] }[] = [];
    let currentLabel = '';
    let currentGroup: AuditLogEntry[] = [];

    data.logs.forEach((log) => {
      const label = getDateLabel(log.createdAt);
      if (label !== currentLabel) {
        if (currentGroup.length > 0) {
          groups.push({ label: currentLabel, dateKey: currentGroup[0].createdAt, logs: currentGroup });
        }
        currentLabel = label;
        currentGroup = [log];
      } else {
        currentGroup.push(log);
      }
    });
    if (currentGroup.length > 0) {
      groups.push({ label: currentLabel, dateKey: currentGroup[0].createdAt, logs: currentGroup });
    }

    return groups;
  }, [data.logs]);

  return (
    <div className="space-y-5">
      {/* Title Row */}
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Audit Log
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{data.total} total entries</p>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Shield className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground tabular-nums">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground font-medium truncate">Total Activities</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Clock className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground tabular-nums">{stats.todayCount}</p>
              <p className="text-[11px] text-muted-foreground font-medium truncate">Today&apos;s Activities</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground tabular-nums">{stats.creditPosts}</p>
              <p className="text-[11px] text-muted-foreground font-medium truncate">Credit Posts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border ">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <ArrowDownRight className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground tabular-nums">{stats.recoveryEntries}</p>
              <p className="text-[11px] text-muted-foreground font-medium truncate">Recovery Entries</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search descriptions, actions, entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`pl-9 pr-9 h-10 ${searchQuery ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : ''}`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((chip) => (
            <Badge
              key={chip.key}
              variant="outline"
              className={`${chip.color} text-xs cursor-pointer gap-1 pr-1 transition-opacity hover:opacity-80`}
              onClick={() => removeFilter(chip.key)}
            >
              {chip.label}
              <X className="h-3 w-3 ml-0.5" />
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Filters + Export Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Card className="flex-1 w-full sm:w-auto card-elevated">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filters</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 flex-1 sm:flex-1">
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="credit_post">Credit</SelectItem>
                  <SelectItem value="recovery_entry">Recovery</SelectItem>
                  <SelectItem value="recovery_approved">Recovery Approved</SelectItem>
                  <SelectItem value="recovery_rejected">Recovery Rejected</SelectItem>
                  <SelectItem value="claim_post">Claim</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="company_change">Company Change</SelectItem>
                  <SelectItem value="edit_pending_recovery">Edit Pending</SelectItem>
                  <SelectItem value="status_change">Status Change</SelectItem>
                </SelectContent>
              </Select>
              <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v === 'all' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="transaction">Transaction</SelectItem>
                </SelectContent>
              </Select>
              {/* View Mode Toggle */}
              <div className="flex items-center border border-border rounded-lg overflow-hidden flex-shrink-0">
                <Button
            type="button"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-3 rounded-none"
                  onClick={() => setViewMode('table')}
                >
                  <List className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-xs hidden sm:inline">Table</span>
                </Button>
                <Button
            type="button"
                  variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-3 rounded-none"
                  onClick={() => setViewMode('timeline')}
                >
                  <LayoutList className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-xs hidden sm:inline">Timeline</span>
                </Button>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.logs.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-shrink-0"
            onClick={() => {
              const rows = data.logs.map((log) => ({
                Date: new Date(log.createdAt).toLocaleString('en-PK'),
                Action: actionLabels[log.action] || log.action,
                Entity: entityLabels[log.entityType] || log.entityType,
                Description: log.description || '',
                'Performed By': log.performer?.name || 'System',
              }));
              exportToCSV(rows, 'audit-log', ['Date', 'Action', 'Entity', 'Description', 'Performed By']);
              toast({ title: 'Exported', description: 'Audit log CSV downloaded' });
            }}
          >
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        )}
      </div>

      {/* Table View */}
      {viewMode === 'table' && (
        <Card className="card-elevated">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : data.logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No audit log entries found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-slate-800 dark:bg-slate-900 hover:bg-slate-800 dark:hover:bg-slate-900">
                        <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                        <TableHead className="text-white font-semibold text-xs">Action</TableHead>
                        <TableHead className="text-white font-semibold text-xs">Entity</TableHead>
                        <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Description</TableHead>
                        <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="stagger-children">
                      {data.logs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/50">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] animate-badge-pop ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                              {actionLabels[log.action] || log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {entityLabels[log.entityType] || log.entityType}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden md:table-cell max-w-xs truncate">
                            {log.description || '—'}
                          </TableCell>
                          <TableCell className="text-xs hidden sm:table-cell">
                            {log.performer?.name || 'System'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {data.page} of {data.totalPages}
                    </p>
                    <div className="flex gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <Card className="card-elevated">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : data.logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No audit log entries</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Activity will appear here as actions are performed</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
                  <div className="px-4 sm:px-6 py-4">
                    {groupedLogs.map((group, groupIdx) => (
                      <div key={group.dateKey} className={groupIdx > 0 ? 'mt-6' : ''}>
                        {/* Date Header */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Clock className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-foreground">{group.label}</p>
                              <p className="text-[10px] text-muted-foreground">{group.logs.length} {group.logs.length === 1 ? 'entry' : 'entries'}</p>
                            </div>
                          </div>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {/* Timeline entries */}
                        <div className="relative ml-4">
                          <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border" />

                          {group.logs.map((log, logIdx) => {
                            const isExpanded = expandedTimelineId === log.id;
                            const dotColor = actionDotColors[log.action] || 'bg-muted-foreground';
                            const avatarInitial = log.performer?.name ? log.performer.name.charAt(0).toUpperCase() : 'S';
                            const avatarBg = log.action === 'create'
                              ? 'bg-muted text-slate-700 dark:text-slate-300'
                              : log.action === 'edit'
                                ? 'bg-muted text-slate-700 dark:text-slate-300'
                                : (log.action === 'credit_post' || log.action === 'recovery_entry' || log.action === 'delete')
                                  ? 'bg-muted text-slate-700 dark:text-slate-300'
                                  : 'bg-muted text-slate-700 dark:text-slate-300';

                            return (
                              <div
                                key={log.id}
                                className="relative flex gap-4 pb-4 last:pb-0 group cursor-pointer"
                                onClick={() => setExpandedTimelineId(isExpanded ? null : log.id)}
                                style={{ animationDelay: `${logIdx * 50}ms` }}
                              >
                                {/* Dot */}
                                <div className="relative z-10 flex-shrink-0 mt-3">
                                  <div className={`h-[11px] w-[11px] rounded-full ${dotColor} ring-2 ring-background shadow-sm group-hover:scale-125 transition-transform`} />
                                </div>

                                {/* Content Card */}
                                <div className="flex-1 min-w-0 mb-1">
                                  <div className="rounded-lg border border-border/50 bg-card p-3 hover:shadow-sm transition-shadow card-hover">
                                    {/* Top row: badge + time */}
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={`text-[10px] animate-badge-pop ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                                          {actionLabels[log.action] || log.action}
                                        </Badge>
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                          {entityLabels[log.entityType] || log.entityType}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                                        {getRelativeTime(log.createdAt)}
                                      </span>
                                    </div>

                                    {/* Description */}
                                    <p className="text-sm text-foreground mt-1.5 leading-snug">
                                      {log.description || 'No description'}
                                    </p>

                                    {/* Details row: user + entity */}
                                    <div className="flex items-center gap-2 mt-2">
                                      {/* Avatar initial */}
                                      <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${avatarBg}`}>
                                        {avatarInitial}
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {log.performer?.name || 'System'}
                                      </span>
                                      {log.entityId && (
                                        <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                                          &middot; ID: <code className="bg-muted px-1 py-0.5 rounded text-[9px]">{log.entityId.slice(0, 8)}</code>
                                        </span>
                                      )}
                                    </div>

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                      <div className="mt-3 pt-3 border-t border-border/50 space-y-2 animate-fade-in">
                                        <div className="flex items-center gap-2 text-xs">
                                          <Clock className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-muted-foreground">{formatDate(log.createdAt)}</span>
                                        </div>
                                        {log.oldValue && (
                                          <div className="text-xs">
                                            <span className="text-muted-foreground font-medium">Before: </span>
                                            <span className="text-slate-600 dark:text-slate-300">{log.oldValue}</span>
                                          </div>
                                        )}
                                        {log.newValue && (
                                          <div className="text-xs">
                                            <span className="text-muted-foreground font-medium">After: </span>
                                            <span className="text-slate-600 dark:text-slate-300">{log.newValue}</span>
                                          </div>
                                        )}
                                        {log.entityId && (
                                          <div className="text-[10px] text-muted-foreground/60 hidden sm:block">
                                            Entity ID: <code className="bg-muted px-1 py-0.5 rounded">{log.entityId}</code>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      Page {data.page} of {data.totalPages}
                    </p>
                    <div className="flex gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
