'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  History,
  Loader2,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Calendar,
  Building2,
  Users,
  TrendingDown,
  Store,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ────────────────────────────────────────────────────────────

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

interface Company {
  id: string;
  name: string;
  status: string;
}

interface ClaimRow {
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
  orderbookerId: string;
  orderbookerName: string;
  creatorId: string | null;
  creatorName: string | null;
}

interface ShopBreakdown {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  claimCount: number;
  totalAmount: number;
  lastClaimDate: string;
  claims: {
    id: string;
    amount: number;
    description: string | null;
    createdAt: string;
    creatorName: string | null;
  }[];
}

interface OBSummary {
  orderbookerId: string;
  orderbookerName: string;
  totalShops: number;
  totalClaims: number;
  totalAmount: number;
  lastClaimDate: string | null;
  shops: ShopBreakdown[];
}

interface ClaimsReportResponse {
  period: { startDate: string; endDate: string };
  companyName: string | null;
  claims: ClaimRow[];
  obSummary: OBSummary[];
  totals: {
    count: number;
    amount: number;
    todayCount: number;
    todayAmount: number;
    monthCount: number;
    monthAmount: number;
  };
}

interface ClaimHistoryReportProps {
  orderbookers: Orderbooker[];
  companies: Company[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getMonthStartString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-PK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateShort(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────

export default function ClaimHistoryReport({ orderbookers, companies }: ClaimHistoryReportProps) {
  // Filter state
  const [filterCompany, setFilterCompany] = useState<string>('');
  const [filterOB, setFilterOB] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(getMonthStartString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());

  // Report state
  const [report, setReport] = useState<ClaimsReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Expandable OB state
  const [expandedOBs, setExpandedOBs] = useState<Set<string>>(new Set());
  const [expandedShops, setExpandedShops] = useState<Set<string>>(new Set());

  // ─── Toggle expand OB ───
  const toggleOB = useCallback((obId: string) => {
    setExpandedOBs((prev) => {
      const next = new Set(prev);
      if (next.has(obId)) {
        next.delete(obId);
      } else {
        next.add(obId);
      }
      return next;
    });
  }, []);

  // ─── Toggle expand Shop ───
  const toggleShop = useCallback((key: string) => {
    setExpandedShops((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ─── Generate Report ───
  const generateReport = useCallback(async () => {
    if (!filterCompany) {
      toast({
        title: 'Company Required',
        description: 'Please select a company to generate the report.',
        variant: 'destructive',
      });
      return;
    }
    if (!startDate || !endDate) {
      toast({
        title: 'Date Range Required',
        description: 'Please select both start and end dates.',
        variant: 'destructive',
      });
      return;
    }
    if (startDate > endDate) {
      toast({
        title: 'Invalid Date Range',
        description: 'Start date cannot be after end date.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('companyId', filterCompany);
      params.set('orderbookerId', filterOB);
      params.set('startDate', startDate);
      params.set('endDate', endDate);

      const res = await apiFetch(`/api/reports/claims?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate report');
      }
      const data: ClaimsReportResponse = await res.json();
      setReport(data);
      setExpandedOBs(new Set());
      setExpandedShops(new Set());
      toast({
        title: 'Report Generated',
        description: `Found ${data.totals.count} claim(s) totaling ${formatPKR(data.totals.amount)}`,
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to generate report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filterCompany, filterOB, startDate, endDate]);

  // ─── Filtered claims (search) ───
  const filteredClaims = useMemo(() => {
    if (!report) return [];
    if (!searchTerm.trim()) return report.claims;
    const q = searchTerm.toLowerCase();
    return report.claims.filter(
      (c) =>
        c.shopName.toLowerCase().includes(q) ||
        c.orderbookerName.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.creatorName || '').toLowerCase().includes(q)
    );
  }, [report, searchTerm]);

  // ─── Excel Export ───
  const exportExcel = useCallback(() => {
    if (!report) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: All Claims
    const claimsData = report.claims.map((c, idx) => ({
      '#': idx + 1,
      'Date & Time': formatDateTime(c.createdAt),
      'Shop Name': c.shopName,
      'Area': c.shopArea || '',
      'Address': c.shopAddress || '',
      'Orderbooker': c.orderbookerName,
      'Company': c.companyName || '',
      'Amount (Rs.)': c.amount,
      'Previous Balance': c.previousBalance,
      'New Balance': c.newBalance,
      'Description': c.description || '',
      'Posted By': c.creatorName || '',
    }));
    const ws1 = XLSX.utils.json_to_sheet(claimsData);
    ws1['!cols'] = [
      { wch: 5 }, { wch: 18 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
      { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 30 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'All Claims');

    // Sheet 2: Per-OB Summary
    const obSummaryData = report.obSummary.map((ob, idx) => ({
      '#': idx + 1,
      'Orderbooker': ob.orderbookerName,
      'Total Shops with Claims': ob.totalShops,
      'Total Claims Count': ob.totalClaims,
      'Total Amount (Rs.)': ob.totalAmount,
      'Last Claim Date': ob.lastClaimDate ? formatDateShort(ob.lastClaimDate) : '',
    }));
    const ws2 = XLSX.utils.json_to_sheet(obSummaryData);
    ws2['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'OB Summary');

    // Sheet 3: Per-OB Per-Shop Breakdown
    const breakdownData: Record<string, unknown>[] = [];
    let counter = 1;
    for (const ob of report.obSummary) {
      for (const shop of ob.shops) {
        breakdownData.push({
          '#': counter++,
          'Orderbooker': ob.orderbookerName,
          'Shop Name': shop.shopName,
          'Area': shop.shopArea || '',
          'Address': shop.shopAddress || '',
          'Claim Count': shop.claimCount,
          'Total Amount (Rs.)': shop.totalAmount,
          'Last Claim Date': formatDateShort(shop.lastClaimDate),
        });
      }
    }
    const ws3 = XLSX.utils.json_to_sheet(breakdownData);
    ws3['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
      { wch: 12 }, { wch: 18 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'OB-Shop Breakdown');

    // Sheet 4: Totals
    const totalsData = [
      { Metric: 'Period Start', Value: report.period.startDate },
      { Metric: 'Period End', Value: report.period.endDate },
      { Metric: 'Company', Value: report.companyName || '' },
      { Metric: 'Total Claims (count)', Value: report.totals.count },
      { Metric: 'Total Amount (Rs.)', Value: report.totals.amount },
      { Metric: "Today's Claims (count)", Value: report.totals.todayCount },
      { Metric: "Today's Amount (Rs.)", Value: report.totals.todayAmount },
      { Metric: "This Month's Claims (count)", Value: report.totals.monthCount },
      { Metric: "This Month's Amount (Rs.)", Value: report.totals.monthAmount },
    ];
    const ws4 = XLSX.utils.json_to_sheet(totalsData);
    ws4['!cols'] = [{ wch: 30 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Summary');

    const filename = `Claims_Report_${report.period.startDate}_to_${report.period.endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast({ title: 'Excel Downloaded', description: filename });
  }, [report]);

  // ─── PDF Export ───
  const exportPDF = useCallback(() => {
    if (!report) return;

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const businessName = 'AL-FALAH TRADERS';

    // Header
    doc.setFillColor(15, 23, 42); // navy
    doc.rect(0, 0, pageWidth, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(businessName, pageWidth / 2, 13, { align: 'center' });
    doc.setFontSize(11);
    doc.text('CLAIMS REPORT', pageWidth / 2, 22, { align: 'center' });

    // Period info
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Company: ${report.companyName || '—'}    Period: ${report.period.startDate} to ${report.period.endDate}`,
      14,
      38
    );

    // Summary cards (3 boxes)
    const cards = [
      { label: 'Total Claims', value: String(report.totals.count), color: [239, 68, 68] as [number, number, number] },
      { label: 'Total Amount', value: formatPKR(report.totals.amount), color: [59, 130, 246] as [number, number, number] },
      { label: "Today's Claims", value: `${report.totals.todayCount} (${formatPKR(report.totals.todayAmount)})`, color: [16, 185, 129] as [number, number, number] },
    ];
    const cardW = (pageWidth - 28 - 8) / 3;
    cards.forEach((card, i) => {
      const x = 14 + i * (cardW + 4);
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(x, 43, cardW, 16, 2, 2, 'F');
      doc.setTextColor(...card.color);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(card.label, x + 3, 49);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, x + 3, 56);
    });

    // Section 1: Per-OB Summary table
    autoTable(doc, {
      startY: 64,
      head: [['#', 'Orderbooker', 'Shops', 'Claims', 'Amount (Rs.)', 'Last Claim']],
      body: report.obSummary.map((ob, i) => [
        String(i + 1),
        ob.orderbookerName,
        String(ob.totalShops),
        String(ob.totalClaims),
        formatPKR(ob.totalAmount),
        ob.lastClaimDate ? formatDateShort(ob.lastClaimDate) : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 8 },
        4: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    // Section 2: Per-OB Per-Shop breakdown
    let yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('Per-OB / Per-Shop Breakdown', 14, yPos);
    yPos += 3;

    const breakdownRows: string[][] = [];
    report.obSummary.forEach((ob) => {
      breakdownRows.push([
        ob.orderbookerName,
        '',
        '',
        `${ob.totalClaims} claims`,
        formatPKR(ob.totalAmount),
        '',
      ]);
      ob.shops.forEach((shop) => {
        breakdownRows.push([
          `   ↳ ${shop.shopName}`,
          shop.shopArea || '—',
          shop.shopAddress || '—',
          String(shop.claimCount),
          formatPKR(shop.totalAmount),
          formatDateShort(shop.lastClaimDate),
        ]);
      });
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Shop', 'Area', 'Address', 'Claims', 'Amount', 'Last Date']],
      body: breakdownRows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        4: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    // Section 3: All Claims detail
    yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    if (yPos > 250) {
      doc.addPage();
      yPos = 14;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('All Claims (Detailed)', 14, yPos);
    yPos += 3;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Shop', 'OB', 'Amount', 'Description', 'Posted By']],
      body: report.claims.map((c) => [
        formatDateTime(c.createdAt),
        c.shopName,
        c.orderbookerName,
        formatPKR(c.amount),
        c.description || '—',
        c.creatorName || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
      columnStyles: {
        3: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    // Footer with page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Page ${i} of ${pageCount} • Generated: ${new Date().toLocaleString('en-PK')}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    }

    const filename = `Claims_Report_${report.period.startDate}_to_${report.period.endDate}.pdf`;
    doc.save(filename);
    toast({ title: 'PDF Downloaded', description: filename });
  }, [report]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Company */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Company <span className="text-destructive">*</span>
              </Label>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Orderbooker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Orderbooker</Label>
              <Select value={filterOB} onValueChange={setFilterOB}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All orderbookers" />
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
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button
              onClick={generateReport}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {loading ? 'Generating...' : 'Generate Report'}
            </Button>

            {report && (
              <>
                <Button variant="outline" onClick={exportExcel} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Excel
                </Button>
                <Button variant="outline" onClick={exportPDF} className="gap-2">
                  <FileText className="h-4 w-4 text-red-600" />
                  PDF
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report Body */}
      {report ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">Total Claims</p>
                    <p className="text-xl font-bold tabular-nums">{report.totals.count}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center">
                    <ShieldAlert className="h-4 w-4 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">Total Amount</p>
                    <p className="text-xl font-bold tabular-nums">{formatPKR(report.totals.amount)}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">Today&apos;s Claims</p>
                    <p className="text-xl font-bold tabular-nums">{report.totals.todayCount}</p>
                    <p className="text-[10px] text-muted-foreground">{formatPKR(report.totals.todayAmount)}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-medium">This Month</p>
                    <p className="text-xl font-bold tabular-nums">{report.totals.monthCount}</p>
                    <p className="text-[10px] text-muted-foreground">{formatPKR(report.totals.monthAmount)}</p>
                  </div>
                  <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Per-OB Breakdown (Expandable) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Per-Orderbooker Breakdown
                <Badge variant="secondary" className="ml-1">
                  {report.obSummary.length} OBs
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.obSummary.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No claims found for the selected filters
                </div>
              ) : (
                <div className="space-y-2">
                  {report.obSummary.map((ob) => {
                    const isExpanded = expandedOBs.has(ob.orderbookerId);
                    return (
                      <div
                        key={ob.orderbookerId}
                        className="border rounded-lg overflow-hidden"
                      >
                        {/* OB Header Row */}
                        <button
                          onClick={() => toggleOB(ob.orderbookerId)}
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{ob.orderbookerName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {ob.totalShops} shop{ob.totalShops !== 1 ? 's' : ''} • {ob.totalClaims} claim{ob.totalClaims !== 1 ? 's' : ''}
                                {ob.lastClaimDate && ` • Last: ${formatDateShort(ob.lastClaimDate)}`}
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">
                            {formatPKR(ob.totalAmount)}
                          </span>
                        </button>

                        {/* Expanded Shops List */}
                        {isExpanded && (
                          <div className="border-t bg-muted/20">
                            <div className="p-3 space-y-2">
                              {ob.shops.map((shop) => {
                                const shopKey = `${ob.orderbookerId}-${shop.shopId}`;
                                const shopExpanded = expandedShops.has(shopKey);
                                return (
                                  <div
                                    key={shop.shopId}
                                    className="border rounded-lg bg-card overflow-hidden"
                                  >
                                    {/* Shop Header Row */}
                                    <button
                                      onClick={() => toggleShop(shopKey)}
                                      className="w-full flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors text-left"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        {shopExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        )}
                                        <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-xs font-semibold truncate">{shop.shopName}</p>
                                          <p className="text-[10px] text-muted-foreground">
                                            {shop.shopArea || 'No area'} • {shop.claimCount} claim{shop.claimCount !== 1 ? 's' : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-2">
                                        {formatPKR(shop.totalAmount)}
                                      </span>
                                    </button>

                                    {/* Expanded Claims List for this Shop */}
                                    {shopExpanded && (
                                      <div className="border-t bg-muted/10">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                              <TableHead className="text-[10px] h-7 py-1">Date & Time</TableHead>
                                              <TableHead className="text-[10px] h-7 py-1 text-right">Amount</TableHead>
                                              <TableHead className="text-[10px] h-7 py-1">Prev Bal → New Bal</TableHead>
                                              <TableHead className="text-[10px] h-7 py-1">Description</TableHead>
                                              <TableHead className="text-[10px] h-7 py-1">Posted By</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {shop.claims.map((cl) => (
                                              <TableRow key={cl.id} className="hover:bg-muted/30">
                                                <TableCell className="text-[10px] py-1.5">
                                                  {formatDateTime(cl.createdAt)}
                                                </TableCell>
                                                <TableCell className="text-[10px] py-1.5 text-right font-semibold text-red-600 dark:text-red-400">
                                                  {formatPKR(cl.amount)}
                                                </TableCell>
                                                <TableCell className="text-[10px] py-1.5 text-muted-foreground">
                                                  {formatPKR(0)} → {formatPKR(0)}
                                                </TableCell>
                                                <TableCell className="text-[10px] py-1.5">
                                                  {cl.description || '—'}
                                                </TableCell>
                                                <TableCell className="text-[10px] py-1.5 text-muted-foreground">
                                                  {cl.creatorName || '—'}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Claims Table with Search */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  All Claims
                  <Badge variant="secondary">{filteredClaims.length}</Badge>
                </CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search shop, OB, description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredClaims.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {report.claims.length === 0
                    ? 'No claims found in this period'
                    : 'No claims match your search'}
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Date & Time</TableHead>
                        <TableHead className="text-[10px]">Shop</TableHead>
                        <TableHead className="text-[10px] hidden md:table-cell">Orderbooker</TableHead>
                        <TableHead className="text-[10px] text-right">Amount</TableHead>
                        <TableHead className="text-[10px] hidden lg:table-cell">Prev → New Bal</TableHead>
                        <TableHead className="text-[10px] hidden md:table-cell">Description</TableHead>
                        <TableHead className="text-[10px] hidden lg:table-cell">Posted By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClaims.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          <TableCell className="text-[11px] py-2 whitespace-nowrap">
                            {formatDateTime(c.createdAt)}
                          </TableCell>
                          <TableCell className="py-2">
                            <p className="text-xs font-medium">{c.shopName}</p>
                            {c.shopArea && (
                              <p className="text-[10px] text-muted-foreground">{c.shopArea}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] py-2 hidden md:table-cell text-muted-foreground">
                            {c.orderbookerName}
                          </TableCell>
                          <TableCell className="text-[11px] py-2 text-right font-semibold text-red-600 dark:text-red-400">
                            {formatPKR(c.amount)}
                          </TableCell>
                          <TableCell className="text-[10px] py-2 hidden lg:table-cell text-muted-foreground">
                            {formatPKR(c.previousBalance)} → {formatPKR(c.newBalance)}
                          </TableCell>
                          <TableCell className="text-[10px] py-2 hidden md:table-cell max-w-[200px] truncate">
                            {c.description || '—'}
                          </TableCell>
                          <TableCell className="text-[10px] py-2 hidden lg:table-cell text-muted-foreground">
                            {c.creatorName || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <History className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No report generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Select company, date range, and click &quot;Generate Report&quot; to view claim history
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
