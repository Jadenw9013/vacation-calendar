import { createSerwistRoute } from "@serwist/turbopack";

// Builds the service worker (src/sw/sw.ts) at build time and serves it at /serwist/sw.js.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
  // The photos are shown through next/image, which caches the sizes actually used at runtime.
  globIgnores: ["public/*.jpg"],
});
