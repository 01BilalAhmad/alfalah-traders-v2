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
  shopOwner?: string | null;
  shopArea: string | null;
  companyName?: string | null;
  orderbookerName: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  type: string; // 'credit' | 'recovery' | 'supplier_collection'
  description: string;
  createdAt: string;
}

/** Convert number to words (Pakistani convention: Lakh / Crore) for receipts. */
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  if (!Number.isFinite(num)) return '';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(Math.abs(num));
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
  if (n < 100000) return numberToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '');
  if (n < 10000000) return numberToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numberToWords(n % 100000) : '');
  return numberToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numberToWords(n % 10000000) : '');
}

/** Type-specific theming for transaction receipts. */
function receiptTheme(type: string) {
  switch (type) {
    case 'credit':
      return {
        accent: [180, 83, 9] as [number, number, number],        // amber-700
        tint: [254, 243, 199] as [number, number, number],       // amber-100
        chip: 'CREDIT RECEIPT',
        amountLabel: 'AMOUNT CREDITED',
        amountNoun: 'Amount Credited',
        sign: '+',
      };
    case 'supplier_collection':
      return {
        accent: [30, 58, 138] as [number, number, number],       // blue-900
        tint: [239, 246, 255] as [number, number, number],       // blue-50
        chip: 'SUPPLIER COLLECTION RECEIPT',
        amountLabel: 'AMOUNT COLLECTED',
        amountNoun: 'Amount Collected',
        sign: '-',
      };
    default:
      return {
        accent: [6, 95, 70] as [number, number, number],         // emerald-700
        tint: [209, 250, 229] as [number, number, number],       // emerald-100
        chip: 'RECOVERY RECEIPT',
        amountLabel: 'AMOUNT RECOVERED',
        amountNoun: 'Amount Recovered',
        sign: '-',
      };
  }
}

function drawDottedLine(
  doc: import('jspdf').jsPDF,
  x1: number,
  x2: number,
  y: number,
  color: [number, number, number],
): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  const gap = 1.6;
  for (let x = x1; x < x2; x += gap) {
    doc.line(x, y, Math.min(x + 0.7, x2), y);
  }
}

export async function generateRecoveryReceiptPDF(data: RecoveryReceiptData): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const businessName = getBusinessName();
  const businessPhone = getBusinessPhone();
  const theme = receiptTheme(data.type);
  const typeLabel = data.type === 'credit' ? 'Credit'
    : data.type === 'supplier_collection' ? 'Supplier Collection'
    : 'Recovery';

  const navyBlue: [number, number, number] = [30, 58, 138];
  const slateGrey: [number, number, number] = [71, 85, 105];
  const lightSlate: [number, number, number] = [148, 163, 184];
  const darkText: [number, number, number] = [30, 41, 59];
  const cardBg: [number, number, number] = [248, 250, 252];
  const hairline: [number, number, number] = [226, 232, 240];

  const receiptNo = `#${data.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const dateStr = formatDate(data.createdAt);
  const amountWords = `${numberToWords(data.amount)} Rupees Only`;

  // ── Header band (full-bleed navy) ──
  doc.setFillColor(...navyBlue);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(...theme.accent);
  doc.rect(0, 38, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(businessName, pageWidth / 2, 15, { align: 'center' });

  if (businessPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(191, 219, 254);
    doc.text(`Tel: ${businessPhone}`, pageWidth / 2, 22, { align: 'center' });
  }

  // ── Type chip (centered pill) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setCharSpace(1.2);
  const chipText = theme.chip;
  // charSpace adds ~1.2mm after every glyph — include it in pill width
  const chipW = doc.getTextWidth(chipText) + 1.2 * chipText.length + 16;
  doc.setCharSpace(0);
  const chipH = 9;
  const chipY = 47;
  doc.setFillColor(...theme.accent);
  doc.roundedRect((pageWidth - chipW) / 2, chipY, chipW, chipH, 4.5, 4.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10.5);
  doc.setCharSpace(1.2);
  // left-align inside pill with fixed padding — jsPDF align:'center' does not
  // account for charSpace, which caused asymmetric right-side overflow
  doc.text(chipText, (pageWidth - chipW) / 2 + 8, chipY + 6.2);
  doc.setCharSpace(0);

  // ── Receipt meta row ──
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...slateGrey);
  doc.text('Receipt No:', 15, 64);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text(receiptNo, 40, 64);

  doc.setFontSize(9.5);
  const dateW = doc.getTextWidth(dateStr);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text(dateStr, pageWidth - 15, 64, { align: 'right' });
  doc.setTextColor(...slateGrey);
  doc.setFont('helvetica', 'normal');
  doc.text('Date & Time:', pageWidth - 15 - dateW - 4, 64, { align: 'right' });

  doc.setDrawColor(...hairline);
  doc.setLineWidth(0.3);
  doc.line(15, 68, pageWidth - 15, 68);

  // ── Received From card ──
  let yPos = 74;

  doc.setTextColor(...lightSlate);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setCharSpace(0.8);
  doc.text('RECEIVED FROM', 15, yPos);
  doc.setCharSpace(0);

  yPos += 4;
  const cardX = 15;
  const cardW = pageWidth - 30;
  const cardH = 25;
  doc.setFillColor(...cardBg);
  doc.roundedRect(cardX, yPos, cardW, cardH, 2, 2, 'F');
  doc.setFillColor(...theme.accent);
  doc.rect(cardX, yPos, 1.6, cardH, 'F');

  doc.setTextColor(...navyBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(data.shopName, cardX + 8, yPos + 8);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateGrey);
  const colSplit = cardX + cardW / 2 + 2;
  if (data.shopArea) {
    doc.text('Area:', cardX + 8, yPos + 15);
    doc.setTextColor(...darkText);
    doc.text(String(data.shopArea).slice(0, 38), cardX + 8 + 12, yPos + 15);
    doc.setTextColor(...slateGrey);
  }
  if (data.shopOwner) {
    doc.text('Owner:', colSplit, yPos + 15);
    doc.setTextColor(...darkText);
    doc.text(String(data.shopOwner).slice(0, 30), colSplit + 14, yPos + 15);
    doc.setTextColor(...slateGrey);
  }
  doc.text('Orderbooker:', cardX + 8, yPos + 21);
  doc.setTextColor(...darkText);
  doc.text(data.orderbookerName || 'N/A', cardX + 8 + 24, yPos + 21);
  if (data.companyName) {
    doc.setTextColor(...slateGrey);
    doc.text('Company:', colSplit, yPos + 21);
    doc.setTextColor(...theme.accent);
    doc.setFont('helvetica', 'bold');
    doc.text(String(data.companyName).slice(0, 28), colSplit + 16, yPos + 21);
  }

  yPos += cardH + 10;

  // ── Amount centerpiece ──
  const amtH = 34;
  doc.setFillColor(...theme.tint);
  doc.roundedRect(cardX, yPos, cardW, amtH, 2.5, 2.5, 'F');
  doc.setDrawColor(...theme.accent);
  doc.setLineWidth(0.5);
  doc.roundedRect(cardX, yPos, cardW, amtH, 2.5, 2.5, 'S');

  doc.setTextColor(...theme.accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setCharSpace(1.5);
  doc.text(theme.amountLabel, pageWidth / 2, yPos + 8, { align: 'center' });
  doc.setCharSpace(0);

  doc.setFontSize(26);
  doc.text(formatCurrency(data.amount), pageWidth / 2, yPos + 20, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(...slateGrey);
  const wordsLines = doc.splitTextToSize(amountWords, cardW - 24) as string[];
  wordsLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, pageWidth / 2, yPos + 27.5 + i * 4.5, { align: 'center' });
  });

  yPos += amtH + 10;

  // ── Balance Summary (ledger style) ──
  doc.setTextColor(...lightSlate);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setCharSpace(0.8);
  doc.text('BALANCE SUMMARY', 15, yPos);
  doc.setCharSpace(0);

  yPos += 7;
  const labelX = 18;
  const valueX = pageWidth - 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...slateGrey);
  doc.text('Previous Balance', labelX, yPos);
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(data.previousBalance), valueX, yPos, { align: 'right' });

  yPos += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slateGrey);
  doc.text(`${theme.amountNoun}`, labelX, yPos);
  doc.setTextColor(...theme.accent);
  doc.setFont('helvetica', 'bold');
  doc.text(`${theme.sign} ${formatCurrency(data.amount)}`, valueX, yPos, { align: 'right' });

  yPos += 4;
  drawDottedLine(doc, labelX, valueX, yPos, [203, 213, 225]);

  yPos += 8;
  doc.setTextColor(...navyBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setCharSpace(0.4);
  doc.text('NEW BALANCE', labelX, yPos);
  doc.setCharSpace(0);
  doc.setFontSize(12);
  doc.setTextColor(...darkText);
  doc.text(formatCurrency(data.newBalance), valueX, yPos, { align: 'right' });

  yPos += 10;

  // ── Description (if present) ──
  const descText = data.description || (data.type === 'credit' ? 'Goods supplied' : 'Cash collected');
  if (descText) {
    doc.setTextColor(...lightSlate);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setCharSpace(0.8);
    doc.text('DESCRIPTION', 15, yPos);
    doc.setCharSpace(0);
    yPos += 6;
    doc.setTextColor(...darkText);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const descLines = doc.splitTextToSize(descText, cardW - 6) as string[];
    descLines.slice(0, 3).forEach((line, i) => {
      doc.text(line, 18, yPos + i * 5);
    });
  }

  // ── Signature area ──
  const sigY = 236;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(15, sigY, 78, sigY);
  doc.line(pageWidth - 78, sigY, pageWidth - 15, sigY);

  doc.setTextColor(...slateGrey);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Authorized Signature', 15, sigY + 5);
  doc.text('Shop Keeper Signature', pageWidth - 78, sigY + 5);

  // ── Footer band (anchored to page bottom) ──
  const footerY = pageHeight - 32;
  doc.setFillColor(...cardBg);
  doc.rect(0, footerY, pageWidth, pageHeight - footerY, 'F');
  doc.setDrawColor(...hairline);
  doc.setLineWidth(0.3);
  doc.line(0, footerY, pageWidth, footerY);

  doc.setTextColor(...navyBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Thank you for your business!', pageWidth / 2, footerY + 7, { align: 'center' });

  doc.setTextColor(...slateGrey);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Please retain this receipt for your records. For any discrepancy, contact${businessPhone ? ` ${businessPhone}` : ' the office'}.`,
    pageWidth / 2, footerY + 13, { align: 'center' },
  );

  doc.setFontSize(7.5);
  doc.setTextColor(...lightSlate);
  doc.text(
    `Generated by ${businessName} - Finexa CMS - ${formatDate(new Date().toISOString())}`,
    pageWidth / 2, footerY + 19, { align: 'center' },
  );
  doc.text(
    '(c) 2026 Finexa. All rights reserved.',
    pageWidth / 2, footerY + 23.5, { align: 'center' },
  );

  const fileName = `${typeLabel}_Receipt_${data.shopName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  return { doc, fileName };
}

export async function downloadRecoveryReceipt(data: RecoveryReceiptData): Promise<void> {
  const { doc, fileName } = await generateRecoveryReceiptPDF(data);
  doc.save(fileName);
}
