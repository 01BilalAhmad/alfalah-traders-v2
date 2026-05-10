'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Printer,
  Banknote,
  Store,
  Users,
  RefreshCw,
  Loader2,
  Building2,
  Calendar,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const ROUTE_DAYS = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
];

interface ShopBalance {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  remainingBalance: number;
  creditLimit: number;
  routeDays: string[];
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  shops: ShopBalance[];
  totalBalance: number;
}

interface DayBreakdown {
  day: string;
  dayLabel: string;
  shopCount: number;
  totalBalance: number;
}

interface OrderbookerGroup {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  companies: CompanyGroup[];
  totalBalance: number;
  dayBreakdown: DayBreakdown[];
}

interface FilterOption {
  id: string;
  name: string;
}

interface BalanceReportData {
  orderbookers: OrderbookerGroup[];
  grandTotal: number;
  selectedDay: string | null;
  filterOptions: {
    orderbookers: FilterOption[];
    companies: FilterOption[];
  };
}

function BalanceSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-48" />
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

export default function AdminBalanceReport() {
  const [data, setData] = useState<BalanceReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOB, setSelectedOB] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOB && selectedOB !== 'all') params.set('orderbookerId', selectedOB);
      if (selectedCompany && selectedCompany !== 'all') params.set('companyId', selectedCompany);
      if (selectedDay && selectedDay !== 'all') params.set('routeDay', selectedDay);

      const res = await apiFetch(`/api/reports/balance-report?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        toast({ title: 'Error', description: 'Failed to load balance report', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load balance report', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedOB, selectedCompany, selectedDay]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    // Remove dark class from <html> before printing to ensure light mode colors
    const html = document.documentElement;
    const hadDark = html.classList.contains('dark');
    if (hadDark) {
      html.classList.remove('dark');
      html.style.colorScheme = 'light';
    }

    // Small delay to let CSS recalculate with light mode
    setTimeout(() => {
      window.print();

      // Restore dark mode after print dialog closes
      if (hadDark) {
        // Use onafterprint to restore dark mode
        const restore = () => {
          html.classList.add('dark');
          html.style.colorScheme = 'dark';
          window.removeEventListener('afterprint', restore);
        };
        window.addEventListener('afterprint', restore);

        // Fallback: restore after 1 second in case afterprint doesn't fire
        setTimeout(() => {
          if (!html.classList.contains('dark')) {
            html.classList.add('dark');
            html.style.colorScheme = 'dark';
          }
        }, 1000);
      }
    }, 100);
  };

  if (loading && !data) {
    return <BalanceSkeleton />;
  }

  const totalShops = data?.orderbookers.reduce(
    (s, ob) => s + ob.companies.reduce((cs, comp) => cs + comp.shops.length, 0), 0
  ) || 0;

  const selectedDayLabel = ROUTE_DAYS.find(d => d.value === selectedDay)?.label || '';

  return (
    <div className="space-y-5">
      {/* Screen-only header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Remaining Balance Report
            {selectedDay !== 'all' && data && (
              <Badge className="ml-2 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                {selectedDayLabel}
              </Badge>
            )}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shops with outstanding balance — filter by day, orderbooker &amp; company
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="btn-ripple">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" />Refresh</>}
          </Button>
          {data && data.orderbookers.length > 0 && (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white btn-ripple"
              onClick={handlePrint}
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
          )}
        </div>
      </div>

      {/* Filters - screen only */}
      <div className="flex flex-wrap items-center gap-3 print-hidden">
        {/* Day Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedDay} onValueChange={setSelectedDay}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Days" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Days</SelectItem>
              {ROUTE_DAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedOB} onValueChange={setSelectedOB}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Orderbookers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {data?.filterOptions.orderbookers.map((ob) => (
                <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {data?.filterOptions.companies.map((comp) => (
                <SelectItem key={comp.id} value={comp.id}>{comp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards - screen only */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print-hidden">
          <Card className="alfalah-card-hover animate-card-entrance" style={{ animationDelay: '0ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Banknote className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedDay !== 'all' ? `${selectedDayLabel} Outstanding` : 'Total Outstanding'}
                </p>
                <p className="text-xl font-bold text-red-600 number-display">Rs. {formatCurrency(data.grandTotal)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover animate-card-entrance" style={{ animationDelay: '50ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Store className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedDay !== 'all' ? `${selectedDayLabel} Shops` : 'Shops with Balance'}
                </p>
                <p className="text-xl font-bold text-foreground">{totalShops}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="alfalah-card-hover animate-card-entrance" style={{ animationDelay: '100ms' }}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Orderbookers</p>
                <p className="text-xl font-bold text-foreground">{data.orderbookers.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No data state */}
      {data && data.orderbookers.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <div className="mx-auto mb-4 h-20 w-20">
              <div className="relative z-10 h-20 w-20 rounded-full bg-gradient-to-br from-green-500/10 to-green-100 dark:from-green-500/20 dark:to-green-900/30 flex items-center justify-center">
                <Banknote className="h-9 w-9 text-green-500/50 animate-gentle-float" />
              </div>
            </div>
            <p className="font-semibold text-muted-foreground text-sm">
              {selectedDay !== 'all'
                ? `No outstanding balances for ${selectedDayLabel}`
                : 'No outstanding balances found'}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              {selectedDay !== 'all'
                ? `No shops with balance found for ${selectedDayLabel}. Try selecting a different day.`
                : 'All shops are settled! Outstanding balances will appear here when shops have credit.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── PRINT AREA ─── */}
      {data && data.orderbookers.length > 0 && (
        <div className="print-area">
          {/* Print Header */}
          <div className="print-header print-only">
            <div className="print-header-title">Al-Falah Traders</div>
            <div className="print-header-subtitle">
              Remaining Balance Report
              {selectedDay !== 'all' && ` — ${selectedDayLabel}`}
            </div>
            <div className="print-header-date">{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>

          {/* Day-wise summary in print (only when showing all days) */}
          {selectedDay === 'all' && data.orderbookers.some(ob => ob.dayBreakdown.length > 0) && (
            <div className="print-only" style={{ marginBottom: '12px' }}>
              <table className="balance-table" style={{ marginBottom: 0, fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th className="col-shop" style={{ fontSize: '10px', padding: '4px 8px' }}>Orderbooker</th>
                    <th className="col-area" style={{ fontSize: '10px', padding: '4px 8px' }}>Day</th>
                    <th className="col-num" style={{ fontSize: '10px', padding: '4px 8px' }}>Shops</th>
                    <th className="col-balance" style={{ fontSize: '10px', padding: '4px 8px' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orderbookers.map(ob =>
                    ob.dayBreakdown.map((d, dIdx) => (
                      <tr key={`${ob.orderbookerId}-${d.day}`}>
                        <td style={{ padding: '2px 8px', fontWeight: dIdx === 0 ? '600' : 'normal' }}>
                          {dIdx === 0 ? ob.orderbookerName : ''}
                        </td>
                        <td style={{ padding: '2px 8px' }}>{d.dayLabel}</td>
                        <td className="col-num" style={{ padding: '2px 8px' }}>{d.shopCount}</td>
                        <td className="col-balance" style={{ padding: '2px 8px' }}>{formatCurrency(d.totalBalance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {data.orderbookers.map((ob) => (
            <div key={ob.orderbookerId} className="balance-section">
              {/* Orderbooker Header */}
              <div className="ob-header">
                <div className="ob-name">{ob.orderbookerName}</div>
                <div className="ob-phone">{ob.orderbookerPhone || ''}</div>
              </div>

              {/* Companies within orderbooker */}
              {ob.companies.map((comp) => (
                <div key={comp.companyId} className="company-section">
                  {/* Company Sub-header - only show if multiple companies */}
                  {ob.companies.length > 1 && (
                    <div className="company-header">
                      <span className="company-name">{comp.companyName}</span>
                    </div>
                  )}

                  {/* Balance Table */}
                  <table className="balance-table">
                    <thead>
                      <tr>
                        <th className="col-num">#</th>
                        <th className="col-shop">Shop Name</th>
                        <th className="col-area">Area</th>
                        {selectedDay === 'all' && (
                          <th className="col-area">Route Days</th>
                        )}
                        <th className="col-balance">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.shops.map((shop, idx) => (
                        <tr key={shop.shopId}>
                          <td className="col-num">{idx + 1}</td>
                          <td className="col-shop">{shop.shopName}</td>
                          <td className="col-area">{shop.shopArea || '—'}</td>
                          {selectedDay === 'all' && (
                            <td className="col-area">{(shop.routeDays || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}</td>
                          )}
                          <td className="col-balance">{formatCurrency(shop.remainingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {/* Show company total only when multiple companies */}
                      {ob.companies.length > 1 && (
                        <tr className="total-row">
                          <td colSpan={selectedDay === 'all' ? 4 : 3} className="total-label">Total {comp.companyName}</td>
                          <td className="total-value">{formatCurrency(comp.totalBalance)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              ))}

              {/* Orderbooker Total */}
              <div className="ob-total">
                <span className="ob-total-label">
                  Total {ob.orderbookerName}
                  {selectedDay !== 'all' && ` (${selectedDayLabel})`}
                </span>
                <span className="ob-total-value">Rs. {formatCurrency(ob.totalBalance)}</span>
              </div>
            </div>
          ))}

          {/* Grand Total - print only */}
          <div className="grand-total print-only">
            <span className="grand-total-label">
              Grand Total
              {selectedDay !== 'all' && ` — ${selectedDayLabel}`}
            </span>
            <span className="grand-total-value">Rs. {formatCurrency(data.grandTotal)}</span>
          </div>
        </div>
      )}

      {/* ─── SCREEN TABLE VIEW ─── */}
      {data && data.orderbookers.length > 0 && (
        <div className="space-y-4 print-hidden">
          {data.orderbookers.map((ob) => (
            <Card key={ob.orderbookerId} className="overflow-hidden">
              {/* OB Header */}
              <div className="bg-primary/5 px-5 py-3 flex items-center justify-between border-b">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">{ob.orderbookerName.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{ob.orderbookerName}</p>
                    {ob.orderbookerPhone && (
                      <p className="text-[11px] text-muted-foreground">{ob.orderbookerPhone}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">Rs. {formatCurrency(ob.totalBalance)}</p>
                  {selectedDay !== 'all' && (
                    <p className="text-[10px] text-muted-foreground">{selectedDayLabel} routes only</p>
                  )}
                </div>
              </div>

              {/* Day-wise mini summary (when all days selected) */}
              {selectedDay === 'all' && ob.dayBreakdown.length > 0 && (
                <div className="px-5 py-2 bg-muted/20 border-b">
                  <div className="flex flex-wrap gap-2">
                    {ob.dayBreakdown.map((d) => (
                      <div
                        key={d.day}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border text-[11px] cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-colors"
                        onClick={() => setSelectedDay(d.day)}
                        title={`Click to filter ${d.dayLabel} only`}
                      >
                        <span className="font-medium text-muted-foreground">{d.dayLabel.slice(0, 3)}</span>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">
                          {d.shopCount}
                        </Badge>
                        <span className="font-semibold text-red-600">{formatCurrency(d.totalBalance)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Companies */}
              {ob.companies.map((comp) => (
                <div key={comp.companyId}>
                  <div className="px-5 py-2 bg-muted/30 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{comp.companyName}</span>
                    </div>
                    <span className="text-xs font-bold text-red-600">Rs. {formatCurrency(comp.totalBalance)}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {comp.shops.map((shop, idx) => (
                      <div key={shop.shopId} className="px-5 py-2.5 flex items-center justify-between hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground w-6">{idx + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{shop.shopName}</p>
                            <div className="flex items-center gap-2">
                              {shop.shopArea && (
                                <p className="text-[11px] text-muted-foreground">{shop.shopArea}</p>
                              )}
                              {selectedDay === 'all' && (shop.routeDays || []).length > 0 && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  ({(shop.routeDays || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm font-bold">Rs. {formatCurrency(shop.remainingBalance)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
