import { expect, test } from "@playwright/test";
import { EDIT_URL } from "../playwright.config";
import { AT, changeAs, mainNav, start, stored, undoLatest } from "./helpers";

// Group awareness, on the production build that tests may edit. Each test puts the trip back.

test("Updates says who did what and when; the badge counts it and clears", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  await changeAs(page, EDIT_URL, "Sam", [{ op: "update_segment", id: "activity-jet-ski", changes: { start: "2026-11-26T16:00:00-06:00" } }]);
  await page.reload();

  const trip = mainNav(page).getByRole("button", { name: /^Trip/ });
  await expect(trip).toHaveAccessibleName("Trip 1 new");
  const row = page.locator("section[aria-labelledby=day-list] li", { hasText: "Jet skiing" });
  await expect(row.getByText("Updated", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Updates/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "Updates" });
  await expect(sheet.getByText(/^New/).first()).toBeVisible();
  await expect(sheet).toContainText(/Sam moved “Jet skiing” to 4:00 PM, (just now|\d+ (minutes?|hours?|days?) ago)\./);
  await page.keyboard.press("Escape");
  await expect(trip).toHaveAccessibleName("Trip");

  // The item's marker stays until the item itself is opened.
  await expect(row.getByText("Updated", { exact: true })).toBeVisible();
  await row.getByRole("button").first().click();
  await expect(row.getByText("Updated", { exact: true })).toHaveCount(0);

  await undoLatest(page, EDIT_URL, "Sam");
});

test("your own changes don't count as unread", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  await changeAs(page, EDIT_URL, "Jaden", [{ op: "set_status", id: "activity-zipline", status: "booked" }]);
  await page.reload();
  await expect(mainNav(page).getByRole("button", { name: /^Trip/ })).toHaveAccessibleName("Trip");
  await undoLatest(page, EDIT_URL);
});

test("I'll book it puts your name on it; Not me takes it off, both through set_status", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  const row = page.locator("section[aria-labelledby=day-list] li", { hasText: "Zip lining" });
  await row.getByRole("button").first().click();
  await row.getByRole("button", { name: "I'll book it" }).click();
  await expect(row.getByText("Jaden is booking this")).toBeVisible();
  expect((await stored(page, EDIT_URL)).trip.segments.find((s) => s.id === "activity-zipline")!.owner).toBe("Jaden");

  await row.getByRole("button", { name: "Not me" }).click();
  await expect(row.getByText("Jaden is booking this")).toHaveCount(0);
  expect((await stored(page, EDIT_URL)).trip.segments.find((s) => s.id === "activity-zipline")!.owner).toBeUndefined();

  const history = await (await page.request.get(`${EDIT_URL}/api/history?limit=2`)).json();
  expect(history.entries.map((e: { ops: { op: string }[] }) => e.ops[0].op)).toEqual(["set_status", "set_status"]);
});

test("Change time moves an item through update_segment", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.nov26 });
  const row = page.locator("section[aria-labelledby=day-list] li", { hasText: "Zip lining" });
  await row.getByRole("button").first().click();
  await row.getByRole("button", { name: "Change time" }).click();
  const sheet = page.getByRole("dialog", { name: /Time: Zip lining/ });
  await sheet.getByLabel(/New time/).fill("11:30");
  await sheet.getByRole("button", { name: "Save time" }).click();
  await expect(sheet).toBeHidden();
  expect((await stored(page, EDIT_URL)).trip.segments.find((s) => s.id === "activity-zipline")!.start).toBe("2026-11-26T11:30:00-06:00");
  await undoLatest(page, EDIT_URL);
});
