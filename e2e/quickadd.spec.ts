import { expect, test } from "@playwright/test";
import { EDIT_URL } from "../playwright.config";
import { AT, smallTargets, start, stored } from "./helpers";

test("Quick add: type, check the preview, Add, Undo within 10 seconds", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { server: EDIT_URL, at: AT.beforeTrip });
  await page.getByRole("button", { name: "Add to the trip" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to the trip" });
  await sheet.getByRole("textbox", { name: "Quick add" }).fill("kayak friday 2pm");
  const preview = sheet.getByRole("article", { name: "What will be added" });
  await expect(preview).toContainText("Kayak");
  await expect(preview).toContainText("Fri Nov 27");
  await expect(preview).toContainText("2:00 PM");
  await expect(preview).toContainText("Activity");
  expect(await smallTargets(page)).toEqual([]);
  await preview.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet).toBeHidden();
  const added = (await stored(page, EDIT_URL)).trip.segments.find((s) => s.id.startsWith("activity-kayak-"));
  expect(added?.start).toBe("2026-11-27T14:00:00-06:00");

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await stored(page, EDIT_URL)).trip.segments.some((s) => s.id.startsWith("activity-kayak-"))).toBe(false);
});

test("Quick add won't guess: questions and bare hours go elsewhere; outside the trip needs a tick", async ({ page }) => {
  await start(page, { server: EDIT_URL, at: AT.beforeTrip });
  await page.getByRole("button", { name: "Add to the trip" }).click();
  const sheet = page.getByRole("dialog", { name: "Add to the trip" });
  const input = sheet.getByRole("textbox", { name: "Quick add" });

  await input.fill("what's next");
  await expect(sheet).toContainText("That sounds like a question.");
  await expect(sheet.getByRole("button", { name: "Fill in the form…" })).toBeVisible();

  await input.fill("dinner 7");
  await expect(sheet).toContainText("Morning or evening?");

  await input.fill("dinner dec 3 7pm");
  const add = sheet.getByRole("article", { name: "What will be added" }).getByRole("button", { name: "Add", exact: true });
  await expect(add).toBeDisabled();
  await sheet.getByRole("checkbox").check();
  await expect(add).toBeEnabled();
});
