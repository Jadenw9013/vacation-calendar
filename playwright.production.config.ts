import { defineConfig } from "@playwright/test";

/** Production-only regressions: a built app with its actual offline worker. */
export default defineConfig({
  testDir: "e2e-production", timeout: 60_000, workers: 1, reporter: [["list"]],
  use: { baseURL: "http://localhost:3300", viewport: { width: 390, height: 844 }, launchOptions: { ignoreDefaultArgs: ["--disable-back-forward-cache"] } },
  webServer: [{ command: "node scripts/auth-provider-fixture.mjs", url: "http://127.0.0.1:3301", timeout: 30_000, reuseExistingServer: false }, {
    command: "node node_modules/next/dist/bin/next start -p 3300",
    url: "http://localhost:3300", timeout: 60_000, reuseExistingServer: false,
    env: {
      ALLOW_MEMORY_STORE: "1", KV_REST_API_URL: "", KV_REST_API_TOKEN: "", UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "",
      GEMINI_API_KEY: "", CHAT_MOCK: "", TRIP_PASSCODE: "volcano", NEXT_DIST_DIR: ".next",
      SESSION_SECRET: "production-test-only-secret", GOOGLE_CLIENT_ID: "production-test.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "production-test-only-client-secret", GOOGLE_REDIRECT_URI: "http://localhost:3300/api/auth/google/callback",
    },
  }],
});
