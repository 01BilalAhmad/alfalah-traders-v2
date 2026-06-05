import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Token Configuration ────────────────────────────────────────
// Matches the validation logic in /api/auth/validate
const MAX_TOKEN_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_REGEX = /^session-(.+)-(\d+)$/;

// ─── Public API Routes (no auth required) ────────────────────────
// These endpoints must be accessible without authentication:
// - Login & password recovery (by design)
// - Health check & connectivity (used by mobile app)
// - Setup (needed for initial database creation)
// - Cron jobs (called by Vercel scheduler, no session)
// - APK download (public installer)
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/reset-password-with-token',
  '/api/auth/validate',
  '/api/ping',
  '/api/setup',
  '/api/cron/keep-alive',
  '/api/cron/auto-end-routes',
  '/api/download',
  '/api/download-apk',
];

// ─── Login Rate Limiting (per-process, lightweight) ──────────────
// Note: In serverless (Vercel), this is per-instance. Not 100% accurate
// but provides meaningful protection against rapid brute-force attempts.
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isLoginRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.lastAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return false;
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    if (now - record.lastAttempt < LOGIN_WINDOW_MS) {
      return true; // Rate limited
    }
    // Window expired, reset counter
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return false;
  }

  record.count++;
  record.lastAttempt = now;
  return false;
}

// Periodically clean up stale rate-limit entries (every 10 minutes)
let lastCleanup = Date.now();
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 10 * 60 * 1000) return;
  lastCleanup = now;
  for (const [ip, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ─── Main Middleware ─────────────────────────────────────────────
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect API routes — page routes use client-side auth
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // ─── Allow public API routes ──────────────────────────────────
  const isPublic = PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isPublic) {
    // Apply rate limiting specifically to the login endpoint
    if (pathname === '/api/auth/login' && request.method === 'POST') {
      cleanupStaleEntries();
      const ip = getClientIP(request);
      if (isLoginRateLimited(ip)) {
        return NextResponse.json(
          { error: 'Too many login attempts. Please try again in 15 minutes.' },
          { status: 429 }
        );
      }
    }
    return NextResponse.next();
  }

  // ─── Protected API routes — require authentication ────────────
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required. Please log in.' },
      { status: 401 }
    );
  }

  // Parse token format: session-{userId}-{timestamp}
  // Example: session-admin-001-1733443200000
  // The regex is greedy for userId to support IDs with dashes like "admin-001"
  const match = token.match(TOKEN_REGEX);
  if (!match) {
    return NextResponse.json(
      { error: 'Invalid authentication token format.' },
      { status: 401 }
    );
  }

  const userId = match[1];
  const timestamp = parseInt(match[2], 10);

  // Validate timestamp is a reasonable number
  if (isNaN(timestamp) || timestamp <= 0) {
    return NextResponse.json(
      { error: 'Invalid authentication token.' },
      { status: 401 }
    );
  }

  // Check token age — reject expired tokens
  const tokenAge = Date.now() - timestamp;
  if (tokenAge > MAX_TOKEN_AGE) {
    return NextResponse.json(
      { error: 'Session expired. Please log in again.' },
      { status: 401 }
    );
  }

  // Reject tokens with future timestamps (clock skew tolerance: 5 minutes)
  if (tokenAge < -(5 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Invalid authentication token.' },
      { status: 401 }
    );
  }

  // ─── Set auth headers for downstream route handlers ───────────
  // This allows requireAdmin() and requireAuth() in auth-guard.ts to work
  // since they read x-auth-userid header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-auth-userid', userId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ─── Add security headers to all API responses ────────────────
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self)'
  );

  return response;
}

// ─── Middleware Config ────────────────────────────────────────────
// Only run middleware on API routes (skip static assets, pages, etc.)
export const config = {
  matcher: ['/api/:path*'],
};
