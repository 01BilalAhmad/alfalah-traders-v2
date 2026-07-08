import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get local date string (YYYY-MM-DD) using Asia/Karachi timezone.
 * This avoids the timezone bug where toISOString().split('T')[0] returns UTC date
 * which can differ from the user's local date (Pakistan is UTC+5).
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  // Use Asia/Karachi timezone (UTC+5) for all date calculations
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/**
 * Get yesterday's local date string (YYYY-MM-DD) using Asia/Karachi timezone.
 */
export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/**
 * Get start of day (midnight) in local timezone as a Date object.
 * Used for database queries to filter by date range.
 * Returns a Date object representing midnight in Asia/Karachi timezone.
 */
export function getLocalStartOfDay(dateStr?: string): Date {
  const str = dateStr || getLocalDateString();
  // Create date in local Pakistan timezone
  const [year, month, day] = str.split('-').map(Number);
  // Create in UTC, then offset to Pakistan (UTC+5) by subtracting 5 hours
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // Subtract 5 hours to get equivalent of midnight Pakistan time in UTC
  utcDate.setUTCHours(utcDate.getUTCHours() - 5);
  return utcDate;
}

/**
 * Get end of day (23:59:59) in local timezone as a Date object.
 * Used for database queries to filter by date range.
 */
export function getLocalEndOfDay(dateStr?: string): Date {
  const str = dateStr || getLocalDateString();
  const [year, month, day] = str.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  utcDate.setUTCHours(utcDate.getUTCHours() - 5);
  return utcDate;
}

/**
 * Format a date for display in Pakistan timezone.
 */
export function formatLocalDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-PK', {
    timeZone: 'Asia/Karachi',
    ...options,
  });
}

/**
 * Format date and time for display in Pakistan timezone.
 */
export function formatLocalDateTime(date: Date): string {
  return date.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format currency in Pakistani Rupees.
 */
export function formatPKR(amount: number | undefined | null): string {
  const safeAmount = amount ?? 0;
  return `Rs. ${safeAmount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format a number with Pakistani locale grouping, without currency prefix.
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Working days for Finexa.
 * Friday is the weekly off day. Saturday through Thursday are working days.
 */
export const WORKING_DAYS = [
  'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday',
] as const;

/**
 * Get today's route day name using Asia/Karachi timezone.
 * Returns '' if today is Friday (weekly off day).
 * Working days: Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday.
 */
export function getTodayRouteDay(): string {
  // Get current day-of-week in Pakistan timezone
  const pkDay = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' })
  ).getDay();
  // pkDay: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday(off), 6=Saturday
  const dayIndexMap: Record<number, number> = {
    6: 0, // Saturday → WORKING_DAYS[0]
    0: 1, // Sunday → WORKING_DAYS[1]
    1: 2, // Monday → WORKING_DAYS[2]
    2: 3, // Tuesday → WORKING_DAYS[3]
    3: 4, // Wednesday → WORKING_DAYS[4]
    4: 5, // Thursday → WORKING_DAYS[5]
    // 5 (Friday) = off day, no mapping
  };
  const idx = dayIndexMap[pkDay];
  return idx !== undefined ? WORKING_DAYS[idx] : '';
}

/**
 * Business rule constants for transaction validation.
 */
export const TRANSACTION_RULES = {
  MIN_AMOUNT: 100,
  MAX_AMOUNT: 500000,
  DAILY_CREDIT_CAP: 100000,
  MAX_DESCRIPTION_LENGTH: 200,
} as const;

/**
 * Validate a transaction against business rules.
 * Returns errors (blocking) and warnings (non-blocking).
 */
export function validateTransaction(params: {
  amount: number;
  type: 'credit' | 'recovery';
  shopBalance: number;
  shopCreditLimit: number | null;
  todayShopCredits: number;
}): { valid: boolean; errors: string[]; warnings: string[] } {
  const { amount, type, shopBalance, shopCreditLimit, todayShopCredits } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Minimum amount check
  if (amount < TRANSACTION_RULES.MIN_AMOUNT) {
    errors.push(`Minimum transaction amount is Rs. ${TRANSACTION_RULES.MIN_AMOUNT.toLocaleString()}`);
  }

  // 2. Maximum single transaction check
  if (amount > TRANSACTION_RULES.MAX_AMOUNT) {
    errors.push(`Maximum single transaction amount is Rs. ${TRANSACTION_RULES.MAX_AMOUNT.toLocaleString()}`);
  }

  // 3. For credit type: daily credit cap (WARNING only — admin can override)
  if (type === 'credit') {
    if (todayShopCredits + amount > TRANSACTION_RULES.DAILY_CREDIT_CAP) {
      warnings.push(
        `Daily credit cap exceeded for this shop. Today's total: Rs. ${todayShopCredits.toLocaleString()}, ` +
        `this entry: Rs. ${amount.toLocaleString()}, ` +
        `combined: Rs. ${(todayShopCredits + amount).toLocaleString()} (limit: Rs. ${TRANSACTION_RULES.DAILY_CREDIT_CAP.toLocaleString()})`
      );
    }
  }

  // 4. For recovery type: cannot recover more than shop balance
  if (type === 'recovery' && amount > shopBalance) {
    errors.push(
      `Recovery amount (Rs. ${amount.toLocaleString()}) exceeds shop balance (Rs. ${shopBalance.toLocaleString()}).`
    );
  }

  // Warnings (non-blocking)
  if (type === 'credit' && shopCreditLimit && shopCreditLimit > 0) {
    const projectedBalance = shopBalance + amount;
    if (projectedBalance > shopCreditLimit) {
      warnings.push(
        `Shop balance will exceed credit limit after this credit (projected: Rs. ${projectedBalance.toLocaleString()}, limit: Rs. ${shopCreditLimit.toLocaleString()})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Credit limit status types for visual indicators.
 */
export interface CreditLimitStatus {
  status: 'none' | 'safe' | 'caution' | 'warning' | 'exceeded';
  percentage: number;
  className: string;
  label: string;
  color: string;
}

/**
 * Get credit limit status with visual styling info.
 * Used to display credit limit indicators next to shop balances.
 */
export function getCreditLimitStatus(balance: number, creditLimit: number | null | undefined): CreditLimitStatus {
  // No credit limit set
  if (!creditLimit || creditLimit <= 0) {
    return { status: 'none', percentage: 0, className: '', label: '', color: '' };
  }

  const percentage = Math.round((balance / creditLimit) * 100);

  if (percentage < 50) {
    return {
      status: 'safe',
      percentage,
      className: 'credit-limit-safe',
      label: 'Safe',
      color: '#10B981',
    };
  } else if (percentage < 80) {
    return {
      status: 'caution',
      percentage,
      className: 'credit-limit-caution',
      label: 'Caution',
      color: '#F59E0B',
    };
  } else if (percentage < 100) {
    return {
      status: 'warning',
      percentage,
      className: 'credit-limit-warning',
      label: 'Warning',
      color: '#F97316',
    };
  } else {
    return {
      status: 'exceeded',
      percentage,
      className: 'credit-limit-exceeded',
      label: 'Exceeded',
      color: '#EF4444',
    };
  }
}
