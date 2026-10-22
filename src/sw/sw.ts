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
 * - The API is never cached: the trip itself is kept in localStorage.
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
        cacheName: PAGES,
        networkTimeoutSeconds: 4,
        plugins: [onlyGoodPages, tripFallback, new ExpirationPlugin({ maxEntries: 16 })],
      }),
    },
    {
      matcher: /\/_next\/static\/.+\.(?:js|css|woff2?)$/i,
      handler: new CacheFirst({ cacheName: "next-static", plugins: [new ExpirationPlugin({ maxEntries: 160 })] }),
    },
    {
      matcher: /\/_next\/image\?url=.+$|\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
      handler: new StaleWhileRevalidate({ cacheName: "images", plugins: [new ExpirationPlugin({ maxEntries: 64 })] }),
    },
  ],
});

serwist.addEventListeners();
