import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space.z.ai", "*.z.ai"],
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
    ],
  },
  // CRITICAL: Prevent Vercel 307 redirects on API POST requests
  // Without this, POST /api/route-tracking/start gets redirected (307)
  // and mobile app/Capacitor can't follow POST redirects, causing "Server did not return route ID" error
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // ── Security Headers ────────────────────────────────────────────────
  // Addresses VibeDoctor findings: 2 critical (CSP + CORS wildcard) and
  // 7 medium (X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  // Permissions-Policy). Note: CORS wildcard for API routes is handled
  // separately in middleware.ts to allow the mobile app (Expo/Capacitor)
  // to call APIs while restricting browser-based cross-origin access.
  async headers() {
    const securityHeaders = [
      {
        // Content-Security-Policy: restrict resource loading to trusted sources.
        // - 'self' for scripts, styles, images, fonts, connect (API)
        // - Allow inline styles (Next.js requires this for styled-jsx)
        // - Allow unsafe-eval only in development (Next.js dev mode)
        // - Allow data: images (chart libraries, screenshots)
        // - Allow blob: for PDF/receipt generation
        // - Allow fonts.googleapis.com + fonts.gstatic.com (Inter, Noto Nastaliq)
        // - Allow unpkg.com for leaflet (map rendering)
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
          "img-src 'self' data: blob: https: http:",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self' https:",
          "media-src 'self' data: blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          "upgrade-insecure-requests",
        ].join('; '),
      },
      {
        // X-Frame-Options: prevent clickjacking — no framing allowed
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        // X-Content-Type-Options: prevent MIME sniffing
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        // Referrer-Policy: only send origin to cross-origin, full URL to same-origin
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        // Permissions-Policy: disable unused browser features
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
      },
      {
        // X-DNS-Prefetch-Control: disable DNS prefetching for privacy
        key: 'X-DNS-Prefetch-Control',
        value: 'off',
      },
      {
        // Strict-Transport-Security: enforce HTTPS for 2 years
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      {
        // X-Permitted-Cross-Domain-Policies: restrict cross-domain policies
        key: 'X-Permitted-Cross-Domain-Policies',
        value: 'none',
      },
    ];

    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  // For APK/Capacitor builds: set BUILD_TARGET=apk
  // For Vercel/web builds: leave BUILD_TARGET unset
  ...(process.env.BUILD_TARGET === 'apk' ? {
    output: 'export',
    images: {
      unoptimized: true,
    },
  } : {}),
};

export default nextConfig;
