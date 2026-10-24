import { defineConfig } from "@playwright/test";

/*
 * End-to-end checks at phone and desktop sizes: joining, adding, the item
 * page, the assistant, layout and accessibility. `npm run e2e`.
 *
 * The server uses the in-memory store and the scripted stand-in assistant,
 * never Redis or Gemini, so nothing here can touch a real trip.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // One at a time: tests share one server and its in-memory trip.
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3200" },
  webServer: {
    command: "npx next dev -p 3200",
    url: "http://localhost:3200",
    env: {
      CHAT_MOCK: "1",
      ALLOW_MEMORY_STORE: "1",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      GEMINI_API_KEY: "",
      SESSION_SECRET: "test-only-playwright-session-secret",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REDIRECT_URI: "",
      TRIP_PASSCODE: "volcano",
      NEXT_DIST_DIR: ".next-e2e",
    },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
