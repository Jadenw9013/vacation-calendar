import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The audit builds into its own folder so it never swaps files under a running `npm start`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The floating dev badge sits on top of the phone bottom bar.
  devIndicators: false,
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
