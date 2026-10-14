import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import "./globals.css";

/** Display face: day titles only. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Guatemala · Nov 24–30",
  description: "Our Guatemala trip at a glance: what's on today, and what still needs booking.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Guatemala", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1014" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} antialiased`}>
      <body className="min-h-dvh bg-canvas text-ink font-sans">
        <ServiceWorker>{children}</ServiceWorker>
      </body>
    </html>
  );
}
