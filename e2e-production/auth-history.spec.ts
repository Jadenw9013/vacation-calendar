import { expect, test, type Page } from "@playwright/test";

async function openControlledPage(page: Page) {
  await page.goto("/?new=1");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test("Back from Google loads the planner and keeps unsent input with the production worker", async ({ page, context }) => {
  // Read the actual OAuth redirect and its headers, then point the browser to a
  // controlled second origin. No Google account or external network is needed.
  await context.route((url) => url.pathname === "/api/auth/google", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.headers()["cache-control"]).toContain("no-store");
    await route.fulfill({ response, status: 302, headers: { ...response.headers(), location: "http://127.0.0.1:3301/" } });
  });
  const workerAuthRequests: string[] = [];
  context.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/auth/") && request.serviceWorker()) workerAuthRequests.push(new URL(request.url()).pathname); });
  await openControlledPage(page);
  const composer = page.getByRole("textbox", { name: "Tell the planner about your trip" });
  await composer.fill("A week in Japan with friends. Keep this unfinished plan.");
  await page.getByRole("link", { name: "Continue with Google", exact: true }).click();
  await expect(page.getByRole("heading", { name: "External sign-in fixture" })).toBeVisible();
  await page.goBack();
  await expect(composer).toHaveValue("A week in Japan with friends. Keep this unfinished plan.");
  await expect(page.getByRole("heading", { name: "Your Voyroo planner", exact: true })).toBeVisible();
  expect(workerAuthRequests).toEqual([]);
  const cachedAuth = await page.evaluate(async () => {
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (new URL(request.url).pathname.startsWith("/api/auth/")) return true;
    return false;
  });
  expect(cachedAuth).toBe(false);
});

test("Back from trip sign-in restores the unfinished planner", async ({ page }) => {
  await openControlledPage(page);
  const composer = page.getByRole("textbox", { name: "Tell the planner about your trip" });
  await composer.fill("Keep my dates and destination while I check an invitation.");
  await page.getByRole("link", { name: /Joining the Guatemala trip/ }).click();
  await expect(page.getByRole("button", { name: "Join the trip", exact: true })).toBeVisible();
  await page.goBack();
  await expect(composer).toHaveValue("Keep my dates and destination while I check an invitation.");
  await page.reload();
  await expect(composer).toHaveValue("Keep my dates and destination while I check an invitation.");
});

test("restoring a frozen browser-history document reloads safely without losing the input", async ({ page }) => {
  await openControlledPage(page);
  const composer = page.getByRole("textbox", { name: "Tell the planner about your trip" });
  await composer.fill("My draft should survive a browser-history restore.");
  await Promise.all([
    page.waitForNavigation(),
    page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))),
  ]);
  await expect(composer).toHaveValue("My draft should survive a browser-history restore.");
});

test("the production worker never caches a viewing link, so revocation takes effect", async ({ page, browser }) => {
  await openControlledPage(page);
  await page.goto("/t/guatemala/join");
  await page.getByLabel("Your first name").fill("Ana");
  await page.getByLabel("Passcode").fill("volcano");
  await page.getByRole("button", { name: "Join the trip", exact: true }).click();
  await page.waitForURL(/\/t\/guatemala$/);
  const created = await page.request.post("/api/t/guatemala/preview");
  expect(created.status()).toBe(200);
  const { path } = await created.json();
  const context = await browser.newContext();
  try {
    const viewer = await context.newPage();
    await openControlledPage(viewer);
    await viewer.goto(path);
    await expect(viewer.getByText("View-only itinerary", { exact: true })).toBeVisible();
    const cachedPreview = await viewer.evaluate(async () => {
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (new URL(request.url).pathname.startsWith("/p/")) return true;
      return false;
    });
    expect(cachedPreview).toBe(false);
    const revoked = await page.request.delete("/api/t/guatemala/preview");
    expect(revoked.status()).toBe(200);
    await viewer.reload();
    await expect(viewer.getByRole("heading", { name: "This viewing link is unavailable." })).toBeVisible();
    expect((await context.request.get("http://localhost:3300/api/t/guatemala")).status()).toBe(401);
  } finally { await context.close(); }
});
