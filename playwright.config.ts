import { defineConfig } from "@playwright/test";

/*
 * UI audit: screenshots, axe, touch targets, layout, keyboard, dialogs,
 * proposals, updates and offline. Run with `npm run e2e`: it builds into
 * .next-e2e first (the offline test needs the production service worker),
 * so a running `npm start` on .next is left alone.
 *
 * Every server uses the in-memory store, never Redis, so nothing here can
 * touch the live trip, and the scripted stand-in model, never Gemini.
 */
const isolated = {
  ALLOW_MEMORY_STORE: "1",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  GEMINI_API_KEY: "",
  NEXT_DIST_DIR: ".next-e2e",
};

/** Dev server with the scripted chat model (CHAT_MOCK only runs outside production). */
export const DEV_URL = "http://localhost:3200";
/** Production build: read-only screens and the offline test. */
export const PROD_URL = "http://localhost:3300";
/** Production build for tests that change the trip; each one puts it back. */
export const EDIT_URL = "http://localhost:3400";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // One at a time: tests that edit the trip share a server with others reading it.
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: PROD_URL },
  webServer: [
    { command: "npx next dev -p 3200", url: DEV_URL, env: { ...isolated, CHAT_MOCK: "1" }, reuseExistingServer: false, timeout: 120_000 },
    { command: "npx next start -p 3300", url: PROD_URL, env: isolated, reuseExistingServer: false, timeout: 120_000 },
    { command: "npx next start -p 3400", url: EDIT_URL, env: isolated, reuseExistingServer: false, timeout: 120_000 },
  ],
});
