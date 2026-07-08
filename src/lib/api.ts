/**
 * Central API Utility for Finexa
 * 
 * This module provides a configurable base URL for all API calls.
 * - In web browser: uses relative paths (works with current domain)
 * - In APK/Capacitor: prepends the configured server URL
 * 
 * Server URL is stored in localStorage under 'finexa-server-url'
 * Auth token is stored in localStorage under 'finexa-token'
 * 
 * Usage: 
 *   import { apiFetch, getServerUrl, setServerUrl, testConnection } from '@/lib/api';
 *   const res = await apiFetch('/api/auth/login', { method: 'POST', body: ... });
 */

const STORAGE_KEY = 'finexa-server-url';
const TOKEN_KEY = 'finexa-token';
// Legacy keys for migration
const LEGACY_STORAGE_KEY = 'alfalah-server-url';
const LEGACY_TOKEN_KEY = 'alfalah-token';

/**
 * Get the configured server base URL
 * Returns empty string if not configured (web browser mode - uses relative paths)
 */
export function getServerUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const url = localStorage.getItem(STORAGE_KEY);
    if (url) return url;
    // Migration: check legacy key
    const legacyUrl = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyUrl) {
      localStorage.setItem(STORAGE_KEY, legacyUrl);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacyUrl;
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Set the server base URL
 */
export function setServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (url) {
      localStorage.setItem(STORAGE_KEY, url);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Check if a custom server URL is configured
 */
export function hasServerUrl(): boolean {
  return !!getServerUrl();
}

/**
 * Get the stored authentication token
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token;
    // Migration: check legacy key
    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      return legacyToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the full API URL from a relative path
 * If server URL is set, prepend it. Otherwise use relative path.
 */
export function buildApiUrl(path: string): string {
  const serverUrl = getServerUrl();
  if (serverUrl) {
    // Clean up the URL - remove trailing slash from server URL and leading slash from path
    const base = serverUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }
  return path; // Relative path for web browser mode
}

/**
 * Drop-in replacement for fetch() that automatically:
 * 1. Uses the configured server URL
 * 2. Sends the auth token in Authorization header (if available)
 * 3. Handles 401 responses by clearing the session and redirecting to login
 * 
 * @param path - API path like '/api/auth/login'
 * @param options - Standard fetch options
 * @returns Promise<Response>
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const fullUrl = buildApiUrl(path);
  const token = getAuthToken();

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  // Attach auth token if available (skip for public endpoints)
  const publicPaths = ['/api/auth/login', '/api/auth/validate', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/setup', '/api/ping'];
  const isPublicPath = publicPaths.some((p) => path.startsWith(p));

  if (token && !isPublicPath) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // ── Handle 401 Unauthorized (session expired or invalid) ──
  // Clear the stored session and redirect to login page so the user
  // can re-authenticate instead of seeing cryptic error messages.
  if (response.status === 401 && !isPublicPath) {
    // Clear stored session data
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('finexa-session');
      localStorage.removeItem('alfalah-token');
      localStorage.removeItem('alfalah-session');
    } catch { /* ignore */ }

    // Dispatch a custom event so the app can react (e.g., show login screen)
    // This is cleaner than directly importing the Zustand store here
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('finexa:session-expired', {
        detail: { reason: 'Session expired or invalid. Please log in again.' }
      }));
    }
  }

  return response;
}

/**
 * Test connection to a server URL by hitting /api/auth/validate
 * Returns { success: true, serverInfo: string } or { success: false, error: string }
 */
export async function testConnection(url: string): Promise<{ success: boolean; message: string }> {
  if (!url) {
    return { success: false, message: 'No URL provided' };
  }

  // Clean URL
  const cleanUrl = url.replace(/\/+$/, '');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const res = await fetch(`${cleanUrl}/api/auth/validate`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return { 
        success: true, 
        message: data.message || `Connected to ${cleanUrl}` 
      };
    } else {
      return { success: false, message: `Server responded with status ${res.status}` };
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, message: 'Connection timed out (10s)' };
    }
    return { success: false, message: 'Could not connect to server. Check URL and try again.' };
  }
}

/**
 * Get display-friendly server label
 */
export function getServerLabel(): string {
  const url = getServerUrl();
  if (!url) return 'Current Server (This Device)';
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}
