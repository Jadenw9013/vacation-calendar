import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

// Step 3: at 390x844 the answers are on screen without scrolling.
test("Trip mode shows the day strip, Now/Next and two rows above the fold at 390x844", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScreen(page, "trip-nov26");

  const nav = await page.locator('nav[aria-label="Main"]:visible').boundingBox();
  const visibleBottom = nav!.y; // the bottom bar covers the rest
  expect(nav!.height).toBeGreaterThanOrEqual(56);

  const strip = await page.getByRole("list", { name: "Trip days" }).boundingBox();
  expect(strip!.y).toBeGreaterThanOrEqual(0);
  expect(strip!.y + strip!.height).toBeLessThanOrEqual(visibleBottom);

  const card = await page.locator("section", { has: page.locator("#now-card-label") }).boundingBox();
  expect(card!.y + card!.height).toBeLessThanOrEqual(visibleBottom);

  const rows = page.locator("section[aria-labelledby=day-list] ol > li");
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  for (const i of [0, 1]) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(box.y + box.height, `row ${i + 1} fully visible`).toBeLessThanOrEqual(visibleBottom);
  }
});

test("day chips and swipe-free buttons change the day", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScreen(page, "trip-nov26");
  await page.getByRole("button", { name: /^Sunday Nov 29/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sunday, Nov 29");
  await expect(page.getByText("3,976 m summit")).toBeVisible();
});

test("Plan mode deletes only after confirming", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScreen(page, "plan-gaps");
  await page.getByRole("button", { name: "Actions for Zip lining" }).first().click();
  let asked = "";
  page.once("dialog", (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.getByRole("button", { name: "Delete…" }).click();
  expect(asked).toContain("Delete “Zip lining”");
  await expect(page.getByText("Zip lining").first()).toBeVisible();
});
