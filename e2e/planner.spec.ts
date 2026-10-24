import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function accountCookie(id: string) {
  const payload = Buffer.from(JSON.stringify({ purpose: "account", value: { id, name: "Ana", email: "ana@example.com" }, expires: Date.now() + 3_600_000 })).toString("base64url");
  const signature = createHmac("sha256", "test-only-playwright-session-secret").update(payload).digest("base64url");
  return { name: "travel_account", value: `${payload}.${signature}`, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
}

test("signed-in planning resumes across devices and saves under the right person", async ({ page, context, browser }) => {
  const cookie = accountCookie("c".repeat(64));
  await context.addCookies([cookie]);
  await page.goto("/?new=1");
  await expect(page.getByText("Your travel space, Ana.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Tell the planner about your trip" }).fill("A relaxed Oaxaca escape, with food and culture.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Conversation saved to your account", { exact: true })).toBeVisible();
  const secondDevice = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const otherPerson = await browser.newContext();
  try {
    await secondDevice.addCookies([cookie]);
    const resumed = await secondDevice.newPage();
    await resumed.goto("/");
    await expect(resumed.getByRole("log")).toContainText("A relaxed Oaxaca escape");
    await otherPerson.addCookies([accountCookie("d".repeat(64))]);
    const isolated = await otherPerson.newPage();
    await isolated.goto("/");
    await expect(isolated.getByRole("log")).not.toContainText("A relaxed Oaxaca escape");
    await resumed.getByRole("textbox", { name: "Tell the planner about your trip" }).fill("2027-03-01 to 2027-03-04, please.");
    await resumed.getByRole("button", { name: "Send message" }).click();
    await expect(resumed.getByRole("button", { name: "Save trip", exact: true })).toBeEnabled();
    await resumed.getByRole("button", { name: "Save trip", exact: true }).click();
    await expect(resumed.getByText("Saved to your trips.", { exact: true })).toBeVisible();
    await resumed.getByRole("link", { name: "Open your trip" }).click();
    await resumed.getByRole("link", { name: "All trips", exact: true }).click();
    await expect(resumed.getByRole("link", { name: /Oaxaca escape/ })).toBeVisible();
    const memberships = await (await resumed.request.get("/api/trips")).json();
    expect(memberships.trips).toHaveLength(1);
    const state = await (await resumed.request.get(`/api/t/${memberships.trips[0].id}`)).json();
    expect(state.trip.people).toEqual(["Ana"]);
    expect(state.trip.items.every((item: { who: string }) => item.who === "Ana")).toBe(true);
    // A returning member needs only their account cookie, even on the original invite URL.
    await secondDevice.clearCookies();
    await secondDevice.addCookies([cookie]);
    await resumed.goto(`/t/${memberships.trips[0].id}/join`);
    await expect(resumed).toHaveURL(new RegExp(`/t/${memberships.trips[0].id}$`));
    await expect(resumed.getByRole("heading", { name: "Oaxaca escape", exact: true })).toBeVisible();
    await expect(resumed.getByRole("button", { name: "Join the trip", exact: true })).toHaveCount(0);
    await resumed.reload();
    await expect(resumed).not.toHaveURL(/\/join$/);
    const remembered = (await secondDevice.cookies()).find((item) => item.name === "travel_account");
    expect(remembered?.expires).toBeGreaterThan(Date.now() / 1000 + 170 * 86_400);
  } finally { await secondDevice.close(); await otherPerson.close(); }
});

for (const scheme of ["light", "dark"] as const) {
  test(`planning workspace is accessible and fits phone and desktop (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/?new=1");
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    }
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(result.violations.filter((issue) => issue.impact === "serious" || issue.impact === "critical").map((issue) => `${issue.id}: ${issue.nodes[0]?.target}`)).toEqual([]);
  });
}

test("a failed planning request retains the message and can be retried", async ({ page }) => {
  await page.goto("/?new=1");
  await page.route("**/api/planner", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The planner is busy. Try again." }) }));
  await page.getByRole("textbox", { name: "Tell the planner about your trip" }).fill("I'm Ana. A birthday trip to Oaxaca.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The planner is busy" })).toBeVisible();
  await expect(page.getByRole("log")).toContainText("I'm Ana. A birthday trip to Oaxaca.");
  await page.unroute("**/api/planner");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("log")).toContainText("What dates are you thinking");
  await expect(page.getByRole("log").getByText("I'm Ana. A birthday trip to Oaxaca.", { exact: true })).toHaveCount(1);
});
