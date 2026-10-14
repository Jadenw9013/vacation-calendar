import { defineConfig } from "@playwright/test";

/*
 * UI audit: screenshots, axe, touch targets, layout and offline.
 * Run with `npm run e2e` (builds first: the offline test needs the production service worker).
 *
 * Both servers use the in-memory store, never Redis, so tests can't touch the live trip.
 */
const memoryStore = {
  ALLOW_MEMORY_STORE: "1",
  KV_REST_API_URL: "",
  KV_REST_API_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};

export const DEV_URL = "http://localhost:3200";
export const PROD_URL = "http://localhost:3300";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: DEV_URL },
  webServer: [
    {
      // Scripted chat model (CHAT_MOCK) for the chat and proposal screens; it only runs outside production.
      command: "npx next dev -p 3200",
      url: DEV_URL,
      env: { ...memoryStore, CHAT_MOCK: "1" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npx next start -p 3300",
      url: PROD_URL,
      env: memoryStore,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
