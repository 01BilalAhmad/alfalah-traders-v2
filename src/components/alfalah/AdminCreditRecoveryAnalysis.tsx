'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, FileSpreadsheet, FileText, Loader2, Search, BarChart3, Calendar, Building2, Users, PieChart,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DailyRow {
  date: string; label: string; credit: number; recovery: number;
  cumulativeCredit: number; cumulativeRecovery: number; net: number;
}
interface OBBreakdownRow {
  orderbookerId: string; orderbookerName: string; totalCredit: number;
  totalRecovery: number; net: number; shopCount: number;
  dailyData: { date: string; credit: number; recovery: number }[];
}
interface AnalysisResponse {
  period: { startDate: string; endDate: string };
  company: { id: string; name: string };
  orderbookerFilter: string;
  dailyData: DailyRow[];
  obBreakdown: OBBreakdownRow[];
  summary: {
    totalCredit: number; totalRecovery: number; netPosition: number;
    recoveryRate: number; daysWithData: number; totalDays: number;
    avgCreditPerDay: number; avgRecoveryPerDay: number;
  };
}
interface Orderbooker { id: string; name: string; phone: string | null; status: string; }
interface Company { id: string; name: string; status: string; }

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function getMonthStartString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}
function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
}
function formatNumberShort(value: number): string {
  if (Math.abs(value) >= 10000000) return `${(value / 10000000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(2)}L`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}
function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AdminCreditRecoveryAnalysis() {
  const [filterCompany, setFilterCompany] = useState<string>('');
  const [filterOB, setFilterOB] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(getMonthStartString());
  const [endDate, setEndDate] = useState<string>(getTodayDateString());
  const [viewMode, setViewMode] = useState<'daily' | 'cumulative'>('daily');
  const [chartType, setChartType] = useState<'both' | 'credit' | 'recovery'>('both');
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const obChartRef = useRef<HTMLDivElement>(null);

  useMemo(() => {
    (async () => {
      try {
        const [compRes, obRes] = await Promise.all([
          apiFetch('/api/companies?status=active'),
          apiFetch('/api/orderbookers?status=active'),
        ]);
        if (compRes.ok) { const cData = await compRes.json(); setCompanies(cData.companies || []); }
        if (obRes.ok) { const oData = await obRes.json(); setOrderbookers(Array.isArray(oData) ? oData : []); }
      } catch (e) { console.error('Failed to fetch filters:', e); }
    })();
  }, []);

  const generateReport = useCallback(async () => {
    if (!filterCompany) { toast({ title: 'Company Required', description: 'Please select a company.', variant: 'destructive' }); return; }
    if (!startDate || !endDate) { toast({ title: 'Date Range Required', description: 'Please select both dates.', variant: 'destructive' }); return; }
    if (startDate > endDate) { toast({ title: 'Invalid Range', description: 'Start date cannot be after end date.', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId: filterCompany, orderbookerId: filterOB, startDate, endDate });
      const res = await apiFetch(`/api/reports/credit-recovery-analysis?${params}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to generate analysis'); }
      const result: AnalysisResponse = await res.json();
      setData(result);
      toast({ title: 'Analysis Generated', description: `${result.summary.totalDays} days • ${result.summary.daysWithData} active days` });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to generate analysis', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [filterCompany, filterOB, startDate, endDate]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.dailyData.map((d) => ({
      label: d.label,
      Credit: viewMode === 'cumulative' ? d.cumulativeCredit : d.credit,
      Recovery: viewMode === 'cumulative' ? d.cumulativeRecovery : d.recovery,
    }));
  }, [data, viewMode]);

  const exportExcel = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const dailySheet = data.dailyData.map((d) => ({
        'Date': formatDateLong(d.date), 'Credit (Rs.)': d.credit, 'Recovery (Rs.)': d.recovery,
        'Cumulative Credit': d.cumulativeCredit, 'Cumulative Recovery': d.cumulativeRecovery, 'Net Position': d.net,
      }));
      const ws1 = XLSX.utils.json_to_sheet(dailySheet);
      ws1['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Daily Data');
      const obSheet = data.obBreakdown.map((ob, i) => ({
        '#': i + 1, 'Orderbooker': ob.orderbookerName, 'Total Credit (Rs.)': ob.totalCredit,
        'Total Recovery (Rs.)': ob.totalRecovery, 'Net Position (Rs.)': ob.net, 'Shops Count': ob.shopCount,
      }));
      const ws2 = XLSX.utils.json_to_sheet(obSheet);
      ws2['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'OB Breakdown');
      const summarySheet = [
        { Metric: 'Company', Value: data.company.name },
        { Metric: 'Period Start', Value: formatDateLong(data.period.startDate) },
        { Metric: 'Period End', Value: formatDateLong(data.period.endDate) },
        { Metric: 'Total Days', Value: data.summary.totalDays },
        { Metric: 'Active Days', Value: data.summary.daysWithData },
        { Metric: 'Total Credit (Rs.)', Value: data.summary.totalCredit },
        { Metric: 'Total Recovery (Rs.)', Value: data.summary.totalRecovery },
        { Metric: 'Net Position (Rs.)', Value: data.summary.netPosition },
        { Metric: 'Recovery Rate (%)', Value: data.summary.recoveryRate },
      ];
      const ws3 = XLSX.utils.json_to_sheet(summarySheet);
      ws3['!cols'] = [{ wch: 30 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Summary');
      XLSX.writeFile(wb, `Credit_Recovery_Analysis_${data.period.startDate}_to_${data.period.endDate}.xlsx`);
      toast({ title: 'Excel Downloaded' });
    } catch (err) { toast({ title: 'Export Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }); }
    finally { setExporting(false); }
  }, [data]);

  const exportPDF = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      let lineChartImg: string | null = null;
      let obChartImg: string | null = null;
      try {
        const html2canvas = (await import('html2canvas')).default;
        
        // Helper function to capture chart with retries
        const captureChart = async (ref: React.RefObject<HTMLDivElement>, retries = 3): Promise<string | null> => {
          for (let i = 0; i < retries; i++) {
            try {
              if (!ref.current) return null;
              // Wait for chart to render
              await new Promise(r => setTimeout(r, 500 + i * 200));
              const canvas = await html2canvas(ref.current, {
                scale: 2,
                backgroundColor: '#FFFFFF',
                logging: false,
                useCORS: true,
                allowTaint: true,
                foreignObjectRendering: false,
              });
              if (canvas && canvas.width > 0 && canvas.height > 0) {
                return canvas.toDataURL('image/png');
              }
            } catch (e) {
              console.warn(`Chart capture attempt ${i + 1} failed:`, e);
            }
          }
          return null;
        };

        lineChartImg = await captureChart(lineChartRef);
        if (data.obBreakdown.length > 0) {
          obChartImg = await captureChart(obChartRef);
        }
      } catch (chartErr) { console.warn('Chart capture failed:', chartErr); }

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFillColor(30, 64, 175); doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('CREDIT vs RECOVERY', pageWidth / 2, 16, { align: 'center' });
      doc.setFontSize(14); doc.text('ANALYSIS REPORT', pageWidth / 2, 26, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`${data.company.name}`, pageWidth / 2, 33, { align: 'center' });
      doc.setTextColor(15, 23, 42); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text(`Date: ${formatDateLong(data.period.startDate)}  to  ${formatDateLong(data.period.endDate)}`, 14, 48);

      const cardY = 54, cardW = (pageWidth - 28 - 8) / 3, cardH = 22;
      doc.setFillColor(219, 234, 254); doc.roundedRect(14, cardY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(30, 64, 175); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('TOTAL CREDIT', 14 + cardW / 2, cardY + 7, { align: 'center' });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text(`Rs. ${data.summary.totalCredit.toLocaleString('en-PK')}`, 14 + cardW / 2, cardY + 15, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.summary.totalCredit.toLocaleString('en-PK')}`, 14 + cardW / 2, cardY + 20, { align: 'center' });
      doc.setFillColor(209, 250, 229); doc.roundedRect(14 + cardW + 4, cardY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(5, 150, 105); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('TOTAL RECOVERY', 14 + cardW + 4 + cardW / 2, cardY + 7, { align: 'center' });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text(`Rs. ${data.summary.totalRecovery.toLocaleString('en-PK')}`, 14 + cardW + 4 + cardW / 2, cardY + 15, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`${data.summary.totalRecovery.toLocaleString('en-PK')}`, 14 + cardW + 4 + cardW / 2, cardY + 20, { align: 'center' });
      doc.setFillColor(254, 243, 199); doc.roundedRect(14 + (cardW + 4) * 2, cardY, cardW, cardH, 2, 2, 'F');
      doc.setTextColor(180, 83, 9); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text('RECOVERY RATE', 14 + (cardW + 4) * 2 + cardW / 2, cardY + 7, { align: 'center' });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text(`${data.summary.recoveryRate}%`, 14 + (cardW + 4) * 2 + cardW / 2, cardY + 15, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(`Net: Rs. ${data.summary.netPosition.toLocaleString('en-PK')}`, 14 + (cardW + 4) * 2 + cardW / 2, cardY + 20, { align: 'center' });

      const statsY = cardY + cardH + 6;
      doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Active Days: ${data.summary.daysWithData} of ${data.summary.totalDays}`, 14, statsY);
      doc.text(`Avg Credit/Day: Rs. ${data.summary.avgCreditPerDay.toLocaleString('en-PK')}`, 14, statsY + 5);
      doc.text(`Avg Recovery/Day: Rs. ${data.summary.avgRecoveryPerDay.toLocaleString('en-PK')}`, 14, statsY + 10);

      let yPos = statsY + 18;
      if (lineChartImg) {
        if (yPos > pageHeight - 100) { doc.addPage(); yPos = 14; }
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
        doc.text(`${viewMode === 'cumulative' ? 'Cumulative' : 'Daily'} Trend — Credit vs Recovery`, 14, yPos); yPos += 4;
        const imgWidth = pageWidth - 28, imgHeight = (imgWidth * 200) / 600;
        try { doc.addImage(lineChartImg, 'PNG', 14, yPos, imgWidth, imgHeight); yPos += imgHeight + 8; } catch (e) { console.warn(e); }
      }
      if (obChartImg && data.obBreakdown.length > 0) {
        if (yPos > pageHeight - 90) { doc.addPage(); yPos = 14; }
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
        doc.text('Orderbooker-wise Breakdown', 14, yPos); yPos += 4;
        const imgWidth = pageWidth - 28, imgHeight = (imgWidth * 160) / 600;
        try { doc.addImage(obChartImg, 'PNG', 14, yPos, imgWidth, imgHeight); yPos += imgHeight + 8; } catch (e) { console.warn(e); }
      }
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 14; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Daily Breakdown', 14, yPos); yPos += 4;
      autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Credit (Rs.)', 'Recovery (Rs.)', 'Cum. Credit', 'Cum. Recovery', 'Net (Rs.)']],
        body: data.dailyData.filter((d) => d.credit > 0 || d.recovery > 0).map((d) => [
          formatDateLong(d.date), d.credit > 0 ? d.credit.toLocaleString('en-PK') : '—',
          d.recovery > 0 ? d.recovery.toLocaleString('en-PK') : '—',
          d.cumulativeCredit.toLocaleString('en-PK'), d.cumulativeRecovery.toLocaleString('en-PK'),
          d.net.toLocaleString('en-PK'),
        ]),
        foot: [['TOTAL', `${data.summary.totalCredit.toLocaleString('en-PK')}`, `${data.summary.totalRecovery.toLocaleString('en-PK')}`, '', '', `${data.summary.netPosition.toLocaleString('en-PK')}`]],
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 8 },
        footStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right', textColor: [30, 64, 175] }, 2: { halign: 'right', textColor: [5, 150, 105] } },
        margin: { left: 14, right: 14 },
      });

      let yPos2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      if (yPos2 > pageHeight - 60) { doc.addPage(); yPos2 = 14; }
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 64, 175);
      doc.text('Orderbooker Breakdown', 14, yPos2); yPos2 += 4;
      autoTable(doc, {
        startY: yPos2,
        head: [['#', 'Orderbooker Name', 'Credit (Rs.)', 'Recovery (Rs.)', 'Net (Rs.)']],
        body: data.obBreakdown.map((ob, i) => [String(i + 1), ob.orderbookerName, ob.totalCredit.toLocaleString('en-PK'), ob.totalRecovery.toLocaleString('en-PK'), ob.net.toLocaleString('en-PK')]),
        foot: [['', 'TOTAL', `${data.summary.totalCredit.toLocaleString('en-PK')}`, `${data.summary.totalRecovery.toLocaleString('en-PK')}`, `${data.summary.netPosition.toLocaleString('en-PK')}`]],
        theme: 'striped',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        footStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontSize: 9, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right', textColor: [30, 64, 175] }, 3: { halign: 'right', textColor: [5, 150, 105] }, 4: { halign: 'right' } },
        margin: { left: 14, right: 14 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
        doc.text(`Page ${i} of ${pageCount}  •  Generated: ${new Date().toLocaleString('en-PK')}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
      }
      doc.save(`Credit_Recovery_Analysis_${data.period.startDate}_to_${data.period.endDate}.pdf`);
      toast({ title: 'PDF Downloaded' });
    } catch (err) { toast({ title: 'PDF Export Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' }); }
    finally { setExporting(false); }
  }, [data, viewMode]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-blue-600" />
          Credit vs Recovery Analysis
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Date-range analysis with company & orderbooker filters</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-primary" />Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Building2 className="h-3 w-3 inline mr-1" />Company <span className="text-destructive">*</span></Label>
              <Select value={filterCompany} onValueChange={setFilterCompany}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select company..." /></SelectTrigger>
                <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Users className="h-3 w-3 inline mr-1" />Orderbooker</Label>
              <Select value={filterOB} onValueChange={setFilterOB}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All orderbookers" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Orderbookers</SelectItem>{orderbookers.map((ob) => <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Calendar className="h-3 w-3 inline mr-1" />Start Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium"><Calendar className="h-3 w-3 inline mr-1" />End Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">View:</Label>
              <div className="flex bg-muted rounded-md p-0.5">
                <button onClick={() => setViewMode('daily')} className={`px-3 py-1 text-xs rounded ${viewMode === 'daily' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Daily</button>
                <button onClick={() => setViewMode('cumulative')} className={`px-3 py-1 text-xs rounded ${viewMode === 'cumulative' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Cumulative</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Show:</Label>
              <div className="flex bg-muted rounded-md p-0.5">
                <button onClick={() => setChartType('both')} className={`px-3 py-1 text-xs rounded ${chartType === 'both' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Both</button>
                <button onClick={() => setChartType('credit')} className={`px-3 py-1 text-xs rounded ${chartType === 'credit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Credit</button>
                <button onClick={() => setChartType('recovery')} className={`px-3 py-1 text-xs rounded ${chartType === 'recovery' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Recovery</button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button onClick={generateReport} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              {loading ? 'Generating...' : 'Generate Analysis'}
            </Button>
            {data && (
              <>
                <Button variant="outline" onClick={exportExcel} disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-600" />}Excel
                </Button>
                <Button variant="outline" onClick={exportPDF} disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2 text-red-600" />}PDF
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="card-elevated border-blue-200 dark:border-blue-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Total Credit</p><p className="text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatPKR(data.summary.totalCredit)}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-blue-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated border-emerald-200 dark:border-emerald-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Total Recovery</p><p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatPKR(data.summary.totalRecovery)}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center"><TrendingDown className="h-4 w-4 text-emerald-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated border-amber-200 dark:border-amber-900">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Recovery Rate</p><p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{data.summary.recoveryRate}%</p></div>
                  <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center"><PieChart className="h-4 w-4 text-amber-500" /></div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-elevated">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-[10px] uppercase text-muted-foreground font-medium">Net Position</p><p className={`text-xl font-bold tabular-nums ${data.summary.netPosition >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatPKR(data.summary.netPosition)}</p></div>
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Wallet className="h-4 w-4 text-muted-foreground" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />{viewMode === 'cumulative' ? 'Cumulative Trend' : 'Daily Trend'} — Credit vs Recovery</CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={lineChartRef} className="h-80 bg-white p-2 rounded-lg" style={{ backgroundColor: '#FFFFFF' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => formatNumberShort(v)} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} formatter={(value: number, name: string) => [`Rs. ${value.toLocaleString('en-PK')}`, name]} />
                    <Legend verticalAlign="top" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                    {(chartType === 'both' || chartType === 'credit') && <Line yAxisId={0} type="monotone" dataKey="Credit" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3, fill: '#2563EB' }} activeDot={{ r: 5 }} isAnimationActive />}
                    {(chartType === 'both' || chartType === 'recovery') && <Line yAxisId={0} type="monotone" dataKey="Recovery" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: '#10B981' }} activeDot={{ r: 5 }} isAnimationActive />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {data.obBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Orderbooker-wise Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div ref={obChartRef} className="h-64 bg-white p-2 rounded-lg" style={{ backgroundColor: '#FFFFFF' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.obBreakdown.map((ob) => ({ name: ob.orderbookerName, Credit: ob.totalCredit, Recovery: ob.totalRecovery }))} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => formatNumberShort(v)} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '12px' }} formatter={(value: number, name: string) => [`Rs. ${value.toLocaleString('en-PK')}`, name]} />
                      <Legend verticalAlign="top" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="Credit" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={48} />
                      <Bar dataKey="Recovery" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />Daily Breakdown<Badge variant="secondary">{data.summary.daysWithData} active days</Badge></CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                      <TableHead className="text-xs text-right">Recovery</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Cum. Credit</TableHead>
                      <TableHead className="text-xs text-right hidden md:table-cell">Cum. Recovery</TableHead>
                      <TableHead className="text-xs text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.dailyData.filter((d) => d.credit > 0 || d.recovery > 0).map((d) => (
                      <TableRow key={d.date} className="hover:bg-muted/30">
                        <TableCell className="text-xs py-2">{formatDateLong(d.date)}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{d.credit > 0 ? formatPKR(d.credit) : '—'}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{d.recovery > 0 ? formatPKR(d.recovery) : '—'}</TableCell>
                        <TableCell className="text-xs py-2 text-right text-muted-foreground hidden md:table-cell">{formatPKR(d.cumulativeCredit)}</TableCell>
                        <TableCell className="text-xs py-2 text-right text-muted-foreground hidden md:table-cell">{formatPKR(d.cumulativeRecovery)}</TableCell>
                        <TableCell className={`text-xs py-2 text-right font-semibold ${d.net >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatPKR(d.net)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-primary/30 bg-primary/5">
                      <TableCell className="text-xs py-2 font-bold">TOTAL</TableCell>
                      <TableCell className="text-xs py-2 text-right font-bold text-blue-600 dark:text-blue-400">{formatPKR(data.summary.totalCredit)}</TableCell>
                      <TableCell className="text-xs py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatPKR(data.summary.totalRecovery)}</TableCell>
                      <TableCell className="text-xs py-2 text-right hidden md:table-cell">—</TableCell>
                      <TableCell className="text-xs py-2 text-right hidden md:table-cell">—</TableCell>
                      <TableCell className={`text-xs py-2 text-right font-bold ${data.summary.netPosition >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatPKR(data.summary.netPosition)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {data.obBreakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Orderbooker Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Orderbooker</TableHead>
                      <TableHead className="text-xs text-right">Credit</TableHead>
                      <TableHead className="text-xs text-right">Recovery</TableHead>
                      <TableHead className="text-xs text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.obBreakdown.map((ob, i) => (
                      <TableRow key={ob.orderbookerId} className="hover:bg-muted/30">
                        <TableCell className="text-xs py-2">{i + 1}</TableCell>
                        <TableCell className="text-xs py-2 font-medium">{ob.orderbookerName}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-semibold text-blue-600 dark:text-blue-400">{formatPKR(ob.totalCredit)}</TableCell>
                        <TableCell className="text-xs py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatPKR(ob.totalRecovery)}</TableCell>
                        <TableCell className={`text-xs py-2 text-right font-semibold ${ob.net >= 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatPKR(ob.net)}</TableCell>
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
            <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <BarChart3 className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No analysis generated yet</p>
            <p className="text-xs text-muted-foreground mt-1">Select company, date range, and click &quot;Generate Analysis&quot;</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
