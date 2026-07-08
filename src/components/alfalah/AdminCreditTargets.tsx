'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  TrendingDown, Users, Wallet, AlertCircle, Loader2, CalendarDays,
  Plus, Pencil, Trash2, Trophy, CheckCircle2, Target, RefreshCw,
  Download, FileText,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatPKR } from '@/lib/utils';
import { exportToExcel } from '@/lib/excel-export';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(parseInt(year), parseInt(m) - 1, 1);
  return date.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' });
}

interface Orderbooker {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  status: string;
}

interface CreditTargetInfo {
  id?: string;
  month: string;
  openingCredit: number | null;
  targetClosingCredit: number | null;
  maxCreditThisMonth: number | null;
  closingCredit: number | null;
  recoveryTarget: number | null;
}

interface OBStats {
  currentCredit: number;
  recoveryDone: number;
  recoveryNeeded: number;
  progress: number;
  status: string;
  prevMonthClosing: number | null;
}

interface OBRow {
  ob: Orderbooker;
  target: CreditTargetInfo | null;
  stats: OBStats;
}

function CreditTargetsSkeleton() {
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

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  achieved: { label: 'Achieved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800', icon: '🏆' },
  on_track: { label: 'On Track', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800', icon: '✅' },
  behind: { label: 'Behind', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800', icon: '⚠️' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800', icon: '🚨' },
  no_target: { label: 'No Target', color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700', icon: '—' },
};

export default function AdminCreditTargets() {
  const { user } = useAppStore();
  const [orderbookers, setOrderbookers] = useState<Orderbooker[]>([]);
  const [obRows, setObRows] = useState<OBRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOB, setEditingOB] = useState<Orderbooker | null>(null);
  const [targetClosingCredit, setTargetClosingCredit] = useState('');
  const [openingCredit, setOpeningCredit] = useState('');
  const [autoOpening, setAutoOpening] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<OBRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // ── Export to Excel ──────────────────────────────────────────────
  const handleExportExcel = async () => {
    if (!obRows.length) return;
    setExportingExcel(true);
    try {
      await exportToExcel(
        sortedRows.map((r) => ({
          'Orderbooker': r.ob.name,
          'Username': r.ob.username,
          'Opening Credit': r.target?.openingCredit != null ? r.target.openingCredit : '—',
          'Current Credit': r.stats.currentCredit,
          'Target Closing': r.target?.targetClosingCredit != null ? r.target.targetClosingCredit : '—',
          'Recovery Done': r.stats.recoveryDone,
          'Still Needed': r.stats.recoveryNeeded,
          'Progress %': r.stats.progress,
          'Status': statusConfig[r.stats.status]?.label || r.stats.status,
        })),
        `credit-targets-${selectedMonth}`,
        'Credit Targets',
        [20, 15, 15, 15, 15, 15, 15, 10, 15],
      );
      toast({ title: 'Export Complete', description: 'Credit Targets exported to Excel' });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Export to PDF (client-side with charts) ─────────────────────
  const handleExportPdf = async () => {
    if (!obRows.length) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ── Title ──
      doc.setFontSize(20);
      doc.setTextColor(79, 70, 229);
      doc.setFont('helvetica', 'bold');
      doc.text('Finexa - Credit Targets Report', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(`${getMonthLabel(selectedMonth)} | Generated: ${new Date().toLocaleString('en-PK')}`, pageWidth / 2, 25, { align: 'center' });

      // ── Summary cards ──
      let y = 35;
      const cardW = (pageWidth - 60) / 4;
      const cardH = 22;
      const cards = [
        { label: 'Total OBs', value: String(summary.totalOBs), color: [79, 70, 229] },
        { label: 'Current Credit', value: formatPKR(summary.totalCurrentCredit), color: [239, 68, 68] },
        { label: 'Target Closing', value: formatPKR(summary.totalTargetClosing), color: [16, 185, 129] },
        { label: 'On Track', value: `${summary.onTrack}/${summary.withTargetCount}`, color: [245, 158, 11] },
      ];
      cards.forEach((c, i) => {
        const x = 20 + i * (cardW + 5);
        doc.setFillColor(249, 250, 251);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'S');
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
        doc.text(c.label, x + 4, y + 6);
        doc.setFontSize(13);
        doc.setTextColor(c.color[0], c.color[1], c.color[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(c.value, x + 4, y + 14);
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.setFont('helvetica', 'normal');
      });
      y += cardH + 8;

      // ── Chart 1: Bar chart — Current vs Target per OB ──
      // Draw manually using rectangles
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'bold');
      doc.text('Current Credit vs Target Closing', 20, y + 5);
      y += 10;

      const chartX = 20;
      const chartW = pageWidth - 40;
      const chartH = 60;
      const maxVal = Math.max(...sortedRows.map(r => Math.max(r.stats.currentCredit || 0, r.target?.targetClosingCredit || 0)), 1);

      // Y-axis
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.2);
      for (let i = 0; i <= 4; i++) {
        const lineY = y + chartH - (i * chartH / 4);
        doc.line(chartX, lineY, chartX + chartW, lineY);
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(formatPKR(maxVal * i / 4), chartX - 1, lineY + 1, { align: 'right' });
      }

      // Bars
      const barGroupW = chartW / sortedRows.length;
      const barW = Math.min(12, barGroupW / 3);
      sortedRows.forEach((r, i) => {
        const gx = chartX + i * barGroupW + barGroupW / 2;
        const curH = (r.stats.currentCredit / maxVal) * chartH;
        const tgtH = ((r.target?.targetClosingCredit || 0) / maxVal) * chartH;
        // Current (red)
        doc.setFillColor(239, 68, 68);
        doc.rect(gx - barW - 1, y + chartH - curH, barW, curH, 'F');
        // Target (green)
        doc.setFillColor(16, 185, 129);
        doc.rect(gx + 1, y + chartH - tgtH, barW, tgtH, 'F');
        // Label
        doc.setFontSize(6);
        doc.setTextColor(55, 65, 81);
        doc.text(r.ob.name.substring(0, 12), gx, y + chartH + 3, { align: 'center', angle: 45 });
      });
      y += chartH + 12;

      // Legend
      doc.setFillColor(239, 68, 68);
      doc.rect(20, y, 4, 4, 'F');
      doc.setFontSize(8);
      doc.setTextColor(55, 65, 81);
      doc.text('Current Credit', 26, y + 3);
      doc.setFillColor(16, 185, 129);
      doc.rect(70, y, 4, 4, 'F');
      doc.text('Target Closing', 76, y + 3);
      y += 8;

      // ── Chart 2: Progress bar (horizontal) ──
      doc.addPage();
      doc.setFontSize(20);
      doc.setTextColor(79, 70, 229);
      doc.setFont('helvetica', 'bold');
      doc.text('Finexa - Credit Targets Report', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(`${getMonthLabel(selectedMonth)} - Progress per Orderbooker`, pageWidth / 2, 25, { align: 'center' });

      y = 35;
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'bold');
      doc.text('Progress per Orderbooker', 20, y);
      y += 8;

      const progBarH = 6;
      const progBarW = pageWidth - 80;
      sortedRows.forEach((r, i) => {
        const yPos = y + i * 10;
        // OB name
        doc.setFontSize(8);
        doc.setTextColor(55, 65, 81);
        doc.setFont('helvetica', 'normal');
        doc.text(r.ob.name.substring(0, 20), 20, yPos + 4);
        // Background bar
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(60, yPos, progBarW, progBarH, 1, 1, 'F');
        // Progress bar (color by status)
        const statusColors: Record<string, [number, number, number]> = {
          achieved: [16, 185, 129],
          on_track: [59, 130, 246],
          behind: [245, 158, 11],
          critical: [239, 68, 68],
          no_target: [156, 163, 175],
        };
        const c = statusColors[r.stats.status] || [156, 163, 175];
        doc.setFillColor(c[0], c[1], c[2]);
        const progW = (r.stats.progress / 100) * progBarW;
        doc.roundedRect(60, yPos, progW, progBarH, 1, 1, 'F');
        // Percentage label
        doc.setFontSize(7);
        doc.setTextColor(55, 65, 81);
        doc.setFont('helvetica', 'bold');
        doc.text(`${r.stats.progress}%`, 60 + progBarW + 2, yPos + 4);
        // 80% line marker
        if (i === 0) {
          doc.setDrawColor(16, 185, 129);
          doc.setLineWidth(0.3);
          doc.setLineDashPattern([1, 1], 0);
          doc.line(60 + progBarW * 0.8, y - 2, 60 + progBarW * 0.8, y + sortedRows.length * 10);
          doc.setLineDashPattern([], 0);
        }
      });
      y += sortedRows.length * 10 + 8;
      doc.setFontSize(7);
      doc.setTextColor(16, 185, 129);
      doc.text('--- 80% on-track threshold ---', 60 + progBarW * 0.8, y);

      // ── Chart 3: Status Distribution (as horizontal stacked bar — more reliable than pie) ──
      y += 10;
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'bold');
      doc.text('Status Distribution', 20, y);
      y += 8;

      const statusCounts: Record<string, number> = {};
      sortedRows.forEach(r => {
        statusCounts[r.stats.status] = (statusCounts[r.stats.status] || 0) + 1;
      });
      const total = sortedRows.length;
      const statusColorsPie: Record<string, [number, number, number]> = {
        achieved: [16, 185, 129],
        on_track: [59, 130, 246],
        behind: [245, 158, 11],
        critical: [239, 68, 68],
        no_target: [156, 163, 175],
      };
      const statusLabels: Record<string, string> = {
        achieved: 'Achieved',
        on_track: 'On Track',
        behind: 'Behind',
        critical: 'Critical',
        no_target: 'No Target',
      };

      // Draw as horizontal stacked bar (simpler, more reliable than pie chart)
      const stackBarX = 20;
      const stackBarW = pageWidth - 40;
      const stackBarH = 10;
      let stackX = stackBarX;
      Object.entries(statusCounts).forEach(([status, count]) => {
        const c = statusColorsPie[status] || [156, 163, 175];
        const segW = (count / total) * stackBarW;
        doc.setFillColor(c[0], c[1], c[2]);
        doc.rect(stackX, y, segW, stackBarH, 'F');
        // Label inside if segment is wide enough
        if (segW > 20) {
          doc.setFontSize(7);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text(`${statusLabels[status] || status}: ${count}`, stackX + 2, y + 6);
        }
        stackX += segW;
      });
      y += stackBarH + 6;

      // Legend below
      let legendX = 20;
      Object.entries(statusCounts).forEach(([status, count]) => {
        const c = statusColorsPie[status] || [156, 163, 175];
        doc.setFillColor(c[0], c[1], c[2]);
        doc.rect(legendX, y, 3, 3, 'F');
        doc.setFontSize(7);
        doc.setTextColor(55, 65, 81);
        doc.setFont('helvetica', 'normal');
        doc.text(`${statusLabels[status] || status} (${count})`, legendX + 4, y + 3);
        legendX += 50;
      });

      // ── Page 3: Detailed Table ──
      doc.addPage();
      doc.setFontSize(20);
      doc.setTextColor(79, 70, 229);
      doc.setFont('helvetica', 'bold');
      doc.text('Finexa - Credit Targets Report', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(`${getMonthLabel(selectedMonth)} - Detailed Breakdown`, pageWidth / 2, 25, { align: 'center' });

      const tableData = sortedRows.map((r, i) => {
        const needed = r.target?.targetClosingCredit != null
          ? Math.max(0, r.stats.currentCredit - (r.target.targetClosingCredit || 0))
          : 0;
        const statusLabel = statusConfig[r.stats.status]?.label || r.stats.status;
        return [
          String(i + 1),
          r.ob.name,
          r.target?.openingCredit != null ? formatPKR(r.target.openingCredit) : '-',
          formatPKR(r.stats.currentCredit),
          r.target?.targetClosingCredit != null ? formatPKR(r.target.targetClosingCredit) : '-',
          formatPKR(r.stats.recoveryDone),
          r.target?.targetClosingCredit != null ? formatPKR(needed) : '-',
          `${r.stats.progress}%`,
          statusLabel,
        ];
      });

      autoTable(doc, {
        head: [['#', 'Orderbooker', 'Opening', 'Current', 'Target', 'Recovery', 'Needed', 'Prog%', 'Status']],
        body: tableData,
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 7.5, textColor: [55, 65, 81] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'center' },
          8: { halign: 'center' },
        },
      });

      // Footer
      const finalY = (doc as any).lastAutoTable?.finalY || 200;
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.setFont('helvetica', 'italic');
      doc.text('Generated by Finexa Admin Portal - Credit Targets Report', pageWidth / 2, pageHeight - 10, { align: 'center' });

      doc.save(`credit-targets-${selectedMonth}.pdf`);
      toast({ title: 'Export Complete', description: 'Credit Targets PDF downloaded' });
    } catch (e: any) {
      console.error('PDF export error:', e);
      toast({ title: 'Export Failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setExportingPdf(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const obRes = await apiFetch('/api/orderbookers');
      const obs = obRes.ok ? await obRes.json() : [];
      const activeOBs = Array.isArray(obs)
        ? obs.filter((o: Orderbooker) => o.status === 'active')
        : [];
      setOrderbookers(activeOBs);

      // Fetch credit target + stats for each OB
      const rowPromises = activeOBs.map(async (ob: Orderbooker) => {
        try {
          const res = await apiFetch(`/api/users/${ob.id}/credit-target?month=${selectedMonth}`);
          if (res.ok) {
            const data = await res.json();
            return {
              ob,
              target: data.target || null,
              stats: data.stats || { currentCredit: 0, recoveryDone: 0, recoveryNeeded: 0, progress: 0, status: 'no_target', prevMonthClosing: null },
            } as OBRow;
          }
        } catch {}
        return {
          ob,
          target: null,
          stats: { currentCredit: 0, recoveryDone: 0, recoveryNeeded: 0, progress: 0, status: 'no_target', prevMonthClosing: null },
        } as OBRow;
      });
      const rows = await Promise.all(rowPromises);
      setObRows(rows);
    } catch {
      toast({ title: 'Error', description: 'Failed to load credit targets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Summary KPIs
  const summary = useMemo(() => {
    const withTargets = obRows.filter(r => r.target?.targetClosingCredit !== null && r.target?.targetClosingCredit !== undefined);
    const totalCurrentCredit = obRows.reduce((s, r) => s + (r.stats?.currentCredit || 0), 0);
    const totalTargetClosing = withTargets.reduce((s, r) => s + (r.target?.targetClosingCredit || 0), 0);
    const totalOpening = withTargets.reduce((s, r) => s + (r.target?.openingCredit || 0), 0);
    const totalRecovery = obRows.reduce((s, r) => s + (r.stats?.recoveryDone || 0), 0);
    const onTrack = withTargets.filter(r => r.stats.progress >= 80).length;
    const achieved = withTargets.filter(r => r.stats.status === 'achieved').length;
    return {
      totalOBs: orderbookers.length,
      totalCurrentCredit,
      totalTargetClosing,
      totalOpening,
      totalRecovery,
      onTrack,
      achieved,
      withTargetCount: withTargets.length,
    };
  }, [obRows, orderbookers]);

  // Month options (past 6 + future 2)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = -6; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      options.push({ value: val, label: getMonthLabel(val) });
    }
    return options;
  }, []);

  const handleOpenDialog = (ob: Orderbooker) => {
    setEditingOB(ob);
    const existing = obRows.find(r => r.ob.id === ob.id);
    if (existing?.target) {
      setTargetClosingCredit(String(existing.target.targetClosingCredit || ''));
      setOpeningCredit(existing.target.openingCredit ? String(existing.target.openingCredit) : '');
      setAutoOpening(false);
    } else {
      setTargetClosingCredit('');
      setOpeningCredit('');
      setAutoOpening(true);
    }
    setDialogOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!editingOB || !targetClosingCredit) return;
    const closingTarget = parseFloat(targetClosingCredit);
    if (isNaN(closingTarget) || closingTarget < 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid target closing credit', variant: 'destructive' });
      return;
    }

    let openingVal: number | undefined = undefined;
    if (!autoOpening && openingCredit) {
      openingVal = parseFloat(openingCredit);
      if (isNaN(openingVal) || openingVal < 0) {
        toast({ title: 'Invalid Opening', description: 'Opening credit must be a valid number', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/users/${editingOB.id}/credit-target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          targetClosingCredit: closingTarget,
          openingCredit: autoOpening ? undefined : openingVal,
        }),
      });
      if (res.ok) {
        toast({
          title: 'Credit Target Saved',
          description: `${getMonthLabel(selectedMonth)} target for ${editingOB.name}: Close at ${formatPKR(closingTarget)}`,
        });
        setDialogOpen(false);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: err.error || 'Failed to save target', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTarget = async () => {
    if (!deletingRow?.target) return;
    setDeleting(true);
    try {
      const res = await apiFetch(
        `/api/users/${deletingRow.ob.id}/credit-target?month=${selectedMonth}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        toast({
          title: 'Target Deleted',
          description: `Credit target for ${deletingRow.ob.name} (${getMonthLabel(selectedMonth)}) removed`,
        });
        setDeleteDialogOpen(false);
        fetchData();
      } else {
        toast({ title: 'Error', description: 'Failed to delete target', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <CreditTargetsSkeleton />;

  const sortedRows = [...obRows].sort((a, b) => {
    // Achieved first, then on_track, then behind, then critical, then no_target
    const order = ['achieved', 'on_track', 'behind', 'critical', 'no_target'];
    const aIdx = order.indexOf(a.stats.status);
    const bIdx = order.indexOf(b.stats.status);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return (b.stats.progress || 0) - (a.stats.progress || 0);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Credit Closing Targets
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set monthly credit balance targets for orderbookers — they must reduce outstanding credit to target by month-end
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleExportExcel}
            disabled={exportingExcel || !obRows.length}
          >
            {exportingExcel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleExportPdf}
            disabled={exportingPdf || !obRows.length}
          >
            {exportingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <Badge variant="secondary" className="text-[10px]">Active</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Orderbookers</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.totalOBs}</p>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{getMonthLabel(selectedMonth).split(' ')[0]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Current Credit (All OBs)</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{formatPKR(summary.totalCurrentCredit)}</p>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Target className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{summary.withTargetCount}/{summary.totalOBs} set</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Target Closing</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{formatPKR(summary.totalTargetClosing)}</p>
          </CardContent>
        </Card>

        <Card className="card-hover border border-border hover-scale-102">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <Badge variant="secondary" className="text-[10px]">{summary.achieved} achieved</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mb-0.5">On Track (80%+)</p>
            <p className="text-2xl font-bold tabular-nums number-animate">{summary.onTrack}/{summary.withTargetCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Targets Table */}
      <Card className="card-elevated">
        <CardHeader className="pb-3 pt-4 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" />
            Orderbooker Credit Targets — {getMonthLabel(selectedMonth)}
            <Badge variant="secondary" className="text-[11px] ml-1">{obRows.length} OBs</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-indigo-800 dark:bg-indigo-950 hover:bg-indigo-800 dark:hover:bg-indigo-950">
                  <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Orderbooker</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Opening Credit</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Current Credit</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Target Closing</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Recovery Done</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-right">Still Needed</TableHead>
                  <TableHead className="text-white font-semibold text-xs">Progress</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                  <TableHead className="text-white font-semibold text-xs text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <div className="text-center py-10">
                        <Users className="h-10 w-10 mx-auto mb-2 text-slate-400/40" />
                        <p className="font-medium text-muted-foreground text-sm">No orderbookers found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedRows.map((row, idx) => {
                    const { ob, target, stats } = row;
                    const statusInfo = statusConfig[stats.status] || statusConfig.no_target;
                    const hasTarget = target?.targetClosingCredit !== null && target?.targetClosingCredit !== undefined;
                    return (
                      <TableRow
                        key={ob.id}
                        className={`${idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'} table-row-hover-effect`}
                      >
                        <TableCell className="text-sm">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground shrink-0">
                            {idx + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{ob.name}</p>
                          <p className="text-[11px] text-muted-foreground">@{ob.username}</p>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {target?.openingCredit != null ? formatPKR(target.openingCredit) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold text-red-600 dark:text-red-400">
                          {formatPKR(stats.currentCredit)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                          {hasTarget && target?.targetClosingCredit != null ? formatPKR(target.targetClosingCredit) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-blue-600 dark:text-blue-400">
                          {formatPKR(stats.recoveryDone)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                          {hasTarget ? formatPKR(stats.recoveryNeeded) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {hasTarget ? (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={stats.progress} className="h-2 flex-1" />
                              <span className="text-xs font-semibold tabular-nums w-9">{stats.progress}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-[10px] border font-semibold ${statusInfo.color}`}>
                            {statusInfo.icon} {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {hasTarget ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleOpenDialog(ob)}
                                  title="Edit target"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  onClick={() => { setDeletingRow(row); setDeleteDialogOpen(true); }}
                                  title="Delete target"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 text-xs"
                                onClick={() => handleOpenDialog(ob)}
                              >
                                <Plus className="h-3 w-3" />
                                Set Target
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Set/Edit Target Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Credit Target — {editingOB?.name}
            </DialogTitle>
            <DialogDescription>
              Set the closing credit balance target for {getMonthLabel(selectedMonth)}.
              The orderbooker must reduce outstanding credit to this amount by month-end.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Opening Credit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="opening-credit">Opening Credit (start of month)</Label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOpening}
                    onChange={(e) => setAutoOpening(e.target.checked)}
                    className="rounded"
                  />
                  Auto (from prev month)
                </label>
              </div>
              <Input
                id="opening-credit"
                type="number"
                value={openingCredit}
                onChange={(e) => setOpeningCredit(e.target.value)}
                placeholder="Auto-calculated"
                disabled={autoOpening}
                className={!autoOpening ? '' : 'bg-muted text-muted-foreground'}
              />
              <p className="text-[11px] text-muted-foreground">
                Auto = previous month's closing balance. If no previous target, uses current credit balance.
              </p>
            </div>

            {/* Target Closing Credit */}
            <div className="space-y-2">
              <Label htmlFor="target-closing">Target Closing Credit (end of month) *</Label>
              <Input
                id="target-closing"
                type="number"
                value={targetClosingCredit}
                onChange={(e) => setTargetClosingCredit(e.target.value)}
                placeholder="e.g. 200000"
              />
              <p className="text-[11px] text-muted-foreground">
                Orderbooker must bring credit down to this amount by month-end.
              </p>
            </div>

            {/* Live preview */}
            {editingOB && obRows.find(r => r.ob.id === editingOB.id)?.stats && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Current Status</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current Credit:</span>
                  <span className="font-semibold tabular-nums">{formatPKR(obRows.find(r => r.ob.id === editingOB.id)!.stats.currentCredit)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Recovery Done:</span>
                  <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">{formatPKR(obRows.find(r => r.ob.id === editingOB.id)!.stats.recoveryDone)}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveTarget} disabled={saving || !targetClosingCredit}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {saving ? 'Saving...' : 'Save Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Delete Credit Target?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the credit target for{' '}
              <strong>{deletingRow?.ob.name}</strong> for{' '}
              <strong>{getMonthLabel(selectedMonth)}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTarget} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {deleting ? 'Deleting...' : 'Delete Target'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
