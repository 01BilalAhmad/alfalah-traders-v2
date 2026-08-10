'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  Printer,
  Filter,
  Calendar,
  Store,
  User,
  Users,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR, formatLocalDate, getLocalDateString } from '@/lib/utils';
import { exportToExcel } from '@/lib/excel-export';
import { handlePrint } from '@/lib/print-utils';
import { getBusinessName } from '@/lib/business-config';

interface TallyRow {
  id: string;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  tallyDate: string;
  systemBalance: number;
  shopBalance: number;
  difference: number;
  status: string;
  notes: string | null;
  talliedBy: string;
  tellerName: string | null;
  tellerUsername: string | null;
  orderbookerId: string | null;
  orderbookerName: string | null;
}

interface Orderbooker {
  id: string;
  name: string;
  username: string;
}

interface Teller {
  id: string;
  name: string;
  username: string;
}

interface Summary {
  total: number;
  verified: number;
  discrepancy: number;
  totalDifference: number;
}

export default function TallyReport() {
  const [rows, setRows] = useState<TallyRow[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, verified: 0, discrepancy: 0, totalDifference: 0 });
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [tellers, setTellers] = useState<Teller[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const today = getLocalDateString();
  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  })();
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [obFilter, setObFilter] = useState<string>('all');
  const [tellerFilter, setTellerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers?status=active');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setOrderbookers(list.map((ob: any) => ({
          id: ob.id,
          name: ob.name,
          username: ob.username,
        })));
      }
    } catch { /* silent */ }
  }, []);

  const fetchTellers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tellers');
      if (res.ok) {
        const data = await res.json();
        setTellers((data.tellers || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          username: t.username,
        })));
      }
    } catch { /* silent */ }
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (obFilter !== 'all') params.set('orderbookerId', obFilter);
      if (tellerFilter !== 'all') params.set('tellerId', tellerFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiFetch(`/api/tally?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.tallies || []);
        setSummary(data.summary || { total: 0, verified: 0, discrepancy: 0, totalDifference: 0 });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to load report', variant: 'destructive' });
        setRows([]);
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, obFilter, tellerFilter, statusFilter]);

  useEffect(() => {
    fetchOrderbookers();
    fetchTellers();
  }, [fetchOrderbookers, fetchTellers]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExcelExport = async () => {
    if (rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'No tally records in current filter', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      const data = rows.map((r, idx) => ({
        '#': idx + 1,
        'Date': formatLocalDate(new Date(r.tallyDate)),
        'Shop': r.shopName,
        'Area': r.shopArea || '',
        'Orderbooker': r.orderbookerName || '',
        'Teller': r.tellerName || (r.tellerUsername ? `@${r.tellerUsername}` : ''),
        'System Balance': r.systemBalance,
        'Shop Balance': r.shopBalance,
        'Difference': r.difference,
        'Status': r.status,
        'Notes': r.notes || '',
      }));
      const filename = `tally-report_${dateFrom || 'all'}_to_${dateTo || 'all'}`;
      await exportToExcel(data, filename, 'Tally Report', [
        5, 14, 22, 14, 18, 18, 14, 14, 14, 12, 30,
      ]);
      toast({ title: 'Excel Exported', description: `${rows.length} records exported` });
    } catch (err) {
      console.error('Excel export error:', err);
      toast({ title: 'Export Failed', description: 'Failed to generate Excel file', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handlePrintReport = () => {
    if (rows.length === 0) {
      toast({ title: 'Nothing to print', description: 'No tally records in current filter', variant: 'destructive' });
      return;
    }
    handlePrint({
      extraCSS: `
        @page { size: A4 landscape; margin: 12mm; }
        html, body { background: #ffffff !important; }

        /* ─── Isolate the report: hide everything except .print-root-wrapper ─── */
        body * { visibility: hidden !important; }
        .print-root-wrapper,
        .print-root-wrapper * { visibility: visible !important; }

        /* Position the report at the top-left of the page, full width */
        .print-root-wrapper {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
        }

        /* Print-only report header — visible only when printing */
        .print-only-header { display: block !important; }

        /* Hide the screen-only card header / chrome inside the printable area */
        .print-root-wrapper .screen-only { display: none !important; }

        /* Table: print-friendly */
        .tally-print-table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
        .tally-print-table thead th {
          background: #2563EB !important;
          color: #ffffff !important;
          padding: 6px 8px !important;
          border: 1px solid #1D4ED8 !important;
          text-align: left !important;
          font-weight: 600 !important;
          font-size: 9px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.3px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .tally-print-table tbody td {
          padding: 4px 8px !important;
          border: 1px solid #E5E7EB !important;
          color: #111827 !important;
          vertical-align: top !important;
        }
        .tally-print-table tbody tr:nth-child(even) td { background: #F9FAFB !important; }
        .tally-print-table tbody tr:nth-child(odd)  td { background: #FFFFFF !important; }
        .tally-print-table .num { text-align: right !important; font-variant-numeric: tabular-nums !important; }

        /* Repeat table header on every printed page */
        .tally-print-table thead { display: table-header-group !important; }
        .tally-print-table tbody tr { page-break-inside: avoid !important; }
      `,
    });
  };

  const clearFilters = () => {
    setDateFrom(monthAgo);
    setDateTo(today);
    setObFilter('all');
    setTellerFilter('all');
    setStatusFilter('all');
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (obFilter !== 'all') n++;
    if (tellerFilter !== 'all') n++;
    if (statusFilter !== 'all') n++;
    if (dateFrom !== monthAgo || dateTo !== today) n++;
    return n;
  }, [obFilter, tellerFilter, statusFilter, dateFrom, dateTo, monthAgo, today]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Tally Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and export all market tally records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintReport} disabled={loading || rows.length === 0}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={loading || exporting || rows.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print-hidden">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Records</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Verified</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">{summary.verified}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Discrepancies</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">{summary.discrepancy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Net Difference</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${
              summary.totalDifference === 0
                ? ''
                : summary.totalDifference > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }`}>
              {summary.totalDifference > 0 ? '+' : ''}{formatPKR(summary.totalDifference)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="print-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">{activeFilterCount} active</Badge>
            )}
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> From Date
              </Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> To Date
              </Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Users className="h-3 w-3" /> Orderbooker
              </Label>
              <Select value={obFilter} onValueChange={setObFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All orderbookers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orderbookers</SelectItem>
                  {orderbookers.map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <User className="h-3 w-3" /> Teller
              </Label>
              <Select value={tellerFilter} onValueChange={setTellerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All tellers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tellers</SelectItem>
                  {tellers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Filter className="h-3 w-3" /> Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="verified">Verified Only</SelectItem>
                  <SelectItem value="discrepancy">Discrepancies Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table (printable) */}
      <div className="print-root-wrapper">
        {/* ─── Print-only report header (hidden on screen, visible on paper) ─── */}
        <div className="print-only-header" style={{ display: 'none', textAlign: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #2563EB' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', letterSpacing: '0.5px' }}>
            {getBusinessName()}
          </div>
          <div style={{ width: '60px', height: '2px', background: '#2563EB', margin: '6px auto' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>Market Tally Report</div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            {dateFrom || dateTo
              ? `Period: ${dateFrom || '…'} to ${dateTo || '…'}`
              : 'Period: All time'}
            {'  •  '}
            Generated: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          {/* Active filters */}
          <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '4px' }}>
            {obFilter !== 'all' && `Orderbooker: ${orderbookers.find(o => o.id === obFilter)?.name || '—'}  •  `}
            {tellerFilter !== 'all' && `Teller: ${tellers.find(t => t.id === tellerFilter)?.name || '—'}  •  `}
            {statusFilter !== 'all' && `Status: ${statusFilter}`}
            {obFilter === 'all' && tellerFilter === 'all' && statusFilter === 'all' && 'No filters applied'}
          </div>
          {/* Summary strip */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '10px', padding: '8px 16px', background: '#EFF6FF', borderRadius: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563EB' }}>{summary.total}</span>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6B7280' }}>Total</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>{summary.verified}</span>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6B7280' }}>Verified</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#D97706' }}>{summary.discrepancy}</span>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6B7280' }}>Discrepancies</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                {summary.totalDifference > 0 ? '+' : ''}{formatPKR(summary.totalDifference)}
              </span>
              <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6B7280' }}>Net Diff</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3 screen-only">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Tally Records
              <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Store className="h-10 w-10 mb-2 opacity-40" />
                <p className="font-medium text-sm">No tally records found</p>
                <p className="text-xs mt-1">Try adjusting your filters or date range.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto sidebar-scroll">
                <Table className="tally-print-table">
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[140px]">Date</TableHead>
                      <TableHead className="min-w-[160px]">Shop</TableHead>
                      <TableHead className="min-w-[120px]">Area</TableHead>
                      <TableHead className="text-right min-w-[120px]">System</TableHead>
                      <TableHead className="text-right min-w-[120px]">Shop Bal.</TableHead>
                      <TableHead className="text-right min-w-[120px]">Difference</TableHead>
                      <TableHead className="min-w-[110px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Teller</TableHead>
                      <TableHead className="min-w-[120px]">Orderbooker</TableHead>
                      <TableHead className="min-w-[180px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <span className="text-xs">{formatLocalDate(new Date(r.tallyDate))}</span>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{r.shopName}</p>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{r.shopArea || '—'}</span>
                        </TableCell>
                        <TableCell className="text-right num">
                          <span className="text-sm tabular-nums">{formatPKR(r.systemBalance)}</span>
                        </TableCell>
                        <TableCell className="text-right num">
                          <span className="text-sm tabular-nums">{formatPKR(r.shopBalance)}</span>
                        </TableCell>
                        <TableCell className="text-right num">
                          <span className={`text-sm font-semibold tabular-nums ${
                            r.difference === 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : r.difference > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {r.difference > 0 ? '+' : ''}{formatPKR(r.difference)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-[10px] ${
                              r.status === 'verified'
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {r.status === 'verified'
                              ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                              : <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                            {r.status === 'verified' ? 'Verified' : 'Discrepancy'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {r.tellerName || (r.tellerUsername ? `@${r.tellerUsername}` : '—')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{r.orderbookerName || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {r.notes || '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
