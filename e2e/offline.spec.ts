import { expect, test } from "@playwright/test";
import { PROD_URL } from "../playwright.config";
import { AT } from "./helpers";

// Step 6: production build, service worker installed, then no network.
test("Trip mode loads from the saved copy with no signal", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date(AT.nov26));
  await page.goto(PROD_URL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Once the worker controls the page, a load puts the page in its cache.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByText(/^Saved on this phone, updated /)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thursday, Nov 26");
  await expect(page.getByText("starts in 1h 20m")).toBeVisible();
  await expect(page.getByText(/^Offline, showing saved copy from /)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/offline-390x844.png" });

  // Editing says it needs a connection.
  await page.locator('nav[aria-label="Main"]:visible').getByRole("button", { name: "Trip", exact: false }).click();
  await expect(page.getByText(/You.re offline, so this is the copy saved on this phone/)).toBeVisible();
});
