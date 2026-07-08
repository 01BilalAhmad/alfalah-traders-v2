import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWARegister } from "@/components/PWARegister";
import { BusinessConfigProvider } from "@/lib/use-business-name";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4F46E5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Finexa | Smart Credit & Route Management",
    template: "%s | Finexa",
  },
  description: "Professional credit management, recovery tracking, and route planning system. Streamline orderbooker workflows with real-time GPS tracking and financial reporting.",
  keywords: ["Finexa", "credit management", "recovery tracking", "orderbooker", "route management", "GPS tracking"],
  manifest: "/manifest.json",
  // SEO: canonical URL prevents duplicate-content penalties
  metadataBase: new URL("https://finexa-cms.vercel.app"),
  alternates: {
    canonical: "/",
  },
  // SEO: OpenGraph tags for social sharing previews
  openGraph: {
    title: "Finexa | Smart Credit & Route Management",
    description: "Professional credit management, recovery tracking, and route planning system. Streamline orderbooker workflows with real-time GPS tracking and financial reporting.",
    url: "https://finexa-cms.vercel.app",
    siteName: "Finexa",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/icon-192.png",
        width: 192,
        height: 192,
        alt: "Finexa Logo",
      },
    ],
  },
  // SEO: Twitter card for Twitter sharing previews
  twitter: {
    card: "summary",
    title: "Finexa | Smart Credit & Route Management",
    description: "Professional credit management, recovery tracking, and route planning system.",
    images: ["/icon-192.png"],
  },
  // SEO: robots directive — allow indexing, follow links
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }],
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Finexa",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "theme-color": "#4F46E5",
    "msapplication-TileColor": "#4F46E5",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <BusinessConfigProvider>
            {children}
            <Toaster />
            <PWARegister />
          </BusinessConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
