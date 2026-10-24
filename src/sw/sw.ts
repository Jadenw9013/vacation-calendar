/// <reference lib="webworker" />
import type { PrecacheEntry, RouteMatchCallbackOptions, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

/*
 * Offline support. Production only (the provider doesn't register it in dev).
 *
 * - The app's JS, CSS and fonts are precached at install.
 * - Pages: network first, so a fresh trip wins whenever there's signal; the
 *   last good copy is served when there isn't (or after 4s of weak signal).
 * - Every screen of a trip is the same page (screens switch on the phone),
 *   so any /t/{id}/... address falls back to the cached /t/{id}, and opening
 *   the app from the home screen with no signal lands on the last trip seen.
 * - The API is never cached (the trip itself is kept in localStorage),
 *   except post and link pictures, kept so the grid still shows offline.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const PAGES = "pages";

const onlyGoodPages = {
  cacheWillUpdate: async ({ response }: { response: Response }) =>
    response.ok && !response.redirected && response.type === "basic" ? response : null,
};

/** No signal and no copy of this exact page: the trip's own page, or else the last trip page cached. */
const tripFallback = {
  handlerDidError: async ({ request }: { request: Request }) => {
    const cache = await caches.open(PAGES);
    const trip = /^\/t\/([^/]+)/.exec(new URL(request.url).pathname)?.[1];
    if (trip) {
      const hit = await cache.match(`/t/${trip}`, { ignoreSearch: true });
      if (hit) return hit;
    }
    const keys = (await cache.keys()).filter((k) => /^\/t\/[^/]+$/.test(new URL(k.url).pathname));
    const last = keys.at(-1);
    return (last && (await cache.match(last))) || undefined;
  },
};

// OAuth must use native browser navigation, including its cross-origin redirects.
// It must not be fetched, replayed or supplied an offline page by the worker.
const isPage = ({ request, sameOrigin, url }: RouteMatchCallbackOptions) => sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/p/");
const isApi = ({ sameOrigin, url }: RouteMatchCallbackOptions) => sameOrigin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
const isThumb = ({ sameOrigin, url }: RouteMatchCallbackOptions) => sameOrigin && /^\/api\/t\/[^/]+\/thumb$/.test(url.pathname);
const isRsc = ({ request, sameOrigin, url }: RouteMatchCallbackOptions) => sameOrigin && request.headers.get("RSC") === "1" && !url.pathname.startsWith("/api/auth/");

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: isThumb,
      handler: new CacheFirst({ cacheName: "thumbs", plugins: [{ cacheWillUpdate: async ({ response }) => (response.ok ? response : null) }, new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
    },
    { matcher: isApi, handler: new NetworkOnly() },
    { matcher: isRsc, handler: new NetworkOnly() },
    {
      matcher: isPage,
      handler: new NetworkFirst({
        cacheName: PAGES,
        networkTimeoutSeconds: 4,
        plugins: [onlyGoodPages, tripFallback, new ExpirationPlugin({ maxEntries: 16 })],
      }),
    },
    {
      matcher: ({ url }) => /\/_next\/static\/.+\.(?:js|css|woff2?)$/i.test(url.pathname),
      handler: new CacheFirst({ cacheName: "next-static", plugins: [new ExpirationPlugin({ maxEntries: 160 })] }),
    },
    {
      matcher: ({ url }) => !url.pathname.startsWith("/api/auth/") && (url.pathname === "/_next/image" || /\.(?:png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)),
      handler: new StaleWhileRevalidate({ cacheName: "images", plugins: [new ExpirationPlugin({ maxEntries: 64 })] }),
    },
  ],
});

serwist.addEventListeners();
