import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space.z.ai", "*.z.ai"],
  // CRITICAL: Prevent Vercel 307 redirects on API POST requests
  // Without this, POST /api/route-tracking/start gets redirected (307) 
  // and mobile app/Capacitor can't follow POST redirects, causing "Server did not return route ID" error
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: path.resolve(__dirname),
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
