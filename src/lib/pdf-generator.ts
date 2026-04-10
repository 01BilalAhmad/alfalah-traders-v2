import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  description: string | null;
  createdAt: string;
  creator: {
    name: string;
    role: string;
  };
}

export interface LedgerData {
  shop: {
    name: string;
    ownerName: string | null;
    area: string | null;
    address: string | null;
    phone: string | null;
    routeDay: string;
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
    totalTransactions: number;
    currentBalance: number;
  };
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

export function generateLedgerPDF(ledger: LedgerData): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const navyBlue: [number, number, number] = [30, 58, 138];
  const slateGrey: [number, number, number] = [71, 85, 105];
  const lightBlue: [number, number, number] = [239, 246, 255];

  // Header background
  doc.setFillColor(...navyBlue);
  doc.rect(0, 0, pageWidth, 42, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Al-Falah Traders', pageWidth / 2, 16, { align: 'center' });

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Smart Credit & Route Management System', pageWidth / 2, 23, { align: 'center' });

  // Document title
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('SHOP LEDGER / KHATA', pageWidth / 2, 34, { align: 'center' });

  // Divider line
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(15, 44, pageWidth - 15, 44);

  // Shop Information Section
  let yPos = 52;

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
    [`Route Day: ${ledger.shop.routeDay.charAt(0).toUpperCase() + ledger.shop.routeDay.slice(1)}`, `Orderbooker: ${ledger.shop.orderbooker.name}`],
    [`Phone: ${ledger.shop.phone || 'N/A'}`, `Address: ${ledger.shop.address || 'N/A'}`],
  ];

  shopInfo.forEach((row, idx) => {
    doc.text(row[0], 20, yPos + 12 + idx * 5.5);
    doc.text(row[1], pageWidth / 2 + 10, yPos + 12 + idx * 5.5);
  });

  yPos += 44;

  // Summary Cards
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(15, yPos, (pageWidth - 40) / 3, 18, 2, 2, 'F');
  doc.setFillColor(209, 250, 229);
  doc.roundedRect(15 + (pageWidth - 40) / 3 + 5, yPos, (pageWidth - 40) / 3, 18, 2, 2, 'F');
  doc.setFillColor(219, 234, 254);
  doc.roundedRect(15 + ((pageWidth - 40) / 3 + 5) * 2, yPos, (pageWidth - 40) / 3, 18, 2, 2, 'F');

  const cardWidth = (pageWidth - 40) / 3;
  const cards = [
    { label: 'Total Credit', value: formatCurrency(ledger.summary.totalCredit), x: 15 },
    { label: 'Total Recovery', value: formatCurrency(ledger.summary.totalRecovery), x: 15 + cardWidth + 5 },
    { label: 'Current Balance', value: formatCurrency(ledger.summary.currentBalance), x: 15 + (cardWidth + 5) * 2 },
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
  const tableData = ledger.transactions.map((txn, idx) => [
    idx + 1,
    formatDate(txn.createdAt),
    txn.type === 'credit' ? 'Credit' : 'Recovery',
    txn.description || (txn.type === 'credit' ? 'Goods supplied' : 'Cash collected'),
    formatCurrency(txn.amount),
    formatCurrency(txn.newBalance),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Date & Time', 'Type', 'Description', 'Amount', 'Balance']],
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
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 38 },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 50 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: 15, right: 15 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        if (data.cell.raw === 'Credit') {
          data.cell.styles.textColor = [146, 64, 14];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [6, 95, 70];
          data.cell.styles.fontStyle = 'bold';
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
    doc.text('Al-Falah Traders - Confidential Document', pageWidth / 2, footerY + 11, { align: 'center' });

    doc.setFontSize(7);
    doc.text('This is a computer-generated document and does not require a signature.', pageWidth / 2, footerY + 16, { align: 'center' });
  }

  return doc;
}

export function downloadLedgerPDF(ledger: LedgerData): void {
  const doc = generateLedgerPDF(ledger);
  const fileName = `AlFalah_Ledger_${ledger.shop.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
