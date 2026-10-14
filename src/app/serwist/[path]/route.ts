import { createSerwistRoute } from "@serwist/turbopack";

// Builds the service worker (src/sw/sw.ts) at build time and serves it at /serwist/sw.js.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
  // The photo only appears as a small thumbnail through next/image, which is cached at runtime.
  globIgnores: ["public/lake-atitlan-hero.jpg"],
});
