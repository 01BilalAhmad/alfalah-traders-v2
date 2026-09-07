'use client';

// components/alfalah/UnpaidBillsDetail.tsx
// Shared FIFO unpaid-bills breakdown used by the Overdue Shops and Aging
// Report pages. Renders each unpaid bill as: DATE — Rs remaining (X days old)
// plus the original bill amount. This is the "amount ki detail with date"
// the admin asked for — every overdue rupee is traceable to a dated bill.

import { formatPKR, formatLocalDate } from '@/lib/utils';
import { Receipt } from 'lucide-react';

export interface UnpaidBillView {
  date: string | null;
  amount: number;
  remaining: number;
  daysOld: number | null;
}

interface UnpaidBillsDetailProps {
  bills: UnpaidBillView[];
  totalBills?: number;
  fifoMatchesBalance?: boolean;
  compact?: boolean;
}

export function UnpaidBillsDetail({
  bills,
  totalBills,
  fifoMatchesBalance = true,
  compact = false,
}: UnpaidBillsDetailProps) {
  if (!bills || bills.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2 italic">
        No unpaid bill breakdown available — the balance may include claims or
        manual adjustments. Please review this shop manually.
      </p>
    );
  }

  const extraCount =
    typeof totalBills === 'number' && totalBills > bills.length
      ? totalBills - bills.length
      : 0;

  return (
    <div className={compact ? 'py-1.5' : 'py-2.5'}>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Receipt className="h-3 w-3" />
        Unpaid Bills — Oldest First {typeof totalBills === 'number' && `(${totalBills})`}
      </p>
      <div className="space-y-1">
        {bills.map((b, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 text-xs rounded-md px-2 py-1 bg-muted/50"
          >
            <span className="text-muted-foreground min-w-[86px]">
              {b.date ? formatLocalDate(new Date(b.date), { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </span>
            <span className="text-[11px] text-muted-foreground/80 hidden sm:inline min-w-[110px]">
              Bill: {formatPKR(b.amount)}
            </span>
            <span className="font-semibold text-foreground tabular-nums min-w-[90px] text-right">
              {formatPKR(b.remaining)}
            </span>
            <span className="min-w-[64px] text-right">
              {b.daysOld !== null ? (
                <span
                  className={`text-[10px] font-semibold ${
                    b.daysOld >= 30
                      ? 'text-red-600 dark:text-red-400'
                      : b.daysOld >= 14
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  {b.daysOld}d old
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
            </span>
          </div>
        ))}
        {extraCount > 0 && (
          <p className="text-[11px] text-muted-foreground pl-2">
            + {extraCount} more unpaid bill{extraCount === 1 ? '' : 's'} not shown
          </p>
        )}
      </div>
      {!fifoMatchesBalance && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 pl-1">
          Note: bill breakdown doesn&apos;t fully match the shop balance (claims/adjustments may apply).
        </p>
      )}
    </div>
  );
}
