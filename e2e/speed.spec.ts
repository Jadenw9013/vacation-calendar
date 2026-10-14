import { expect, test } from "@playwright/test";
import { DEV_URL, EDIT_URL } from "../playwright.config";
import { AT, changeAs, openPlanner, planner, propose, start, stored, undoLatest } from "./helpers";

/* Phase 3: perceived speed, and the safety that comes with it. */

test("a proposal is never applied without a tap", async ({ page }) => {
  await start(page, { server: DEV_URL, at: AT.beforeTrip });
  const { version } = await stored(page, DEV_URL);
  await openPlanner(page);
  await propose(page, "Draft a timed plan for Wed Nov 25");
  await page.waitForTimeout(1500);
  expect((await stored(page, DEV_URL)).version).toBe(version);
  await planner(page).getByRole("button", { name: /^Apply/ }).click();
  await expect(planner(page).getByText("✓ Applied.")).toBeVisible();
  expect((await stored(page, DEV_URL)).version).toBe(version + 1);
  await undoLatest(page, DEV_URL);
});

test("schedule questions come from the saved trip, with Ask the planner instead", async ({ page }) => {
  await start(page, { server: DEV_URL, at: AT.nov26 });
  await openPlanner(page);
  // A question whose answer doesn't depend on today (the server uses its own clock).
  await planner(page).getByRole("textbox", { name: "Message" }).fill("when is the hike");
  await planner(page).getByRole("button", { name: "Send message" }).click();
  await expect(planner(page).getByText("From the saved schedule")).toBeVisible();
  await expect(planner(page).getByText(/Acatenango overnight hike \(Wicho & Charlie's\): Sun Nov 29, 6:30 AM \(booked\)/)).toBeVisible();
  await planner(page).getByRole("button", { name: "Ask the planner instead" }).click();
  // The scripted model's reply replaces the local one.
  await expect(planner(page).getByText(/Mock model/)).toBeVisible();
  await expect(planner(page).getByText("From the saved schedule")).toHaveCount(0);
});

test("the Working card shows within 100 ms of sending, with the person's words", async ({ page }) => {
  await start(page, { server: DEV_URL, at: AT.beforeTrip });
  // Hold the reply so only the client's own feedback can appear.
  await page.route("**/api/chat", () => {});
  await openPlanner(page);
  await planner(page).getByRole("textbox", { name: "Message" }).fill("Draft a timed plan for Wed Nov 25");
  const ms = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const send = document.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!;
        const t0 = performance.now();
        const check = () => {
          const card = [...document.querySelectorAll('[role="status"]')].find((e) => e.textContent?.includes("Working"));
          if (card) resolve(performance.now() - t0);
          else requestAnimationFrame(check);
        };
        send.click();
        requestAnimationFrame(check);
      }),
  );
  console.log(`WORKING CARD after ${Math.round(ms)} ms`);
  expect(ms).toBeLessThanOrEqual(100);
  await expect(planner(page).getByText("You said: “Draft a timed plan for Wed Nov 25”")).toBeVisible();
});

test("Still working with Cancel at 8 seconds; at 25 seconds it stops, keeps the words and offers Retry", async ({ page }) => {
  await page.clock.install({ time: new Date(AT.beforeTrip) });
  await page.addInitScript(() => localStorage.setItem("trip-author", "Jaden"));
  await page.goto(DEV_URL);
  await page.route("**/api/chat", () => {}); // never answers
  await openPlanner(page);
  await planner(page).getByRole("textbox", { name: "Message" }).fill("Draft a timed plan for Wed Nov 25");
  await planner(page).getByRole("button", { name: "Send message" }).click();
  await expect(planner(page).getByText("Working…")).toBeVisible();
  await page.clock.runFor(8_100);
  await expect(planner(page).getByText("Still working…")).toBeVisible();
  await expect(planner(page).getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.clock.runFor(17_000);
  await expect(planner(page).getByText(/took too long, so nothing was proposed/)).toBeVisible();
  await expect(planner(page).getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(planner(page).getByRole("textbox", { name: "Message" })).toHaveValue("Draft a timed plan for Wed Nov 25");
});

test("Apply shows Saving at once, then the saved version", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  // Slow the save down so the optimistic state is visible.
  await page.route("**/api/ops", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  const row = page.locator("section[aria-labelledby=day-list] li", { hasText: "Zip lining" });
  await row.getByRole("button").first().click();
  await row.getByRole("button", { name: "I'll book it" }).click();
  await expect(row.getByText("Saving…")).toBeVisible();
  await expect(row.getByText("Jaden is booking this")).toBeVisible();
  await expect(row.getByText("Saving…")).toHaveCount(0, { timeout: 10_000 });
  await expect(row.getByText("Jaden is booking this")).toBeVisible();
  await undoLatest(page, EDIT_URL);
});

test("a version conflict takes the optimistic change back off and says why", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  // Someone else changes the trip; this page is now a version behind.
  await changeAs(page, EDIT_URL, "Sam", [{ op: "set_status", id: "activity-jet-ski", status: "booked" }]);
  const row = page.locator("section[aria-labelledby=day-list] li", { hasText: "Zip lining" });
  await row.getByRole("button").first().click();
  await row.getByRole("button", { name: "I'll book it" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Someone else changed the trip just now" })).toBeVisible();
  await expect(row.getByText("Jaden is booking this")).toHaveCount(0);
  expect((await stored(page, EDIT_URL)).trip.segments.find((s) => s.id === "activity-zipline")!.owner).toBeUndefined();
  await undoLatest(page, EDIT_URL, "Sam");
});
