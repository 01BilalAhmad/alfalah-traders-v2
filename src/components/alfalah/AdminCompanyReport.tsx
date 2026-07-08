'use client';

import { useState, useEffect, useCallback } from 'react';
import { useBusinessName } from '@/lib/use-business-name';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Printer,
  Building2,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { formatAmount, formatPKR } from '@/lib/utils';
import { handlePrint as sharedHandlePrint } from '@/lib/print-utils';

function formatCurrency(amount: number): string {
  // Used in table cells (no Rs. prefix in template)
  if (amount === 0) return '—';
  return formatAmount(amount);
}

interface Orderbooker {
  id: string;
  name: string;
}

interface DayInfo {
  date: string;
  label: string;
}

interface DayData {
  credit: number;
  recovery: number;
  balance: number;
}

interface ReportData {
  company: { id: string; name: string };
  month: string;
  monthLabel: string;
  days: DayInfo[];
  orderbookers: Orderbooker[];
  data: Record<string, Record<string, DayData>>;
  obTotals: Record<string, { credit: number; recovery: number; balance: number }>;
  openingBalances: Record<string, number>;
  currentBalances: Record<string, number>;
  grandTotals: { credit: number; recovery: number; balance: number };
  workingDays: number;
}

interface CompanyOption {
  id: string;
  name: string;
}

function ReportSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div>
                <Skeleton className="h-3 w-28 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCompanyReport() {
  const { businessName } = useBusinessName();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  // Fetch companies list
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await apiFetch('/api/companies');
        if (res.ok) {
          const result = await res.json();
          const comps = Array.isArray(result) ? result : (result.companies || []);
          setCompanies(comps.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
          if (comps.length > 0 && !selectedCompany) {
            setSelectedCompany(comps[0].id);
          }
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load companies', variant: 'destructive' });
      } finally {
        setCompaniesLoading(false);
      }
    }
    fetchCompanies();
  }, []);

  // Fetch report data
  const fetchData = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('companyId', selectedCompany);
      params.set('month', selectedMonth);

      const res = await apiFetch(`/api/reports/company-credit-recovery?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, selectedMonth]);

  useEffect(() => {
    if (selectedCompany) {
      fetchData();
    }
  }, [fetchData, selectedCompany]);

  const handlePrint = () => {
    sharedHandlePrint({
      delay: 300,
      extraCSS: '@page { size: landscape; margin: 6mm; }',
    });
  };

  // Generate month options (current month ± 12 months)
  const monthOptions: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -12; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    monthOptions.push({ value: val, label });
  }

  if (companiesLoading) {
    return <ReportSkeleton />;
  }

  return (
    <div className="space-y-5 company-report-print">
      {/* Screen-only header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Company Credit &amp; Recovery Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Days-wise credit posted &amp; recovery collected — orderbooker breakdown
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={fetchData} disabled={loading} className="">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" />Refresh</>}
          </Button>
          {data && data.orderbookers.length > 0 && (
            <Button
            type="button"
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white "
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 print-hidden">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select Company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((comp) => (
                <SelectItem key={comp.id} value={comp.id}>{comp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print-hidden">
          <Card className="card-hover " style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Credit</p>
                <p className="text-xl font-bold text-foreground number-display">{formatPKR(data.grandTotals.credit)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover " style={{ animationDelay: '50ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Recovery</p>
                <p className="text-xl font-bold text-foreground number-display">{formatPKR(data.grandTotals.recovery)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover " style={{ animationDelay: '100ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Working Days</p>
                <p className="text-xl font-bold text-foreground">{data.workingDays} / {data.days.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No company selected */}
      {!selectedCompany && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="mx-auto mb-4 h-20 w-20">
              <div className="relative z-10 h-20 w-20 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Building2 className="h-9 w-9 text-indigo-600 dark:text-indigo-400 animate-gentle-float" />
              </div>
            </div>
            <p className="font-semibold text-muted-foreground text-sm">Select a company to view the report</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5">Choose a company from the dropdown above</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !data && <ReportSkeleton />}

      {/* No data */}
      {data && data.orderbookers.length === 0 && selectedCompany && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="mx-auto mb-4 h-20 w-20">
              <div className="relative z-10 h-20 w-20 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <FileSpreadsheet className="h-9 w-9 text-indigo-600 dark:text-indigo-400 animate-gentle-float" />
              </div>
            </div>
            <p className="font-semibold text-muted-foreground text-sm">No orderbookers found for this company</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Add orderbookers to this company to see their credit &amp; recovery data.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── PRINT HEADER ─── */}
      {data && data.orderbookers.length > 0 && (
        <div className="print-only mb-2">
          <div className="text-center">
            <h1 className="text-base font-bold">{businessName}</h1>
            <h2 className="text-xs font-semibold">{data.company.name} — Credit &amp; Recovery Report</h2>
            <p className="text-[10px] text-muted-foreground">
              {data.monthLabel} | Working Days: {data.workingDays}
            </p>
          </div>
        </div>
      )}

      {/* ─── MAIN REPORT TABLE ─── */}
      {data && data.orderbookers.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs print:text-[11px]">
              {/* Header Row 1: Closing Balance above OB names */}
              <thead>
                <tr className="bg-primary/10 border-b border-primary/20">
                  {/* Date column header */}
                  <th
                    className="sticky left-0 z-20 bg-primary/10 border-r border-primary/20 px-2 py-1 text-center font-bold text-foreground min-w-[70px] print:min-w-[60px]"
                    rowSpan={3}
                  >
                    Date
                  </th>
                  {/* Current Outstanding Balance (bold) above each OB name — matches Balance Report */}
                  {data.orderbookers.map((ob) => (
                    <th
                      key={`bal-${ob.id}`}
                      className="border-r border-border/50 px-1 py-1 text-center font-extrabold text-slate-800 dark:text-slate-100 text-xs print:text-[10px]"
                      colSpan={2}
                    >
                      {formatPKR(data.currentBalances?.[ob.id] ?? data.openingBalances[ob.id] ?? 0)}
                    </th>
                  ))}
                  {/* Grand total outstanding */}
                  <th
                    className="border-l-2 border-primary/30 px-1 py-1 text-center font-extrabold text-slate-800 dark:text-slate-100 text-xs print:text-[10px] bg-primary/5"
                    colSpan={2}
                  >
                    {formatPKR(data.orderbookers.reduce((sum, ob) => sum + (data.currentBalances?.[ob.id] ?? data.openingBalances[ob.id] ?? 0), 0))}
                  </th>
                </tr>
                {/* Header Row 2: Orderbooker Names */}
                <tr className="bg-primary/10 border-b border-primary/20">
                  {data.orderbookers.map((ob) => (
                    <th
                      key={ob.id}
                      className="border-r border-border/50 px-1 py-1 text-center font-bold text-foreground"
                      colSpan={2}
                    >
                      {ob.name}
                    </th>
                  ))}
                  <th
                    className="border-l-2 border-primary/30 px-1 py-1 text-center font-bold text-foreground bg-primary/5"
                    colSpan={2}
                  >
                    TOTAL
                  </th>
                </tr>
                {/* Header Row 3: Credit | Recovery sub-headers */}
                <tr className="bg-muted/50 border-b border-border">
                  {data.orderbookers.map((ob) => (
                    <>
                      <th key={`credit-${ob.id}`} className="border-r border-border/30 px-1 py-1 text-center font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 min-w-[55px] print:min-w-[50px]">
                        Credit
                      </th>
                      <th key={`recovery-${ob.id}`} className="border-r border-border/50 px-1 py-1 text-center font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 min-w-[55px] print:min-w-[50px]">
                        Recovery
                      </th>
                    </>
                  ))}
                  <th className="border-r border-border/30 px-1 py-1 text-center font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 min-w-[55px] print:min-w-[50px]">
                    Credit
                  </th>
                  <th className="px-1 py-1 text-center font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 min-w-[55px] print:min-w-[50px]">
                    Recovery
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.days.filter((day) => {
                  // Only show days that have at least one credit or recovery transaction
                  return data.orderbookers.some(
                    (ob) => (data.data[day.date]?.[ob.id]?.credit || 0) > 0 || (data.data[day.date]?.[ob.id]?.recovery || 0) > 0
                  );
                }).map((day, dayIdx) => {
                  // Calculate day totals
                  let dayTotalCredit = 0;
                  let dayTotalRecovery = 0;
                  for (const ob of data.orderbookers) {
                    dayTotalCredit += data.data[day.date]?.[ob.id]?.credit || 0;
                    dayTotalRecovery += data.data[day.date]?.[ob.id]?.recovery || 0;
                  }

                  return (
                    <tr
                      key={day.date}
                      className={`border-b border-border/50 hover:bg-muted/20 ${dayIdx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}
                    >
                      {/* Date cell — sticky */}
                      <td className="sticky left-0 z-10 border-r border-border/50 px-2 py-1.5 font-medium text-foreground bg-background print:bg-white">
                        {day.label}
                      </td>
                      {/* Credit & Recovery for each orderbooker — PAIRED together */}
                      {data.orderbookers.map((ob) => {
                        const obData = data.data[day.date]?.[ob.id] || { credit: 0, recovery: 0 };
                        return (
                          <>
                            <td
                              key={`cr-${ob.id}-${day.date}`}
                              className={`border-r border-border/30 px-1 py-1 text-right tabular-nums ${obData.credit > 0 ? 'text-foreground bg-slate-50/30 dark:bg-slate-800/20' : 'text-muted-foreground'}`}
                            >
                              {formatCurrency(obData.credit)}
                            </td>
                            <td
                              key={`re-${ob.id}-${day.date}`}
                              className={`border-r border-border/50 px-1 py-1 text-right tabular-nums ${obData.recovery > 0 ? 'text-foreground bg-slate-50/30 dark:bg-slate-800/20' : 'text-muted-foreground'}`}
                            >
                              {formatCurrency(obData.recovery)}
                            </td>
                          </>
                        );
                      })}
                      {/* Day Total */}
                      <td className={`border-r border-border/30 px-1 py-1 text-right tabular-nums font-semibold ${dayTotalCredit > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {formatCurrency(dayTotalCredit)}
                      </td>
                      <td className={`px-1 py-1 text-right tabular-nums font-semibold ${dayTotalRecovery > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {formatCurrency(dayTotalRecovery)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer: Totals Row */}
              <tfoot>
                <tr className="bg-primary/10 border-t-2 border-primary/30 font-bold">
                  <td className="sticky left-0 z-10 border-r border-primary/20 px-2 py-2 text-foreground bg-primary/10">
                    TOTAL
                  </td>
                  {data.orderbookers.map((ob) => (
                    <>
                      <td
                        key={`total-credit-${ob.id}`}
                        className="border-r border-border/30 px-1 py-2 text-right tabular-nums text-foreground bg-slate-100/50 dark:bg-slate-800/50"
                      >
                        {formatCurrency(data.obTotals[ob.id]?.credit || 0)}
                      </td>
                      <td
                        key={`total-recovery-${ob.id}`}
                        className="border-r border-border/50 px-1 py-2 text-right tabular-nums text-foreground bg-slate-100/50 dark:bg-slate-800/50"
                      >
                        {formatCurrency(data.obTotals[ob.id]?.recovery || 0)}
                      </td>
                    </>
                  ))}
                  <td className="border-r border-border/30 px-1 py-2 text-right tabular-nums text-foreground bg-slate-100/50 dark:bg-slate-800/50">
                    {formatCurrency(data.grandTotals.credit)}
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums text-foreground bg-slate-100/50 dark:bg-slate-800/50">
                    {formatCurrency(data.grandTotals.recovery)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Legend */}
      {data && data.orderbookers.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground print:hidden">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-indigo-200 dark:bg-indigo-700 border border-indigo-300 dark:border-indigo-600" />
            <span>Credit = Credit Posted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-emerald-200 dark:bg-emerald-700 border border-emerald-300 dark:border-emerald-600" />
            <span>Recovery = Recovery Collected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm bg-rose-200 dark:bg-rose-700 border border-rose-300 dark:border-rose-600" />
            <span>Bold amount = Outstanding Balance</span>
          </div>
          <span>|</span>
          <span>— = No data</span>
        </div>
      )}
    </div>
  );
}
