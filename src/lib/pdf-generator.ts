import { getBusinessName, getBusinessPhone } from './business-config';

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  companyId?: string | null;
  createdAt: string;
  creator: {
    name: string;
    role: string;
  };
  company?: {
    id: string;
    name: string;
  } | null;
}

export interface LedgerData {
  shop: {
    name: string;
    ownerName: string | null;
    area: string | null;
    address: string | null;
    phone: string | null;
    routeDays: string[];
    balance: number;
    orderbooker: {
      name: string;
      phone: string | null;
    };
  };
  transactions: LedgerEntry[];
  summary: {
    totalCredit: number;
    totalRecovery: number;
    totalClaims: number;
    totalTransactions: number;
    currentBalance: number;
  };
  companyBalances?: { companyId: string; companyName: string; balance: number }[];
  filteredCompanyName?: string | null;
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function generateLedgerPDF(ledger: LedgerData) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const navyBlue: [number, number, number] = [30, 58, 138];
  const slateGrey: [number, number, number] = [71, 85, 105];
  const lightBlue: [number, number, number] = [239, 246, 255];
  const businessPhone = getBusinessPhone();

  // Header background
  doc.setFillColor(...navyBlue);
  const headerHeight = businessPhone ? 47 : 42;
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(getBusinessName(), pageWidth / 2, 14, { align: 'center' });

  // Business phone (below company name)
  if (businessPhone) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tel: ${businessPhone}`, pageWidth / 2, 20, { align: 'center' });
  }

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Powered by Finexa', pageWidth / 2, businessPhone ? 25 : 23, { align: 'center' });

  // Document title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  const docTitle = ledger.filteredCompanyName
    ? `SHOP LEDGER — ${ledger.filteredCompanyName}`
    : 'SHOP LEDGER / KHATA';
  doc.text(docTitle, pageWidth / 2, businessPhone ? 35 : 34, { align: 'center' });

  // Divider line
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  const dividerY = businessPhone ? 45 : 44;
  doc.line(15, dividerY, pageWidth - 15, dividerY);

  // Shop Information Section
  let yPos = businessPhone ? 57 : 52;

  doc.setFillColor(...lightBlue);
  doc.roundedRect(15, yPos - 4, pageWidth - 30, 38, 3, 3, 'F');

  doc.setTextColor(...navyBlue);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(ledger.shop.name, 20, yPos + 4);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateGrey);

  const shopInfo = [
    [`Owner: ${ledger.shop.ownerName || 'N/A'}`, `Area: ${ledger.shop.area || 'N/A'}`],
    [`Route Days: ${ledger.shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}`, `Orderbooker: ${ledger.shop.orderbooker.name}`],
    [`Phone: ${ledger.shop.phone || 'N/A'}`, `Address: ${ledger.shop.address || 'N/A'}`],
  ];

  shopInfo.forEach((row, idx) => {
    doc.text(row[0], 20, yPos + 12 + idx * 5.5);
    doc.text(row[1], pageWidth / 2 + 10, yPos + 12 + idx * 5.5);
  });

  yPos += 44;

  // Summary Cards (4 cards: Credit, Recovery, Claims, Balance)
  const cardWidth = (pageWidth - 50) / 4;
  const cardGap = 5;
  doc.setFillColor(254, 243, 199); // amber
  doc.roundedRect(15, yPos, cardWidth, 18, 2, 2, 'F');
  doc.setFillColor(209, 250, 229); // green
  doc.roundedRect(15 + cardWidth + cardGap, yPos, cardWidth, 18, 2, 2, 'F');
  doc.setFillColor(254, 226, 226); // red
  doc.roundedRect(15 + (cardWidth + cardGap) * 2, yPos, cardWidth, 18, 2, 2, 'F');
  doc.setFillColor(219, 234, 254); // blue
  doc.roundedRect(15 + (cardWidth + cardGap) * 3, yPos, cardWidth, 18, 2, 2, 'F');

  const cards = [
    { label: 'Total Credit', value: formatCurrency(ledger.summary.totalCredit), x: 15 },
    { label: 'Total Recovery', value: formatCurrency(ledger.summary.totalRecovery), x: 15 + cardWidth + cardGap },
    { label: 'Total Claims', value: formatCurrency(ledger.summary.totalClaims || 0), x: 15 + (cardWidth + cardGap) * 2 },
    { label: 'Current Balance', value: formatCurrency(ledger.summary.currentBalance), x: 15 + (cardWidth + cardGap) * 3 },
  ];

  cards.forEach((card) => {
    doc.setTextColor(...slateGrey);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, card.x + cardWidth / 2, yPos + 6, { align: 'center' });
    doc.setTextColor(...navyBlue);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(card.value, card.x + cardWidth / 2, yPos + 14, { align: 'center' });
  });

  yPos += 26;

  // Transactions Table
  const hasCompanyInfo = ledger.transactions.some(t => t.company);
  const tableData = ledger.transactions.map((txn, idx) => {
    const row: (string | number)[] = [
      idx + 1,
      formatDate(txn.createdAt),
      txn.type === 'credit' ? 'Credit' : txn.type === 'claim' ? 'Claim' : txn.type === 'supplier_collection' ? 'Supp. Coll.' : 'Recovery',
    ];
    if (hasCompanyInfo) {
      row.push(txn.company?.name || '—');
    }
    row.push(
      txn.description || (txn.type === 'credit' ? 'Goods supplied' : txn.type === 'claim' ? 'Claim deduction' : 'Cash collected'),
      formatCurrency(txn.amount),
      formatCurrency(txn.newBalance),
    );
    return row;
  });

  const tableHeaders = hasCompanyInfo
    ? ['#', 'Date & Time', 'Type', 'Company', 'Description', 'Amount', 'Balance']
    : ['#', 'Date & Time', 'Type', 'Description', 'Amount', 'Balance'];

  const columnStyles = hasCompanyInfo
    ? {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 34 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 25 },
        4: { cellWidth: 40 },
        5: { halign: 'right', cellWidth: 26 },
        6: { halign: 'right', cellWidth: 26 },
      }
    : {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 38 },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 50 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 28 },
      };

  autoTable(doc, {
    startY: yPos,
    head: [tableHeaders],
    body: tableData,
    headStyles: {
      fillColor: navyBlue,
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
    columnStyles,
    margin: { left: 15, right: 15 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        if (data.cell.raw === 'Credit') {
          data.cell.styles.textColor = [146, 64, 14];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'Claim') {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [6, 95, 70];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Make entire claim row have red background
      if (data.section === 'body') {
        const rowData = data.row.raw as any[];
        if (rowData && rowData[2] === 'Claim') {
          data.cell.styles.fillColor = [254, 242, 242]; // red-50
        }
      }
    },
  });

  // Footer
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || yPos + 100;
  const footerY = Math.max(finalY + 10, 250);

  if (footerY < 275) {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, footerY, pageWidth - 15, footerY);

    doc.setTextColor(...slateGrey);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleString('en-PK')}`, pageWidth / 2, footerY + 6, { align: 'center' });
    doc.text('© 2026 Finexa. All rights reserved. Unauthorized copying, reverse engineering, modification, or distribution is strictly prohibited under Copyright Ordinance 1962 & PECA 2016.', pageWidth / 2, footerY + 11, { align: 'center' });

    doc.setFontSize(7);
    doc.text('This is a computer-generated document and does not require a signature.', pageWidth / 2, footerY + 16, { align: 'center' });
  }

  return doc;
}

export async function downloadLedgerPDF(ledger: LedgerData): Promise<void> {
  const doc = await generateLedgerPDF(ledger);
  const companySuffix = ledger.filteredCompanyName ? `_${ledger.filteredCompanyName.replace(/\s+/g, '_')}` : '';
  const fileName = `Finexa_Ledger_${ledger.shop.name.replace(/\s+/g, '_')}${companySuffix}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// ─── Recovery / Credit Receipt ─────────────────────────────────────────
export interface RecoveryReceiptData {
  id: string;
  shopName: string;
  shopArea: string | null;
  orderbookerName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  type: string; // 'credit' | 'recovery'
  description: string;
  createdAt: string;
}

export async function downloadRecoveryReceipt(data: RecoveryReceiptData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const businessName = getBusinessName();
  const businessPhone = getBusinessPhone();

  const navyBlue: [number, number, number] = [30, 58, 138];
  const slateGrey: [number, number, number] = [71, 85, 105];
  const lightBlue: [number, number, number] = [239, 246, 255];

  const isCredit = data.type === 'credit';
  const typeLabel = isCredit ? 'Credit' : 'Recovery';

  // ── Header ──
  doc.setFillColor(...navyBlue);
  doc.rect(0, 0, pageWidth, 35, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(businessName, pageWidth / 2, 13, { align: 'center' });

  if (businessPhone) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tel: ${businessPhone}`, pageWidth / 2, 18, { align: 'center' });
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${typeLabel} Receipt`, pageWidth / 2, businessPhone ? 27 : 25, { align: 'center' });

  // ── Receipt Info ──
  let yPos = 45;

  // Shop info box
  doc.setFillColor(...lightBlue);
  doc.roundedRect(15, yPos - 3, pageWidth - 30, 28, 3, 3, 'F');

  doc.setTextColor(...navyBlue);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.shopName, 20, yPos + 5);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateGrey);
  if (data.shopArea) {
    doc.text(`Area: ${data.shopArea}`, 20, yPos + 12);
  }
  doc.text(`Orderbooker: ${data.orderbookerName || 'N/A'}`, 20, yPos + 18);

  yPos += 32;

  // ── Transaction Details Table ──
  const rows = [
    ['Transaction ID', data.id.substring(0, 12) + '...'],
    ['Type', typeLabel],
    ['Date & Time', formatDate(data.createdAt)],
    ['Amount', formatCurrency(data.amount)],
    ['Previous Balance', formatCurrency(data.previousBalance)],
    ['New Balance', formatCurrency(data.newBalance)],
    ['Description', data.description || (isCredit ? 'Goods supplied' : 'Cash collected')],
  ];

  rows.forEach(([label, value]) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPos - 3, pageWidth - 30, 8, 'F');

    doc.setTextColor(...slateGrey);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(label, 20, yPos + 2);

    doc.setTextColor(...navyBlue);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value), pageWidth - 20, yPos + 2, { align: 'right' });

    yPos += 8;
  });

  // ── Signature Area ──
  yPos = Math.max(yPos + 20, 180);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);

  doc.line(15, yPos, 80, yPos);
  doc.line(pageWidth - 80, yPos, pageWidth - 15, yPos);

  doc.setTextColor(...slateGrey);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', 15, yPos + 5);
  doc.text('Shop Keeper Signature', pageWidth - 80, yPos + 5);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated by ${businessName} Finexa CMS — ${formatDate(new Date().toISOString())}`, pageWidth / 2, 285, { align: 'center' });

  const fileName = `${typeLabel}_${data.shopName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
