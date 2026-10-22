import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

async function join(page: Page, name = "Sam") {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill(name);
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
}

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

test("the trip is private until you join", async ({ page }) => {
  await page.goto("/t/guatemala");
  await expect(page).toHaveURL(/\/join$/);
  await page.getByLabel("Your first name").fill("Eve");
  await page.getByLabel("Passcode").fill("wrong-code");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await expect(page.getByText("That passcode doesn't match.")).toBeVisible();
});

for (const size of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
]) {
  test(`no sideways scrolling at ${size.width}px, on every tab`, async ({ page }) => {
    await page.setViewportSize(size);
    await join(page);
    for (const t of ["Today", "Plan", "To-do", "Trip"]) {
      await tab(page, t).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${t} at ${size.width}px`).toBeLessThanOrEqual(0);
    }
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`no serious accessibility problems on the main screens (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await join(page);
    for (const t of ["Today", "Plan", "To-do", "Trip"]) {
      await tab(page, t).click();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target}`), `${t} (${scheme})`).toEqual([]);
    }
  });
}

test("add a dinner by typing one line, see it on the plan, undo it", async ({ page }) => {
  await join(page);
  await page.getByRole("button", { name: "Add or ask" }).click();
  // The box is focused when the sheet opens: typing goes straight in.
  await page.keyboard.type("dinner fri 7 at sabe rico");
  await expect(page.getByText("Fri Nov 27, 7:00 PM")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added “Dinner at Sabe Rico”" })).toBeVisible();
  await tab(page, "Plan").click();
  await expect(page.locator("#day-2026-11-27").getByText("Dinner at Sabe Rico", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("#day-2026-11-27").getByText("Dinner at Sabe Rico", { exact: true })).toHaveCount(0);
});

test("an item page holds the reservation, contact and links", async ({ page }) => {
  await join(page);
  await tab(page, "To-do").click();
  const row = page.locator("li", { hasText: "Zip lining" });
  // The row says what it is (To book) and what you can do (Mark as booked): no button reads like a status.
  await expect(row.getByText("To book")).toBeVisible();
  await expect(row.getByRole("button", { name: "Booked", exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: "Mark as booked" }).click();
  const sheet = page.getByRole("dialog", { name: /Mark Zip lining as booked/ });
  await sheet.getByLabel("Confirmation number (optional)").fill("ZIP-4421");
  await sheet.getByRole("button", { name: "Mark as booked" }).click();
  await tab(page, "Plan").click();
  await page.locator("#day-2026-11-26").getByRole("button", { name: /Zip lining/ }).click();
  await expect(page).toHaveURL(/\/item\/activity-zipline$/);
  await expect(page.getByRole("button", { name: "ZIP-4421" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).nth(3).click();
  await page.getByLabel("WhatsApp").fill("+502 5555 1234");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "WhatsApp" }).first()).toHaveAttribute("href", "https://wa.me/50255551234");

  await page.getByLabel("Add a link").fill("https://www.instagram.com/reel/abc123/");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByText("Instagram").first()).toBeVisible();
});

test("the assistant suggests places and asks before removing anything", async ({ page }) => {
  await join(page);
  await page.getByRole("button", { name: "Add or ask" }).click();
  await page.getByRole("button", { name: /Where should we eat/ }).click();
  // The first message compiles the chat route in dev: give it time.
  await expect(page.getByText("Test Café Uno")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Save idea" }).first().click();
  await expect(page.getByText("Saved to ideas")).toBeVisible();

  const box = page.getByLabel("Message the assistant");
  await box.fill("remove the cliff jumping");
  await box.press("Enter");
  await expect(page.getByText("Remove from the trip?")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Keep it as is" }).click();
  await expect(page.getByText("Left as it was.")).toBeVisible();
});

test("Back from an item page returns to the plan", async ({ page }) => {
  await join(page);
  await tab(page, "Plan").click();
  await page.getByRole("button", { name: /Acatenango overnight hike/ }).first().click();
  await expect(page.getByRole("heading", { name: /Acatenango/ })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/plan$/);
});

test("a saved post shows as a picture in Plan, Posts and opens in its own player", async ({ page }) => {
  await join(page);
  // Embedded players and pictures load from other sites; don't wait on them.
  await page.goto("/t/guatemala/item/activity-zipline", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Add a link").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Saved posts" }).getByRole("button", { name: /^YouTube/ })).toBeVisible({ timeout: 15_000 });

  await page.goto("/t/guatemala/plan/posts", { waitUntil: "domcontentloaded" });
  const tile = page.getByRole("button", { name: /^YouTube.*saved to Zip lining/ });
  await expect(tile).toBeVisible();
  await tile.click();
  const viewer = page.getByRole("dialog", { name: /YouTube 1 of/ });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Open in YouTube" })).toHaveAttribute("href", /dQw4w9WgXcQ/);
});
