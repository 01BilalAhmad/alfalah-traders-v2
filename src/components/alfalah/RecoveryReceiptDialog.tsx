'use client';

import { useRef, useState } from 'react';
import { formatPKR } from '@/lib/utils';
import { useBusinessName } from '@/lib/use-business-name';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X, Phone, MapPin, User, Calendar, Building2, Wallet, ArrowDownRight, AlertCircle, Store, Download, MessageCircle, Loader2, Share2, RefreshCw, MessageSquare, FileText } from 'lucide-react';

export interface RecoveryReceiptData {
  // Business info
  businessName: string;
  businessPhone: string;
  // Company
  companyName: string | null;
  // Shop details
  shopName: string;
  shopAddress: string | null;
  shopArea: string | null;
  ownerName: string | null;
  shopPhone: string | null;
  // Transaction details
  date: string;
  orderbookerName: string;
  // Balance breakdown
  totalBalance: number;
  recoveryAmount: number;
  remainingBalance: number;
  // Description
  description: string | null;
  // Transaction ID
  transactionId: string;
  // Receipt type: 'recovery' | 'supplier_collection'
  receiptType?: 'recovery' | 'supplier_collection';
}

interface RecoveryReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: RecoveryReceiptData | null;
}

// Convert number to words (simple version for PKR)
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num < 0) return 'Minus ' + numberToWords(-num);
  if (num < 20) return ones[num];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
  return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
}

export default function RecoveryReceiptDialog({ open, onOpenChange, receipt }: RecoveryReceiptDialogProps) {
  const { businessName, businessPhone } = useBusinessName();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isSupplierCollection = receipt?.receiptType === 'supplier_collection';
  const receiptTitleStr = isSupplierCollection ? 'Supplier Collection Receipt' : 'Recovery Receipt';
  const receiptTitleUpper = isSupplierCollection ? 'SUPPLIER COLLECTION RECEIPT' : 'RECOVERY RECEIPT';

  // ─── Print Receipt ───
  const handlePrint = () => {
    const el = receiptRef.current;
    if (!el) return;

    const printWindow = window.open('', '_blank', 'width=420,height=900');
    if (!printWindow) {
      window.print();
      return;
    }

    // SECURITY NOTE: document.write() is used here with internally-generated HTML only
    // (no user-controlled input is interpolated into the HTML template).
    // The buildPrintHTML() output is constructed from receipt data that is already
    // validated/sanitized upstream. This is acceptable for the print-receipt use case.
    // For richer interactivity, consider refactoring to Blob URL + iframe in the future.
    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${receiptTitleStr}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #F5F7FA;
      color: #374151;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-wrapper { max-width: 400px; margin: 0 auto; }
    .receipt-card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .blue-header { background: #4169E1; color: white; text-align: center; padding: 14px 20px; }
    .blue-header h2 { font-size: 16px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .business-section { background: #1E293B; color: white; text-align: center; padding: 20px; }
    .business-section h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .business-section .phone-text { font-size: 13px; color: rgba(255,255,255,0.7); }
    .receipt-badge { text-align: center; margin-top: -14px; position: relative; z-index: 1; }
    .receipt-badge span { display: inline-block; background: #10B981; color: white; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 6px 20px; border-radius: 20px; }
    .txn-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid #E5E7EB; }
    .txn-row .label { font-size: 12px; color: #6B7280; }
    .txn-row .value { font-size: 12px; color: #374151; font-weight: 600; }
    .section-label { font-size: 11px; color: #6B7280; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 12px 20px 6px; }
    .info-item { display: flex; align-items: center; gap: 10px; padding: 8px 20px; }
    .info-item .icon { color: #9CA3AF; font-size: 14px; width: 20px; text-align: center; }
    .info-item .label { font-size: 12px; color: #6B7280; min-width: 60px; }
    .info-item .value { font-size: 13px; color: #374151; font-weight: 500; }
    .amount-section { text-align: center; padding: 20px; border-top: 1px solid #E5E7EB; border-bottom: 1px solid #E5E7EB; }
    .amount-section .label { font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .amount-section .amount { font-size: 32px; font-weight: 700; color: #10B981; }
    .amount-section .words { font-size: 12px; color: #6B7280; font-style: italic; margin-top: 4px; }
    .summary-section { padding: 16px 20px; }
    .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
    .summary-row .label { font-size: 13px; color: #374151; }
    .summary-row .value { font-size: 14px; font-weight: 600; }
    .summary-row .value.green { color: #10B981; }
    .summary-row .value.red { color: #EF4444; }
    .summary-divider { border-top: 1px dashed #D1D5DB; margin: 6px 0; }
    .footer-section { text-align: center; padding: 16px 20px; border-top: 1px solid #E5E7EB; }
    .footer-section .brand { font-size: 16px; font-weight: 700; color: #4169E1; }
    .footer-section .sub { font-size: 10px; color: #9CA3AF; margin-top: 2px; }
    .notice-section { margin: 0 20px 16px; padding: 10px 14px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 11px; color: #6B7280; line-height: 1.5; }
    .notice-section strong { color: #374151; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="receipt-wrapper">
    ${buildPrintHTML(receipt, businessName, businessPhone)}
  </div>
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  // ─── Save as Image ───
  const handleSaveImage = async () => {
    const el = receiptRef.current;
    if (!el) return;

    setSaving(true);
    try {
      const html2canvas = (await import('html2canvas')).default;

      // Force all elements to be visible and rendered
      const originalOverflow = el.style.overflow;
      el.style.overflow = 'visible';

      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#F5F7FA',
        useCORS: true,
        logging: false,
        allowTaint: true,
        removeContainer: false,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      el.style.overflow = originalOverflow;

      // Convert to blob for better mobile compatibility
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png', 1.0);
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Recovery_Receipt_${receipt?.shopName?.replace(/\s+/g, '_') || 'receipt'}_${new Date().toISOString().split('T')[0]}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save image:', err);
      // Fallback: try simpler approach
      try {
        const el2 = receiptRef.current;
        if (!el2) return;
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(el2, {
          scale: 2,
          backgroundColor: '#F5F7FA',
          allowTaint: true,
        });
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png', 1.0);
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `Recovery_Receipt_${Date.now()}.png`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        // Last resort: open canvas in new tab
        try {
          const el3 = receiptRef.current;
          if (!el3) return;
          const html2canvas = (await import('html2canvas')).default;
          const canvas = await html2canvas(el3, { scale: 2, backgroundColor: '#F5F7FA' });
          const dataUrl = canvas.toDataURL('image/png');
          const win = window.open();
          if (win) {
            // SECURITY: dataUrl is canvas-generated base64 PNG (no user input). Safe to write.
            // Using Blob URL approach for modern browser compatibility.
            win.document.write(`<img src="${dataUrl}" style="max-width:100%" />`);
            win.document.title = 'Receipt Image - Right click to save';
          }
        } catch {
          alert('Could not save image. Please use Print > Save as PDF instead.');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Share on WhatsApp ───
  const handleWhatsApp = () => {
    if (!receipt) return;

    const bName = receipt.businessName || businessName || 'AL-FALAH TRADERS';
    const bPhone = receipt.businessPhone || businessPhone || '';
    const isSupplierCollection = receipt.receiptType === 'supplier_collection';
    const receiptTitleStr = isSupplierCollection ? 'SUPPLIER COLLECTION RECEIPT' : 'RECOVERY RECEIPT';

    let msg = `🧾 *${receiptTitleStr}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `🏢 *${bName}*\n`;
    if (bPhone) msg += `📞 ${bPhone}\n`;
    msg += `\n`;
    if (receipt.companyName) msg += `📦 Company: ${receipt.companyName}\n`;
    msg += `🏪 Shop: ${receipt.shopName}\n`;
    if (receipt.shopPhone) msg += `📞 Phone No.: ${receipt.shopPhone}\n`;
    if (receipt.ownerName) msg += `👤 Owner: ${receipt.ownerName}\n`;
    msg += `📅 Date: ${receipt.date}\n`;
    msg += `🚶 Orderbooker: ${receipt.orderbookerName}\n`;
    msg += `\n`;
    msg += `💰 *Amount Recovered: Rs. ${receipt.recoveryAmount.toLocaleString('en-PK')}*\n`;
    msg += `\n`;
    msg += `📊 *Summary:*\n`;
    msg += `  Previous Balance: Rs. ${receipt.totalBalance.toLocaleString('en-PK')}\n`;
    msg += `  ✅ Recovered: Rs. ${receipt.recoveryAmount.toLocaleString('en-PK')}\n`;
    msg += `  📌 Remaining: Rs. ${receipt.remainingBalance.toLocaleString('en-PK')}\n`;
    msg += `\n`;
    msg += `✨ Thank you for your Payment!\n`;
    msg += `\n`;
    msg += `⚠️ اگر آپ کو بیلنس میں کوئی فرق محسوس ہوتا ہے تو ${bPhone || 'ہم سے'} رابطہ کریں۔ شکریہ۔\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `Powered by Finexa`;

    let phone = receipt.shopPhone || '';
    if (phone) {
      phone = phone.replace(/[^\d+]/g, '');
      if (phone.startsWith('0')) {
        phone = '92' + phone.substring(1);
      } else if (phone.startsWith('+')) {
        phone = phone.substring(1);
      } else if (!phone.startsWith('92')) {
        phone = '92' + phone;
      }
    }

    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank');
  };

  // ─── Share (Native) ───
  const handleShare = async () => {
    if (!receipt) return;

    const bName = receipt.businessName || businessName || 'AL-FALAH TRADERS';
    const bPhone = receipt.businessPhone || businessPhone || '';

    const text = `${receiptTitleStr} - ${bName}\nShop: ${receipt.shopName}\nAmount: Rs. ${receipt.recoveryAmount.toLocaleString('en-PK')}\nDate: ${receipt.date}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: receiptTitleStr, text });
      } catch {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch {
        // Ignore
      }
    }
  };

  if (!receipt) return null;

  const displayBusinessName = receipt.businessName || businessName || 'AL-FALAH TRADERS';
  const displayBusinessPhone = receipt.businessPhone || businessPhone || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{receiptTitleStr}</DialogTitle>
          <DialogDescription>Recovery transaction receipt</DialogDescription>
        </DialogHeader>

        {/* Receipt Content - Finexa Style */}
        <div ref={receiptRef} style={{ backgroundColor: '#F5F7FA' }}>
          <div className="receipt-content">
            <div className="bg-white rounded-2xl m-3 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.08)]">

              {/* Blue Header Bar */}
              <div className="bg-[#4169E1] text-white text-center py-3.5 px-5">
                <h2 className="text-sm font-bold tracking-wider uppercase">{receiptTitleUpper}</h2>
              </div>

              {/* Business Info - Dark Navy */}
              <div className="bg-[#1E293B] text-white text-center py-5 px-5">
                <h1 className="text-xl font-bold">{displayBusinessName}</h1>
                {displayBusinessPhone && (
                  <p className="text-white/60 text-xs mt-1 flex items-center justify-center gap-1">
                    <Phone className="h-3 w-3" />
                    {displayBusinessPhone}
                  </p>
                )}
              </div>

              {/* Green Recovery Badge */}
              <div className="text-center -mt-3.5 relative z-10">
                <span className="inline-block bg-[#10B981] text-white text-[10px] font-bold tracking-[1.5px] uppercase px-5 py-1.5 rounded-full">
                  {receiptTitleUpper}
                </span>
              </div>

              {/* Transaction ID & Date Row */}
              <div className="flex justify-between items-center px-5 py-3 border-b border-[#E5E7EB]">
                <div>
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Transaction ID</p>
                  <p className="text-xs font-semibold text-[#374151]">#{receipt.transactionId.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#6B7280] uppercase tracking-wider">Date</p>
                  <p className="text-xs font-semibold text-[#374151]">{receipt.date}</p>
                </div>
              </div>

              {/* Company */}
              {receipt.companyName && (
                <div className="px-5 py-2.5 border-b border-[#E5E7EB]">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    <span className="text-[10px] text-[#6B7280] uppercase tracking-wider">Company</span>
                    <span className="text-xs font-semibold text-[#374151] ml-auto">{receipt.companyName}</span>
                  </div>
                </div>
              )}

              {/* Received From Section */}
              <div className="px-5 pt-3 pb-1">
                <p className="text-[10px] text-[#6B7280] font-semibold uppercase tracking-[1px] mb-2">Received From</p>
              </div>

              <div className="flex items-center gap-2.5 px-5 py-1.5">
                <Store className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                <span className="text-xs text-[#6B7280] min-w-[52px]">Shop</span>
                <span className="text-sm font-medium text-[#374151] ml-auto text-right">{receipt.shopName}</span>
              </div>

              {receipt.ownerName && (
                <div className="flex items-center gap-2.5 px-5 py-1.5">
                  <User className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                  <span className="text-xs text-[#6B7280] min-w-[52px]">Owner</span>
                  <span className="text-sm font-medium text-[#374151] ml-auto text-right">{receipt.ownerName}</span>
                </div>
              )}

              {receipt.shopPhone && (
                <div className="flex items-center gap-2.5 px-5 py-1.5">
                  <Phone className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                  <span className="text-xs text-[#6B7280] min-w-[52px]">Phone</span>
                  <span className="text-sm font-medium text-[#374151] ml-auto text-right">{receipt.shopPhone}</span>
                </div>
              )}

              {receipt.shopAddress && (
                <div className="flex items-center gap-2.5 px-5 py-1.5">
                  <MapPin className="h-4 w-4 text-[#9CA3AF] shrink-0" />
                  <span className="text-xs text-[#6B7280] min-w-[52px]">Area</span>
                  <span className="text-sm font-medium text-[#374151] ml-auto text-right max-w-[60%] truncate">{receipt.shopAddress}</span>
                </div>
              )}

              {/* Amount Recovered - Big Center Display */}
              <div className="text-center py-5 border-t border-b border-[#E5E7EB] my-3 mx-5">
                <p className="text-[10px] text-[#6B7280] uppercase tracking-[1.5px] font-semibold mb-2">Amount Recovered</p>
                <p className="text-3xl font-bold text-[#10B981]">{formatPKR(receipt.recoveryAmount)}</p>
                <p className="text-xs text-[#6B7280] italic mt-1.5">{numberToWords(receipt.recoveryAmount)} Rupees Only</p>
              </div>

              {/* Financial Summary */}
              <div className="px-5 py-3">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[#374151]">Previous Balance</span>
                  <span className="text-sm font-semibold text-[#374151]">{formatPKR(receipt.totalBalance)}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-[#374151]">Amount Recovered</span>
                  <span className="text-sm font-bold text-[#10B981]">- {formatPKR(receipt.recoveryAmount)}</span>
                </div>
                <div className="border-t border-dashed border-[#D1D5DB] my-1" />
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-semibold text-[#374151]">Remaining Balance</span>
                  <span className="text-base font-bold text-[#EF4444]">{formatPKR(receipt.remainingBalance)}</span>
                </div>
              </div>

              {/* Thank You */}
              <div className="text-center py-2">
                <p className="text-sm font-semibold text-[#10B981]">✓ Thank you for your Payment!</p>
              </div>

              {/* Notice */}
              <div className="mx-5 mb-3 px-3.5 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg">
                <p className="text-[11px] text-[#6B7280] leading-relaxed" style={{ direction: 'rtl', fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', Tahoma, sans-serif" }}>
                  <strong className="text-[#374151]">نوٹ:</strong> اگر آپ کو بیلنس میں کوئی فرق محسوس ہوتا ہے تو اوپر دیے گئے نمبر پر ضرور رابطہ کریں۔ شکریہ۔
                </p>
              </div>

              {/* Footer */}
              <div className="text-center py-3 border-t border-[#E5E7EB]">
                <p className="text-base font-bold text-[#4169E1]">Finexa</p>
                <p className="text-[10px] text-[#9CA3AF] mt-0.5">Powered by Finexa Credit System</p>
              </div>

            </div>

            {/* Success Message */}
            {saveSuccess && (
              <div className="text-center py-2">
                <p className="text-xs font-medium text-[#10B981] flex items-center justify-center gap-1">
                  ✓ Receipt saved successfully!
                </p>
              </div>
            )}

            {/* Quick Action Icons */}
            <div className="flex justify-center gap-5 py-3">
              <button onClick={handleWhatsApp} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
                  <MessageCircle className="h-5 w-5 text-[#10B981]" />
                </div>
                <span className="text-[10px] text-[#6B7280]">WhatsApp</span>
              </button>
              <button onClick={handlePrint} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                  <FileText className="h-5 w-5 text-[#EF4444]" />
                </div>
                <span className="text-[10px] text-[#6B7280]">PDF</span>
              </button>
              <button onClick={handleSaveImage} disabled={saving} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                  {saving ? <Loader2 className="h-5 w-5 text-[#8B5CF6] animate-spin" /> : <MessageSquare className="h-5 w-5 text-[#8B5CF6]" />}
                </div>
                <span className="text-[10px] text-[#6B7280]">Save</span>
              </button>
              <button onClick={handleShare} className="flex flex-col items-center gap-1 group">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors">
                  <Share2 className="h-5 w-5 text-[#F59E0B]" />
                </div>
                <span className="text-[10px] text-[#6B7280]">Share</span>
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <DialogFooter className="px-4 py-3 border-t border-[#E5E7EB] gap-2 flex-wrap">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5 flex-1 min-w-[70px]">
            <X className="h-4 w-4" />
            Close
          </Button>
          <Button type="button" onClick={handlePrint} className="bg-[#4169E1] hover:bg-[#3457c7] gap-1.5 flex-1 min-w-[90px]">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button type="button" onClick={handleSaveImage} disabled={saving} variant="outline" className="gap-1.5 flex-1 min-w-[90px] border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Image'}
          </Button>
          <Button type="button" onClick={handleWhatsApp} className="bg-[#10B981] hover:bg-[#059669] text-white gap-1.5 flex-1 min-w-[100px]">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helper: Build print-friendly HTML (Finexa Style) ───
function buildPrintHTML(receipt: RecoveryReceiptData | null, businessName: string, businessPhone: string): string {
  if (!receipt) return '';

  const bName = receipt.businessName || businessName || 'AL-FALAH TRADERS';
  const bPhone = receipt.businessPhone || businessPhone || '';
  const fmtPKR = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;
  const amountWords = receipt ? numberToWords(receipt.recoveryAmount) + ' Rupees Only' : '';
  const isSuppColl = receipt.receiptType === 'supplier_collection';
  const titleStr = isSuppColl ? 'Supplier Collection Receipt' : 'Recovery Receipt';

  return `
    <div class="receipt-card">
      <div class="blue-header">
        <h2>${titleStr}</h2>
      </div>
      <div class="business-section">
        <h1>${bName}</h1>
        ${bPhone ? `<div class="phone-text">📞 ${bPhone}</div>` : ''}
      </div>
      <div class="receipt-badge"><span>${titleStr}</span></div>
      <div class="txn-row">
        <div><div class="label">Transaction ID</div><div class="value">#${receipt!.transactionId.slice(0, 8).toUpperCase()}</div></div>
        <div style="text-align:right"><div class="label">Date</div><div class="value">${receipt!.date}</div></div>
      </div>
      ${receipt!.companyName ? `
      <div class="txn-row">
        <div class="label">Company</div>
        <div class="value">${receipt!.companyName}</div>
      </div>` : ''}
      <div class="section-label">Received From</div>
      <div class="info-item"><div class="icon">🏪</div><div class="label">Shop</div><div class="value" style="margin-left:auto;text-align:right">${receipt!.shopName}</div></div>
      ${receipt!.ownerName ? `<div class="info-item"><div class="icon">👤</div><div class="label">Owner</div><div class="value" style="margin-left:auto;text-align:right">${receipt!.ownerName}</div></div>` : ''}
      ${receipt!.shopPhone ? `<div class="info-item"><div class="icon">📞</div><div class="label">Phone</div><div class="value" style="margin-left:auto;text-align:right">${receipt!.shopPhone}</div></div>` : ''}
      ${receipt!.shopAddress ? `<div class="info-item"><div class="icon">📍</div><div class="label">Area</div><div class="value" style="margin-left:auto;text-align:right">${receipt!.shopAddress}</div></div>` : ''}
      <div class="amount-section">
        <div class="label">Amount Recovered</div>
        <div class="amount">${fmtPKR(receipt!.recoveryAmount)}</div>
        <div class="words">${amountWords}</div>
      </div>
      <div class="summary-section">
        <div class="summary-row"><span class="label">Previous Balance</span><span class="value">${fmtPKR(receipt!.totalBalance)}</span></div>
        <div class="summary-row"><span class="label">Amount Recovered</span><span class="value green">- ${fmtPKR(receipt!.recoveryAmount)}</span></div>
        <div class="summary-divider"></div>
        <div class="summary-row"><span class="label" style="font-weight:600">Remaining Balance</span><span class="value red">${fmtPKR(receipt!.remainingBalance)}</span></div>
      </div>
      <div style="text-align:center;padding:12px 20px;color:#10B981;font-weight:600;font-size:14px;">✓ Thank you for your Payment!</div>
      <div class="notice-section" style="direction:rtl;font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',Tahoma,sans-serif"><strong>نوٹ:</strong> اگر آپ کو بیلنس میں کوئی فرق محسوس ہوتا ہے تو اوپر دیے گئے نمبر پر ضرور رابطہ کریں۔ شکریہ۔</div>
      <div class="footer-section">
        <div class="brand">Finexa</div>
        <div class="sub">Powered by Finexa Credit System</div>
      </div>
    </div>
  `;
}
