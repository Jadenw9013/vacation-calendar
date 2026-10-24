import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PREFS_BOOT } from "@/client/prefs";
import { ServiceWorker } from "@/client/ServiceWorker";
import "./globals.css";
import { PRODUCT_NAME, PRODUCT_DESCRIPTION } from "@/brand";

/** Designed for legibility: read on a bumpy shuttle, in bright sun, at a glance. */
const atkinson = localFont({
  src: "./fonts/AtkinsonHyperlegibleNext.ttf",
  variable: "--font-atkinson",
  weight: "200 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.voyroo.com"),
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  applicationName: PRODUCT_NAME,
  description: PRODUCT_DESCRIPTION,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "default" },
  openGraph: { title: PRODUCT_NAME, description: PRODUCT_DESCRIPTION, siteName: PRODUCT_NAME, type: "website", images: [{ url: "/brand/voyroo-social.png", width: 1200, height: 630, alt: "Voyroo — A little further, together." }] },
  icons: {
    icon: [{ url: "/brand/voyroo-mark.svg", type: "image/svg+xml" }, { url: "/icon-192.png?v=voyroo", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png?v=voyroo", sizes: "180x180" }],
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
