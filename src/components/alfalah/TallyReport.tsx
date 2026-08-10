'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
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
  Ban,
  ShieldCheck,
  MapPin,
  XCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatPKR, formatLocalDate, getLocalDateString } from '@/lib/utils';
import { exportToExcel } from '@/lib/excel-export';
import { handlePrint } from '@/lib/print-utils';
import { getBusinessName } from '@/lib/business-config';
import {
  REASON_CODE_LABELS,
  RESOLUTION_TYPE_LABELS,
  type ResolutionType,
} from '@/lib/tally-constants';

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
  // New fields
  gpsLat: number | null;
  gpsLng: number | null;
  locationStatus: string;
  reasonCode: string | null;
  resolutionStatus: string;
  resolutionType: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  voided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
}

interface Orderbooker { id: string; name: string; username: string; }
interface Teller { id: string; name: string; username: string; }

interface Summary {
  total: number;
  verified: number;
  discrepancy: number;
  totalDifference: number;
  openDiscrepancies?: number;
  resolvedDiscrepancies?: number;
}

const REASON_OPTIONS = Object.entries(REASON_CODE_LABELS).map(([value, label]) => ({ value, label }));
const RESOLUTION_OPTIONS = Object.entries(RESOLUTION_TYPE_LABELS).map(([value, label]) => ({ value: value as ResolutionType, label }));

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
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [showVoided, setShowVoided] = useState(false);

  // Resolve + Void dialog state
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveRow, setResolveRow] = useState<TallyRow | null>(null);
  const [resolveType, setResolveType] = useState<ResolutionType | ''>('');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidRow, setVoidRow] = useState<TallyRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const fetchOrderbookers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orderbookers?status=active');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setOrderbookers(list.map((ob: any) => ({ id: ob.id, name: ob.name, username: ob.username })));
      }
    } catch { /* silent */ }
  }, []);

  const fetchTellers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/tellers');
      if (res.ok) {
        const data = await res.json();
        setTellers((data.tellers || []).map((t: any) => ({ id: t.id, name: t.name, username: t.username })));
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
      if (resolutionFilter !== 'all') params.set('resolutionStatus', resolutionFilter);
      if (reasonFilter !== 'all') params.set('reasonCode', reasonFilter);
      if (showVoided) params.set('includeVoided', 'true');

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
  }, [dateFrom, dateTo, obFilter, tellerFilter, statusFilter, resolutionFilter, reasonFilter, showVoided]);

  useEffect(() => { fetchOrderbookers(); fetchTellers(); }, [fetchOrderbookers, fetchTellers]);
  useEffect(() => { fetchReport(); }, [fetchReport]);

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
        'Status': r.voided ? 'VOIDED' : r.status,
        'Reason': r.reasonCode ? (REASON_CODE_LABELS as any)[r.reasonCode] || r.reasonCode : '',
        'Resolution': r.resolutionStatus === 'resolved'
          ? `Resolved (${r.resolutionType || ''})`
          : r.resolutionStatus,
        'GPS': r.locationStatus === 'verified' ? 'Verified' : 'Unverified',
        'Notes': r.notes || '',
      }));
      const filename = `tally-report_${dateFrom || 'all'}_to_${dateTo || 'all'}`;
      await exportToExcel(data, filename, 'Tally Report', [5, 14, 22, 14, 18, 18, 14, 14, 14, 12, 24, 22, 12, 30]);
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
        @page { size: A4 landscape; margin: 10mm; }
        html, body { background: #ffffff !important; }
        body * { visibility: hidden !important; }
        .print-root-wrapper,
        .print-root-wrapper * { visibility: visible !important; }
        .print-root-wrapper {
          position: absolute !important; left: 0 !important; top: 0 !important;
          width: 100% !important; max-width: none !important;
          margin: 0 !important; padding: 0 !important; display: block !important;
        }
        .print-only-header { display: block !important; }
        .print-root-wrapper .screen-only { display: none !important; }
        /* Hide print-hidden elements (Actions column, etc.) */
        .print-hidden { display: none !important; }

        /* ─── Print-friendly table ─── */
        .tally-print-table {
          width: 100% !important;
          table-layout: fixed !important;
          border-collapse: collapse !important;
          font-size: 9px !important;
        }
        /* Override min-w-* utility classes that force columns too wide */
        .tally-print-table th,
        .tally-print-table td {
          min-width: 0 !important;
          max-width: none !important;
        }
        .tally-print-table thead th {
          background: #2563EB !important; color: #ffffff !important;
          padding: 5px 4px !important; border: 1px solid #1D4ED8 !important;
          text-align: left !important; font-weight: 600 !important; font-size: 8px !important;
          text-transform: uppercase !important; letter-spacing: 0.2px !important;
          word-wrap: break-word !important; overflow-wrap: break-word !important;
          -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
        }
        .tally-print-table tbody td {
          padding: 3px 4px !important; border: 1px solid #E5E7EB !important;
          color: #111827 !important; vertical-align: top !important;
          word-wrap: break-word !important; overflow-wrap: break-word !important;
        }
        .tally-print-table tbody tr:nth-child(even) td { background: #F9FAFB !important; }
        .tally-print-table tbody tr:nth-child(odd)  td { background: #FFFFFF !important; }
        .tally-print-table .num { text-align: right !important; font-variant-numeric: tabular-nums !important; }
        .tally-print-table thead { display: table-header-group !important; }
        .tally-print-table tbody tr { page-break-inside: avoid !important; }

        /* ─── Explicit column widths for print (12 visible columns) ─── */
        /* Total: 100% of page width (landscape A4 minus margins ≈ 277mm) */
        .tally-print-table .print-header-date       { width: 9% !important; }
        .tally-print-table .print-header-shop       { width: 14% !important; }
        .tally-print-table .print-header-area       { width: 8% !important; }
        .tally-print-table .print-header-num        { width: 7% !important; }
        .tally-print-table .print-header-status     { width: 7% !important; }
        .tally-print-table .print-header-reason     { width: 13% !important; }
        .tally-print-table .print-header-resolution { width: 10% !important; }
        .tally-print-table .print-header-teller     { width: 10% !important; }
        .tally-print-table .print-header-ob         { width: 10% !important; }
        .tally-print-table .print-header-gps        { width: 5% !important; }
      `,
    });
  };

  // ─── Resolve handler ──────────────────────────────────────────
  const openResolveDialog = (row: TallyRow) => {
    setResolveRow(row);
    setResolveType('');
    setResolveNote('');
    setResolveOpen(true);
  };
  const handleResolveSubmit = async () => {
    if (!resolveRow || !resolveType) {
      toast({ title: 'Error', description: 'Please select a resolution type', variant: 'destructive' });
      return;
    }
    setResolving(true);
    try {
      const res = await apiFetch(`/api/tally/${resolveRow.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionType: resolveType, resolutionNote: resolveNote.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to resolve tally', variant: 'destructive' });
        return;
      }
      toast({ title: 'Resolved', description: `${resolveRow.shopName} tally marked as resolved.` });
      setResolveOpen(false);
      fetchReport();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setResolving(false);
    }
  };

  // ─── Void handler ─────────────────────────────────────────────
  const openVoidDialog = (row: TallyRow) => {
    setVoidRow(row);
    setVoidReason('');
    setVoidOpen(true);
  };
  const handleVoidSubmit = async () => {
    if (!voidRow || !voidReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a void reason', variant: 'destructive' });
      return;
    }
    setVoiding(true);
    try {
      const res = await apiFetch(`/api/tally/${voidRow.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voidReason: voidReason.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to void tally', variant: 'destructive' });
        return;
      }
      toast({ title: 'Voided', description: `${voidRow.shopName} tally voided.` });
      setVoidOpen(false);
      fetchReport();
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setVoiding(false);
    }
  };

  const clearFilters = () => {
    setDateFrom(monthAgo);
    setDateTo(today);
    setObFilter('all');
    setTellerFilter('all');
    setStatusFilter('all');
    setResolutionFilter('all');
    setReasonFilter('all');
    setShowVoided(false);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (obFilter !== 'all') n++;
    if (tellerFilter !== 'all') n++;
    if (statusFilter !== 'all') n++;
    if (resolutionFilter !== 'all') n++;
    if (reasonFilter !== 'all') n++;
    if (showVoided) n++;
    if (dateFrom !== monthAgo || dateTo !== today) n++;
    return n;
  }, [obFilter, tellerFilter, statusFilter, resolutionFilter, reasonFilter, showVoided, dateFrom, dateTo, monthAgo, today]);

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
            View, resolve, and export all market tally records.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintReport} disabled={loading || rows.length === 0}>
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={loading || exporting || rows.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 print-hidden">
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
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Open Discrepancies</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-rose-600 dark:text-rose-400">{summary.openDiscrepancies ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Resolved</p>
            <p className="text-2xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">{summary.resolvedDiscrepancies ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Net Difference</p>
            <p className={`text-2xl font-bold tabular-nums mt-1 ${
              summary.totalDifference === 0 ? '' : summary.totalDifference > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
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
            <Filter className="h-4 w-4 text-primary" /> Filters
            {activeFilterCount > 0 && <Badge variant="secondary" className="text-[10px]">{activeFilterCount} active</Badge>}
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={clearFilters}>Clear</Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" /> To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Users className="h-3 w-3" /> Orderbooker</Label>
              <Select value={obFilter} onValueChange={setObFilter}>
                <SelectTrigger><SelectValue placeholder="All orderbookers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orderbookers</SelectItem>
                  {orderbookers.map((ob) => <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Teller</Label>
              <Select value={tellerFilter} onValueChange={setTellerFilter}>
                <SelectTrigger><SelectValue placeholder="All tellers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tellers</SelectItem>
                  {tellers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Filter className="h-3 w-3" /> Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="verified">Verified Only</SelectItem>
                  <SelectItem value="discrepancy">Discrepancies Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Resolution</Label>
              <Select value={resolutionFilter} onValueChange={setResolutionFilter}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Reason</Label>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger><SelectValue placeholder="All reasons" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reasons</SelectItem>
                  {REASON_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Ban className="h-3 w-3" /> Voided</Label>
              <Select value={showVoided ? 'true' : 'false'} onValueChange={(v) => setShowVoided(v === 'true')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">Hide Voided</SelectItem>
                  <SelectItem value="true">Show Voided</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Table (printable) */}
      <div className="print-root-wrapper">
        {/* Print-only header */}
        <div className="print-only-header" style={{ display: 'none', textAlign: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #2563EB' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563EB', letterSpacing: '0.5px' }}>{getBusinessName()}</div>
          <div style={{ width: '60px', height: '2px', background: '#2563EB', margin: '6px auto' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151' }}>Market Tally Report</div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Period: {dateFrom || '…'} to {dateTo || '…'}  •  Generated: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          <div style={{ fontSize: '10px', color: '#6B7280', marginTop: '4px' }}>
            {obFilter !== 'all' && `OB: ${orderbookers.find(o => o.id === obFilter)?.name || '—'}  •  `}
            {tellerFilter !== 'all' && `Teller: ${tellers.find(t => t.id === tellerFilter)?.name || '—'}  •  `}
            {statusFilter !== 'all' && `Status: ${statusFilter}  •  `}
            {resolutionFilter !== 'all' && `Resolution: ${resolutionFilter}  •  `}
            {reasonFilter !== 'all' && `Reason: ${reasonFilter}  •  `}
            {showVoided ? 'Including voided' : 'Excluding voided'}
            {obFilter === 'all' && tellerFilter === 'all' && statusFilter === 'all' && resolutionFilter === 'all' && reasonFilter === 'all' && !showVoided && 'No filters applied'}
          </div>
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
              <FileText className="h-4 w-4 text-primary" /> Tally Records
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
                      <TableHead className="min-w-[130px] print-header-date">Date</TableHead>
                      <TableHead className="min-w-[150px] print-header-shop">Shop</TableHead>
                      <TableHead className="min-w-[100px] print-header-area">Area</TableHead>
                      <TableHead className="text-right min-w-[100px] print-header-num">System</TableHead>
                      <TableHead className="text-right min-w-[100px] print-header-num">Shop Bal.</TableHead>
                      <TableHead className="text-right min-w-[100px] print-header-num">Diff</TableHead>
                      <TableHead className="min-w-[90px] print-header-status">Status</TableHead>
                      <TableHead className="min-w-[140px] print-header-reason">Reason</TableHead>
                      <TableHead className="min-w-[110px] print-header-resolution">Resolution</TableHead>
                      <TableHead className="min-w-[110px] print-header-teller">Teller</TableHead>
                      <TableHead className="min-w-[110px] print-header-ob">Orderbooker</TableHead>
                      <TableHead className="min-w-[80px] print-header-gps">GPS</TableHead>
                      <TableHead className="text-right min-w-[120px] print-hidden">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const isVoided = r.voided;
                      return (
                        <TableRow key={r.id} className={isVoided ? 'opacity-50' : ''}>
                          <TableCell>
                            <span className="text-xs">{formatLocalDate(new Date(r.tallyDate))}</span>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{r.shopName}</p>
                            {isVoided && (
                              <Badge variant="outline" className="text-[9px] mt-1 border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300">
                                <Ban className="h-2.5 w-2.5 mr-1" /> VOIDED
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell><span className="text-xs">{r.shopArea || '—'}</span></TableCell>
                          <TableCell className="text-right num">
                            <span className="text-sm tabular-nums">{formatPKR(r.systemBalance)}</span>
                          </TableCell>
                          <TableCell className="text-right num">
                            <span className="text-sm tabular-nums">{formatPKR(r.shopBalance)}</span>
                          </TableCell>
                          <TableCell className="text-right num">
                            <span className={`text-sm font-semibold tabular-nums ${
                              r.difference === 0 ? 'text-emerald-600 dark:text-emerald-400'
                                : r.difference > 0 ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {r.difference > 0 ? '+' : ''}{formatPKR(r.difference)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isVoided ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">—</Badge>
                            ) : (
                              <Badge className={`text-[10px] ${
                                r.status === 'verified'
                                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800'
                              }`}>
                                {r.status === 'verified'
                                  ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                                  : <AlertTriangle className="h-2.5 w-2.5 mr-1" />}
                                {r.status === 'verified' ? 'Verified' : 'Discrepancy'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-[10px] text-muted-foreground">
                              {r.reasonCode ? (REASON_CODE_LABELS as any)[r.reasonCode] || r.reasonCode : '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {r.status === 'discrepancy' && !isVoided ? (
                              <Badge variant="outline" className={`text-[10px] ${
                                r.resolutionStatus === 'resolved'
                                  ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                                  : 'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300'
                              }`}>
                                {r.resolutionStatus === 'resolved'
                                  ? <><ShieldCheck className="h-2.5 w-2.5 mr-1" /> Resolved</>
                                  : <><AlertTriangle className="h-2.5 w-2.5 mr-1" /> Open</>}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {r.tellerName || (r.tellerUsername ? `@${r.tellerUsername}` : '—')}
                            </span>
                          </TableCell>
                          <TableCell><span className="text-xs">{r.orderbookerName || '—'}</span></TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${
                              r.locationStatus === 'verified'
                                ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300'
                                : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300'
                            }`}>
                              <MapPin className="h-2.5 w-2.5 mr-1" />
                              {r.locationStatus === 'verified' ? 'Yes' : 'No'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right print-hidden">
                            {!isVoided && r.status === 'discrepancy' && r.resolutionStatus !== 'resolved' && (
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => openResolveDialog(r)}>
                                  <ShieldCheck className="h-3 w-3 mr-1" /> Resolve
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 text-[10px] border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300" onClick={() => openVoidDialog(r)}>
                                  <Ban className="h-3 w-3 mr-1" /> Void
                                </Button>
                              </div>
                            )}
                            {isVoided && (
                              <span className="text-[10px] text-muted-foreground italic">{r.voidReason}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Resolve Dialog ────────────────────────────────────── */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Resolve Discrepancy
            </DialogTitle>
            <DialogDescription>
              {resolveRow?.shopName} — diff {resolveRow ? formatPKR(resolveRow.difference) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Resolution Type *</Label>
              <Select value={resolveType} onValueChange={(v) => setResolveType(v as ResolutionType)}>
                <SelectTrigger><SelectValue placeholder="Select resolution type" /></SelectTrigger>
                <SelectContent>
                  {RESOLUTION_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {resolveType === 'adjustment_posted' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  ⚠️ An adjustment Transaction will be auto-created to align the system balance with the shopkeeper&rsquo;s stated balance.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Add context for this resolution…"
                rows={3}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)} disabled={resolving}>Cancel</Button>
            <Button onClick={handleResolveSubmit} disabled={resolving || !resolveType}>
              {resolving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Void Dialog ───────────────────────────────────────── */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <XCircle className="h-5 w-5" /> Void Tally
            </DialogTitle>
            <DialogDescription>
              {voidRow?.shopName} — recorded on {voidRow ? formatLocalDate(new Date(voidRow.tallyDate)) : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              Voiding a tally will hide it from default reports but it will still be visible when &quot;Show Voided&quot; is enabled. This action is recorded in the audit log.
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Void Reason *</Label>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Why is this tally being voided? (e.g. duplicate, wrong shop, recording error)"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoidSubmit} disabled={voiding || !voidReason.trim()}>
              {voiding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Void Tally
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
