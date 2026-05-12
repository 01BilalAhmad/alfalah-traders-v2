'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { getLocalDateString, formatPKR } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  FileText,
  Loader2,
  CalendarDays,
  Banknote,
  Printer,
  Download,
  User,
  Store,
  CheckCircle,
  TrendingDown,
  Scale,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

function formatCurrencyPDF(amount: number): string {
  return amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface RecoveryEntry {
  id: string;
  amount: number;
  time: string;
  description: string | null;
  hasGps: boolean;
}

interface ShopRecovery {
  shopId: string;
  shopName: string;
  shopArea: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
  visited: boolean;
  recoveryEntries: RecoveryEntry[];
}

interface OrderbookerRecovery {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  shops: ShopRecovery[];
}

interface OrderbookerOption {
  id: string;
  name: string;
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Skeleton className="skeleton-shimmer h-7 w-56" />
        <div className="flex gap-2">
          <Skeleton className="skeleton-shimmer h-9 w-44" />
          <Skeleton className="skeleton-shimmer h-9 w-36" />
        </div>
      </div>
      <Skeleton className="skeleton-shimmer h-24 w-full" />
      <Skeleton className="skeleton-shimmer h-64 w-full" />
    </div>
  );
}

export default function AdminOBRecoveryReport() {
  const { selectedDate, setSelectedDate } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<OrderbookerOption[]>([]);
  const [selectedOB, setSelectedOB] = useState<string>('');
  const [reportData, setReportData] = useState<OrderbookerRecovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [obLoading, setObLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  // Fetch orderbookers list
  useEffect(() => {
    async function fetchOBs() {
      setObLoading(true);
      try {
        const res = await apiFetch('/api/orderbookers');
        if (res.ok) {
          const data = await res.json();
          const obs = Array.isArray(data) ? data : data.orderbookers || [];
          setOrderbookers(obs.filter((ob: any) => ob.status === 'active'));
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load orderbookers', variant: 'destructive' });
      } finally {
        setObLoading(false);
      }
    }
    fetchOBs();
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async () => {
    if (!selectedOB) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/reports/recovery-summary?date=${selectedDate}`);
      if (res.ok) {
        const data = await res.json();
        const obData = data.orderbookers?.find(
          (ob: OrderbookerRecovery) => ob.orderbookerId === selectedOB
        );
        if (obData) {
          setReportData(obData);
        } else {
          // OB found but no recovery data for this date
          const obInfo = orderbookers.find((ob) => ob.id === selectedOB);
          setReportData({
            orderbookerId: selectedOB,
            orderbookerName: obInfo?.name || 'Unknown',
            orderbookerPhone: null,
            totalRecovery: 0,
            totalShops: 0,
            visitedShops: 0,
            shops: [],
          });
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOB, selectedDate, orderbookers]);

  useEffect(() => {
    if (selectedOB) fetchReport();
  }, [fetchReport]);

  // Filter shops with recovery only
  const recoveryShops = reportData
    ? reportData.shops.filter((s) => s.todayRecovery > 0)
    : [];

  // Calculate route totals from ALL shops (not just recovery shops)
  const routeTotalBalance = reportData
    ? reportData.shops.reduce((sum, s) => sum + s.previousBalance, 0)
    : 0;
  const todayRecovery = reportData?.totalRecovery || 0;
  const remainingBalance = routeTotalBalance - todayRecovery;

  // Generate PDF
  const generatePDF = useCallback(() => {
    if (!reportData) return;

    const dateFormatted = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const now = new Date().toLocaleString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Error', description: 'Please allow popups to generate PDF', variant: 'destructive' });
      return;
    }

    const shopRows = recoveryShops.map((shop, idx) => `
      <tr class="${idx % 2 === 0 ? 'even-row' : 'odd-row'}">
        <td class="center">${idx + 1}</td>
        <td><strong>${shop.shopName}</strong></td>
        <td>${shop.shopArea || '\u2014'}</td>
        <td class="right">${formatCurrencyPDF(shop.previousBalance)}</td>
        <td class="right">${shop.todayCredit > 0 ? formatCurrencyPDF(shop.todayCredit) : '\u2014'}</td>
        <td class="right bold green">${formatCurrencyPDF(shop.todayRecovery)}</td>
        <td class="right">${formatCurrencyPDF(shop.closingBalance)}</td>
      </tr>
    `).join('');

    const totalRecoveryShops = recoveryShops.length;
    const totalCredit = recoveryShops.reduce((s, sh) => s + sh.todayCredit, 0);
    const totalRecovery = recoveryShops.reduce((s, sh) => s + sh.todayRecovery, 0);
    const totalClosing = recoveryShops.reduce((s, sh) => s + sh.closingBalance, 0);
    const totalPrevBalance = recoveryShops.reduce((s, sh) => s + sh.previousBalance, 0);

    // Route totals from ALL shops (not just recovery shops)
    const allShopsRouteBalance = reportData.shops.reduce((s, sh) => s + sh.previousBalance, 0);
    const allShopsTotalRecovery = reportData.totalRecovery;
    const allShopsRemaining = allShopsRouteBalance - allShopsTotalRecovery;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Recovery Report - ${reportData.orderbookerName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; color: #1a1a1a; padding: 20px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 3px double #333; padding-bottom: 15px; }
    .company-name { font-size: 22px; font-weight: bold; letter-spacing: 1px; color: #0d5c3e; }
    .company-sub { font-size: 11px; color: #666; margin-top: 2px; }
    .report-title { font-size: 16px; font-weight: bold; margin-top: 10px; color: #333; background: #f0f7f4; padding: 6px 15px; display: inline-block; border-radius: 4px; }
    .info-row { display: flex; justify-content: space-between; margin-top: 12px; font-size: 12px; }
    .info-item { display: flex; gap: 5px; }
    .info-label { font-weight: 600; color: #555; }
    .info-value { color: #000; }
    .summary-cards { display: flex; gap: 15px; margin: 15px 0; justify-content: center; }
    .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 20px; text-align: center; min-width: 140px; }
    .summary-card .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 18px; font-weight: bold; margin-top: 3px; }
    .summary-card.green .value { color: #0d7a4f; }
    .summary-card.blue .value { color: #1a56db; }
    .summary-card.amber .value { color: #b45309; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
    th { background: #0d5c3e; color: white; padding: 8px 6px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
    td { padding: 7px 6px; border-bottom: 1px solid #e5e5e5; }
    .even-row { background: #fafafa; }
    .odd-row { background: #fff; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .green { color: #0d7a4f; }
    .total-row { background: #f0f7f4 !important; font-weight: 700; border-top: 2px solid #0d5c3e; }
    .total-row td { padding: 10px 6px; font-size: 12px; }
    .footer { margin-top: 25px; padding-top: 10px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
    .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
    .signature-box { text-align: center; width: 200px; }
    .signature-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 5px; font-size: 11px; }
    .no-data { text-align: center; padding: 40px; color: #888; font-size: 14px; }
    @media print {
      body { padding: 10px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">AL-FALAH TRADERS</div>
    <div class="company-sub">Credit & Route Management System</div>
    <div class="report-title">DAILY RECOVERY REPORT</div>
    <div class="info-row">
      <div class="info-item">
        <span class="info-label">Order Booker:</span>
        <span class="info-value">${reportData.orderbookerName}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Date:</span>
        <span class="info-value">${dateFormatted}</span>
      </div>
    </div>
    ${reportData.orderbookerPhone ? `<div class="info-row"><div class="info-item"><span class="info-label">Phone:</span><span class="info-value">${reportData.orderbookerPhone}</span></div></div>` : ''}
  </div>

  <div class="summary-cards">
    <div class="summary-card blue">
      <div class="label">Route Total Balance</div>
      <div class="value">${formatCurrencyPDF(allShopsRouteBalance)}</div>
    </div>
    <div class="summary-card green">
      <div class="label">Today's Recovery</div>
      <div class="value">${formatCurrencyPDF(allShopsTotalRecovery)}</div>
    </div>
    <div class="summary-card amber">
      <div class="label">Remaining Balance</div>
      <div class="value">${formatCurrencyPDF(allShopsRemaining)}</div>
    </div>
  </div>

  ${totalRecoveryShops > 0 ? `
  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Shop Name</th>
        <th>Area</th>
        <th style="text-align:right">Prev. Balance</th>
        <th style="text-align:right">Credit</th>
        <th style="text-align:right">Recovery</th>
        <th style="text-align:right">Closing Balance</th>
      </tr>
    </thead>
    <tbody>
      ${shopRows}
      <tr class="total-row">
        <td colspan="3" style="text-align:right">TOTAL</td>
        <td class="right">${formatCurrencyPDF(totalPrevBalance)}</td>
        <td class="right">${totalCredit > 0 ? formatCurrencyPDF(totalCredit) : '\u2014'}</td>
        <td class="right green">${formatCurrencyPDF(totalRecovery)}</td>
        <td class="right">${formatCurrencyPDF(totalClosing)}</td>
      </tr>
    </tbody>
  </table>
  ` : `
  <div class="no-data">No recovery data found for this date.</div>
  `}

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-line">Order Booker Signature</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Admin Signature</div>
    </div>
  </div>

  <div class="footer">
    <span>Generated: ${now}</span>
    <span>Al-Falah Traders - Recovery Report</span>
  </div>

  <div class="no-print" style="text-align:center; margin-top:20px;">
    <button onclick="window.print()" style="padding:10px 30px; background:#0d5c3e; color:white; border:none; border-radius:6px; font-size:14px; cursor:pointer;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`);

    printWindow.document.close();
    // Auto trigger print dialog after content loads
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
  }, [reportData, recoveryShops, selectedDate]);

  // Print current view
  const handlePrint = () => {
    generatePDF();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            OB Recovery Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Order booker-wise daily recovery report with PDF</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="animate-fade-in">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Order Booker</Label>
              <Select value={selectedOB} onValueChange={setSelectedOB}>
                <SelectTrigger>
                  <SelectValue placeholder={obLoading ? 'Loading...' : 'Select Order Booker'} />
                </SelectTrigger>
                <SelectContent>
                  {orderbookers.map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>
                      {ob.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Date</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(getLocalDateString())}
              className="text-xs"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReport}
              disabled={loading || !selectedOB}
              className="text-xs"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* No OB Selected State */}
      {!selectedOB && (
        <Card className="animate-fade-in">
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary/50" />
            </div>
            <p className="font-semibold text-muted-foreground text-sm">Select an Order Booker</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5">Choose an order booker and date to generate the recovery report</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {selectedOB && loading && <ReportSkeleton />}

      {/* Report Content */}
      {selectedOB && !loading && reportData && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in">
            <Card className="alfalah-card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Scale className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Route Total Balance</p>
                  <p className="text-xl font-bold text-blue-600">{formatPKR(routeTotalBalance)}</p>
                  <p className="text-[10px] text-muted-foreground">Start of day outstanding</p>
                </div>
              </CardContent>
            </Card>
            <Card className="alfalah-card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Today's Recovery</p>
                  <p className="text-xl font-bold text-green-600">{formatPKR(todayRecovery)}</p>
                  <p className="text-[10px] text-muted-foreground">From {recoveryShops.length} shop{recoveryShops.length !== 1 ? 's' : ''}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="alfalah-card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Remaining Balance</p>
                  <p className="text-xl font-bold text-amber-600">{formatPKR(remainingBalance)}</p>
                  <p className="text-[10px] text-muted-foreground">Still outstanding</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          {recoveryShops.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={handlePrint}
                className="bg-primary hover:bg-primary/90 text-white btn-ripple"
                size="sm"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Print / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows: Record<string, unknown>[] = recoveryShops.map((shop, idx) => ({
                    '#': idx + 1,
                    'Shop Name': shop.shopName,
                    Area: shop.shopArea || '',
                    'Prev Balance': shop.previousBalance,
                    Credit: shop.todayCredit,
                    Recovery: shop.todayRecovery,
                    'Closing Balance': shop.closingBalance,
                  }));
                  const csvContent = [
                    Object.keys(rows[0]).join(','),
                    ...rows.map((r) => Object.values(r).join(',')),
                  ].join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `recovery-${reportData.orderbookerName}-${selectedDate}.csv`;
                  link.click();
                  toast({ title: 'Downloaded', description: 'CSV file downloaded' });
                }}
                className="btn-ripple"
              >
                <Download className="h-4 w-4 mr-1.5" /> CSV
              </Button>
            </div>
          )}

          {/* Shop Recovery Table */}
          <Card ref={reportRef} className="animate-fade-in">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Store className="h-4 w-4" />
                Recovery Detail — {reportData.orderbookerName}
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {selectedDate}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recoveryShops.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                    <Banknote className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                  <p className="font-semibold text-sm">No recovery today</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    This order booker has no recovery entries for {selectedDate}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-semibold w-10">#</TableHead>
                        <TableHead className="text-xs font-semibold">Shop Name</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">Area</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Prev. Balance</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Credit</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Recovery</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recoveryShops.map((shop, idx) => (
                        <TableRow
                          key={shop.shopId}
                          className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                        >
                          <TableCell className="text-xs text-center">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                              {idx + 1}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{shop.shopName}</p>
                              {shop.recoveryEntries.length > 1 && (
                                <p className="text-[10px] text-muted-foreground">
                                  {shop.recoveryEntries.length} entries
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                            {shop.shopArea || '\u2014'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatPKR(shop.previousBalance)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-amber-600 font-medium">
                            {shop.todayCredit > 0 ? `+${formatPKR(shop.todayCredit)}` : '\u2014'}
                          </TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-bold">
                            {formatPKR(shop.todayRecovery)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {shop.closingBalance === 0 ? (
                              <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                Settled
                              </Badge>
                            ) : (
                              <span className="font-bold">{formatPKR(shop.closingBalance)}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total Row */}
                      <TableRow className="bg-primary/5 border-t-2 border-primary/20">
                        <TableCell colSpan={3} className="text-right font-bold text-sm">
                          TOTAL
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm">
                          {formatPKR(recoveryShops.reduce((s, sh) => s + sh.previousBalance, 0))}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm text-amber-600">
                          {(() => {
                            const t = recoveryShops.reduce((s, sh) => s + sh.todayCredit, 0);
                            return t > 0 ? `+${formatPKR(t)}` : '\u2014';
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm text-green-600">
                          {formatPKR(reportData.totalRecovery)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm">
                          {formatPKR(recoveryShops.reduce((s, sh) => s + sh.closingBalance, 0))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
