'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  Download,
  Loader2,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trash2,
  Store,
  ArrowRight,
  ArrowLeft,
  FileUp,
  ClipboardList,
  Rocket,
  Building2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { WORKING_DAYS, formatPKR } from '@/lib/utils';

interface Orderbooker {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

interface Company {
  id: string;
  name: string;
  status: string;
}

interface ParsedShop {
  rowNumber: number;
  name: string;
  ownerName: string;
  area: string;
  address: string;
  phone: string;
  routeDays: string[];
  creditAmount: number;
  creditLimit: number;
  valid: boolean;
  error?: string;
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderbookers: Orderbooker[];
  companies: Company[];
  onImportComplete: () => void;
}

function normalizeRouteDays(raw: string): string[] {
  const VALID_ROUTE_DAYS = [...WORKING_DAYS];
  const parts = raw.split(',').map(p => p.trim().toLowerCase()).filter(p => p);
  const result: string[] = [];
  for (const part of parts) {
    const matched = VALID_ROUTE_DAYS.find(d => d === part || d.startsWith(part));
    if (matched && !result.includes(matched)) {
      result.push(matched);
    }
  }
  return result;
}

export default function AdminBulkImport({ open, onOpenChange, orderbookers, companies, onImportComplete }: BulkImportDialogProps) {
  const { user } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'select' | 'upload' | 'preview' | 'result'>('select');
  const [selectedOBId, setSelectedOBId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsedShops, setParsedShops] = useState<ParsedShop[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    failed: number;
    totalCredit: number;
    orderbookerName: string;
    shops: { name: string; balance: number }[];
    errors: { row: number; name: string; error: string }[];
    validationErrors?: { row: number; error: string }[];
  } | null>(null);

  const activeOrderbookers = orderbookers.filter((ob) => ob.status === 'active');
  const activeCompanies = companies.filter((c) => c.status === 'active');
  const validShops = parsedShops.filter((s) => s.valid);
  const invalidShops = parsedShops.filter((s) => !s.valid);
  const selectedCompany = activeCompanies.find((c) => c.id === selectedCompanyId);

  const downloadTemplate = useCallback(async () => {
    const XLSX = await import('xlsx');
    const templateData = [
      { 'Shop Name': 'Sample General Store', 'Owner Name': 'Muhammad Ali', 'Area': 'Saddar', 'Address': 'Shop #12, Main Market', 'Phone': '0300-1234567', 'Route Days': 'Monday', 'Credit Amount': 5000, 'Credit Limit': 20000 },
      { 'Shop Name': 'Madina Traders', 'Owner Name': 'Ahmed Khan', 'Area': 'Cantt', 'Address': '', 'Phone': '0312-9876543', 'Route Days': 'Tuesday', 'Credit Amount': 10000, 'Credit Limit': 30000 },
      { 'Shop Name': 'City Electronics', 'Owner Name': 'Bilal', 'Area': 'DHA', 'Address': 'Block-C, Shop 5', 'Phone': '', 'Route Days': 'Wednesday', 'Credit Amount': 0, 'Credit Limit': 0 },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shops');
    XLSX.writeFile(wb, 'Finexa_Bulk_Import_Template.xlsx');

    toast({ title: 'Template Downloaded', description: 'Fill in the template and upload it here' });
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

    if (!validExtensions.includes(ext)) {
      toast({ title: 'Invalid File', description: 'Please upload .xlsx, .xls, or .csv file', variant: 'destructive' });
      return;
    }

    setFile(selectedFile);
    parseFile(selectedFile);
  }, []);

  const parseFile = useCallback(async (selectedFile: File) => {
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        if (jsonData.length === 0) {
          toast({ title: 'Empty File', description: 'The file has no data rows', variant: 'destructive' });
          return;
        }

        const parsed: ParsedShop[] = jsonData.map((row, idx) => {
          const name = (row['Shop Name'] || '').toString().trim();
          const ownerName = (row['Owner Name'] || '').toString().trim();
          const area = (row['Area'] || '').toString().trim();
          const address = (row['Address'] || '').toString().trim();
          const phone = (row['Phone'] || '').toString().trim();
          const routeDaysRaw = (row['Route Days'] || row['Route Day'] || '').toString().trim();
          const creditAmountRaw = parseFloat((row['Credit Amount'] || '0').toString());
          const creditLimitRaw = parseFloat((row['Credit Limit'] || '0').toString());

          let valid = true;
          let error = '';

          if (!name) {
            valid = false;
            error = 'Shop name is required';
          } else {
            const routeDays = normalizeRouteDays(routeDaysRaw);
            if (routeDays.length === 0) {
              valid = false;
              error = `Invalid route day(s) "${routeDaysRaw}"`;
            } else if (isNaN(creditAmountRaw) || creditAmountRaw < 0) {
              valid = false;
              error = 'Invalid credit amount';
            } else if (isNaN(creditLimitRaw) || creditLimitRaw < 0) {
              valid = false;
              error = 'Invalid credit limit';
            }
          }

          return {
            rowNumber: idx + 2,
            name,
            ownerName,
            area,
            address,
            phone,
            routeDays: normalizeRouteDays(routeDaysRaw),
            creditAmount: isNaN(creditAmountRaw) ? 0 : creditAmountRaw,
            creditLimit: isNaN(creditLimitRaw) ? 0 : creditLimitRaw,
            valid,
            error: valid ? undefined : error,
          };
        });

        setParsedShops(parsed);
        setStep('preview');
      } catch {
        toast({ title: 'Parse Error', description: 'Could not read the file. Make sure it is a valid Excel/CSV file.', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  }, []);

  const removeInvalidRows = useCallback(() => {
    setParsedShops((prev) => prev.filter((s) => s.valid));
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedOBId || validShops.length === 0) return;

    setImporting(true);
    try {
      const payload = {
        orderbookerId: selectedOBId,
        companyId: selectedCompanyId || undefined,
        shops: validShops.map((s) => ({
          name: s.name,
          ownerName: s.ownerName || undefined,
          area: s.area || undefined,
          address: s.address || undefined,
          phone: s.phone || undefined,
          routeDays: s.routeDays,
          creditAmount: s.creditAmount || undefined,
          creditLimit: s.creditLimit || undefined,
        })),
        createdBy: user?.id,
      };

      const res = await apiFetch('/api/shops/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: 'Import Failed',
          description: data.error || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }

      setImportResult(data);
      setStep('result');
    } catch {
      toast({ title: 'Network Error', description: 'Could not connect to server', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }, [selectedOBId, selectedCompanyId, validShops, user]);

  const resetAndClose = useCallback(() => {
    setStep('select');
    setSelectedOBId('');
    setSelectedCompanyId('');
    setFile(null);
    setParsedShops([]);
    setImportResult(null);
    onOpenChange(false);
    onImportComplete();
  }, [onOpenChange, onImportComplete]);

  const totalCredit = validShops.reduce((sum, s) => sum + s.creditAmount, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg">Bulk Import Shops</DialogTitle>
              <DialogDescription>
                {step === 'select' && 'Import multiple shops from an Excel file with optional credit amounts'}
                {step === 'upload' && 'Upload your filled Excel/CSV file'}
                {step === 'preview' && `Review ${validShops.length} shops before importing`}
                {step === 'result' && 'Import completed'}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            {['select', 'upload', 'preview', 'result'].map((s, idx) => {
              const steps = ['select', 'upload', 'preview', 'result'];
              const currentIdx = steps.indexOf(step);
              const isComplete = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              const labels = ['Orderbooker', 'Upload', 'Preview', 'Done'];

              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  {idx > 0 && (
                    <div className={`h-px flex-1 ${isComplete ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                  <div className={`flex items-center gap-1.5 shrink-0 ${isCurrent ? 'text-primary' : isComplete ? 'text-primary' : 'text-muted-foreground'}`}>
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isCurrent ? 'bg-primary text-primary-foreground' : isComplete ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {isComplete ? <CheckCircle className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:inline">{labels[idx]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {step === 'select' && (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Step 1: Select Orderbooker</label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                All imported shops will be assigned to this orderbooker.
              </p>
              <Select value={selectedOBId} onValueChange={setSelectedOBId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an orderbooker..." />
                </SelectTrigger>
                <SelectContent>
                  {activeOrderbookers.map((ob) => (
                    <SelectItem key={ob.id} value={ob.id}>
                      {ob.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="divider-gradient" />

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Select Company (for Credit)
              </label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If shops have credit, select which company the credit belongs to. This ensures the balance appears correctly in the per-company balance report.
              </p>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a company..." />
                </SelectTrigger>
                <SelectContent>
                  {activeCompanies.map((comp) => (
                    <SelectItem key={comp.id} value={comp.id}>
                      {comp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {totalCredit > 0 && !selectedCompanyId && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Credit is entered but no company selected — balance won&apos;t appear in per-company reports
                </p>
              )}
            </div>

            <div className="divider-gradient" />

            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground">Step 2: Download Template & Fill It</label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Download the Excel template, fill in your shop details, then upload it.
              </p>
              <Button type="button" variant="outline" className="gap-2" onClick={downloadTemplate}>
                <Download className="h-4 w-4" />
                Download Excel Template
              </Button>
            </div>

            <div className="divider-gradient" />

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Template Columns Guide
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { col: 'Shop Name', req: true, desc: 'Name of the shop' },
                  { col: 'Owner Name', req: false, desc: "Owner's full name" },
                  { col: 'Area', req: false, desc: 'Area/location name' },
                  { col: 'Address', req: false, desc: 'Full address' },
                  { col: 'Phone', req: false, desc: 'Contact number' },
                  { col: 'Route Days', req: true, desc: 'Monday,Thursday or Mon,Thu (comma-separated for multiple days)' },
                  { col: 'Credit Amount', req: false, desc: 'Initial opening balance (0 if none)' },
                  { col: 'Credit Limit', req: false, desc: 'Maximum credit allowed (0 = no limit)' },
                ].map((item) => (
                  <div key={item.col} className="flex items-start gap-2 text-xs">
                    <Badge variant={item.req ? 'default' : 'outline'} className="shrink-0 text-[10px] mt-0.5">
                      {item.req ? 'Required' : 'Optional'}
                    </Badge>
                    <div>
                      <span className="font-semibold">{item.col}</span>
                      <span className="text-muted-foreground"> — {item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'upload' && (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                Assigning to: {activeOrderbookers.find((o) => o.id === selectedOBId)?.name}
                {selectedCompany && (
                  <span className="text-muted-foreground"> — {selectedCompany.name}</span>
                )}
              </label>
            </div>

            <div
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/10'); }}
              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/10'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) {
                  setFile(droppedFile);
                  parseFile(droppedFile);
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="space-y-3">
                <div className="h-16 w-16 mx-auto rounded-2xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <FileUp className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Drop your Excel/CSV file here</p>
                  <p className="text-sm text-muted-foreground mt-1">or click to browse files</p>
                </div>
                <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files</p>
                {file && (
                  <Badge variant="secondary" className="mt-2">
                    <FileSpreadsheet className="h-3 w-3 mr-1" />
                    {file.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-4">
            <div className="flex flex-wrap gap-3 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">{validShops.length} Valid</span>
              </div>
              {invalidShops.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-200 dark:border-red-800">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-400">{invalidShops.length} Invalid</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-100" onClick={removeInvalidRows}>
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
              )}
              {totalCredit > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                  <span className="text-sm font-semibold text-foreground">
                    Total Credit: {formatPKR(totalCredit)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <span className="text-sm text-muted-foreground">
                  OB: <span className="font-semibold text-foreground">{activeOrderbookers.find((o) => o.id === selectedOBId)?.name}</span>
                </span>
              </div>
              {selectedCompany && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                  <Building2 className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                  <span className="text-sm font-semibold text-foreground">{selectedCompany.name}</span>
                </div>
              )}
            </div>

            {invalidShops.length > 0 && (
              <Alert variant="destructive" className="shrink-0">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Some rows have errors. Click &quot;Remove&quot; to exclude them.
                  {invalidShops.slice(0, 3).map((s) => (
                    <div key={s.rowNumber} className="mt-1">Row {s.rowNumber}: {s.name} — {s.error}</div>
                  ))}
                  {invalidShops.length > 3 && <div className="mt-1 text-muted-foreground">...and {invalidShops.length - 3} more</div>}
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="flex-1 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-transparent">
                    <TableHead className="text-white font-semibold text-xs w-12">#</TableHead>
                    <TableHead className="text-white font-semibold text-xs">Shop Name</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden sm:table-cell">Owner</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden md:table-cell">Area</TableHead>
                    <TableHead className="text-white font-semibold text-xs hidden lg:table-cell">Route Days</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Credit</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-right">Limit</TableHead>
                    <TableHead className="text-white font-semibold text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedShops.map((shop) => (
                    <TableRow key={shop.rowNumber} className={`${shop.valid ? (shop.rowNumber % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd') : 'bg-red-50 dark:bg-red-950/30'}`}>
                      <TableCell className="text-xs text-muted-foreground">{shop.rowNumber}</TableCell>
                      <TableCell className="font-medium text-sm">{shop.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{shop.ownerName || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{shop.area || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline" className="text-[10px]">{shop.routeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {shop.creditAmount > 0 ? (
                          <span className="font-semibold text-sm text-slate-600 dark:text-slate-300">{formatPKR(shop.creditAmount)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {shop.creditLimit > 0 ? (
                          <span className="font-semibold text-sm text-slate-600 dark:text-slate-300">{formatPKR(shop.creditLimit)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {shop.valid ? (
                          <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span className="text-[9px] text-red-600 leading-tight">{shop.error}</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            <div className="rounded-xl border bg-green-50 dark:bg-green-950/30 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-500/15 flex items-center justify-center">
                  <Rocket className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-800 dark:text-green-300">Import Complete!</h3>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {importResult.created} shops created for {importResult.orderbookerName}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-white dark:bg-black/20 p-3 text-center border border-green-200 dark:border-green-800">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{importResult.created}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-black/20 p-3 text-center border border-green-200 dark:border-green-800">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
                <div className="rounded-lg bg-white dark:bg-black/20 p-3 text-center border border-green-200 dark:border-green-800">
                  <p className="text-2xl font-bold text-foreground">{formatPKR(importResult.totalCredit)}</p>
                  <p className="text-xs text-muted-foreground">Total Credit</p>
                </div>
              </div>
            </div>

            {importResult.errors && importResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-1">
                  <p className="font-semibold">{importResult.errors.length} shop(s) failed:</p>
                  {importResult.errors.map((err, i) => (
                    <div key={i}>Row {err.row}: {err.name} — {err.error}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {importResult.shops && importResult.shops.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Imported Shops</h4>
                <ScrollArea className="max-h-60 rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary hover:bg-transparent">
                        <TableHead className="text-white font-semibold text-xs">#</TableHead>
                        <TableHead className="text-white font-semibold text-xs">Name</TableHead>
                        <TableHead className="text-white font-semibold text-xs text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.shops.map((shop, idx) => (
                        <TableRow key={idx} className={idx % 2 === 0 ? 'data-table-row-even' : 'data-table-row-odd'}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{shop.name}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-semibold text-sm ${shop.balance > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {formatPKR(shop.balance)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          {(step === 'upload' || step === 'preview') && (
            <Button type="button" variant="outline" onClick={() => setStep(step === 'upload' ? 'select' : 'upload')} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          )}

          {step === 'result' && (
            <Button type="button" onClick={resetAndClose} className="bg-primary hover:bg-primary/90 text-white gap-1.5">
              <CheckCircle className="h-4 w-4" /> Done
            </Button>
          )}

          {step !== 'result' && (
            <Button type="button" variant="ghost" onClick={resetAndClose}>Cancel</Button>
          )}

          {step === 'select' && (
            <Button type="button" onClick={() => setStep('upload')} disabled={!selectedOBId} className="bg-primary hover:bg-primary/90 text-white gap-1.5">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 'select' && selectedOBId && !selectedCompanyId && activeCompanies.length > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Select a company if importing with credit
            </p>
          )}

          {step === 'preview' && (
            <Button type="button" variant="outline" onClick={() => { setFile(null); fileInputRef.current?.click(); }} className="gap-1.5">
              <Upload className="h-4 w-4" /> Re-upload
            </Button>
          )}

          {step === 'preview' && (
            <Button type="button" onClick={handleImport} disabled={validShops.length === 0 || importing} className="bg-primary hover:bg-primary/90 text-white gap-1.5">
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Importing {validShops.length} shops...</>
              ) : (
                <><Rocket className="h-4 w-4" /> Import {validShops.length} Shops
                {totalCredit > 0 && <span className="text-xs opacity-80 ml-1">({formatPKR(totalCredit)} credit)</span>}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
