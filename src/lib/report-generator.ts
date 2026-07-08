/**
 * Finexa — Print-Friendly PDF Report Generator
 *
 * Generates professional PDF reports using jsPDF + jspdf-autotable.
 * All reports share a consistent navy blue branded header and generation timestamp.
 *
 * jspdf and jspdf-autotable are dynamically imported to avoid adding ~400KB
 * to the initial JS bundle. Only the type is statically imported.
 */

import type jsPDF from 'jspdf';
import { getBusinessName, getBusinessPhone } from './business-config';

// ─── Brand Constants ────────────────────────────────────────────────────
const NAVY_BLUE: [number, number, number] = [30, 58, 138];    // #4F46E5
const SLATE_GREY: [number, number, number] = [71, 85, 105];
const LIGHT_BLUE: [number, number, number] = [239, 246, 255];
const GREEN_TEXT: [number, number, number] = [6, 95, 70];
const RED_TEXT: [number, number, number] = [185, 28, 28];
const AMBER_TEXT: [number, number, number] = [146, 64, 14];

// ─── Helpers ────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCurrencyShort(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function todayStamp(): string {
  return new Date().toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Draw the standard header on a jsPDF doc and return the Y position after it. */
function drawHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const businessPhone = getBusinessPhone();
  const headerHeight = businessPhone ? 42 : 36;

  // Navy blue gradient header
  doc.setFillColor(...NAVY_BLUE);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(getBusinessName(), pageWidth / 2, 13, { align: 'center' });

  // Business phone (below company name)
  if (businessPhone) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tel: ${businessPhone}`, pageWidth / 2, 18, { align: 'center' });
  }

  // Tagline
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Smart Credit & Route Management System', pageWidth / 2, businessPhone ? 23 : 19, { align: 'center' });

  // Document title
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, businessPhone ? 35 : 30, { align: 'center' });

  // Divider
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  const dividerY = businessPhone ? 44 : 38;
  doc.line(15, dividerY, pageWidth - 15, dividerY);

  // Generation timestamp (right aligned)
  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generated: ${todayStamp()}`, pageWidth - 15, dividerY + 5, { align: 'right' });

  // Subtitle (left aligned, if provided)
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, 15, dividerY + 5);
  }

  return dividerY + 10;
}

/** Draw the standard footer on every page. */
function drawFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 12;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(15, footerY - 4, pageWidth - 15, footerY - 4);

  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('© 2026 Finexa. All rights reserved. Prohibited under Copyright Ordinance 1962 & PECA 2016.', pageWidth / 2, footerY, { align: 'center' });
  doc.text('This is a computer-generated document and does not require a signature.', pageWidth / 2, footerY + 4, { align: 'center' });

  // Page number
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_GREY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 15, pageHeight - 6, { align: 'right' });
  }
}

// ─── Type Definitions ───────────────────────────────────────────────────

export interface RecoveryReportData {
  date: string;
  grandTotalRecovery: number;
  orderbookers: {
    orderbookerId: string;
    orderbookerName: string;
    totalRecovery: number;
    totalShops: number;
    visitedShops: number;
    shops: {
      shopName: string;
      shopArea: string | null;
      previousBalance: number;
      todayCredit: number;
      todayRecovery: number;
      closingBalance: number;
      visited: boolean;
      recoveryEntries: {
        amount: number;
        time: string;
        description: string | null;
      }[];
    }[];
  }[];
}

export interface MonthlySummaryData {
  month: string;
  monthLabel: string;
  totalCredit: number;
  totalRecovery: number;
  netChange: number;
  shopCount: number;
  activeOrderbookers: number;
  dailyBreakdown: {
    date: string;
    credit: number;
    recovery: number;
    net: number;
  }[];
  topRecoveryShops: {
    shopName: string;
    area: string;
    recovery?: number;
    orderbookerName: string;
  }[];
  topCreditShops: {
    shopName: string;
    area: string;
    credit?: number;
    orderbookerName: string;
  }[];
  orderbookerBreakdown: {
    name: string;
    credit: number;
    recovery: number;
    shops: number;
  }[];
}

export interface ShopData {
  id: string;
  name: string;
  ownerName: string | null;
  area: string | null;
  routeDays: string[];
  balance: number;
  creditLimit: number;
  status: string;
  orderbooker: {
    id: string;
    name: string;
  } | null;
}

export interface OBPerformanceData {
  orderbookerId: string;
  orderbookerName: string;
  orderbookerPhone: string | null;
  orderbookerStatus: string;
  totalShops: number;
  totalOutstanding: number;
  todayRecovery: number;
  periodRecovery: number;
  lastActive: string | null;
  avgRecoveryPerShop: number;
  recoveryRate: number;
}

// ─── 1. Recovery Report PDF ─────────────────────────────────────────────

export async function generateRecoveryReportPDF(data: RecoveryReportData): Promise<jsPDF> {
  const [{ default: jsPDFLib }, { default: autoTableLib }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDFLib('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  let yPos = drawHeader(doc, 'RECOVERY REPORT', `Date: ${formatDate(data.date)}`);

  // Summary cards
  const totalShops = data.orderbookers.reduce((s, ob) => s + ob.totalShops, 0);
  const totalVisited = data.orderbookers.reduce((s, ob) => s + ob.visitedShops, 0);
  const avgRecovery = data.orderbookers.length > 0 ? data.grandTotalRecovery / data.orderbookers.length : 0;
  const topOB = data.orderbookers.length > 0
    ? data.orderbookers.reduce((best, ob) => ob.totalRecovery > best.totalRecovery ? ob : best, data.orderbookers[0])
    : null;

  // Three summary cards
  const cardWidth = (pageWidth - 40) / 3;
  const cardColors: [number, number, number][] = [
    [209, 250, 229], // green
    [219, 234, 254], // blue
    [254, 243, 199], // amber
  ];
  const cardData = [
    { label: 'Total Recovery', value: formatCurrencyShort(data.grandTotalRecovery) },
    { label: 'Average Recovery/OB', value: formatCurrencyShort(avgRecovery) },
    { label: 'Shops Visited', value: `${totalVisited} / ${totalShops}` },
  ];

  cardData.forEach((card, i) => {
    const x = 15 + i * (cardWidth + 5);
    doc.setFillColor(...cardColors[i]);
    doc.roundedRect(x, yPos, cardWidth, 18, 2, 2, 'F');

    doc.setTextColor(...SLATE_GREY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, x + cardWidth / 2, yPos + 6, { align: 'center' });

    doc.setTextColor(...NAVY_BLUE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, x + cardWidth / 2, yPos + 14, { align: 'center' });
  });

  yPos += 24;

  // Top OB highlight
  if (topOB) {
    doc.setFillColor(...LIGHT_BLUE);
    doc.roundedRect(15, yPos, pageWidth - 30, 10, 2, 2, 'F');
    doc.setTextColor(...NAVY_BLUE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Top Orderbooker: ${topOB.orderbookerName} — ${formatCurrencyShort(topOB.totalRecovery)} (${topOB.visitedShops}/${topOB.totalShops} shops)`, pageWidth / 2, yPos + 6.5, { align: 'center' });
    yPos += 14;
  }

  // Build table data — flat list of shop recoveries
  const tableRows: (string | number)[][] = [];
  data.orderbookers.forEach((ob) => {
    ob.shops.forEach((shop) => {
      if (shop.todayRecovery > 0 || shop.visited) {
        tableRows.push([
          shop.shopName,
          ob.orderbookerName,
          formatCurrencyShort(shop.closingBalance),
          formatCurrencyShort(shop.todayRecovery),
          formatDate(data.date),
        ]);
      }
    });
  });

  if (tableRows.length > 0) {
    autoTableLib(doc, {
      startY: yPos,
      head: [['Shop Name', 'OB Name', 'Balance', 'Recovery Amount', 'Recovery Date']],
      body: tableRows,
      headStyles: {
        fillColor: NAVY_BLUE,
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [30, 41, 59],
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 35 },
        2: { halign: 'right', cellWidth: 32 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'center', cellWidth: 28 },
      },
      margin: { left: 15, right: 15 },
      didParseCell: (hookData: { section: string; column: { index: number }; cell: { raw: unknown; styles: { textColor: number[]; fontStyle: string } } }) => {
        if (hookData.section === 'body' && hookData.column.index === 3) {
          hookData.cell.styles.textColor = GREEN_TEXT;
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
  } else {
    doc.setTextColor(...SLATE_GREY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text('No recovery data for this date.', pageWidth / 2, yPos + 10, { align: 'center' });
  }

  drawFooter(doc);
  return doc;
}

export async function downloadRecoveryReportPDF(data: RecoveryReportData): Promise<void> {
  const doc = await generateRecoveryReportPDF(data);
  const fileName = `Finexa_Recovery_${data.date}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ─── 2. Monthly Summary PDF ────────────────────────────────────────────

export async function generateMonthlySummaryPDF(data: MonthlySummaryData): Promise<jsPDF> {
  const [{ default: jsPDFLib }, { default: autoTableLib }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDFLib('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  let yPos = drawHeader(doc, 'MONTHLY SUMMARY REPORT', data.monthLabel);

  // Summary row
  const recoveryRate = data.totalCredit > 0 ? Math.round((data.totalRecovery / data.totalCredit) * 100) : 0;
  const summaryItems = [
    { label: 'Total Credit', value: formatCurrencyShort(data.totalCredit), color: AMBER_TEXT },
    { label: 'Total Recovery', value: formatCurrencyShort(data.totalRecovery), color: GREEN_TEXT },
    { label: 'Net Change', value: formatCurrencyShort(Math.abs(data.netChange)), color: data.netChange > 0 ? RED_TEXT : GREEN_TEXT },
    { label: 'Recovery Rate', value: `${recoveryRate}%`, color: recoveryRate >= 80 ? GREEN_TEXT : recoveryRate >= 50 ? AMBER_TEXT : RED_TEXT },
  ];

  const cardW = (pageWidth - 50) / 4;
  const bgColors: [number, number, number][] = [
    [254, 243, 199], [209, 250, 229], [219, 234, 254], [243, 232, 255],
  ];

  summaryItems.forEach((item, i) => {
    const x = 15 + i * (cardW + 5);
    doc.setFillColor(...bgColors[i]);
    doc.roundedRect(x, yPos, cardW, 20, 2, 2, 'F');

    doc.setTextColor(...SLATE_GREY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, x + cardW / 2, yPos + 6, { align: 'center' });

    doc.setTextColor(...item.color);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const prefix = item.label === 'Net Change' ? (data.netChange > 0 ? '+' : data.netChange < 0 ? '-' : '') : '';
    doc.text(`${prefix}${item.value}`, x + cardW / 2, yPos + 15, { align: 'center' });
  });

  yPos += 28;

  // Per-OB breakdown table
  const obRows = data.orderbookerBreakdown.map((ob) => [
    ob.name,
    String(ob.shops),
    formatCurrencyShort(ob.credit),
    formatCurrencyShort(ob.recovery),
    formatCurrencyShort(Math.abs(ob.credit - ob.recovery)),
  ]);

  // Grand totals
  const grandCredit = data.orderbookerBreakdown.reduce((s, ob) => s + ob.credit, 0);
  const grandRecovery = data.orderbookerBreakdown.reduce((s, ob) => s + ob.recovery, 0);
  const grandShops = data.orderbookerBreakdown.reduce((s, ob) => s + ob.shops, 0);
  const grandOutstanding = grandCredit - grandRecovery;

  obRows.push([
    'GRAND TOTAL',
    String(grandShops),
    formatCurrencyShort(grandCredit),
    formatCurrencyShort(grandRecovery),
    formatCurrencyShort(Math.abs(grandOutstanding)),
  ]);

  autoTableLib(doc, {
    startY: yPos,
    head: [['OB Name', 'Shops', 'Credits', 'Recoveries', 'Outstanding']],
    body: obRows,
    headStyles: {
      fillColor: NAVY_BLUE,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
      4: { halign: 'right', cellWidth: 35 },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (hookData: { section: string; row: { index: number }; column: { index: number }; cell: { raw: unknown; styles: { fillColor?: number[]; textColor: number[]; fontStyle: string } } }) => {
      // Style the grand total row
      if (hookData.section === 'body' && hookData.row.index === obRows.length - 1) {
        hookData.cell.styles.fillColor = LIGHT_BLUE;
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = NAVY_BLUE;
      }
      // Color-code credit / recovery columns
      if (hookData.section === 'body' && hookData.row.index < obRows.length - 1) {
        if (hookData.column.index === 2) {
          hookData.cell.styles.textColor = AMBER_TEXT;
        }
        if (hookData.column.index === 3) {
          hookData.cell.styles.textColor = GREEN_TEXT;
        }
      }
    },
  });

  // Top shops section on a new page
  if (data.topRecoveryShops.length > 0 || data.topCreditShops.length > 0) {
    doc.addPage();
    let newY = drawHeader(doc, 'MONTHLY SUMMARY — TOP SHOPS', data.monthLabel);

    if (data.topRecoveryShops.length > 0) {
      doc.setTextColor(...NAVY_BLUE);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Top Recovery Shops', 15, newY);
      newY += 4;

      autoTableLib(doc, {
        startY: newY,
        head: [['#', 'Shop', 'Area', 'Recovery', 'OB']],
        body: data.topRecoveryShops.map((s, i) => [
          i + 1,
          s.shopName,
          s.area || '—',
          formatCurrencyShort(s.recovery || 0),
          s.orderbookerName,
        ]),
        headStyles: {
          fillColor: GREEN_TEXT,
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          cellPadding: 3,
        },
        bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 15, right: 15 },
      });

      newY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY + 8;
    }

    if (data.topCreditShops.length > 0) {
      doc.setTextColor(...NAVY_BLUE);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Top Credit Shops', 15, newY);
      newY += 4;

      autoTableLib(doc, {
        startY: newY,
        head: [['#', 'Shop', 'Area', 'Credit', 'OB']],
        body: data.topCreditShops.map((s, i) => [
          i + 1,
          s.shopName,
          s.area || '—',
          formatCurrencyShort(s.credit || 0),
          s.orderbookerName,
        ]),
        headStyles: {
          fillColor: AMBER_TEXT,
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          cellPadding: 3,
        },
        bodyStyles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 41, 59] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 15, right: 15 },
      });
    }
  }

  drawFooter(doc);
  return doc;
}

export async function downloadMonthlySummaryPDF(data: MonthlySummaryData): Promise<void> {
  const doc = await generateMonthlySummaryPDF(data);
  const fileName = `Finexa_Monthly_${data.month}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ─── 3. Shop List PDF ──────────────────────────────────────────────────

export async function generateShopListPDF(shops: ShopData[]): Promise<jsPDF> {
  const [{ default: jsPDFLib }, { default: autoTableLib }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDFLib('l', 'mm', 'a4'); // Landscape for many columns
  const pageWidth = doc.internal.pageSize.getWidth();

  let yPos = drawHeader(doc, 'COMPLETE SHOP LISTING', `${shops.length} shops`);

  // Filter counts
  const activeCount = shops.filter((s) => s.status === 'active').length;
  const inactiveCount = shops.length - activeCount;
  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Active: ${activeCount}  |  Inactive: ${inactiveCount}`, 15, yPos);
  yPos += 4;

  const tableRows = shops.map((shop) => [
    shop.name,
    shop.ownerName || '—',
    shop.area || '—',
    shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', '),
    shop.orderbooker?.name || '—',
    formatCurrencyShort(shop.balance),
    formatCurrencyShort(shop.creditLimit),
    shop.status.toUpperCase(),
  ]);

  autoTableLib(doc, {
    startY: yPos,
    head: [['Shop Name', 'Owner', 'Area', 'Route', 'OB', 'Balance', 'Credit Limit', 'Status']],
    body: tableRows,
    headStyles: {
      fillColor: NAVY_BLUE,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 18 },
      4: { cellWidth: 28 },
      5: { halign: 'right', cellWidth: 26 },
      6: { halign: 'right', cellWidth: 26 },
      7: { halign: 'center', cellWidth: 18 },
    },
    margin: { left: 10, right: 10 },
    didParseCell: (hookData: { section: string; column: { index: number }; row: { index: number }; cell: { raw: unknown; styles: { textColor: number[]; fontStyle: string } } }) => {
      // Color-code status column
      if (hookData.section === 'body' && hookData.column.index === 7) {
        const val = String(hookData.cell.raw);
        if (val === 'ACTIVE') {
          hookData.cell.styles.textColor = GREEN_TEXT;
          hookData.cell.styles.fontStyle = 'bold';
        } else if (val === 'INACTIVE') {
          hookData.cell.styles.textColor = RED_TEXT;
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
      // Color-code balance column
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const raw = shops[hookData.row.index];
        if (raw && raw.balance > raw.creditLimit && raw.creditLimit > 0) {
          hookData.cell.styles.textColor = RED_TEXT;
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  drawFooter(doc);
  return doc;
}

export async function downloadShopListPDF(shops: ShopData[]): Promise<void> {
  const doc = await generateShopListPDF(shops);
  const fileName = `Finexa_Shops_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ─── 4. OB Performance PDF ─────────────────────────────────────────────

export async function generateOBPerformancePDF(data: OBPerformanceData[]): Promise<jsPDF> {
  const [{ default: jsPDFLib }, { default: autoTableLib }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDFLib('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  let yPos = drawHeader(doc, 'ORDERBOOKER PERFORMANCE REPORT', `${data.length} orderbookers`);

  // Summary KPIs
  const totalOBs = data.length;
  const totalOutstanding = data.reduce((s, ob) => s + ob.totalOutstanding, 0);
  const totalRecovery = data.reduce((s, ob) => s + ob.periodRecovery, 0);
  const avgBalance = totalOBs > 0 ? totalOutstanding / totalOBs : 0;

  const kpis = [
    { label: 'Total OBs', value: String(totalOBs) },
    { label: 'Total Outstanding', value: formatCurrencyShort(totalOutstanding) },
    { label: 'Total Recovery', value: formatCurrencyShort(totalRecovery) },
    { label: 'Avg Balance/OB', value: formatCurrencyShort(avgBalance) },
  ];

  const kpiW = (pageWidth - 50) / 4;
  const kpiBg: [number, number, number][] = [
    [219, 234, 254], [254, 226, 226], [209, 250, 229], [254, 243, 199],
  ];

  kpis.forEach((kpi, i) => {
    const x = 15 + i * (kpiW + 5);
    doc.setFillColor(...kpiBg[i]);
    doc.roundedRect(x, yPos, kpiW, 18, 2, 2, 'F');

    doc.setTextColor(...SLATE_GREY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label, x + kpiW / 2, yPos + 6, { align: 'center' });

    doc.setTextColor(...NAVY_BLUE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + kpiW / 2, yPos + 14, { align: 'center' });
  });

  yPos += 24;

  // Ranking table
  const tableRows = data.map((ob, idx) => {
    const perfLabel = ob.recoveryRate >= 80 ? 'Excellent' : ob.recoveryRate >= 50 ? 'Good' : 'Low';
    return [
      idx + 1,
      ob.orderbookerName,
      String(ob.totalShops),
      formatCurrencyShort(ob.totalOutstanding),
      formatCurrencyShort(ob.periodRecovery),
      formatCurrencyShort(ob.avgRecoveryPerShop),
      `${ob.recoveryRate}%`,
      perfLabel,
      ob.lastActive ? formatDate(ob.lastActive) : 'Never',
    ];
  });

  autoTableLib(doc, {
    startY: yPos,
    head: [['#', 'OB Name', 'Shops', 'Outstanding', 'Recovery', 'Avg/Shop', 'Rate', 'Rating', 'Last Active']],
    body: tableRows,
    headStyles: {
      fillColor: NAVY_BLUE,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 35 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 18 },
      8: { halign: 'center', cellWidth: 22 },
    },
    margin: { left: 12, right: 12 },
    didParseCell: (hookData: { section: string; column: { index: number }; row: { index: number }; cell: { raw: unknown; styles: { textColor: number[]; fontStyle: string } } }) => {
      if (hookData.section === 'body') {
        // Color-code rating column
        if (hookData.column.index === 7) {
          const val = String(hookData.cell.raw);
          if (val === 'Excellent') {
            hookData.cell.styles.textColor = GREEN_TEXT;
            hookData.cell.styles.fontStyle = 'bold';
          } else if (val === 'Good') {
            hookData.cell.styles.textColor = AMBER_TEXT;
            hookData.cell.styles.fontStyle = 'bold';
          } else if (val === 'Low') {
            hookData.cell.styles.textColor = RED_TEXT;
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
        // Highlight recovery column green
        if (hookData.column.index === 4) {
          hookData.cell.styles.textColor = GREEN_TEXT;
        }
        // Highlight outstanding column red
        if (hookData.column.index === 3) {
          hookData.cell.styles.textColor = RED_TEXT;
        }
        // Medal for top 3
        if (hookData.column.index === 0) {
          const rank = hookData.row.index;
          if (rank === 0) hookData.cell.styles.textColor = AMBER_TEXT;
          else if (rank === 1) hookData.cell.styles.textColor = SLATE_GREY;
          else if (rank === 2) hookData.cell.styles.textColor = [180, 83, 9] as [number, number, number];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  drawFooter(doc);
  return doc;
}

export async function downloadOBPerformancePDF(data: OBPerformanceData[]): Promise<void> {
  const doc = await generateOBPerformancePDF(data);
  const fileName = `Finexa_OB_Performance_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// Re-export formatting helpers for use in components
export { formatCurrency, formatCurrencyShort, formatDate, formatDateTime };

// ─── Claim Receipt PDF ─────────────────────────────────────────────────

export interface ClaimReceiptData {
  claimId: string;
  shopName: string;
  shopOwner: string | null;
  shopArea: string | null;
  orderbookerName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string;
  createdAt: string;
  adminName: string;
  companyName?: string | null;
}

export async function generateClaimReceiptPDF(data: ClaimReceiptData): Promise<jsPDF> {
  const [{ default: jsPDFLib }] = await Promise.all([
    import('jspdf'),
  ]);

  const doc = new jsPDFLib('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const businessName = getBusinessName();

  // ── Header ──
  doc.setFillColor(...NAVY_BLUE);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(businessName, pageWidth / 2, 14, { align: 'center' });

  doc.setFontSize(12);
  doc.text('CLAIM RECEIPT', pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Ref: ${data.claimId}`, pageWidth - 15, 30, { align: 'right' });

  // ── Red accent line ──
  doc.setFillColor(185, 28, 28); // RED
  doc.rect(0, 35, pageWidth, 3, 'F');

  // ── Date & Time ──
  let yPos = 45;
  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formatDateTime(data.createdAt)}`, 15, yPos);

  const businessPhone = getBusinessPhone();
  if (businessPhone) {
    doc.text(`Phone: ${businessPhone}`, pageWidth - 15, yPos, { align: 'right' });
  }
  yPos += 10;

  // ── Shop Details ──
  const shopDetailsHeight = data.companyName ? 38 : 30;
  doc.setFillColor(...LIGHT_BLUE);
  doc.roundedRect(15, yPos - 4, pageWidth - 30, shopDetailsHeight, 2, 2, 'F');

  doc.setTextColor(...NAVY_BLUE);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Shop Details', 20, yPos + 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Shop: ${data.shopName}`, 20, yPos + 11);
  doc.text(`Owner: ${data.shopOwner || '—'}`, 20, yPos + 18);
  doc.text(`Area: ${data.shopArea || '—'}`, pageWidth / 2 + 10, yPos + 11);
  doc.text(`Orderbooker: ${data.orderbookerName}`, pageWidth / 2 + 10, yPos + 18);
  if (data.companyName) {
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.text(`Company: ${data.companyName}`, 20, yPos + 25);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
  }
  yPos += shopDetailsHeight + 4;

  // ── Claim Amount (BIG RED) ──
  doc.setFillColor(254, 226, 226); // light red bg
  doc.roundedRect(15, yPos - 2, pageWidth - 30, 20, 2, 2, 'F');

  doc.setTextColor(185, 28, 28);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CLAIM AMOUNT (DEDUCTED)', 20, yPos + 5);

  doc.setFontSize(16);
  doc.text(formatCurrency(data.amount), pageWidth - 20, yPos + 12, { align: 'right' });
  yPos += 26;

  // ── Balance Summary ──
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, yPos - 2, pageWidth - 30, 28, 2, 2, 'F');

  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  doc.text('Previous Balance:', 20, yPos + 5);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.previousBalance), pageWidth - 20, yPos + 5, { align: 'right' });

  doc.setTextColor(...RED_TEXT);
  doc.setFont('helvetica', 'normal');
  doc.text('Claim Deducted:', 20, yPos + 12);
  doc.setFont('helvetica', 'bold');
  doc.text(`- ${formatCurrency(data.amount)}`, pageWidth - 20, yPos + 12, { align: 'right' });

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(20, yPos + 16, pageWidth - 20, yPos + 16);

  doc.setTextColor(...NAVY_BLUE);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('New Balance:', 20, yPos + 22);
  doc.setFontSize(11);
  doc.text(formatCurrency(data.newBalance), pageWidth - 20, yPos + 22, { align: 'right' });
  yPos += 34;

  // ── Reason ──
  if (data.description) {
    doc.setTextColor(...SLATE_GREY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Reason / Description:', 15, yPos);
    yPos += 5;

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(data.description, pageWidth - 30);
    doc.text(lines, 15, yPos);
    yPos += lines.length * 5 + 5;
  }

  // ── Signature Area ──
  yPos = Math.max(yPos + 20, 200);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);

  doc.line(15, yPos, 80, yPos);
  doc.line(pageWidth - 80, yPos, pageWidth - 15, yPos);

  doc.setTextColor(...SLATE_GREY);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', 15, yPos + 5);
  doc.text('Shop Keeper Signature', pageWidth - 80, yPos + 5);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by ${businessName} Finexa CMS — ${formatDateTime(new Date().toISOString())}`, pageWidth / 2, 285, { align: 'center' });

  return doc;
}

export async function downloadClaimReceiptPDF(data: ClaimReceiptData): Promise<void> {
  const doc = await generateClaimReceiptPDF(data);
  const fileName = `Claim_${data.shopName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
