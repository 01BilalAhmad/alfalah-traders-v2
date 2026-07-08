'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Printer,
  Clock,
  HardDrive,
  Package,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import {
  downloadRecoveryReportPDF,
  downloadMonthlySummaryPDF,
  downloadShopListPDF,
  downloadOBPerformancePDF,
  type RecoveryReportData,
  type MonthlySummaryData,
  type ShopData,
  type OBPerformanceData,
} from '@/lib/report-generator';
import { getLocalDateString } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────

type ExportFormat = 'xlsx' | 'csv';

interface ExportOption {
  key: string;
  label: string;
  description: string;
  apiPath: string;
  icon: React.ReactNode;
}

interface RecentExport {
  id: string;
  label: string;
  format: string;
  timestamp: Date;
  fileSize: string;
  status: 'success' | 'error';
}

// ─── Constants ──────────────────────────────────────────────────────────

const EXPORT_OPTIONS: ExportOption[] = [
  {
    key: 'shops',
    label: 'Shops',
    description: 'All shops including inactive',
    apiPath: '/api/shops?includeInactive=true',
    icon: <Package className="h-4 w-4" />,
  },
  {
    key: 'orderbookers',
    label: 'Orderbookers',
    description: 'All orderbooker details',
    apiPath: '/api/orderbookers',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    description: 'Recent transactions (up to 10,000)',
    apiPath: '/api/transactions?limit=10000',
    icon: <FileDown className="h-4 w-4" />,
  },
  {
    key: 'monthlySummary',
    label: 'Monthly Summary',
    description: 'Current month summary data',
    apiPath: '/api/reports/monthly-summary',
    icon: <FileSpreadsheet className="h-4 w-4" />,
  },
  {
    key: 'recoveryReport',
    label: 'Recovery Report',
    description: "Today's recovery summary",
    apiPath: '/api/reports/recovery-summary',
    icon: <FileDown className="h-4 w-4" />,
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Skeleton ───────────────────────────────────────────────────────────

function ExportSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="skeleton-shimmer h-7 w-52 mb-1" />
        <Skeleton className="skeleton-shimmer h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="skeleton-shimmer h-5 w-5" />
                <Skeleton className="skeleton-shimmer h-4 w-32" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <Skeleton className="skeleton-shimmer h-5 w-40" />
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-5 w-full" />
            ))}
            <Skeleton className="skeleton-shimmer h-10 w-full" />
          </CardContent>
        </Card>
      </div>
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <Skeleton className="skeleton-shimmer h-5 w-48" />
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-shimmer h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function AdminExportData() {
  // Export selections
  const [selectedExports, setSelectedExports] = useState<Set<string>>(
    new Set(EXPORT_OPTIONS.map((o) => o.key))
  );
  const [format, setFormat] = useState<ExportFormat>('xlsx');

  // Loading state
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  // Quick print loading states
  const [printingRecovery, setPrintingRecovery] = useState(false);
  const [printingMonthly, setPrintingMonthly] = useState(false);
  const [printingShops, setPrintingShops] = useState(false);
  const [printingOB, setPrintingOB] = useState(false);

  // Recent exports (in-memory only)
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);

  // ─── Toggle Export Selection ──────────────────────────────────────
  const toggleExport = useCallback((key: string) => {
    setSelectedExports((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedExports(new Set(EXPORT_OPTIONS.map((o) => o.key)));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedExports(new Set());
  }, []);

  // ─── Generate XLSX / CSV Export ───────────────────────────────────
  const handleExport = useCallback(async () => {
    if (selectedExports.size === 0) {
      toast({ title: 'Nothing selected', description: 'Select at least one data type to export.', variant: 'destructive' });
      return;
    }

    setExporting(true);
    setProgress(0);
    setProgressLabel('Preparing...');

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const selected = EXPORT_OPTIONS.filter((o) => selectedExports.has(o.key));
      const totalSteps = selected.length;
      let completedSteps = 0;

      for (const option of selected) {
        setProgressLabel(`Fetching ${option.label}...`);
        setProgress(Math.round((completedSteps / totalSteps) * 100));

        let apiPath = option.apiPath;
        // Add date params for reports
        if (option.key === 'recoveryReport') {
          apiPath += `&date=${getLocalDateString()}`;
        } else if (option.key === 'monthlySummary') {
          apiPath += `&month=${getCurrentMonth()}`;
        }

        const res = await apiFetch(apiPath);
        if (!res.ok) {
          toast({ title: 'Fetch Error', description: `Failed to fetch ${option.label}`, variant: 'destructive' });
          continue;
        }
        const rawData = await res.json();

        // Convert data to sheet
        let sheetData: Record<string, unknown>[];

        try {
        switch (option.key) {
          case 'shops': {
            const shops = Array.isArray(rawData) ? rawData : [];
            sheetData = shops.map((s: ShopData) => ({
              Name: s.name || '',
              Owner: s.ownerName || '',
              Area: s.area || '',
              Route: Array.isArray(s.routeDays) ? s.routeDays.join(', ') : '',
              Orderbooker: s.orderbooker?.name || '',
              Balance: s.balance || 0,
              CreditLimit: s.creditLimit || 0,
              Status: s.status || '',
            }));
            break;
          }
          case 'orderbookers': {
            const obs = Array.isArray(rawData) ? rawData : [];
            sheetData = obs.map((ob: Record<string, unknown>) => ({
              Name: ob.name || '',
              Username: ob.username || '',
              Phone: ob.phone || '',
              Status: ob.status || '',
              TotalShops: ob.totalShops || 0,
              TotalOutstanding: ob.totalOutstanding || 0,
            }));
            break;
          }
          case 'transactions': {
            const txns = Array.isArray(rawData?.transactions) ? rawData.transactions : Array.isArray(rawData) ? rawData : [];
            sheetData = txns.map((t: Record<string, unknown>) => ({
              Date: t.createdAt ? new Date(t.createdAt as string).toLocaleString('en-PK') : '',
              Shop: (t.shop as Record<string, string>)?.name || '',
              Type: t.type || '',
              Amount: t.amount || 0,
              PreviousBalance: t.previousBalance || 0,
              NewBalance: t.newBalance || 0,
              Description: t.description || '',
              CreatedBy: (t.creator as Record<string, string>)?.name || '',
              Status: t.status || '',
            }));
            break;
          }
          case 'monthlySummary': {
            const ms = rawData as MonthlySummaryData;
            // OB breakdown sheet
            sheetData = (ms?.orderbookerBreakdown || []).map((ob) => ({
              OBName: ob.name,
              Shops: ob.shops,
              Credits: ob.credit,
              Recoveries: ob.recovery,
              Outstanding: ob.credit - ob.recovery,
            }));
            // Add daily breakdown as separate sheet
            if (ms?.dailyBreakdown?.length) {
              const dailyData = ms.dailyBreakdown.map((d) => ({
                Date: d.date,
                Credit: d.credit,
                Recovery: d.recovery,
                Net: d.net,
              }));
              const dailyWs = XLSX.utils.json_to_sheet(dailyData);
              XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Breakdown');
            }
            break;
          }
          case 'recoveryReport': {
            const rr = rawData as RecoveryReportData;
            sheetData = [];
            rr?.orderbookers?.forEach((ob) => {
              ob.shops.forEach((shop) => {
                sheetData.push({
                  Orderbooker: ob.orderbookerName,
                  Shop: shop.shopName,
                  Area: shop.shopArea || '',
                  PreviousBalance: shop.previousBalance,
                  TodayCredit: shop.todayCredit,
                  TodayRecovery: shop.todayRecovery,
                  ClosingBalance: shop.closingBalance,
                  Visited: shop.visited ? 'Yes' : 'No',
                });
              });
            });
            break;
          }
          default:
            sheetData = [];
        }
        } catch (mapErr) {
          console.error(`Error mapping ${option.label} data:`, mapErr);
          toast({ title: 'Mapping Error', description: `Failed to process ${option.label} data: ${mapErr instanceof Error ? mapErr.message : 'Unknown error'}`, variant: 'destructive' });
          continue;
        }

        if (format === 'xlsx') {
          const ws = XLSX.utils.json_to_sheet(sheetData);
          // Set column widths
          const colWidths = Object.keys(sheetData[0] || {}).map((key) => {
            const maxLen = Math.max(
              key.length,
              ...sheetData.map((row) => String(row[key] ?? '').length)
            );
            return { wch: Math.min(maxLen + 2, 40) };
          });
          ws['!cols'] = colWidths;

          // Sheet name must be <= 31 chars
          const sheetName = option.label.replace(/[/\\?*[\]]/g, '').slice(0, 31);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        } else {
          // CSV — download each as separate file
          if (sheetData.length > 0) {
            const csvWs = XLSX.utils.json_to_sheet(sheetData);
            const csvContent = XLSX.utils.sheet_to_csv(csvWs);
            const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Finexa_${option.key}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }
        }

        completedSteps++;
        setProgress(Math.round((completedSteps / totalSteps) * 100));
      }

      // Save XLSX workbook
      if (format === 'xlsx' && wb.SheetNames.length > 0) {
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Finexa_Export_${dateStr}.xlsx`);

        // Estimate file size (rough)
        const estimatedSize = wb.SheetNames.length * 15000;
        addRecentExport(`Finexa Export (${wb.SheetNames.length} sheets)`, 'XLSX', estimatedSize, 'success');
      } else if (format === 'csv') {
        addRecentExport(`${selectedExports.size} CSV files`, 'CSV', selectedExports.size * 5000, 'success');
      }

      toast({
        title: 'Export Complete',
        description: format === 'xlsx'
          ? `${wb.SheetNames.length} sheets exported to Excel`
          : `${selectedExports.size} CSV files downloaded`,
      });
    } catch (err) {
      toast({ title: 'Export Failed', description: 'An error occurred during export. Please try again.', variant: 'destructive' });
      addRecentExport('Export attempt', format.toUpperCase(), 0, 'error');
    } finally {
      setExporting(false);
      setProgress(0);
      setProgressLabel('');
    }
  }, [selectedExports, format]);

  // ─── Quick Print PDF Handlers ─────────────────────────────────────

  const handlePrintRecovery = useCallback(async () => {
    setPrintingRecovery(true);
    try {
      const res = await apiFetch(`/api/reports/recovery-summary?date=${getLocalDateString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: RecoveryReportData = await res.json();
      downloadRecoveryReportPDF(data);
      addRecentExport('Recovery Report PDF', 'PDF', 45000, 'success');
      toast({ title: 'PDF Downloaded', description: 'Recovery Report saved as PDF' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate Recovery Report PDF', variant: 'destructive' });
      addRecentExport('Recovery Report PDF', 'PDF', 0, 'error');
    } finally {
      setPrintingRecovery(false);
    }
  }, []);

  const handlePrintMonthly = useCallback(async () => {
    setPrintingMonthly(true);
    try {
      const res = await apiFetch(`/api/reports/monthly-summary?month=${getCurrentMonth()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: MonthlySummaryData = await res.json();
      downloadMonthlySummaryPDF(data);
      addRecentExport('Monthly Summary PDF', 'PDF', 55000, 'success');
      toast({ title: 'PDF Downloaded', description: 'Monthly Summary saved as PDF' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate Monthly Summary PDF', variant: 'destructive' });
      addRecentExport('Monthly Summary PDF', 'PDF', 0, 'error');
    } finally {
      setPrintingMonthly(false);
    }
  }, []);

  const handlePrintShops = useCallback(async () => {
    setPrintingShops(true);
    try {
      const res = await apiFetch('/api/shops?includeInactive=true');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: ShopData[] = await res.json();
      downloadShopListPDF(data);
      addRecentExport('Shop List PDF', 'PDF', 35000, 'success');
      toast({ title: 'PDF Downloaded', description: 'Shop List saved as PDF' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate Shop List PDF', variant: 'destructive' });
      addRecentExport('Shop List PDF', 'PDF', 0, 'error');
    } finally {
      setPrintingShops(false);
    }
  }, []);

  const handlePrintOB = useCallback(async () => {
    setPrintingOB(true);
    try {
      const res = await apiFetch('/api/reports/ob-performance?period=month');
      if (!res.ok) throw new Error('Failed to fetch');
      const data: OBPerformanceData[] = await res.json();
      downloadOBPerformancePDF(data);
      addRecentExport('OB Performance PDF', 'PDF', 40000, 'success');
      toast({ title: 'PDF Downloaded', description: 'OB Performance saved as PDF' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate OB Performance PDF', variant: 'destructive' });
      addRecentExport('OB Performance PDF', 'PDF', 0, 'error');
    } finally {
      setPrintingOB(false);
    }
  }, []);

  // ─── Recent Exports Helper ────────────────────────────────────────
  const addRecentExport = (label: string, formatStr: string, fileSize: number, status: 'success' | 'error') => {
    setRecentExports((prev) => [
      {
        id: `export-${Date.now()}`,
        label,
        format: formatStr,
        timestamp: new Date(),
        fileSize: formatBytes(fileSize),
        status,
      },
      ...prev,
    ].slice(0, 8));
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Page Title */}
      <div className="animate-fade-in">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Download className="h-5 w-5 text-primary" />
          Export & Reports
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Export data to Excel/CSV or generate printable PDF reports
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ─── Export Options Card ─── */}
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Data to Export
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-[10px] font-medium text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-muted-foreground/40">|</span>
                <button
                  onClick={deselectAll}
                  className="text-[10px] font-medium text-muted-foreground hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {EXPORT_OPTIONS.map((option) => {
              const checked = selectedExports.has(option.key);
              return (
                <div
                  key={option.key}
                  className={`flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                    checked ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 border border-transparent'
                  }`}
                >
                  <Checkbox
                    id={`export-${option.key}`}
                    checked={checked}
                    onCheckedChange={() => toggleExport(option.key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`export-${option.key}`}
                      className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                    >
                      {option.icon}
                      {option.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ─── Format & Export Button Card ─── */}
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileDown className="h-4 w-4 text-primary" />
              Export Format
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-5">
            <RadioGroup value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <div className="space-y-3">
                {/* XLSX Option */}
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                    format === 'xlsx' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 border border-transparent'
                  }`}
                  onClick={() => setFormat('xlsx')}
                >
                  <RadioGroupItem value="xlsx" id="format-xlsx" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="format-xlsx" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      Excel (.xlsx)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      All selected data in one workbook with separate sheets
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    Recommended
                  </Badge>
                </div>

                {/* CSV Option */}
                <div
                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                    format === 'csv' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 border border-transparent'
                  }`}
                  onClick={() => setFormat('csv')}
                >
                  <RadioGroupItem value="csv" id="format-csv" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="format-csv" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      CSV (.csv)
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Each data type as a separate CSV file
                    </p>
                  </div>
                </div>
              </div>
            </RadioGroup>

            {/* Progress Bar */}
            {exporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{progressLabel}</span>
                  <span className="font-semibold text-primary">{progress}%</span>
                </div>
                <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Export Button */}
            <Button
            type="button"
              onClick={handleExport}
              disabled={exporting || selectedExports.size === 0}
              className="w-full bg-primary hover:bg-primary/90 text-white h-11 text-sm font-semibold "
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting... {progress}%
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {selectedExports.size} Data {selectedExports.size === 1 ? 'Type' : 'Types'} as {format.toUpperCase()}
                </>
              )}
            </Button>

            {selectedExports.size === 0 && (
              <p className="text-xs text-center text-slate-600 dark:text-slate-400 flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Select at least one data type to export
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Quick Print PDF Reports ─── */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              Quick Print PDF Reports
            </CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              One-click download
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Generate professional print-ready PDF reports instantly
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Recovery Report */}
            <button
              onClick={handlePrintRecovery}
              disabled={printingRecovery}
              className="group relative p-4 rounded-xl border border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                <FileDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-foreground">Recovery Report</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Today&apos;s recovery summary</p>
              {printingRecovery && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-600 dark:text-slate-300" />
                </div>
              )}
            </button>

            {/* Monthly Summary */}
            <button
              onClick={handlePrintMonthly}
              disabled={printingMonthly}
              className="group relative p-4 rounded-xl border border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                <FileDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-foreground">Monthly Summary</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Monthly breakdown &amp; OB stats</p>
              {printingMonthly && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-600 dark:text-slate-300" />
                </div>
              )}
            </button>

            {/* Shop List */}
            <button
              onClick={handlePrintShops}
              disabled={printingShops}
              className="group relative p-4 rounded-xl border border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                <FileDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-foreground">Shop List</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Complete shop directory</p>
              {printingShops && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-600 dark:text-slate-300" />
                </div>
              )}
            </button>

            {/* OB Performance */}
            <button
              onClick={handlePrintOB}
              disabled={printingOB}
              className="group relative p-4 rounded-xl border border-border hover:border-slate-300 dark:hover:border-slate-700 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all text-left disabled:opacity-50"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform">
                <FileDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-foreground">OB Performance</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Rankings &amp; recovery rates</p>
              {printingOB && (
                <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-600 dark:text-slate-300" />
                </div>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Recent Exports ─── */}
      {recentExports.length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Recent Exports
              </CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                This session
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 p-0">
            <div className="divide-y divide-border">
              {recentExports.map((exp) => (
                <div
                  key={exp.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {exp.status === 'success' ? (
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{exp.label}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                        <span>{exp.timestamp.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {exp.fileSize}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      exp.format === 'PDF'
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                        : exp.format === 'XLSX'
                          ? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {exp.format}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
