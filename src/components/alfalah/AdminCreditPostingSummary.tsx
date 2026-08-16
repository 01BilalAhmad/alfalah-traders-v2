'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  CreditCard, Download, Loader2, Search, FileSpreadsheet, TrendingUp,
  Store, Building2, Calendar, Printer, Send, MessageSquare,
  CheckCircle2, XCircle, Ban, Smartphone, AlertTriangle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import * as XLSX from 'xlsx';

interface CreditRow {
  id: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdAt: string;
  companyName: string | null;
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  orderbookerName: string;
  creatorName: string;
}

interface CompanySummary {
  companyName: string;
  totalAmount: number;
  shopCount: number;
}

interface ReportData {
  date: string;
  credits: CreditRow[];
  summary: {
    totalAmount: number;
    totalShops: number;
    totalTransactions: number;
  };
  companySummary: CompanySummary[];
}

interface Company { id: string; name: string; }
interface Orderbooker { id: string; name: string; }

function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
}


function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminCreditPostingSummary() {
  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [filterCompany, setFilterCompany] = useState('');
  const [filterOB, setFilterOB] = useState('all');
  const [data, setData] = useState<ReportData | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendingSms, setSendingSms] = useState(false);
  const [smsConfirmOpen, setSmsConfirmOpen] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsModalData, setSmsModalData] = useState<{
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    details: Array<{
      shopName: string;
      shopPhone: string | null;
      status: 'sent' | 'failed' | 'skipped';
      error?: string;
    }>;
  } | null>(null);

  // Fetch companies + OBs on mount
  useEffect(() => {
    (async () => {
      try {
        const [cRes, oRes] = await Promise.all([
          apiFetch('/api/companies?status=active'),
          apiFetch('/api/orderbookers?status=active'),
        ]);
        if (cRes.ok) { const d = await cRes.json(); setCompanies(d.companies || []); }
        if (oRes.ok) { const d = await oRes.json(); setOrderbookers(Array.isArray(d) ? d : []); }
      } catch {}
    })();
  }, []);

  const generateReport = useCallback(async () => {
    if (!selectedDate) {
      toast({ title: 'Date Required', description: 'Please select a date.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (filterCompany) params.set('companyId', filterCompany);
      if (filterOB && filterOB !== 'all') params.set('orderbookerId', filterOB);
      const res = await apiFetch(`/api/reports/credit-posting-summary?${params}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed'); }
      const result: ReportData = await res.json();
      setData(result);
      toast({ title: 'Report Generated', description: `${result.summary.totalTransactions} credit entries • ${formatPKR(result.summary.totalAmount)}` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [selectedDate, filterCompany, filterOB]);

  const filteredCredits = data?.credits.filter(c => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return c.shopName.toLowerCase().includes(q) || c.orderbookerName.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
  }) || [];

  // ─── Selection helpers ───────────────────────────────────────
  const visibleIds = filteredCredits.map(c => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some(id => selectedIds.has(id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds(prev => new Set([...prev, ...visibleIds]));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Send SMS handler ────────────────────────────────────────
  const handleSendSms = async () => {
    setSmsConfirmOpen(false);
    setSendingSms(true);
    try {
      // Send to selected transactions, OR if none selected, all visible
      const idsToSend = selectedIds.size > 0 ? Array.from(selectedIds) : visibleIds;
      const res = await apiFetch('/api/whatsapp/send-credit-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: idsToSend }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmsModalData(data.smsSummary);
        setSmsModalOpen(true);
        setSelectedIds(new Set());
      } else {
        toast({
          title: '❌ SMS Failed',
          description: data.error || 'Failed to send SMS',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: '❌ Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSendingSms(false);
    }
  };

  const exportExcel = useCallback(() => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const rows = data.credits.map((c, i) => ({
      '#': i + 1,
      'Shop Name': c.shopName,
      'Area': c.shopArea || '',
      'Address': c.shopAddress || '',
      'Amount (Rs.)': c.amount,
      'Previous Balance': c.previousBalance,
      'New Balance': c.newBalance,
      'Company': c.companyName || '',
      'Orderbooker': c.orderbookerName,
      'Description': c.description || '',
      'Posted By': c.creatorName,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 22 }, { wch: 15 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Summary');
    const summary = [
      { Metric: 'Date', Value: formatDate(data.date) },
      { Metric: 'Total Amount', Value: data.summary.totalAmount },
      { Metric: 'Total Shops', Value: data.summary.totalShops },
      { Metric: 'Total Transactions', Value: data.summary.totalTransactions },
    ];
    const ws2 = XLSX.utils.json_to_sheet(summary);
    ws2['!cols'] = [{ wch: 25 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
    XLSX.writeFile(wb, `Credit_Posting_Summary_${data.date}.xlsx`);
    toast({ title: 'Excel Downloaded' });
  }, [data]);

  const handlePrint = useCallback(() => {
    if (!data) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const businessName = 'AL-FALAH TRADERS';
    const dateLabel = formatDate(data.date);
    const companyNameDisplay = filterCompany ? (companies.find(c => c.id === filterCompany)?.name || 'All') : (data.companySummary.length > 0 ? data.companySummary.map(c => c.companyName).join(', ') : 'All');
    const obNameDisplay = (filterOB && filterOB !== 'all') ? (orderbookers.find(o => o.id === filterOB)?.name || 'All') : 'All';

    const rowsHtml = data.credits.map((c, i) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td><strong>${c.shopName}</strong></td>
        <td>${c.shopAddress || c.shopArea || '—'}</td>
        <td style="text-align:right">${formatPKR(c.previousBalance)}</td>
        <td style="text-align:right; font-weight:bold; color:#2563EB">${formatPKR(c.amount)}</td>
        <td style="text-align:right; font-weight:bold">${formatPKR(c.newBalance)}</td>
      </tr>
    `).join('');

    const companyRows = data.companySummary.map(c => `
      <tr>
        <td>${c.companyName}</td>
        <td style="text-align:right; font-weight:bold">${formatPKR(c.totalAmount)}</td>
        <td style="text-align:center">${c.shopCount}</td>
      </tr>
    `).join('');

    printWin.document.write(`<!DOCTYPE html><html><head><title>Credit Posting Summary - ${dateLabel}</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
      .header { text-align:center; margin-bottom:10px; border-bottom: 3px solid #2563EB; padding-bottom:8px; }
      .biz-name { font-size: 20px; font-weight: bold; color: #2563EB; letter-spacing:1px; }
      .subtitle { font-size: 10px; color: #666; margin-top:2px; }
      .report-title { font-size: 15px; font-weight:bold; margin-top:6px; color:#1E40AF; }
      .date-line { font-size: 11px; font-weight:bold; margin-top:4px; color:#333; }
      .info-line { font-size: 10px; color: #555; margin-top:4px; text-align:center; }
      .summary-box { display:flex; gap:12px; margin:10px 0; justify-content:center; }
      .summary-card { border:1px solid #BFDBFE; border-radius:6px; padding:8px 16px; text-align:center; background:#EFF6FF; }
      .summary-card .label { font-size:8px; color:#666; text-transform:uppercase; letter-spacing:0.3px; font-weight:600; }
      .summary-card .value { font-size:16px; font-weight:bold; color:#2563EB; margin-top:2px; }
      table { width:100%; border-collapse:collapse; margin-top:6px; font-size:10px; }
      th { background:#2563EB; color:#fff; padding:6px 4px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:0.3px; }
      td { padding:4px 4px; border-bottom:1px solid #ddd; }
      tr:nth-child(even) { background:#F8FAFC; }
      .total-row { background:#DBEAFE !important; font-weight:bold; }
      .total-row td { border-top:2px solid #2563EB; padding:6px 4px; font-size:11px; }
      .footer { margin-top:12px; padding-top:6px; border-top:1px solid #ccc; text-align:center; font-size:8px; color:#999; }
      @media print { body { padding:0; } .no-print { display:none; } }
    </style></head><body>
      <div class="header">
        <div class="biz-name">${businessName}</div>
        <div class="subtitle">Credit & Route Management System</div>
        <div class="report-title">CREDIT POSTING SUMMARY</div>
        <div class="date-line">Date: ${dateLabel}</div>
        <div class="info-line">Company: ${companyNameDisplay} &nbsp;|&nbsp; Orderbooker: ${obNameDisplay}</div>
      </div>
      <div class="summary-box">
        <div class="summary-card"><div class="label">Total Credit</div><div class="value">${formatPKR(data.summary.totalAmount)}</div></div>
        <div class="summary-card"><div class="label">Total Shops</div><div class="value">${data.summary.totalShops}</div></div>
        <div class="summary-card"><div class="label">Transactions</div><div class="value">${data.summary.totalTransactions}</div></div>
      </div>
      <table>
        <thead>
          <tr><th style="width:25px">#</th><th>Shop Name</th><th>Address</th><th style="text-align:right">Opening</th><th style="text-align:right">Credit</th><th style="text-align:right">Closing</th></tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="4" style="text-align:right">TOTAL CREDIT POSTED</td>
            <td style="text-align:right; color:#2563EB; font-size:12px">${formatPKR(data.summary.totalAmount)}</td>
            <td>${data.summary.totalShops} shops</td>
          </tr>
        </tbody>
      </table>
      ${data.companySummary.length > 1 ? `
      <div class="company-section">
        <div class="company-title">Company-wise Breakdown</div>
        <table class="company-table">
          <thead><tr><th>Company</th><th style="text-align:right">Total Amount</th><th style="text-align:center">Entries</th></tr></thead>
          <tbody>${companyRows}</tbody>
        </table>
      </div>` : ''}
      <div class="footer">Generated: ${new Date().toLocaleString('en-PK')} • Credit Posting Summary • ${businessName}</div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    printWin.document.close();
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-blue-600" />
          Credit Posting Summary
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Print credit posting report for any date — for sundry system entry
        </p>
      </div>

      {/* Filters */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-blue-600" />Select Date & Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Calendar className="h-3 w-3 inline mr-1" />Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-9" max={getTodayDate()} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Building2 className="h-3 w-3 inline mr-1" />Company</Label>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All companies" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Companies</SelectItem>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Orderbooker</Label>
              <Select value={filterOB} onValueChange={setFilterOB}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All orderbookers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orderbookers</SelectItem>
                  {orderbookers.map(ob => <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={generateReport} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                {loading ? 'Loading...' : 'Generate'}
              </Button>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(getYesterdayDate())}>Yesterday</Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedDate(getTodayDate())}>Today</Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Body */}
      {data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-blue-200 dark:border-blue-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Total Credit</p><p className="text-xl font-bold text-blue-600 dark:text-blue-400">{formatPKR(data.summary.totalAmount)}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-blue-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Total Shops</p><p className="text-xl font-bold">{data.summary.totalShops}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Store className="h-4 w-4 text-muted-foreground" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Transactions</p><p className="text-xl font-bold">{data.summary.totalTransactions}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><CreditCard className="h-4 w-4 text-muted-foreground" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Date</p><p className="text-sm font-bold">{formatDate(data.date)}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Calendar className="h-4 w-4 text-muted-foreground" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handlePrint} disabled={!data || data.credits.length === 0}>
              <Printer className="h-4 w-4 mr-2" /> Print / PDF
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={!data || data.credits.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" /> Excel
            </Button>

            {/* SMS Send button — primary action, with selection count badge */}
            <Button
              onClick={() => setSmsConfirmOpen(true)}
              disabled={!data || filteredCredits.length === 0 || sendingSms}
              className="bg-blue-600 hover:bg-blue-700 text-white ml-auto"
            >
              {sendingSms ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {sendingSms ? 'Sending SMS...' : 'Send Credit SMS'}
              {selectedIds.size > 0 && (
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">
                  {selectedIds.size} selected
                </Badge>
              )}
              {selectedIds.size === 0 && filteredCredits.length > 0 && (
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">
                  all {filteredCredits.length}
                </Badge>
              )}
            </Button>
          </div>

          {/* Selection helper line */}
          {filteredCredits.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <Checkbox checked={allVisibleSelected || someVisibleSelected} onCheckedChange={toggleSelectAll} />
                <span>
                  {allVisibleSelected ? 'Deselect all' : 'Select all visible'}
                </span>
              </button>
              {selectedIds.size > 0 && (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {selectedIds.size} shop(s) selected for SMS
                </span>
              )}
            </div>
          )}

          {/* Company + OB info line */}
          {data && (
            <div className="flex items-center gap-4 text-sm">
              {filterCompany && companies.find(c => c.id === filterCompany) && (
                <span className="font-medium">Company: <span className="text-blue-600 dark:text-blue-400">{companies.find(c => c.id === filterCompany)?.name}</span></span>
              )}
              {!filterCompany && data.companySummary.length > 0 && (
                <span className="font-medium">Company: <span className="text-blue-600 dark:text-blue-400">{data.companySummary.map(c => c.companyName).join(', ')}</span></span>
              )}
              {filterOB && filterOB !== 'all' && orderbookers.find(o => o.id === filterOB) && (
                <span className="font-medium">Orderbooker: <span className="text-blue-600 dark:text-blue-400">{orderbookers.find(o => o.id === filterOB)?.name}</span></span>
              )}
              {(!filterOB || filterOB === 'all') && (
                <span className="font-medium">Orderbooker: <span className="text-blue-600 dark:text-blue-400">All</span></span>
              )}
            </div>
          )}

          {/* Credits Table — only Shop, Address, Opening, Credit, Closing */}
          <Card className="border-blue-200 dark:border-blue-900">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-blue-600" />Credit Details</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search shop, OB..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-8 pl-7 text-xs" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredCredits.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {data.credits.length === 0 ? 'No credit posted on this date' : 'No results match your search'}
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 dark:bg-blue-950/30">
                        <TableHead className="text-xs w-10">
                          <Checkbox
                            checked={allVisibleSelected || someVisibleSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Shop</TableHead>
                        <TableHead className="text-xs hidden md:table-cell">Address</TableHead>
                        <TableHead className="text-xs text-right hidden sm:table-cell">Opening</TableHead>
                        <TableHead className="text-xs text-right">Credit</TableHead>
                        <TableHead className="text-xs text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCredits.map((c, i) => (
                        <TableRow
                          key={c.id}
                          className={`hover:bg-blue-50/50 dark:hover:bg-blue-950/20 ${selectedIds.has(c.id) ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}
                        >
                          <TableCell className="text-xs py-2">
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              onCheckedChange={() => toggleSelectOne(c.id)}
                              aria-label={`Select ${c.shopName}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs py-2">{i + 1}</TableCell>
                          <TableCell className="py-2"><p className="text-sm font-medium">{c.shopName}</p><p className="text-[10px] text-muted-foreground">{c.shopArea || '—'}</p></TableCell>
                          <TableCell className="text-xs py-2 hidden md:table-cell max-w-[200px] truncate">{c.shopAddress || c.shopArea || '—'}</TableCell>
                          <TableCell className="text-xs py-2 text-right hidden sm:table-cell text-muted-foreground">{formatPKR(c.previousBalance)}</TableCell>
                          <TableCell className="text-xs py-2 text-right font-bold text-blue-600 dark:text-blue-400">{formatPKR(c.amount)}</TableCell>
                          <TableCell className="text-xs py-2 text-right font-semibold">{formatPKR(c.newBalance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
                        <TableCell colSpan={5} className="text-xs py-2 font-bold">TOTAL</TableCell>
                        <TableCell className="text-xs py-2 text-right font-bold text-blue-600 dark:text-blue-400 text-base">{formatPKR(data.summary.totalAmount)}</TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">{data.summary.totalShops} shops</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company Breakdown */}
          {data.companySummary.length > 1 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" />Company-wise Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead className="text-xs">Company</TableHead><TableHead className="text-xs text-right">Total Amount</TableHead><TableHead className="text-xs text-center">Entries</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.companySummary.map(c => (
                      <TableRow key={c.companyName} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-medium">{c.companyName}</TableCell>
                        <TableCell className="text-sm text-right font-bold text-blue-600 dark:text-blue-400">{formatPKR(c.totalAmount)}</TableCell>
                        <TableCell className="text-sm text-center">{c.shopCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center mb-4">
              <CreditCard className="h-7 w-7 text-blue-500" />
            </div>
            <p className="text-sm font-medium text-foreground">No report generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">Select a date and click &quot;Generate&quot; to view credit posting summary</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ SMS Confirmation Dialog ═══ */}
      <Dialog open={smsConfirmOpen} onOpenChange={setSmsConfirmOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Send Credit SMS?
            </DialogTitle>
            <DialogDescription className="text-sm">
              This will send WhatsApp credit receipt to the selected shopkeepers.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-0.5">Verify before sending</p>
              <p>Make sure all credit entries are correct. SMS cannot be unsent once delivered.</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted-foreground">Recipients:</span>
              <span className="font-bold text-foreground">
                {selectedIds.size > 0 ? selectedIds.size : filteredCredits.length} shop(s)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Credit:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                {formatPKR(
                  (selectedIds.size > 0
                    ? filteredCredits.filter(c => selectedIds.has(c.id))
                    : filteredCredits
                  ).reduce((sum, c) => sum + c.amount, 0)
                )}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setSmsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendSms}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ SMS Summary Modal — Clean popup showing SMS send results ═══ */}
      <Dialog open={smsModalOpen} onOpenChange={setSmsModalOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              Credit SMS Send Complete
            </DialogTitle>
            <DialogDescription className="text-sm mt-1">
              WhatsApp credit receipts were sent to shopkeepers
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {(() => {
              if (!smsModalData) return null;
              const sms = smsModalData;

              // All skipped — feature disabled or all already sent
              if (sms.total > 0 && sms.sent === 0 && sms.failed === 0 && sms.skipped === sms.total) {
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        No SMS were sent
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        Possible reasons: Credit SMS disabled in settings, all shops already received SMS, or no phone numbers.
                      </p>
                    </div>
                  </div>
                );
              }

              const successRate = sms.total > 0 ? Math.round((sms.sent / sms.total) * 100) : 0;

              return (
                <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="rounded-lg border border-border bg-card p-3 text-center">
                      <div className="text-xs text-muted-foreground font-medium mb-1">Total</div>
                      <div className="text-xl font-bold text-foreground tabular-nums">{sms.total}</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 text-center">
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-1 flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Sent
                      </div>
                      <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{sms.sent}</div>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-center">
                      <div className="text-xs text-red-700 dark:text-red-400 font-medium mb-1 flex items-center justify-center gap-1">
                        <XCircle className="h-3 w-3" /> Failed
                      </div>
                      <div className="text-xl font-bold text-red-700 dark:text-red-400 tabular-nums">{sms.failed}</div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-center">
                      <div className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1 flex items-center justify-center gap-1">
                        <Ban className="h-3 w-3" /> Skipped
                      </div>
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">{sms.skipped}</div>
                    </div>
                  </div>

                  {/* Success Rate Bar */}
                  {sms.total > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground font-medium">Success Rate</span>
                        <span className={`font-bold tabular-nums ${successRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : successRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                          {successRate}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${successRate >= 80 ? 'bg-emerald-500' : successRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${successRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Details List */}
                  {sms.details && sms.details.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-foreground">Shop-wise Details</h4>
                        <Badge variant="secondary" className="text-[10px]">{sms.details.length} shops</Badge>
                      </div>
                      <div className="rounded-lg border border-border overflow-hidden max-h-[280px] overflow-y-auto">
                        {sms.details.map((d, idx) => {
                          const isError = d.status === 'failed' || d.status === 'skipped';
                          const statusConfig = {
                            sent: {
                              icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
                              bg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
                              label: 'Sent',
                              labelColor: 'text-emerald-700 dark:text-emerald-400',
                            },
                            failed: {
                              icon: <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,
                              bg: 'bg-red-50/50 dark:bg-red-950/20',
                              label: 'Failed',
                              labelColor: 'text-red-700 dark:text-red-400',
                            },
                            skipped: {
                              icon: <Ban className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
                              bg: 'bg-amber-50/50 dark:bg-amber-950/20',
                              label: 'Skipped',
                              labelColor: 'text-amber-700 dark:text-amber-400',
                            },
                          };
                          const cfg = statusConfig[d.status];
                          return (
                            <div
                              key={idx}
                              className={`flex items-start gap-3 px-3 py-2.5 border-b border-border last:border-b-0 ${cfg.bg}`}
                            >
                              <div className="flex-shrink-0 mt-0.5">{cfg.icon}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-foreground truncate">{d.shopName}</p>
                                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${cfg.labelColor} flex-shrink-0`}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {d.shopPhone ? (
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Smartphone className="h-2.5 w-2.5" />
                                      {d.shopPhone}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground/70 italic">no phone</span>
                                  )}
                                </div>
                                {isError && d.error && (
                                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 leading-relaxed">
                                    {d.error}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSmsModalOpen(false)}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
