'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Building2,
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

interface ShopCompanyBreakdown {
  companyId: string;
  companyName: string;
  previousBalance: number;
  todayCredit: number;
  todayRecovery: number;
  closingBalance: number;
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
  companyBreakdown: ShopCompanyBreakdown[];
  recoveryEntries: RecoveryEntry[];
}

interface CompanyTotal {
  companyId: string;
  companyName: string;
  totalRecovery: number;
  shops: number;
}

interface OrderbookerRecovery {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  totalRecovery: number;
  totalShops: number;
  visitedShops: number;
  companyBreakdown: CompanyTotal[];
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

/** Group recovery shops by company — each shop appears under the company that has its recovery */
function groupShopsByCompany(recoveryShops: ShopRecovery[]): {
  companyId: string;
  companyName: string;
  shops: ShopRecovery[];
  totalRecovery: number;
  totalPrevBalance: number;
  totalCredit: number;
  totalClosing: number;
}[] {
  const companyMap = new Map<string, {
    companyId: string;
    companyName: string;
    shops: ShopRecovery[];
    totalRecovery: number;
    totalPrevBalance: number;
    totalCredit: number;
    totalClosing: number;
  }>();

  for (const shop of recoveryShops) {
    // Determine which company this shop's recovery belongs to
    // If shop has companyBreakdown, find the company with recovery
    if (shop.companyBreakdown && shop.companyBreakdown.length > 0) {
      // Shop has company breakdown — assign to each company that has recovery or credit
      for (const comp of shop.companyBreakdown) {
        if (comp.todayRecovery > 0 || comp.todayCredit > 0) {
          const existing = companyMap.get(comp.companyId);
          if (existing) {
            existing.shops.push(shop);
            existing.totalRecovery += comp.todayRecovery;
            existing.totalPrevBalance += comp.previousBalance;
            existing.totalCredit += comp.todayCredit;
            existing.totalClosing += comp.closingBalance;
          } else {
            companyMap.set(comp.companyId, {
              companyId: comp.companyId,
              companyName: comp.companyName,
              shops: [shop],
              totalRecovery: comp.todayRecovery,
              totalPrevBalance: comp.previousBalance,
              totalCredit: comp.todayCredit,
              totalClosing: comp.closingBalance,
            });
          }
        }
      }
    } else {
      // No company breakdown — put under "Other" / no company
      const noCompKey = '_none_';
      const existing = companyMap.get(noCompKey);
      if (existing) {
        existing.shops.push(shop);
        existing.totalRecovery += shop.todayRecovery;
        existing.totalPrevBalance += shop.previousBalance;
        existing.totalCredit += shop.todayCredit;
        existing.totalClosing += shop.closingBalance;
      } else {
        companyMap.set(noCompKey, {
          companyId: noCompKey,
          companyName: 'General',
          shops: [shop],
          totalRecovery: shop.todayRecovery,
          totalPrevBalance: shop.previousBalance,
          totalCredit: shop.todayCredit,
          totalClosing: shop.closingBalance,
        });
      }
    }
  }

  // Sort: companies with most recovery first
  return Array.from(companyMap.values()).sort((a, b) => b.totalRecovery - a.totalRecovery);
}

export default function AdminOBRecoveryReport() {
  const { selectedDate, setSelectedDate } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<OrderbookerOption[]>([]);
  const [selectedOB, setSelectedOB] = useState<string>('');
  const [reportData, setReportData] = useState<OrderbookerRecovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [obLoading, setObLoading] = useState(true);

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
          const obInfo = orderbookers.find((ob) => ob.id === selectedOB);
          setReportData({
            orderbookerId: selectedOB,
            orderbookerName: obInfo?.name || 'Unknown',
            orderbookerPhone: null,
            totalRecovery: 0,
            totalShops: 0,
            visitedShops: 0,
            companyBreakdown: [],
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

  // Group shops by company
  const companyGroups = groupShopsByCompany(recoveryShops);

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

    let printWindow: Window | null;
    try {
      printWindow = window.open('', '_blank');
    } catch {
      printWindow = null;
    }
    if (!printWindow) {
      toast({ title: 'Popup Blocked', description: 'Please allow popups for this site to generate PDF. Check your browser address bar for a popup blocker icon.', variant: 'destructive' });
      return;
    }

    // Build company-grouped tables
    const companySections = companyGroups.map((group) => {
      const shopRows = group.shops.map((shop, idx) => {
        // Get this shop's data for this specific company
        const compData = shop.companyBreakdown?.find(c => c.companyId === group.companyId);
        const showPrevBal = compData ? compData.previousBalance : shop.previousBalance;
        const showCredit = compData ? compData.todayCredit : shop.todayCredit;
        const showRecovery = compData ? compData.todayRecovery : shop.todayRecovery;
        const showClosing = compData ? compData.closingBalance : shop.closingBalance;

        return `
        <tr class="${idx % 2 === 0 ? 'even-row' : 'odd-row'}">
          <td class="center">${idx + 1}</td>
          <td><strong>${shop.shopName}</strong></td>
          <td>${shop.shopArea || '\u2014'}</td>
          <td class="right">${formatCurrencyPDF(showPrevBal)}</td>
          <td class="right">${showCredit > 0 ? formatCurrencyPDF(showCredit) : '\u2014'}</td>
          <td class="right bold green">${formatCurrencyPDF(showRecovery)}</td>
          <td class="right">${formatCurrencyPDF(showClosing)}</td>
        </tr>`;
      }).join('');

      return `
      <div class="company-section">
        <div class="company-section-header">
          <span class="company-section-name">${group.companyName}</span>
          <span class="company-section-total">Recovery: Rs. ${formatCurrencyPDF(group.totalRecovery)} | ${group.shops.length} shop${group.shops.length !== 1 ? 's' : ''}</span>
        </div>
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
              <td colspan="3" style="text-align:right">TOTAL ${group.companyName}</td>
              <td class="right">${formatCurrencyPDF(group.totalPrevBalance)}</td>
              <td class="right">${group.totalCredit > 0 ? formatCurrencyPDF(group.totalCredit) : '\u2014'}</td>
              <td class="right green">${formatCurrencyPDF(group.totalRecovery)}</td>
              <td class="right">${formatCurrencyPDF(group.totalClosing)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
    }).join('');

    // Grand total across all companies
    const grandPrevBalance = companyGroups.reduce((s, g) => s + g.totalPrevBalance, 0);
    const grandCredit = companyGroups.reduce((s, g) => s + g.totalCredit, 0);
    const grandRecovery = companyGroups.reduce((s, g) => s + g.totalRecovery, 0);
    const grandClosing = companyGroups.reduce((s, g) => s + g.totalClosing, 0);

    // Route totals from ALL shops
    const allShopsRouteBalance = reportData.shops.reduce((s, sh) => s + sh.previousBalance, 0);
    const allShopsRemaining = allShopsRouteBalance - todayRecovery;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Recovery Report - ${reportData.orderbookerName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 8mm; }
    body { font-family: 'Arial', sans-serif; color: #1a1a1a; padding: 10px; font-size: 11px; line-height: 1.3; }
    .report-top { page-break-inside: avoid; break-inside: avoid; }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 8px; }
    .company-name { font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #0d5c3e; }
    .company-sub { font-size: 9px; color: #333; margin-top: 1px; }
    .report-title { font-size: 13px; font-weight: bold; margin-top: 6px; color: #333; background: #f0f7f4; padding: 4px 12px; display: inline-block; border-radius: 3px; }
    .info-row { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; }
    .info-item { display: flex; gap: 4px; }
    .info-label { font-weight: 700; color: #222; }
    .info-value { color: #000; }
    .summary-cards { display: flex; gap: 10px; margin: 8px 0; justify-content: center; }
    .summary-card { border: 1px solid #ddd; border-radius: 4px; padding: 6px 14px; text-align: center; min-width: 120px; }
    .summary-card .label { font-size: 8px; color: #444; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; }
    .summary-card .value { font-size: 15px; font-weight: bold; margin-top: 2px; }
    .summary-card.green .value { color: #0d7a4f; }
    .summary-card.blue .value { color: #1a56db; }
    .summary-card.amber .value { color: #b45309; }
    .company-section { margin: 8px 0; page-break-inside: avoid; }
    .company-section-header { background: #0d5c3e; color: white; padding: 5px 10px; border-radius: 3px 3px 0 0; display: flex; justify-content: space-between; align-items: center; }
    .company-section-name { font-size: 12px; font-weight: 700; }
    .company-section-total { font-size: 10px; opacity: 1; font-weight: 600; }
    .company-section table { border: 1px solid #999; border-top: none; border-radius: 0 0 4px 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #e0ede8; color: #000; padding: 5px 5px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.2px; border-bottom: 1px solid #999; font-weight: 700; }
    td { padding: 4px 5px; border-bottom: 1px solid #bbb; color: #000; }
    .even-row { background: #f5f5f5; }
    .odd-row { background: #fff; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .green { color: #065f36; font-weight: 700; }
    .total-row { background: #f0f7f4 !important; font-weight: 700; border-top: 2px solid #0d5c3e; }
    .total-row td { padding: 6px 5px; font-size: 11px; }
    .grand-total-row { background: #e8f5e9 !important; font-weight: 700; border-top: 3px double #0d5c3e; }
    .grand-total-row td { padding: 8px 5px; font-size: 11px; }
    .footer { margin-top: 15px; padding-top: 6px; border-top: 1px solid #888; display: flex; justify-content: space-between; font-size: 9px; color: #555; }
    .signature-section { margin-top: 25px; display: flex; justify-content: space-between; }
    .signature-box { text-align: center; width: 180px; }
    .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 4px; font-size: 10px; color: #000; font-weight: 600; }
    .no-data { text-align: center; padding: 40px; color: #888; font-size: 14px; }
    @media print {
      body { padding: 5px; color: #000 !important; }
      .no-print { display: none !important; }
      .report-top { page-break-inside: avoid !important; break-inside: avoid !important; }
      .company-section { page-break-inside: avoid !important; break-inside: avoid !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      td, th, span, div, p { color: #000 !important; }
      .company-name { color: #0d5c3e !important; }
      .green { color: #065f36 !important; }
      .summary-card.blue .value { color: #0a3d91 !important; }
      .summary-card.amber .value { color: #7c2d12 !important; }
      .company-section-header { background: #0d5c3e !important; color: #fff !important; }
      .company-section-header * { color: #fff !important; }
      .report-title { background: #e0ede8 !important; color: #000 !important; }
      th { background: #e0ede8 !important; color: #000 !important; }
      .total-row { background: #e0ede8 !important; }
      .total-row td { color: #000 !important; }
      .grand-total-row { background: #d5ead9 !important; }
      .grand-total-row td { color: #000 !important; }
    }
  </style>
</head>
<body>
  <div class="report-top">
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
        <div class="value">${formatCurrencyPDF(todayRecovery)}</div>
      </div>
      <div class="summary-card amber">
        <div class="label">Remaining Balance</div>
        <div class="value">${formatCurrencyPDF(allShopsRemaining)}</div>
      </div>
    </div>
  </div>

  ${companyGroups.length > 0 ? companySections : `
  <div class="no-data">No recovery data found for this date.</div>
  `}

  ${companyGroups.length > 1 ? `
  <table style="margin-top:20px;">
    <tbody>
      <tr class="grand-total-row">
        <td style="text-align:right;width:60%"><strong>GRAND TOTAL (All Companies)</strong></td>
        <td class="right">${formatCurrencyPDF(grandPrevBalance)}</td>
        <td class="right">${grandCredit > 0 ? formatCurrencyPDF(grandCredit) : '\u2014'}</td>
        <td class="right green bold">${formatCurrencyPDF(grandRecovery)}</td>
        <td class="right">${formatCurrencyPDF(grandClosing)}</td>
      </tr>
    </tbody>
  </table>
  ` : ''}

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
    <span>Powered by Finexa</span>
  </div>

  <div class="no-print" style="text-align:center; margin-top:20px;">
    <button onclick="window.print()" style="padding:10px 30px; background:#0d5c3e; color:white; border:none; border-radius:6px; font-size:14px; cursor:pointer;">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`);

    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
  }, [reportData, recoveryShops, selectedDate, companyGroups, todayRecovery]);

  const handlePrint = () => {
    generatePDF();
  };

  // Render a company-grouped shop table
  const renderCompanySection = (group: typeof companyGroups[0], startIdx: number) => (
    <Card className="animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          {group.companyName} Recovery
          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 ml-1">
            {formatPKR(group.totalRecovery)}
          </Badge>
          <Badge variant="outline" className="text-[10px] ml-auto">
            {group.shops.length} shop{group.shops.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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
              {group.shops.map((shop, idx) => {
                // Get this shop's data for this specific company
                const compData = shop.companyBreakdown?.find(c => c.companyId === group.companyId);
                const showPrevBal = compData ? compData.previousBalance : shop.previousBalance;
                const showCredit = compData ? compData.todayCredit : shop.todayCredit;
                const showRecovery = compData ? compData.todayRecovery : shop.todayRecovery;
                const showClosing = compData ? compData.closingBalance : shop.closingBalance;

                return (
                  <TableRow
                    key={`${shop.shopId}-${group.companyId}`}
                    className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                  >
                    <TableCell className="text-xs text-center">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {startIdx + idx + 1}
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
                      {formatPKR(showPrevBal)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-amber-600 font-medium">
                      {showCredit > 0 ? `+${formatPKR(showCredit)}` : '\u2014'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-green-600 font-bold">
                      {formatPKR(showRecovery)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {showClosing === 0 ? (
                        <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                          <CheckCircle className="h-3 w-3 mr-0.5" />
                          Settled
                        </Badge>
                      ) : (
                        <span className="font-bold">{formatPKR(showClosing)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {/* Company Total Row */}
              <TableRow className="bg-primary/5 border-t-2 border-primary/20">
                <TableCell colSpan={3} className="text-right font-bold text-sm">
                  TOTAL {group.companyName}
                </TableCell>
                <TableCell className="text-right font-bold text-sm">
                  {formatPKR(group.totalPrevBalance)}
                </TableCell>
                <TableCell className="text-right font-bold text-sm text-amber-600">
                  {group.totalCredit > 0 ? `+${formatPKR(group.totalCredit)}` : '\u2014'}
                </TableCell>
                <TableCell className="text-right font-bold text-sm text-green-600">
                  {formatPKR(group.totalRecovery)}
                </TableCell>
                <TableCell className="text-right font-bold text-sm">
                  {formatPKR(group.totalClosing)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            OB Recovery Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Order booker-wise daily recovery report with PDF</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="animate-fade-in print-hidden">
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
            <Card className="card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Scale className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Route Total Balance</p>
                  <p className="text-xl font-bold text-foreground">{formatPKR(routeTotalBalance)}</p>
                  <p className="text-[10px] text-muted-foreground">Start of day outstanding</p>
                </div>
              </CardContent>
            </Card>
            <Card className="card-hover">
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
            <Card className="card-hover">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <TrendingDown className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Remaining Balance</p>
                  <p className="text-xl font-bold text-foreground">{formatPKR(remainingBalance)}</p>
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
                className="bg-primary hover:bg-primary/90 text-white "
                size="sm"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                Print / PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const rows: Record<string, unknown>[] = [];
                  companyGroups.forEach((group) => {
                    rows.push({
                      '#': '',
                      'Shop Name': `--- ${group.companyName} ---`,
                      Area: '',
                      'Prev Balance': '',
                      Credit: '',
                      Recovery: group.totalRecovery,
                      'Closing Balance': '',
                    });
                    group.shops.forEach((shop, idx) => {
                      const compData = shop.companyBreakdown?.find(c => c.companyId === group.companyId);
                      const showPrevBal = compData ? compData.previousBalance : shop.previousBalance;
                      const showCredit = compData ? compData.todayCredit : shop.todayCredit;
                      const showRecovery = compData ? compData.todayRecovery : shop.todayRecovery;
                      const showClosing = compData ? compData.closingBalance : shop.closingBalance;
                      rows.push({
                        '#': idx + 1,
                        'Shop Name': shop.shopName,
                        Area: shop.shopArea || '',
                        'Prev Balance': showPrevBal,
                        Credit: showCredit,
                        Recovery: showRecovery,
                        'Closing Balance': showClosing,
                      });
                    });
                  });
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
                className=""
              >
                <Download className="h-4 w-4 mr-1.5" /> CSV
              </Button>
            </div>
          )}

          {/* Company-Grouped Shop Tables */}
          {recoveryShops.length === 0 ? (
            <Card className="animate-fade-in">
              <CardContent className="py-12 text-center">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Banknote className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="font-semibold text-sm">No recovery today</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  This order booker has no recovery entries for {selectedDate}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {companyGroups.map((group, gIdx) => {
                const startIdx = companyGroups.slice(0, gIdx).reduce((s, g) => s + g.shops.length, 0);
                return renderCompanySection(group, startIdx);
              })}

              {/* Grand Total Card — only if multiple companies */}
              {companyGroups.length > 1 && (
                <Card className="animate-fade-in border-2 border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      Grand Total — All Companies
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {selectedDate}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs font-semibold">Company</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Shops</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Prev. Balance</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Credit</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Recovery</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Closing</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {companyGroups.map((group) => (
                            <TableRow key={group.companyId}>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 border-primary/30 text-primary">
                                  {group.companyName}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {group.shops.length}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatPKR(group.totalPrevBalance)}
                              </TableCell>
                              <TableCell className="text-right text-sm text-amber-600 font-medium">
                                {group.totalCredit > 0 ? `+${formatPKR(group.totalCredit)}` : '\u2014'}
                              </TableCell>
                              <TableCell className="text-right text-sm text-green-600 font-bold">
                                {formatPKR(group.totalRecovery)}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatPKR(group.totalClosing)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Grand Total Row */}
                          <TableRow className="bg-primary/5 border-t-2 border-primary/20">
                            <TableCell className="font-bold text-sm">GRAND TOTAL</TableCell>
                            <TableCell className="text-right font-bold text-sm text-muted-foreground">
                              {companyGroups.reduce((s, g) => s + g.shops.length, 0)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm">
                              {formatPKR(companyGroups.reduce((s, g) => s + g.totalPrevBalance, 0))}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm text-amber-600">
                              {(() => {
                                const t = companyGroups.reduce((s, g) => s + g.totalCredit, 0);
                                return t > 0 ? `+${formatPKR(t)}` : '\u2014';
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm text-green-600">
                              {formatPKR(todayRecovery)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm">
                              {formatPKR(companyGroups.reduce((s, g) => s + g.totalClosing, 0))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
