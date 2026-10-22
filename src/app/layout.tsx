import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { PREFS_BOOT } from "@/client/prefs";
import { ServiceWorker } from "@/client/ServiceWorker";
import "./globals.css";

/** Designed for legibility: read on a bumpy shuttle, in bright sun, at a glance. */
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Next has no metrics for this face to size a fallback with.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: { default: "Trip", template: "%s · Trip" },
  description: "Your group's trip: what's next, where you're sleeping, and everything you saved.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Trip", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the keyboard resizes the page instead of covering it.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f3f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1214" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script may add data-theme, data-sunlight and data-text before React loads.
    <html lang="en" className={`${atkinson.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink">
        <ServiceWorker>{children}</ServiceWorker>
      </body>
    </html>
  );
}
