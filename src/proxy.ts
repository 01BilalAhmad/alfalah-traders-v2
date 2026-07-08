import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

// ─── Token Configuration ────────────────────────────────────────
// Token verification is now handled by @/lib/jwt (verifyToken)
// Legacy format support is maintained for backward compatibility

// ─── General Rate Limiting ───────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // Max requests per window
const RATE_WINDOW = 60 * 1000; // 1 minute window

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ─── Login Rate Limiting (stricter than general) ────────────────
// 5 login attempts per 15 minutes per IP — prevents brute force
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

let lastCleanup = Date.now();
function cleanupStaleLoginEntries() {
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
    request.headers.get('cf-connecting-ip') || // Cloudflare
    'unknown'
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

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

// ─── Allowed CORS Origins ────────────────────────────────────────
// SECURITY: Only allow specific origins instead of wildcard *
// VibeDoctor flagged 'CORS wildcard (Access-Control-Allow-Origin: *)' as CRITICAL.
// This was caused by the old behavior of returning a default origin for unknown
// request origins, which effectively allowed any origin to read API responses.
// Now: returns null for unrecognized origins, and the caller skips setting
// the Access-Control-Allow-Origin header in that case (browsers will block
// the cross-origin read).
const ALLOWED_ORIGINS = [
  'https://alfalah-traders.vercel.app',
  'https://finexa-cms.vercel.app',
  'https://finexa-cms-s-projects.vercel.app',
  'http://localhost:3000',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
];

function getAllowedOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin') || '';
  if (!origin) {
    // Same-origin requests (no Origin header) — return null, no CORS header needed.
    return null;
  }
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow Vercel preview deployments of this project (finexa-cms-*.vercel.app
  // and alfalah-traders-*.vercel.app) — needed for preview branches.
  if (
    origin.match(/^https:\/\/(finexa-cms|alfalah-traders)-[a-z0-9-]+\.vercel\.app$/)
  ) return origin;
  // Unknown origin — return null so caller skips setting the CORS header.
  // Browser will then block the cross-origin response (default Same-Origin policy).
  return null;
}

// Helper: set CORS headers on a response. No-ops if origin is not allowed.
function setCorsHeaders(response: NextResponse, request: NextRequest): void {
  const allowedOrigin = getAllowedOrigin(request);
  if (allowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
}

// ─── Public API Routes (no auth required) ────────────────────────
// These endpoints must be accessible without authentication:
// - Login & password recovery (by design)
// - Health check & connectivity (used by mobile app)
// - Setup (needed for initial database creation + migrations)
// - Cron jobs (called by Vercel scheduler, no session)
// - APK download (public installer)
// SECURITY: Removed /api/shops/phone, /api/users/phone, /api/companies/distributor-phone
// from public list — they expose PII without authentication
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/forgot-password',
  // SECURITY: /api/auth/reset-password removed from public — it's admin-only
  // and was exploitable via x-auth-userid header spoofing on public routes
  '/api/auth/reset-password-with-token',
  '/api/auth/validate',
  '/api/ping',
  '/api/setup',
  '/api/cron/keep-alive',
  '/api/cron/auto-end-routes',
  '/api/cron/auto-backup',
  '/api/download',
  '/api/download-apk',
  '/api/config',
  // Mobile app endpoints — removed from public list; now go through JWT verification
  // The proxy validates the Bearer token and sets x-auth-userid / x-auth-role
  // Route handlers verify the authenticated user matches the requested data
  '/api/orderbooker/login',
  // '/api/mobile/sync' — REMOVED from public: now requires valid JWT token
  // '/api/route-sessions/*' — REMOVED from public: now requires valid JWT token
];

// ─── Admin-Only API Routes ──────────────────────────────────────
// SECURITY: These routes require admin role (not just any authenticated user)
// Orderbookers should NOT have access to these endpoints
const ADMIN_ONLY_ROUTES = [
  '/api/backup',
  '/api/admin/',
  '/api/dashboard',
  '/api/audit',
  '/api/reports/',
  '/api/stats',
  '/api/summary',
  '/api/companies',  // Company management
  '/api/shops/bulk-import',
  '/api/shops/bulk-status',
  '/api/shops/bulk-route-days',
  '/api/shops/bulk-assign',
  '/api/shops/bulk-assign-secondary',
  '/api/shops/recalculate-balance',
  '/api/shops/assign-orderbooker',
  '/api/shops/locations',
  '/api/shops/needing-recovery',
  '/api/orderbookers',
  '/api/users/',
  '/api/transactions/claim',
  '/api/transactions/edit-pending',
  '/api/transactions/pending-summary',
  '/api/auth/reset-password', // SECURITY: Admin-only — removed from public routes
];

// ─── Token Parsing ────────────────────────────────────────────────
// SECURITY: Now uses JWT verification via verifyToken()
// Supports both new JWT tokens and legacy session-{userId}-{timestamp} format

// ─── Proxy (Next.js 16 — replaces deprecated middleware) ──────────
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // Handle preflight OPTIONS request first
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    setCorsHeaders(response, request);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    response.headers.set('Access-Control-Max-Age', '3600');
    return response;
  }

  // ─── General Rate Limiting ───────────────────────────────────
  const clientIP = getClientIP(request);
  if (!checkRateLimit(clientIP)) {
    const response = NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
    setCorsHeaders(response, request);
    response.headers.set('Retry-After', '60');
    return response;
  }

  // ─── Login Rate Limiting (stricter: 5 attempts / 15 min) ────
  if ((pathname === '/api/auth/login' || pathname === '/api/orderbooker/login') && request.method === 'POST') {
    cleanupStaleLoginEntries();
    if (isLoginRateLimited(clientIP)) {
      const response = NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
      setCorsHeaders(response, request);
      return response;
    }
  }

  // ─── Check if route is public ───────────────────────────────
  const isPublic = PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // SECURITY: Always strip auth headers from incoming requests.
  // The proxy is the SOLE source of truth for these headers.
  // Without stripping, an attacker could spoof x-auth-userid on public routes
  // and bypass requireAdmin() / requireAuth() checks in route handlers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-auth-userid');
  requestHeaders.delete('x-auth-role');
  requestHeaders.delete('x-auth-legacy');
  requestHeaders.delete('x-auth-required-role');
  requestHeaders.set('x-client-ip', clientIP);

  // ─── Public routes: skip auth check ─────────────────────────
  if (isPublic) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    setCorsHeaders(response, request);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    return response;
  }

  // ─── Protected routes: require authentication ───────────────
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const response = NextResponse.json(
      { error: 'Authentication required. Please log in.' },
      { status: 401 }
    );
    setCorsHeaders(response, request);
    return response;
  }

  // SECURITY: Verify token using JWT (with backward-compatible legacy support)
  const verified = verifyToken(token);

  if (!verified.valid) {
    const response = NextResponse.json(
      { error: 'Invalid or expired authentication token.' },
      { status: 401 }
    );
    setCorsHeaders(response, request);
    return response;
  }

  // ─── SECURITY: Admin-only route check ───────────────────────
  // Check if this route requires admin role
  const isAdminRoute = ADMIN_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  // EXCEPTION: /api/reports/ledger is used by orderbookers in the mobile app
  // to view a shop's account statement. It must be accessible to any
  // authenticated user (the route handler validates shopId ownership).
  // Without this exception, OBs get "Could not load ledger" 403 error.
  const isLedgerException = pathname === '/api/reports/ledger';

  // EXCEPTION: /api/admin/email-config/status (v2 - force rebuild) is used on the login page
  // (before authentication) to determine whether to show the "Forgot
  // Password" link. Without this exception, the login page always shows
  // "Password reset not available" because the unauthenticated request
  // gets blocked by the admin-only check.
  const isEmailStatusException = pathname === '/api/admin/email-config/status';

  // EXCEPTION: /api/companies/distributor-phone is used by the mobile app
  // to fetch distributor phone for receipts. OBs need access.
  const isDistributorPhoneException = pathname === '/api/companies/distributor-phone';

  if (isAdminRoute && !isLedgerException && !isEmailStatusException && !isDistributorPhoneException) {
    // If we have role from JWT, check immediately
    if (verified.role && verified.role !== 'admin') {
      const response = NextResponse.json(
        { error: 'Admin access required.' },
        { status: 403 }
      );
      setCorsHeaders(response, request);
      return response;
    }
    // For legacy tokens (no role in token), pass flag to route handler
    // The route handler will check role via requireAdmin()
    if (verified.isLegacy || !verified.role) {
      requestHeaders.set('x-auth-required-role', 'admin');
    }
  }

  // ─── Pass userId and role to route handlers via custom headers ─
  // This allows requireAdmin() and requireAuth() in auth-guard.ts to work
  requestHeaders.set('x-auth-userid', verified.userId || '');
  if (verified.role) {
    requestHeaders.set('x-auth-role', verified.role);
  }
  if (verified.isLegacy) {
    requestHeaders.set('x-auth-legacy', 'true');
  }

  // Continue with request
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ─── CORS Headers (only set if origin is allowed) ──────────
  setCorsHeaders(response, request);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

  // ─── Security Headers ───────────────────────────────────────
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

export const config = {
  matcher: '/api/:path*',
};
