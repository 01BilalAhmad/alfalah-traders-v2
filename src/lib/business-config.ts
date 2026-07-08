/**
 * Business configuration utility
 * Provides the business name and phone for use in both React and non-React contexts.
 *
 * In React components: use the `useBusinessName()` hook from use-business-name.ts
 * In utility functions (PDF generators, etc.): use `getBusinessName()` / `getBusinessPhone()` from this file
 */

const DEFAULT_BUSINESS_NAME = 'AL-FALAH TRADERS';
const DEFAULT_BUSINESS_PHONE = '';

/**
 * Get the business name from localStorage (client-side only).
 * Falls back to default if not available.
 */
export function getBusinessName(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('finexa-business-name') || DEFAULT_BUSINESS_NAME;
  }
  return DEFAULT_BUSINESS_NAME;
}

/**
 * Set the business name in localStorage.
 * Called when config is loaded from API or when admin updates it.
 */
export function setBusinessName(name: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('finexa-business-name', name);
  }
}

/**
 * Get the business phone from localStorage (client-side only).
 * Falls back to default (empty string) if not available.
 */
export function getBusinessPhone(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('finexa-business-phone') || DEFAULT_BUSINESS_PHONE;
  }
  return DEFAULT_BUSINESS_PHONE;
}

/**
 * Set the business phone in localStorage.
 * Called when config is loaded from API or when admin updates it.
 */
export function setBusinessPhone(phone: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('finexa-business-phone', phone);
  }
}
