import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space.z.ai", "*.z.ai"],
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
