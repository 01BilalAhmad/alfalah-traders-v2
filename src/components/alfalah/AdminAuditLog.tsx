'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
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
  create: 'badge-active',
  edit: 'bg-blue-50 text-blue-700',
  credit_post: 'badge-credit',
  recovery_entry: 'badge-recovery',
  status_change: 'badge-inactive',
};

const actionLabels: Record<string, string> = {
  create: 'Create',
  edit: 'Edit',
  credit_post: 'Credit Post',
  recovery_entry: 'Recovery',
  status_change: 'Status Change',
};

const entityLabels: Record<string, string> = {
  shop: 'Shop',
  user: 'User',
  transaction: 'Transaction',
};

export default function AdminAuditLog() {
  const [data, setData] = useState<AuditData>({ logs: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (res.ok) setData(await res.json());
    } catch {
      toast({ title: 'Error', description: 'Failed to load audit logs', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Audit Log
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{data.total} total entries</p>
      </div>

      {/* Export button */}
      {data.logs.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
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
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="credit_post">Credit Post</SelectItem>
                <SelectItem value="recovery_entry">Recovery Entry</SelectItem>
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
            {(actionFilter || entityFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setActionFilter(''); setEntityFilter(''); setPage(1); }}>
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
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
              <ScrollArea className="max-h-[560px]">
                <Table>
                  <TableHeader>
                    <TableRow className="data-table-header hover:bg-transparent">
                      <TableHead className="text-white font-semibold text-xs">Date</TableHead>
                      <TableHead className="text-white font-semibold text-xs">Action</TableHead>
                      <TableHead className="text-white font-semibold text-xs">Entity</TableHead>
                      <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Description</TableHead>
                      <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/50">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
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
              </ScrollArea>
              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Page {data.page} of {data.totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
