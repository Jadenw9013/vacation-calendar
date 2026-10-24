import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The audit builds into its own folder so it never swaps files under a running `npm start`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The floating dev badge sits on top of the phone bottom bar.
  devIndicators: false,
  async headers() {
    return [{ source: "/p/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
  // The passphrase page is gone; old links land on the trip.
  async redirects() {
    return [{ source: "/login", destination: "/", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withSerwist(nextConfig);
