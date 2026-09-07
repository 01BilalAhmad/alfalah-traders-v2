'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  Store,
  Clock,
  Phone,
  MapPin,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  User,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  MessageSquare,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { formatPKR } from '@/lib/utils';
import { UnpaidBillsDetail, UnpaidBillView } from '@/components/alfalah/UnpaidBillsDetail';

interface OverdueShop {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  companyName?: string | null;
  companyBalances?: Array<{ companyId: string; companyName: string; balance: number }>;
  balance: number;
  phone: string | null;
  orderbookerId: string;
  orderbookerName: string;
  lastCreditDate: string | null;
  lastRecoveryDate: string | null;
  daysSinceCredit: number | null;
  daysSinceRecovery: number | null;
  // v2 FIFO fields (returned by /api/shops/needing-recovery since Aug 2026)
  overdueAmount?: number;             // unpaid portion 14+ days old
  oldestUnpaidCreditDate?: string | null;
  unpaidBills?: UnpaidBillView[];     // top 5 oldest unpaid bills (with dates)
  unpaidBillCount?: number;
  fifoMatchesShopBalance?: boolean;
}

// WhatsApp status per shop: 'unknown' | 'exists' | 'not_exists' | 'checking'
type WaStatus = 'unknown' | 'exists' | 'not_exists' | 'checking';

interface Orderbooker {
  id: string;
  name: string;
  status: string;
}

function OverdueSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="skeleton-shimmer h-7 w-56 mb-1" />
          <Skeleton className="skeleton-shimmer h-4 w-80" />
        </div>
        <Skeleton className="skeleton-shimmer h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-4">
              <Skeleton className="skeleton-shimmer h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="skeleton-shimmer h-3 w-24 mb-2" />
              <Skeleton className="skeleton-shimmer h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="card-elevated">
        <CardContent className="p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="skeleton-shimmer h-5 w-5" />
              <Skeleton className="skeleton-shimmer h-4 w-32" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Short date for the oldest-unpaid sub-line (e.g. "12 May")
function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

function DaysBadge({ days }: { days: number | null }) {
  if (days === null) {
    return (
      <Badge className="text-[10px] bg-muted text-muted-foreground border-border font-semibold">
        —
      </Badge>
    );
  }

  if (days >= 30) {
    return (
      <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800 font-semibold">
        {days}d — Critical
      </Badge>
    );
  }
  if (days >= 21) {
    return (
      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800 font-semibold">
        {days}d — Urgent
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800 font-semibold">
      {days}d — Overdue
    </Badge>
  );
}

export default function AdminOverdueShops() {
  const { setSelectedShopId, setSelectedShopName } = useAppStore();
  const router = useRouter();
  const [shops, setShops] = useState<OverdueShop[]>([]);
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [minDays, setMinDays] = useState('14');
  const [selectedOB, setSelectedOB] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null); // shop row expanded to show unpaid bills
  const [sendingSms, setSendingSms] = useState<string | null>(null); // shopId being sent SMS
  const [waStatus, setWaStatus] = useState<Record<string, WaStatus>>({}); // shopId → status
  const [bulkChecking, setBulkChecking] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null); // shopId whose per-shop statement is being fetched

  // Check a single shop's phone on WhatsApp
  const checkShopWhatsApp = async (shop: OverdueShop) => {
    if (!shop.phone) return;
    setWaStatus(prev => ({ ...prev, [shop.id]: 'checking' }));
    try {
      const res = await apiFetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check-number', phone: shop.phone }),
      });
      const data = await res.json();
      setWaStatus(prev => ({ ...prev, [shop.id]: data.exists ? 'exists' : 'not_exists' }));
      if (!data.exists) {
        toast({
          title: 'WhatsApp not registered',
          description: `${shop.name}: ${shop.phone} is not on WhatsApp.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Verified', description: `${shop.name}: WhatsApp ✅`, variant: 'default' });
      }
    } catch {
      setWaStatus(prev => ({ ...prev, [shop.id]: 'unknown' }));
      toast({ title: 'Check failed', description: 'Network error', variant: 'destructive' });
    }
  };

  // Bulk check all visible shops (with rate-limit pacing on backend)
  const checkAllWhatsApp = async () => {
    const shopsToCheck = shops.filter(s => s.phone && waStatus[s.id] !== 'exists' && waStatus[s.id] !== 'checking');
    if (shopsToCheck.length === 0) {
      toast({ title: 'Nothing to check', description: 'All shops already verified or no phones available.' });
      return;
    }
    setBulkChecking(true);
    // Process in chunks of 10 to avoid timeouts on Vercel serverless (10s/60s limit)
    const CHUNK_SIZE = 10;
    for (let i = 0; i < shopsToCheck.length; i += CHUNK_SIZE) {
      const chunk = shopsToCheck.slice(i, i + CHUNK_SIZE);
      // Mark all as checking
      setWaStatus(prev => {
        const next = { ...prev };
        chunk.forEach(s => { next[s.id] = 'checking'; });
        return next;
      });
      try {
        const res = await apiFetch('/api/whatsapp/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-numbers', phones: chunk.map(s => s.phone) }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          setWaStatus(prev => {
            const next = { ...prev };
            chunk.forEach((s, idx) => {
              const r = data.results[idx];
              next[s.id] = r?.exists ? 'exists' : 'not_exists';
            });
            return next;
          });
        }
      } catch {
        // Mark chunk as unknown on failure
        setWaStatus(prev => {
          const next = { ...prev };
          chunk.forEach(s => { next[s.id] = 'unknown'; });
          return next;
        });
      }
    }
    setBulkChecking(false);
    toast({ title: 'Verification complete', description: `${shopsToCheck.length} numbers checked.` });
  };

  const sendReminderSms = async (shop: OverdueShop) => {
    if (!shop.phone) {
      toast({ title: 'No phone', description: `${shop.name} has no phone number`, variant: 'destructive' });
      return;
    }
    // Pre-warn if we already know number is not on WhatsApp
    if (waStatus[shop.id] === 'not_exists') {
      toast({
        title: 'WhatsApp not registered',
        description: `${shop.phone} is not on WhatsApp. SMS will fail. Update shop's WhatsApp number first.`,
        variant: 'destructive',
      });
      return;
    }
    setSendingSms(shop.id);
    try {
      const res = await apiFetch('/api/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send-single-overdue',
          shopId: shop.id,
          shopName: shop.name,
          shopPhone: shop.phone,
          shopArea: shop.area,
          shopAddress: shop.address,
          companyName: shop.companyName,
          balance: shop.balance,
          // Use the SAME days value as displayed in the UI (daysSinceCredit)
          // — previously used 'daysSinceRecovery || daysSinceCredit' which
          // caused mismatch: UI showed 97 days (credit) but SMS said 30 days (recovery)
          daysOverdue: shop.daysSinceCredit || shop.daysSinceRecovery || 0,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'SMS Sent', description: `Reminder sent to ${shop.name}` });
        setWaStatus(prev => ({ ...prev, [shop.id]: 'exists' })); // confirmed exists
      } else {
        const errMsg = data.error || 'Failed to send';
        // If error is about JID/non-existent, mark as not_exists
        if (errMsg.toLowerCase().includes('not on whatsapp') || errMsg.toLowerCase().includes('jid')) {
          setWaStatus(prev => ({ ...prev, [shop.id]: 'not_exists' }));
        }
        toast({ title: 'SMS Failed', description: errMsg, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSendingSms(null);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('minDays', minDays);
      if (selectedOB !== 'all') queryParams.set('orderbookerId', selectedOB);
      if (selectedCompany !== 'all') queryParams.set('companyId', selectedCompany);

      const [overdueRes, obRes, compRes] = await Promise.all([
        apiFetch(`/api/shops/needing-recovery?${queryParams.toString()}`),
        apiFetch('/api/orderbookers'),
        companies.length === 0 ? apiFetch('/api/companies?status=active') : Promise.resolve(null),
      ]);

      if (overdueRes.ok) {
        const data = await overdueRes.json();
        setShops(data.shops || []);
      } else {
        toast({ title: 'Error', description: 'Failed to load overdue shops', variant: 'destructive' });
      }

      if (obRes.ok) {
        const obs = await obRes.json();
        setOrderbookers(Array.isArray(obs) ? obs.filter((o: Orderbooker) => o.status === 'active') : []);
      }

      if (compRes && compRes.ok) {
        const cd = await compRes.json();
        setCompanies(cd.companies || []);
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [minDays, selectedOB, selectedCompany, companies.length]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter by search
  const filteredShops = useMemo(() => {
    if (!searchQuery.trim()) return shops;
    const q = searchQuery.toLowerCase();
    return shops.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q) ||
      s.orderbookerName.toLowerCase().includes(q)
    );
  }, [shops, searchQuery]);

  // Print overdue shops — now includes the overdue amount, the oldest unpaid
  // bill DATE and per-bill breakdown so the printed report is self-explanatory.
  const handlePrint = useCallback(() => {
    if (shops.length === 0) return;
    const printWin = window.open('', '_blank');
    if (!printWin) return;
    const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });
    const rowsHtml = filteredShops.map((s, i) => {
      const oldestDate = s.oldestUnpaidCreditDate
        ? new Date(s.oldestUnpaidCreditDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';
      const lastRecovery = s.lastRecoveryDate
        ? new Date(s.lastRecoveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Never';
      const billLines = (s.unpaidBills || [])
        .map((b) => {
          const d = b.date
            ? new Date(b.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
          return `<div class="bill-line"><span>${d}</span><span>${formatPKR(b.remaining)}</span><span>${b.daysOld ?? '—'}d</span></div>`;
        })
        .join('');
      return `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td><strong>${s.name}</strong>${billLines ? `<div class="bills">${billLines}</div>` : ''}</td>
        <td>${s.address || s.area || '—'}</td>
        <td style="text-align:right; font-weight:bold; color:#DC2626">${formatPKR(s.balance)}</td>
        <td style="text-align:right; color:#991B1B">${formatPKR(s.overdueAmount ?? s.balance)}</td>
        <td style="text-align:center">${oldestDate}<br/><span style="color:#888;font-size:9px">${s.daysSinceCredit ?? '—'}d</span></td>
        <td>${s.orderbookerName}</td>
        <td style="text-align:center">${lastRecovery}</td>
      </tr>
    `;
    }).join('');
    const totalBalance = filteredShops.reduce((sum, s) => sum + s.balance, 0);
    const totalOverdue = filteredShops.reduce((sum, s) => sum + (s.overdueAmount ?? s.balance), 0);

    printWin.document.write(`<!DOCTYPE html><html><head><title>Overdue Shops Report</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size: A4; margin: 10mm; }
      body { font-family: Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
      .header { text-align:center; margin-bottom:10px; border-bottom: 3px solid #DC2626; padding-bottom:8px; }
      .biz-name { font-size: 20px; font-weight: bold; color: #DC2626; letter-spacing:1px; }
      .subtitle { font-size: 10px; color: #666; margin-top:2px; }
      .report-title { font-size: 15px; font-weight:bold; margin-top:6px; color:#991B1B; }
      .date-line { font-size: 11px; font-weight:bold; margin-top:4px; color:#333; }
      .info-line { font-size: 10px; color: #555; margin-top:4px; text-align:center; }
      .summary-box { display:flex; gap:12px; margin:10px 0; justify-content:center; }
      .summary-card { border:1px solid #FECACA; border-radius:6px; padding:8px 16px; text-align:center; background:#FEF2F2; }
      .summary-card .label { font-size:8px; color:#666; text-transform:uppercase; letter-spacing:0.3px; font-weight:600; }
      .summary-card .value { font-size:16px; font-weight:bold; color:#DC2626; margin-top:2px; }
      table { width:100%; border-collapse:collapse; margin-top:6px; font-size:10px; }
      th { background:#DC2626; color:#fff; padding:6px 4px; text-align:left; font-size:9px; text-transform:uppercase; }
      td { padding:4px 4px; border-bottom:1px solid #ddd; vertical-align:top; }
      tr:nth-child(even) { background:#FEF2F2; }
      .bills { margin-top:3px; border-left:2px solid #FECACA; padding-left:6px; }
      .bill-line { display:flex; gap:10px; font-size:8.5px; color:#555; padding:1px 0; }
      .bill-line span:first-child { width:58px; }
      .bill-line span:nth-child(2) { width:70px; font-weight:600; color:#991B1B; }
      .total-row { background:#FEE2E2 !important; font-weight:bold; }
      .total-row td { border-top:2px solid #DC2626; padding:6px 4px; font-size:11px; }
      .footer { margin-top:12px; padding-top:6px; border-top:1px solid #ccc; text-align:center; font-size:8px; color:#999; }
      @media print { body { padding:0; } }
    </style></head><body>
      <div class="header">
        <div class="biz-name">AL-FALAH TRADERS</div>
        <div class="subtitle">Credit & Route Management System</div>
        <div class="report-title">OVERDUE SHOPS REPORT</div>
        <div class="date-line">Generated: ${today}</div>
        <div class="info-line">Shops whose OLDEST unpaid bill is ${minDays}+ days old (FIFO aging) ${selectedOB !== 'all' ? '| Orderbooker: ' + (orderbookers.find(o => o.id === selectedOB)?.name || 'All') : '| All Orderbookers'}</div>
      </div>
      <div class="summary-box">
        <div class="summary-card"><div class="label">Overdue Shops</div><div class="value">${filteredShops.length}</div></div>
        <div class="summary-card"><div class="label">Total Outstanding</div><div class="value">${formatPKR(totalBalance)}</div></div>
        <div class="summary-card"><div class="label">Overdue ${minDays}+d Portion</div><div class="value">${formatPKR(totalOverdue)}</div></div>
      </div>
      <table>
        <thead>
          <tr><th style="width:25px">#</th><th>Shop Name + Unpaid Bills</th><th>Address</th><th style="text-align:right">Outstanding</th><th style="text-align:right">Overdue ${minDays}+d</th><th style="text-align:center">Oldest Unpaid</th><th>Orderbooker</th><th style="text-align:center">Last Recovery</th></tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="3" style="text-align:right">TOTAL</td>
            <td style="text-align:right; color:#DC2626; font-size:12px">${formatPKR(totalBalance)}</td>
            <td style="text-align:right; color:#991B1B; font-size:12px">${formatPKR(totalOverdue)}</td>
            <td colspan="3">${filteredShops.length} shops</td>
          </tr>
        </tbody>
      </table>
      <div class="footer">Generated: ${new Date().toLocaleString('en-PK')} • Overdue Shops Report (FIFO) • AL-FALAH TRADERS</div>
      <script>window.onload=function(){window.print();}</script>
    </body></html>`);
    printWin.document.close();
  }, [filteredShops, shops, minDays, selectedOB, orderbookers]);

  // Print a SINGLE shop's overdue statement — fetches the FULL FIFO breakdown
  // from /api/shops/[id]/overdue-detail (ALL unpaid bills, not just the top 5)
  // and prints a statement with every bill date, amount & age. This is the
  // shopkeeper-facing document (hand it over or send via WhatsApp).
  const handlePrintShopDetail = useCallback(async (shop: OverdueShop) => {
    if (printingId) return;
    setPrintingId(shop.id);
    try {
      const res = await apiFetch(`/api/shops/${shop.id}/overdue-detail`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      const printWin = window.open('', '_blank');
      if (!printWin) {
        toast({
          title: 'Popup blocked',
          description: 'Allow popups for this site to print the overdue statement.',
          variant: 'destructive',
        });
        return;
      }

      const esc = (v: unknown) =>
        String(v ?? '').replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c as '&' | '<' | '>' | '"' | "'"])
        );
      const fmtDate = (iso: string | null | undefined) => {
        if (!iso) return '—';
        try {
          return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch {
          return '—';
        }
      };

      const s = data.shop || {};
      const bills: Array<{ date: string | null; amount: number; remaining: number; daysOld: number | null }> =
        data.unpaidBills || [];
      const totalRemaining = bills.reduce((sum, b) => sum + (b.remaining || 0), 0);
      const totalAmount = bills.reduce((sum, b) => sum + (b.amount || 0), 0);
      // Authoritative total = Shop.balance; FIFO overdue portion only when sane
      const totalBalance: number = data.totalBalance ?? shop.balance;
      const fifoSane: boolean = data.fifoMatchesShopBalance !== false;
      const overdueAmount: number = fifoSane ? (data.overdueAmount ?? shop.overdueAmount ?? 0) : totalBalance;
      const daysOverdue: number = data.daysOverdue ?? shop.daysSinceCredit ?? 0;

      const rowsHtml = bills
        .map((b, i) => {
          const old = (b.daysOld ?? 0) >= 14;
          return `
          <tr class="${old ? 'row-old' : ''}">
            <td style="text-align:center">${i + 1}</td>
            <td style="text-align:center">${fmtDate(b.date)}</td>
            <td style="text-align:right">${formatPKR(b.amount)}</td>
            <td style="text-align:right; font-weight:600">${formatPKR(b.remaining)}</td>
            <td style="text-align:center">${b.daysOld ?? '—'}d${old ? ' ⚠' : ''}</td>
          </tr>`;
        })
        .join('');

      const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });

      printWin.document.write(`<!DOCTYPE html><html><head><title>Overdue Statement — ${esc(s.name)}</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size: A4; margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #1a1a1a; font-size: 12px; }
        .header { text-align:center; margin-bottom:12px; border-bottom: 3px solid #DC2626; padding-bottom:8px; }
        .biz-name { font-size: 22px; font-weight: bold; color: #DC2626; letter-spacing:1px; }
        .subtitle { font-size: 10px; color: #666; margin-top:2px; }
        .report-title { font-size: 15px; font-weight:bold; margin-top:6px; color:#991B1B; }
        .date-line { font-size: 11px; font-weight:bold; margin-top:4px; color:#333; }
        .shop-card { border:1px solid #ddd; border-radius:8px; padding:10px 14px; margin:10px 0; display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap; background:#FAFAFA; }
        .shop-card .col { min-width:180px; }
        .shop-card .lbl { font-size:8px; color:#999; text-transform:uppercase; letter-spacing:0.4px; font-weight:700; margin-bottom:1px; }
        .shop-card .val { font-size:12px; font-weight:600; }
        .summary-box { display:flex; gap:10px; margin:10px 0; justify-content:center; flex-wrap:wrap; }
        .summary-card { border:1px solid #FECACA; border-radius:6px; padding:8px 14px; text-align:center; background:#FEF2F2; min-width:130px; }
        .summary-card .label { font-size:8px; color:#666; text-transform:uppercase; letter-spacing:0.3px; font-weight:600; }
        .summary-card .value { font-size:15px; font-weight:bold; color:#DC2626; margin-top:2px; }
        table { width:100%; border-collapse:collapse; margin-top:8px; font-size:11px; }
        th { background:#DC2626; color:#fff; padding:7px 6px; text-align:left; font-size:9.5px; text-transform:uppercase; }
        td { padding:5px 6px; border-bottom:1px solid #ddd; }
        tr:nth-child(even) { background:#FEF2F2; }
        tr.row-old td { background:#FEE2E2; }
        tr.row-old:nth-child(even) td { background:#FEE2E2; }
        .total-row { background:#FEE2E2 !important; font-weight:bold; }
        .total-row td { border-top:2px solid #DC2626; padding:7px 6px; font-size:12px; }
        .note { margin-top:10px; font-size:9.5px; color:#7C2D12; background:#FFF7ED; border:1px solid #FED7AA; border-radius:5px; padding:6px 10px; }
        .meta-line { margin-top:10px; font-size:10px; color:#555; text-align:center; }
        .footer { margin-top:12px; padding-top:6px; border-top:1px solid #ccc; text-align:center; font-size:8px; color:#999; }
        @media print { body { padding:0; } }
      </style></head><body>
        <div class="header">
          <div class="biz-name">AL-FALAH TRADERS</div>
          <div class="subtitle">Credit & Route Management System</div>
          <div class="report-title">OVERDUE PAYMENT STATEMENT</div>
          <div class="date-line">Generated: ${today}</div>
        </div>

        <div class="shop-card">
          <div class="col"><div class="lbl">Shop</div><div class="val">${esc(s.name)}</div></div>
          <div class="col"><div class="lbl">Address / Area</div><div class="val">${esc(s.address || s.area || '—')}</div></div>
          <div class="col"><div class="lbl">Phone</div><div class="val">${esc(s.phone || '—')}</div></div>
          <div class="col"><div class="lbl">Orderbooker</div><div class="val">${esc(s.orderbookerName || '—')}</div></div>
          <div class="col"><div class="lbl">Company</div><div class="val">${esc(s.companyName || '—')}</div></div>
        </div>

        <div class="summary-box">
          <div class="summary-card"><div class="label">Total Outstanding</div><div class="value">${formatPKR(totalBalance)}</div></div>
          <div class="summary-card"><div class="label">Overdue 14+d Portion</div><div class="value">${formatPKR(overdueAmount)}</div></div>
          <div class="summary-card"><div class="label">Oldest Unpaid Bill</div><div class="value">${daysOverdue}d</div></div>
          <div class="summary-card"><div class="label">Unpaid Bills</div><div class="value">${data.unpaidBillCount ?? bills.length}</div></div>
        </div>

        <table>
          <thead>
            <tr><th style="width:30px; text-align:center">#</th><th style="width:90px; text-align:center">Bill Date</th><th style="text-align:right">Bill Amount</th><th style="text-align:right">Remaining Unpaid</th><th style="width:70px; text-align:center">Age</th></tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="2" style="text-align:right">TOTAL (${bills.length} bills)</td>
              <td style="text-align:right; color:#DC2626">${formatPKR(totalAmount)}</td>
              <td style="text-align:right; color:#DC2626">${formatPKR(totalRemaining)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        ${!fifoSane ? `<div class="note">⚠ Note: bill-wise breakdown (FIFO) does not match the shop ledger balance exactly (possible claim adjustment). The <b>Total Outstanding</b> figure above is the authoritative ledger balance.</div>` : ''}

        <div class="meta-line">Oldest unpaid bill date: <b>${fmtDate(data.oldestUnpaidCreditDate || shop.oldestUnpaidCreditDate)}</b> &nbsp;•&nbsp; Last recovery: <b>${fmtDate(data.lastRecoveryDate || shop.lastRecoveryDate)}</b> &nbsp;•&nbsp; Last bill: <b>${fmtDate(data.lastCreditDate || shop.lastCreditDate)}</b></div>

        <div class="footer">This is a computer-generated overdue statement • AL-FALAH TRADERS • ${new Date().toLocaleString('en-PK')}</div>
        <script>window.onload=function(){window.print();}</script>
      </body></html>`);
      printWin.document.close();
    } catch (err) {
      console.error('Failed to print shop overdue detail:', err);
      toast({
        title: 'Could not load overdue detail',
        description: 'Failed to fetch the full unpaid-bills breakdown for this shop.',
        variant: 'destructive',
      });
    } finally {
      setPrintingId(null);
    }
  }, [printingId]);

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    if (shops.length === 0) return;
    const wb = XLSX.utils.book_new();
    const rows = filteredShops.map((s, i) => ({
      '#': i + 1,
      'Shop Name': s.name,
      'Address': s.address || s.area || '',
      'Outstanding (Rs.)': s.balance,
      [`Overdue ${minDays}+d (Rs.)`]: s.overdueAmount ?? s.balance,
      'Oldest Unpaid Bill': s.oldestUnpaidCreditDate ? new Date(s.oldestUnpaidCreditDate).toLocaleDateString('en-PK') : '—',
      'Days Overdue': s.daysSinceCredit ?? '—',
      'Unpaid Bills Count': s.unpaidBillCount ?? (s.unpaidBills || []).length,
      'Orderbooker': s.orderbookerName,
      'Last Recovery': s.lastRecoveryDate ? new Date(s.lastRecoveryDate).toLocaleDateString('en-PK') : 'Never',
      'Days Since Recovery': s.daysSinceRecovery !== null ? s.daysSinceRecovery : 'Never',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 15 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Overdue Shops');
    const summary = [
      { Metric: 'Total Overdue Shops', Value: filteredShops.length },
      { Metric: 'Total Outstanding', Value: formatPKR(filteredShops.reduce((s, sh) => s + sh.balance, 0)) },
      { Metric: 'Threshold (days)', Value: minDays },
      { Metric: 'Generated', Value: new Date().toLocaleString('en-PK') },
    ];
    const ws2 = XLSX.utils.json_to_sheet(summary);
    ws2['!cols'] = [{ wch: 25 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
    XLSX.writeFile(wb, `Overdue_Shops_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Excel Downloaded' });
  }, [filteredShops, shops, minDays]);

  // Summary KPIs
  const summary = useMemo(() => {
    const totalBalance = shops.reduce((s, sh) => s + sh.balance, 0);
    const criticalCount = shops.filter(s => s.daysSinceCredit !== null && s.daysSinceCredit >= 30).length;
    const urgentCount = shops.filter(s => s.daysSinceCredit !== null && s.daysSinceCredit >= 21 && s.daysSinceCredit < 30).length;
    const neverRecovered = shops.filter(s => s.daysSinceRecovery === null).length;
    return {
      totalOverdue: shops.length,
      totalBalance,
      criticalCount,
      urgentCount,
      neverRecovered,
    };
  }, [shops]);

  // OB-wise breakdown
  const obBreakdown = useMemo(() => {
    const map: Record<string, { name: string; count: number; balance: number }> = {};
    for (const s of shops) {
      if (!map[s.orderbookerId]) {
        map[s.orderbookerId] = { name: s.orderbookerName || 'Unknown', count: 0, balance: 0 };
      }
      map[s.orderbookerId].count++;
      map[s.orderbookerId].balance += s.balance;
    }
    return Object.entries(map)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [shops]);

  const handleShopClick = (shop: OverdueShop) => {
    setSelectedShopId(shop.id);
    setSelectedShopName(shop.name);
    router.push(`/shops/${shop.id}`);
  };

  if (loading) return <OverdueSkeleton />;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            Overdue Shops
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Shops whose OLDEST unpaid bill is {minDays}+ days old (FIFO) — expand a row
            (chevron) to see each unpaid bill with its date &amp; amount
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={minDays} onValueChange={setMinDays}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7+ days</SelectItem>
              <SelectItem value="14">14+ days</SelectItem>
              <SelectItem value="21">21+ days</SelectItem>
              <SelectItem value="30">30+ days</SelectItem>
              <SelectItem value="60">60+ days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedOB} onValueChange={setSelectedOB}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="All OBs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orderbookers</SelectItem>
              {orderbookers.map(ob => (
                <SelectItem key={ob.id} value={ob.id}>{ob.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={handlePrint} disabled={shops.length === 0}>
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExportExcel} disabled={shops.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            Excel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300"
            onClick={checkAllWhatsApp}
            disabled={bulkChecking || shops.length === 0}
            title="Check which shop phone numbers have WhatsApp installed"
          >
            {bulkChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
            Verify WhatsApp
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shadow-sm">
                <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">{minDays}+ Days</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Overdue Shops</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.totalOverdue}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-sm">
                <Store className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">At Risk</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Outstanding Balance</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{formatPKR(summary.totalBalance)}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center shadow-sm">
                <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Critical</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">30+ Days Overdue</p>
            <p className="text-2xl font-bold text-foreground tabular-nums number-animate">{summary.criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shadow-sm">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <Badge variant="secondary" className="text-[10px] font-medium">Never</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Never Recovered</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.neverRecovered}</p>
          </CardContent>
        </Card>
      </div>

      {/* OB Breakdown */}
      {obBreakdown.length > 0 && (
        <Card className="card-elevated">
          <CardHeader className="pb-3 pt-4 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Overdue by Orderbooker
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {obBreakdown.map(ob => (
                <button
                  key={ob.id}
                  onClick={() => setSelectedOB(ob.id)}
                  className={`rounded-lg border p-3 text-left transition-all hover:shadow-md ${
                    selectedOB === ob.id
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{ob.name}</p>
                  <p className="text-lg font-bold text-foreground mt-1">{ob.count}</p>
                  <p className="text-[11px] text-muted-foreground">{formatPKR(ob.balance)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Shops Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Overdue Shops List
              <Badge variant="secondary" className="text-[11px] ml-1">
                {filteredShops.length} shops
              </Badge>
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search shops..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-rose-800 dark:bg-rose-950 hover:bg-rose-800 dark:hover:bg-rose-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Area</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right hidden md:table-cell">Overdue (14+d)</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Last Credit</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Days Overdue</TableHead>
                  <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Orderbooker</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center hidden lg:table-cell">Phone / WhatsApp</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">SMS</TableHead>
                  <TableHead className="text-white font-semibold text-xs w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShops.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <div className="text-center py-10">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">No overdue shops found</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {shops.length === 0
                            ? 'All shops have recent recovery activity'
                            : 'Try adjusting the search or filters'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShops.map((shop, idx) => {
                    const isExpanded = expandedId === shop.id;
                    return (
                      <Fragment key={shop.id}>
                        <TableRow
                          className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect cursor-pointer`}
                          onClick={() => handleShopClick(shop)}
                        >
                      <TableCell className="text-sm">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium hover:text-primary transition-colors">{shop.name}</p>
                          <p className="text-[11px] text-muted-foreground sm:hidden">{shop.area}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{shop.address || shop.area || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPKR(shop.balance)}
                          </span>
                          {(shop.overdueAmount ?? shop.balance) < shop.balance && (
                            <span className="text-[10px] text-rose-600 dark:text-rose-400 tabular-nums">
                              of which overdue: {formatPKR(shop.overdueAmount ?? shop.balance)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <span className="text-sm font-semibold text-red-600 dark:text-red-400 tabular-nums">
                          {formatPKR(shop.overdueAmount ?? shop.balance)}
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          since {formatShortDate(shop.oldestUnpaidCreditDate ?? shop.lastCreditDate)}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        {shop.lastCreditDate ? (
                          <span className="text-xs text-muted-foreground">
                            {new Date(shop.lastCreditDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <DaysBadge days={shop.daysSinceCredit} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground">{shop.orderbookerName}</span>
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        {shop.phone ? (
                          <div className="flex flex-col items-center gap-1">
                            <a
                              href={`tel:${shop.phone}`}
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="h-3 w-3" />
                              {shop.phone}
                            </a>
                            {/* WhatsApp status badge */}
                            {waStatus[shop.id] === 'checking' ? (
                              <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 font-medium gap-1">
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                Checking
                              </Badge>
                            ) : waStatus[shop.id] === 'exists' ? (
                              <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800 font-medium gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                WhatsApp ✅
                              </Badge>
                            ) : waStatus[shop.id] === 'not_exists' ? (
                              <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800 font-medium gap-1" title="Number not registered on WhatsApp">
                                <AlertCircle className="h-2.5 w-2.5" />
                                No WhatsApp
                              </Badge>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); checkShopWhatsApp(shop); }}
                                className="text-[9px] text-muted-foreground hover:text-primary underline"
                                title="Check if this number is on WhatsApp"
                              >
                                Verify
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendReminderSms(shop);
                          }}
                          disabled={!shop.phone || sendingSms === shop.id || waStatus[shop.id] === 'not_exists'}
                          className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            waStatus[shop.id] === 'not_exists'
                              ? 'border-red-300 text-red-400 dark:border-red-700 dark:text-red-600'
                              : waStatus[shop.id] === 'exists'
                              ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300'
                              : 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300'
                          }`}
                          title={
                            !shop.phone
                              ? 'No phone number'
                              : waStatus[shop.id] === 'not_exists'
                              ? 'WhatsApp not registered on this number'
                              : waStatus[shop.id] === 'exists'
                              ? 'Send WhatsApp reminder'
                              : 'Send WhatsApp reminder (number not yet verified)'
                          }
                        >
                          {sendingSms === shop.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePrintShopDetail(shop);
                            }}
                            disabled={printingId === shop.id}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Print full overdue statement — ALL unpaid bills with dates & amounts"
                          >
                            {printingId === shop.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Printer className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(isExpanded ? null : shop.id);
                            }}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted transition-colors"
                            title={isExpanded ? 'Hide unpaid bills detail' : 'Show unpaid bills with dates & amounts'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 border-b">
                              <div className="px-2 sm:px-4">
                                <UnpaidBillsDetail
                                  bills={shop.unpaidBills || []}
                                  totalBills={shop.unpaidBillCount}
                                  fifoMatchesBalance={shop.fifoMatchesShopBalance !== false}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


