/**
 * Central API Utility for Al-Falah Traders
 * 
 * This module provides a configurable base URL for all API calls.
 * - In web browser: uses relative paths (works with current domain)
 * - In APK/Capacitor: prepends the configured server URL
 * 
 * Server URL is stored in localStorage under 'alfalah-server-url'
 * 
 * Usage: 
 *   import { apiFetch, getServerUrl, setServerUrl, testConnection } from '@/lib/api';
 *   const res = await apiFetch('/api/auth/login', { method: 'POST', body: ... });
 */

const STORAGE_KEY = 'alfalah-server-url';

/**
 * Get the configured server base URL
 * Returns empty string if not configured (web browser mode - uses relative paths)
 */
export function getServerUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
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
 * Drop-in replacement for fetch() that automatically uses the configured server URL
 * 
 * @param path - API path like '/api/auth/login'
 * @param options - Standard fetch options
 * @returns Promise<Response>
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const fullUrl = buildApiUrl(path);
  return fetch(fullUrl, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });
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
