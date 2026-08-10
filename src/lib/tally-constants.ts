/**
 * Client-safe constants for the tally system.
 * Separated from tally-migrations.ts (which imports pg) so client
 * components can import these labels without pulling server-only code.
 */

export const DISCREPANCY_REASON_CODES = [
  'ob_missed_recovery',
  'ob_missed_credit',
  'shopkeeper_partial_payment',
  'disputed_amount',
  'system_error',
  'other',
] as const;

export type DiscrepancyReasonCode = typeof DISCREPANCY_REASON_CODES[number];

export const REASON_CODE_LABELS: Record<DiscrepancyReasonCode, string> = {
  ob_missed_recovery: 'OB missed recovery entry',
  ob_missed_credit: 'OB missed credit entry',
  shopkeeper_partial_payment: 'Shopkeeper claims partial payment',
  disputed_amount: 'Disputed amount',
  system_error: 'System error',
  other: 'Other (see notes)',
};

export const RESOLUTION_TYPES = [
  'adjustment_posted',
  'error_acknowledged',
  'shopkeeper_confirmed',
  'written_off',
] as const;

export type ResolutionType = typeof RESOLUTION_TYPES[number];

export const RESOLUTION_TYPE_LABELS: Record<ResolutionType, string> = {
  adjustment_posted: 'Adjustment posted (balance corrected)',
  error_acknowledged: 'Error acknowledged (no action)',
  shopkeeper_confirmed: 'Shopkeeper confirmed (resolved externally)',
  written_off: 'Written off (difference waived)',
};
