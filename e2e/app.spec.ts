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

test("create a vacation with separate destination and home settings, then add a booked multi-night stay", async ({ page }) => {
  await page.goto("/?new=1");
  await page.getByLabel("Where are you going?").fill("Oaxaca, Mexico");
  await page.getByLabel("Trip name (optional)").fill("Birthday getaway");
  await page.getByLabel("First day", { exact: true }).fill("2027-03-01");
  await page.getByLabel("Travel home", { exact: true }).fill("2027-03-04");
  await page.getByLabel("Time zone there").selectOption("America/Mexico_City");
  await page.getByLabel("Time zone at home").selectOption("Europe/London");
  await page.getByLabel("Local currency").fill("mxn");
  await page.getByLabel("Currency at home").fill("gbp");
  await page.getByLabel("Your first name").fill("Ana");
  await page.getByLabel("A passcode for the group").fill("birthday");
  await page.getByRole("button", { name: "Create the trip" }).click();
  await expect(page).toHaveURL(/\/t\/birthday-getaway-[a-z2-9]+\/plan$/);
  const tripPath = new URL(page.url()).pathname.replace(/\/plan$/, "");
  await page.getByRole("region", { name: "Start planning" }).getByRole("button", { name: "Add a stay" }).click();
  const sheet = page.getByRole("dialog", { name: "Add or ask", exact: true });
  await sheet.getByLabel("Title", { exact: true }).fill("Casa Oaxaca");
  await expect(sheet.getByLabel("Kind", { exact: true })).toHaveValue("stay");
  await sheet.getByLabel("Check-in time").fill("15:00");
  await sheet.getByLabel("Check-out date").fill("2027-03-04");
  await sheet.getByLabel("Check-out time").fill("11:00");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Reservation", { exact: true }).selectOption("booked");
  await sheet.getByLabel("Confirmation number (optional)").fill("CASA-123");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.locator("#day-2027-03-02")).toContainText("Casa Oaxaca");
  await expect(page.locator("#day-2027-03-03")).toContainText("Casa Oaxaca");
  await expect.poll(async () => (await (await page.request.get(`/api${tripPath}`)).json()).trip.items.length).toBe(1);
  await page.reload();
  const snapshot = await (await page.request.get(`/api${tripPath}`)).json();
  expect(snapshot.trip).toMatchObject({ destination: "Oaxaca, Mexico", homeTz: "Europe/London", homeCurrency: "GBP", currency: "MXN" });
  expect(snapshot.trip.items[0]).toMatchObject({ start: { date: "2027-03-01", time: "15:00" }, end: { date: "2027-03-04", time: "11:00" }, booking: { state: "booked", confirmation: "CASA-123" } });
  await page.getByRole("link", { name: "Plan a new trip", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New trip", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Birthday getaway/ })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a dated plan can be saved as an undated idea", async ({ page }) => {
  await join(page);
  await page.getByRole("button", { name: "Add or ask", exact: true }).click();
  await page.getByRole("textbox", { name: "Add or ask", exact: true }).fill("dinner fri 7 at sabe rico");
  const sheet = page.getByRole("dialog", { name: "Add or ask", exact: true });
  await sheet.getByLabel("Day", { exact: true }).selectOption("");
  await expect(sheet.getByText("No day yet: saved to ideas")).toBeVisible();
  await sheet.getByLabel("Title", { exact: true }).fill("Dinner idea for later");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await tab(page, "Plan").click();
  await page.getByRole("tab", { name: /Ideas/ }).click();
  await expect(page.getByRole("button", { name: /Dinner idea for later/ })).toBeVisible();
});

test("paste and review a plan offline, sync it, and avoid duplicate imports without AI", async ({ page, context }) => {
  await join(page);
  await tab(page, "Plan").click();
  const aiRequests: string[] = [];
  page.on("request", (request) => { if (/\/(chat|import)$/.test(new URL(request.url()).pathname)) aiRequests.push(request.url()); });
  const text = "Day 1\n09:00 Activity: Pasted walking tour\n15:00 Stay: Pasted guesthouse | end: day 3 11:00 | booked | confirmation: PASTE-123\nIdeas\nFood: Pasted cooking class";
  await page.getByRole("button", { name: "Paste a travel plan" }).click();
  await context.setOffline(true);
  let sheet = page.getByRole("dialog", { name: "Paste a travel plan" });
  await sheet.getByLabel("Your travel plan").fill(text);
  await sheet.getByRole("button", { name: "Review 3 items" }).click();
  const first = sheet.getByRole("region", { name: "Item 1", exact: true });
  await first.getByLabel("Time", { exact: true }).fill("10:30");
  await expect(sheet.getByRole("region", { name: "Item 2" }).getByLabel("Check-out date")).toHaveValue("2026-11-26");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await sheet.getByRole("button", { name: "Add 3 items to trip" }).click();
  await expect(sheet).not.toBeVisible();
  await expect(page.locator("#day-2026-11-24")).toContainText("Pasted guesthouse");
  await context.setOffline(false);
  await expect.poll(async () => {
    const body = await (await page.request.get("/api/t/guatemala")).json();
    return body.trip.items.filter((item: { title: string }) => item.title.startsWith("Pasted ")).length;
  }).toBe(3);
  await page.reload();
  await page.getByRole("button", { name: "Paste a travel plan" }).click();
  sheet = page.getByRole("dialog", { name: "Paste a travel plan" });
  await sheet.getByLabel("Your travel plan").fill(text.replace("09:00", "10:30"));
  await sheet.getByRole("button", { name: "Review 3 items" }).click();
  await expect(sheet.getByRole("button", { name: "Add 0 items to trip" })).toBeDisabled();
  await expect(sheet.getByText("Already on this trip.", { exact: false })).toHaveCount(3);
  expect(aiRequests).toEqual([]);
});

test("review a flight across time zones and uncheck repeated pasted lines", async ({ page }) => {
  await join(page);
  await tab(page, "Plan").click();
  await page.getByRole("button", { name: "Paste a travel plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Paste a travel plan" });
  const flight = "2026-11-26 18:00 Flight: Pasted Tokyo to LA | end: 2026-11-26 11:00 | tz: Asia/Tokyo | end tz: America/Los_Angeles";
  await sheet.getByLabel("Your travel plan").fill(`${flight}\n${flight}`);
  await sheet.getByRole("button", { name: "Review 2 items" }).click();
  const first = sheet.getByRole("region", { name: "Item 1", exact: true });
  await expect(first.getByLabel("Departure time zone")).toHaveValue("Asia/Tokyo");
  await expect(first.getByLabel("Arrival time zone")).toHaveValue("America/Los_Angeles");
  await expect(sheet.getByText("Matches an earlier item", { exact: false })).toBeVisible();
  const save = sheet.getByRole("button", { name: "Add 1 items to trip" });
  await expect(save).toBeEnabled();
  await first.getByLabel("Arrival time zone").fill("Mars/Base");
  await expect(save).toBeDisabled();
  await first.getByLabel("Arrival time zone").fill("America/Los_Angeles");
  await save.click();
  await expect(sheet).not.toBeVisible();
  await expect.poll(async () => {
    const { trip } = await (await page.request.get("/api/t/guatemala")).json();
    return trip.items.filter((item: { title: string }) => item.title === "Pasted Tokyo to LA");
  }).toMatchObject([{ start: { tz: "Asia/Tokyo" }, end: { tz: "America/Los_Angeles" } }]);
});

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
  // Where it sits in the grid depends on what else is saved; any position is fine.
  const viewer = page.getByRole("dialog", { name: /^YouTube \d+ of \d+$/ });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Open in YouTube" })).toHaveAttribute("href", /dQw4w9WgXcQ/);
});

test("reads up to ten booking screenshots at once and records each", async ({ page }) => {
  await join(page);
  await page.getByRole("button", { name: "Add or ask" }).click();
  // Twelve tiny pictures: the first ten are read, and the app says so about the other two.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const files = Array.from({ length: 12 }, (_, i) => ({ name: `booking-${i + 1}.png`, mimeType: "image/png", buffer: png }));
  await page.locator('dialog[open] input[type="file"]').setInputFiles(files);
  await expect(page.getByText("Reading the first 10. Add the other 2 after.")).toBeVisible();
  const list = page.getByRole("region", { name: "Screenshots" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await expect(list.getByText("Read 10 screenshots")).toBeVisible({ timeout: 60_000 });
  await expect(list.getByText(/Added “Test Posada \d+”/)).toHaveCount(10);
  await expect(list.getByRole("button", { name: "Open Test Posada 1", exact: true })).toBeVisible();
});
