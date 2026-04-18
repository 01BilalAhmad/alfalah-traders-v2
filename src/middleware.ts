import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// CORS middleware for Flutter APK and external API consumers
export function middleware(request: NextRequest) {
  // Only apply to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const response = NextResponse.next();

    // Allow all origins (for APK / mobile app / any client)
    response.headers.set('Access-Control-Allow-Origin', '*');

    // Allow common HTTP methods
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    // Allow common headers (Content-Type, Authorization, etc.)
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

    // Cache preflight for 1 hour
    response.headers.set('Access-Control-Max-Age', '3600');

    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
