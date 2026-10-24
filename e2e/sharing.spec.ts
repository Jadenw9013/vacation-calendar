import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

test("home logo and new trip work at phone, tablet and desktop widths", async ({ page }, testInfo) => {
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill("Sam");
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/t/guatemala/plan");
    await expect(page.getByRole("link", { name: "Voyroo home", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share trip", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`) });
    await page.getByRole("link", { name: "Voyroo home", exact: true }).click();
    await expect(page).toHaveURL(/\/\?all=1$/);
    await page.goto("/t/guatemala/plan");
    await page.getByRole("link", { name: "New trip", exact: true }).click();
    await expect(page).toHaveURL(/\/\?new=1$/);
    await expect(page.getByRole("textbox", { name: "Tell the planner about your trip" })).toBeVisible();
  }
});

test("share a view-only itinerary without sign-up, then revoke it", async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { localStorage.setItem("test-copied", text); } } }));
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill("Sam");
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip" }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  const update = await page.request.post("/api/t/guatemala/ops", { data: { ops: [{ op: "trip.update", set: { notes: "PRIVATE-NOTE-NOT-FOR-PRESENTATION" } }] } });
  expect(update.ok()).toBe(true);
  const { trip } = await (await page.request.get("/api/t/guatemala")).json();
  const reservation = await page.request.post("/api/t/guatemala/ops", { data: { confirmed: true, ops: [{ op: "item.update", id: trip.items[0].id, set: { booking: { state: "booked", confirmation: "PRIVATE-CONFIRMATION-NOT-FOR-PRESENTATION" } } }] } });
  expect(reservation.ok()).toBe(true);
  await page.getByRole("button", { name: "Share trip", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Share trip", exact: true });
  await sheet.getByRole("button", { name: "Copy invite", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("test-copied"))).toContain("/t/guatemala/join");
  await sheet.getByRole("button", { name: "Copy itinerary", exact: true }).click();
  const copied = await page.evaluate(() => localStorage.getItem("test-copied"));
  expect(copied).toContain("Times are local");
  expect(copied).not.toContain("PRIVATE-NOTE-NOT-FOR-PRESENTATION");
  await sheet.getByRole("button", { name: "Create viewing link", exact: true }).click();
  const url = await sheet.getByLabel("Viewing link", { exact: true }).inputValue();
  await page.screenshot({ path: testInfo.outputPath("share-trip-mobile.png") });
  expect(url).toMatch(/\/p\/guatemala\/[a-f0-9]{64}$/);
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const viewer = await guest.newPage();
    const response = await viewer.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    const html = await response!.text();
    expect(html).not.toContain("PRIVATE-NOTE-NOT-FOR-PRESENTATION");
    expect(html).not.toContain("PRIVATE-CONFIRMATION-NOT-FOR-PRESENTATION");
    await expect(viewer.getByText("View-only itinerary", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Print itinerary", exact: true })).toBeVisible();
    await viewer.screenshot({ path: testInfo.outputPath("presentation-mobile.png") });
    await expect(viewer.getByRole("textbox")).toHaveCount(0);
    await expect(viewer.getByText("PRIVATE-NOTE-NOT-FOR-PRESENTATION")).toHaveCount(0);
    expect((await guest.request.get("http://localhost:3200/api/t/guatemala")).status()).toBe(401);
    expect((await guest.request.post("http://localhost:3200/api/t/guatemala/ops", { data: { ops: [] } })).status()).toBe(401);
    expect((await guest.cookies()).some((cookie) => cookie.name.startsWith("trip_") || cookie.name === "travel_account")).toBe(false);
    expect((await new AxeBuilder({ page: viewer }).analyze()).violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);
    for (const width of [320, 390, 1440]) {
      await viewer.setViewportSize({ width, height: 900 });
      expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await viewer.screenshot({ path: testInfo.outputPath("presentation-desktop.png") });
    await sheet.getByRole("button", { name: "Turn off viewing link", exact: true }).click();
    await expect(sheet.getByRole("button", { name: "Create viewing link", exact: true })).toBeEnabled();
    await viewer.reload();
    await expect(viewer.getByRole("heading", { name: "This viewing link is unavailable." })).toBeVisible();
  } finally { await guest.close(); }
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("blocked"); } } }));
  await sheet.getByRole("button", { name: "Copy invite", exact: true }).click();
  await expect(sheet.getByRole("textbox", { name: "Text to copy" })).toHaveValue(/\/t\/guatemala\/join/);
});
