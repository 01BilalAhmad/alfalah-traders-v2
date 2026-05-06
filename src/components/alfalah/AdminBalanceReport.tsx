'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Banknote,
  Store,
  Users,
  RefreshCw,
  Loader2,
  Building2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface ShopBalance {
  shopId: string;
  shopName: string;
  shopArea: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  remainingBalance: number;
  creditLimit: number;
}

interface CompanyGroup {
  companyId: string;
  companyName: string;
  shops: ShopBalance[];
  totalBalance: number;
}

interface OrderbookerGroup {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  companies: CompanyGroup[];
  totalBalance: number;
}

interface FilterOption {
  id: string;
  name: string;
}

interface BalanceReportData {
  orderbookers: OrderbookerGroup[];
  grandTotal: number;
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedOB && selectedOB !== 'all') params.set('orderbookerId', selectedOB);
      if (selectedCompany && selectedCompany !== 'all') params.set('companyId', selectedCompany);

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
  }, [selectedOB, selectedCompany]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    window.print();
  };

  if (loading && !data) {
    return <BalanceSkeleton />;
  }

  const totalShops = data?.orderbookers.reduce(
    (s, ob) => s + ob.companies.reduce((cs, comp) => cs + comp.shops.length, 0), 0
  ) || 0;

  return (
    <div className="space-y-5">
      {/* Screen-only header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print-hidden">
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            Remaining Balance Report
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Shops with outstanding balance — print by orderbooker &amp; company
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
                <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
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
                <p className="text-xs text-muted-foreground font-medium">Shops with Balance</p>
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
            <p className="font-semibold text-muted-foreground text-sm">No outstanding balances found</p>
            <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-xs mx-auto leading-relaxed">
              All shops are settled! Outstanding balances will appear here when shops have credit.
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
            <div className="print-header-subtitle">Remaining Balance Report</div>
            <div className="print-header-date">{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
          </div>

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
                        <th className="col-balance">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.shops.map((shop, idx) => (
                        <tr key={shop.shopId}>
                          <td className="col-num">{idx + 1}</td>
                          <td className="col-shop">{shop.shopName}</td>
                          <td className="col-area">{shop.shopArea || '—'}</td>
                          <td className="col-balance">{formatCurrency(shop.remainingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {/* Show company total only when multiple companies */}
                      {ob.companies.length > 1 && (
                        <tr className="total-row">
                          <td colSpan={3} className="total-label">Total {comp.companyName}</td>
                          <td className="total-value">{formatCurrency(comp.totalBalance)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              ))}

              {/* Orderbooker Total */}
              <div className="ob-total">
                <span className="ob-total-label">Total {ob.orderbookerName}</span>
                <span className="ob-total-value">Rs. {formatCurrency(ob.totalBalance)}</span>
              </div>
            </div>
          ))}

          {/* Grand Total - print only */}
          <div className="grand-total print-only">
            <span className="grand-total-label">Grand Total</span>
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
                <p className="text-sm font-bold text-red-600">Rs. {formatCurrency(ob.totalBalance)}</p>
              </div>

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
                            {shop.shopArea && (
                              <p className="text-[11px] text-muted-foreground">{shop.shopArea}</p>
                            )}
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
