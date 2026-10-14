/// <reference lib="webworker" />
import type { PrecacheEntry, RouteMatchCallbackOptions, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

/*
 * Offline support. Production only (the provider doesn't register it in dev).
 *
 * - The app's JS, CSS and fonts are precached at install.
 * - Pages: network first, so a fresh trip wins whenever there's signal; the
 *   last good copy is served when there isn't (or after 4s of weak signal).
 *   Error pages and redirects are never stored as the page.
 * - The API is never cached: edits and chat need a connection.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const onlyGoodPages = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.ok && !response.redirected && response.type === "basic" ? response : null,
};

const isPage = ({ request, sameOrigin }: RouteMatchCallbackOptions) => sameOrigin && request.mode === "navigate";
const isApi = ({ sameOrigin, url }: RouteMatchCallbackOptions) => sameOrigin && url.pathname.startsWith("/api/");
const isRsc = ({ request, sameOrigin }: RouteMatchCallbackOptions) => sameOrigin && request.headers.get("RSC") === "1";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    { matcher: isApi, handler: new NetworkOnly() },
    { matcher: isRsc, handler: new NetworkOnly() },
    {
      matcher: isPage,
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 4,
        plugins: [onlyGoodPages, new ExpirationPlugin({ maxEntries: 8 })],
      }),
    },
    {
      matcher: /\/_next\/static\/.+\.(?:js|css|woff2?)$/i,
      handler: new CacheFirst({ cacheName: "next-static", plugins: [new ExpirationPlugin({ maxEntries: 128 })] }),
    },
    {
      matcher: /\/_next\/image\?url=.+$|\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
      handler: new StaleWhileRevalidate({ cacheName: "images", plugins: [new ExpirationPlugin({ maxEntries: 32 })] }),
    },
  ],
});

serwist.addEventListeners();
