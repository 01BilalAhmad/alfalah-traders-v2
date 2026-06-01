import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
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

// ─── Protected Endpoints ──────────────────────────────────────────────────────
// These endpoints require a valid Authorization header
const PROTECTED_PATHS = [
  '/api/auth/reset-password',
  '/api/admin/backup',
  '/api/admin/restore',
  '/api/admin/reset-shops',
  '/api/route-tracking',
];

// Paths that are public even under a protected prefix
// e.g. /api/route-tracking/create-tables should be accessible without auth for initial setup
const PUBLIC_SUBPATHS = [
  '/api/route-tracking/create-tables',
];

// ─── Token Parsing ────────────────────────────────────────────────────────────
// Current token format: session-{userId}-{timestamp}
// We parse the userId from the token and pass it to route handlers
function parseToken(token: string): { userId: string; timestamp: number } | null {
  try {
    // Format: session-{userId}-{timestamp}
    // userId can contain underscores or be a cuid, so we extract carefully
    const match = token.match(/^session-(.+)-(\d+)$/);
    if (!match) return null;
    return { userId: match[1], timestamp: parseInt(match[2], 10) };
  } catch {
    return null;
  }
}

// ─── Middleware ────────────────────────────────────────────────────────────────
export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
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

  // ─── Rate Limiting ──────────────────────────────────────────────────────
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

  // ─── CORS Headers ───────────────────────────────────────────────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-client-ip', clientIP);

  // ─── Auth Check for Protected Endpoints ─────────────────────────────────
  const isProtected = PROTECTED_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Check if this specific path is in the public subpaths list (even under a protected prefix)
  const isPublicSubpath = PUBLIC_SUBPATHS.some((path) =>
    request.nextUrl.pathname === path
  );

  if (isProtected && !isPublicSubpath) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json(
        { error: 'Authentication required. Please log in again.' },
        { status: 401 }
      );
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    const token = authHeader.replace('Bearer ', '');
    const parsed = parseToken(token);

    if (!parsed) {
      const response = NextResponse.json(
        { error: 'Invalid authentication token.' },
        { status: 401 }
      );
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    // Check token age (max 7 days old)
    const tokenAge = Date.now() - parsed.timestamp;
    const MAX_TOKEN_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (tokenAge > MAX_TOKEN_AGE) {
      const response = NextResponse.json(
        { error: 'Session expired. Please log in again.' },
        { status: 401 }
      );
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    // Pass userId to route handler via custom header
    requestHeaders.set('x-auth-userid', parsed.userId);
  }

  // Continue with request
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
