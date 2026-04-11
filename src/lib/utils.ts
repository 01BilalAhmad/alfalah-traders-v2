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
export function formatPKR(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
