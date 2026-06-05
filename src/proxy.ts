import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Token Configuration ────────────────────────────────────────
// Matches the validation logic in /api/auth/validate
const MAX_TOKEN_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOKEN_REGEX = /^session-(.+)-(\d+)$/;

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

// ─── Public API Routes (no auth required) ────────────────────────
// These endpoints must be accessible without authentication:
// - Login & password recovery (by design)
// - Health check & connectivity (used by mobile app)
// - Setup (needed for initial database creation + migrations)
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

// ─── Token Parsing ────────────────────────────────────────────────
// Current token format: session-{userId}-{timestamp}
// We parse the userId from the token and pass it to route handlers
function parseToken(token: string): { userId: string; timestamp: number } | null {
  try {
    const match = token.match(TOKEN_REGEX);
    if (!match) return null;
    const timestamp = parseInt(match[2], 10);
    if (isNaN(timestamp) || timestamp <= 0) return null;
    return { userId: match[1], timestamp };
  } catch {
    return null;
  }
}

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
    response.headers.set('Access-Control-Allow-Origin', '*');
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
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Retry-After', '60');
    return response;
  }

  // ─── Login Rate Limiting (stricter: 5 attempts / 15 min) ────
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    cleanupStaleLoginEntries();
    if (isLoginRateLimited(clientIP)) {
      const response = NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }
  }

  // ─── Check if route is public ───────────────────────────────
  const isPublic = PUBLIC_API_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-client-ip', clientIP);

  // ─── Public routes: skip auth check ─────────────────────────
  if (isPublic) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('Access-Control-Allow-Origin', '*');
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
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }

  // Parse and validate token
  const parsed = parseToken(token);

  if (!parsed) {
    const response = NextResponse.json(
      { error: 'Invalid authentication token format.' },
      { status: 401 }
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }

  // Check token age — reject expired tokens
  const tokenAge = Date.now() - parsed.timestamp;
  if (tokenAge > MAX_TOKEN_AGE) {
    const response = NextResponse.json(
      { error: 'Session expired. Please log in again.' },
      { status: 401 }
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }

  // Reject tokens with future timestamps (clock skew tolerance: 5 minutes)
  if (tokenAge < -(5 * 60 * 1000)) {
    const response = NextResponse.json(
      { error: 'Invalid authentication token.' },
      { status: 401 }
    );
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }

  // ─── Pass userId to route handlers via custom header ────────
  // This allows requireAdmin() and requireAuth() in auth-guard.ts to work
  requestHeaders.set('x-auth-userid', parsed.userId);

  // Continue with request
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ─── CORS Headers ───────────────────────────────────────────
  response.headers.set('Access-Control-Allow-Origin', '*');
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
