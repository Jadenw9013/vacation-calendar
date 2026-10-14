import { expect, test } from "@playwright/test";
import { DEV_URL, PROD_URL } from "../playwright.config";
import { AT, mainNav, openPlanner, planner, start } from "./helpers";

// Production build, service worker installed, then no network.
test("Trip mode loads from the saved copy with no signal", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date(AT.nov26));
  await page.goto(PROD_URL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.getByText(/^Saved on this phone, updated /)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Thursday, Nov 26");
  await expect(page.getByText("starts in 1h 20m")).toBeVisible();
  await expect(page.getByText(/^Offline, showing saved copy from /)).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/offline-390x844.png" });

  await mainNav(page).getByRole("button", { name: /^Trip/ }).click();
  await expect(page.getByText(/You.re offline, so this is the copy saved on this phone/)).toBeVisible();
});

test("offline: the planner says so; Quick add previews but Add waits for a connection", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { server: DEV_URL, at: AT.beforeTrip });
  await context.setOffline(true);
  await openPlanner(page);
  await expect(planner(page).getByRole("status").first()).toContainText("You're offline. The planner needs a connection");
  await expect(planner(page).getByRole("textbox", { name: "Message" })).toBeDisabled();

  await planner(page).getByRole("textbox", { name: "Quick add" }).fill("kayak friday 2pm");
  const preview = planner(page).getByRole("article", { name: "What will be added" });
  await expect(preview).toContainText("Fri Nov 27");
  await expect(preview.getByRole("button", { name: "Add needs a connection" })).toBeDisabled();
  await page.screenshot({ path: "docs/screenshots/chat-offline-390x844.png" });
  await context.setOffline(false);
});
