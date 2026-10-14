import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
