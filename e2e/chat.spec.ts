import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEV_URL } from "../playwright.config";
import { AT, changeAs, mainNav, openPlanner, planner, propose, smallTargets, start, stored, undoLatest, type Mode } from "./helpers";

/*
 * The planner sheet and proposal cards, against the scripted stand-in model
 * on the dev server. Every test that applies something undoes it, so the
 * in-memory trip ends as it started.
 */

async function openChat(page: Page, opts: { mode?: Mode; at?: string } = {}) {
  await start(page, { server: DEV_URL, at: opts.at ?? AT.beforeTrip, mode: opts.mode });
  await openPlanner(page);
}

/** "Draft a timed plan" makes the stand-in propose three plan steps. */
const THREE = "Draft a timed plan for Wed Nov 25";

test.describe("proposal card", () => {
  test("unticking a change applies only the rest: Apply 2 of 3", async ({ page }) => {
    await openChat(page);
    const before = (await stored(page, DEV_URL)).trip.plan?.length ?? 0;
    await propose(page, THREE);
    const card = planner(page).getByRole("article", { name: /Proposal/ });
    await card.getByRole("checkbox").nth(1).uncheck();
    const apply = card.getByRole("button", { name: "Apply 2 of 3" });
    await expect(apply).toBeVisible();
    // Apply and Discard are at least 48px tall.
    for (const name of ["Apply 2 of 3", "Discard"]) expect((await card.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await apply.click();
    await expect(card.getByText("✓ Applied.")).toBeVisible();
    const plan = (await stored(page, DEV_URL)).trip.plan ?? [];
    expect(plan.length).toBe(before + 2);
    expect(plan.some((p) => p.id.startsWith("plan-boat-to-san-marcos"))).toBe(false);
    await undoLatest(page, DEV_URL);
  });

  test("Edit changes a step's time before it's applied", async ({ page }) => {
    await openChat(page);
    await propose(page, THREE);
    const card = planner(page).getByRole("article", { name: /Proposal/ });
    await card.getByRole("button", { name: "Edit" }).first().click();
    await card.getByLabel("Time (empty: TBD)").fill("09:15");
    await card.getByRole("button", { name: "Use this" }).click();
    await expect(card.getByText("Wed Nov 25, 9:15 AM")).toBeVisible();
    await card.getByRole("button", { name: /^Apply/ }).click();
    await expect(card.getByText("✓ Applied.")).toBeVisible();
    const plan = (await stored(page, DEV_URL)).trip.plan ?? [];
    expect(plan.find((p) => p.id.startsWith("plan-leave-for-panajachel"))!.start).toBe("2026-11-25T09:15:00-06:00");
    await undoLatest(page, DEV_URL);
  });

  test("echoes what was said and shows unknown times as time TBD", async ({ page }) => {
    await openChat(page);
    await propose(page, "Book a hotel in Antigua");
    const card = planner(page).getByRole("article", { name: /Proposal/ });
    await expect(card.getByText("You said: “Book a hotel in Antigua”")).toBeVisible();
    await expect(card.getByText(/Sat Nov 28, time TBD/)).toBeVisible();
    await expect(card.getByText("Undo for 10 seconds, or later from Updates.")).toBeVisible();
  });

  test("a double tap applies once", async ({ page }) => {
    await openChat(page);
    await propose(page, THREE);
    const { version } = await stored(page, DEV_URL);
    await planner(page).getByRole("button", { name: /^Apply/ }).dblclick();
    await expect(planner(page).getByText("✓ Applied.")).toBeVisible();
    await page.waitForTimeout(500);
    expect((await stored(page, DEV_URL)).version).toBe(version + 1);
    await undoLatest(page, DEV_URL);
  });

  test("a stale draft isn't applied: Someone changed the trip, Review again", async ({ page }) => {
    await openChat(page);
    await propose(page, THREE);
    await changeAs(page, DEV_URL, "Sam", [{ op: "set_status", id: "activity-zipline", status: "booked" }]);
    const { version } = await stored(page, DEV_URL);
    await planner(page).getByRole("button", { name: /^Apply/ }).click();
    await expect(planner(page).getByText("Someone changed the trip after this was drafted")).toBeVisible();
    await expect(planner(page).getByRole("button", { name: "Review again" })).toBeVisible();
    expect((await stored(page, DEV_URL)).version).toBe(version);
    await undoLatest(page, DEV_URL, "Sam");
  });

  test("Undo in the first 10 seconds puts it back", async ({ page }) => {
    await openChat(page);
    const before = (await stored(page, DEV_URL)).trip.plan?.length ?? 0;
    await propose(page, THREE);
    await planner(page).getByRole("button", { name: /^Apply/ }).click();
    await planner(page).getByRole("button", { name: "Undo", exact: true }).click();
    await expect(planner(page).getByText(/^Undone\./)).toBeVisible();
    expect((await stored(page, DEV_URL)).trip.plan?.length ?? 0).toBe(before);
  });

  test("Undo from Updates afterwards", async ({ page }) => {
    await openChat(page);
    const before = (await stored(page, DEV_URL)).trip.plan?.length ?? 0;
    await propose(page, THREE);
    await planner(page).getByRole("button", { name: /^Apply/ }).click();
    await expect(planner(page).getByText("✓ Applied.")).toBeVisible();
    await planner(page).getByRole("button", { name: "Close the planner" }).click();
    await page.getByRole("button", { name: /^Updates/ }).first().click();
    const updates = page.getByRole("dialog", { name: "Updates" });
    await expect(updates.getByText(/Jaden added .* to the plan/).first()).toBeVisible();
    await updates.getByRole("button", { name: "Undo this" }).click();
    await expect.poll(async () => (await stored(page, DEV_URL)).trip.plan?.length ?? 0).toBe(before);
  });

  test("when the planner fails it says what's missing and offers Quick add", async ({ page }) => {
    await openChat(page);
    await page.route("**/api/chat", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The planner is busy." }) }));
    await planner(page).getByRole("textbox", { name: "Message" }).fill("kayak at 2pm");
    await planner(page).getByRole("button", { name: "Send message" }).click();
    const alert = planner(page).getByRole("alert");
    await expect(alert).toContainText("Which day?");
    await alert.getByRole("button", { name: "Add it with Quick add" }).click();
    await expect(planner(page).getByRole("textbox", { name: "Quick add" })).toHaveValue("kayak at 2pm");
    await expect(planner(page).getByRole("article", { name: "What will be added" })).toBeVisible();
  });
});

test.describe("planner sheet", () => {
  test("Escape closes it, the page behind is inert, focus returns to Ask", async ({ page }) => {
    await start(page, { server: DEV_URL, at: AT.nov26 });
    const ask = mainNav(page).getByRole("button", { name: "Ask", exact: true });
    await ask.click();
    await expect(planner(page)).toBeVisible();
    const behind = await page.evaluate(() => {
      const today = [...document.querySelectorAll('nav[aria-label="Main"] button')].find((b) => b.textContent?.includes("Today"))!;
      const r = today.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { reachable: today.contains(hit), modal: !!document.querySelector("dialog:modal") };
    });
    expect(behind).toEqual({ reachable: false, modal: true });
    await page.keyboard.press("Escape");
    await expect(planner(page)).toBeHidden();
    await expect(ask).toBeFocused();
  });

  test("Back closes it and stays on the page", async ({ page }) => {
    await start(page, { server: DEV_URL, at: AT.nov26 });
    const url = page.url();
    await openPlanner(page);
    await page.goBack();
    await expect(planner(page)).toBeHidden();
    expect(page.url()).toBe(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thursday, Nov 26");
  });

  test("with the keyboard up (visual viewport 390x450) the input and Apply stay in view", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Stand in for the iPhone keyboard: the visible area shrinks, the layout viewport doesn't.
    await page.addInitScript(() => {
      const vv = new EventTarget() as EventTarget & Record<string, number>;
      Object.assign(vv, { width: 390, height: 450, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
      Object.defineProperty(window, "visualViewport", { get: () => vv });
    });
    await openChat(page);
    await propose(page, "Book a hotel in Antigua");
    const input = await planner(page).getByRole("textbox", { name: "Message" }).boundingBox();
    const apply = await planner(page).getByRole("button", { name: /^(Confirm & apply|Apply)/ }).boundingBox();
    for (const [name, box] of [["input", input], ["Apply", apply]] as const) {
      expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(450);
    }
  });

  test("viewport meta resizes for the Android keyboard; the textarea is 16px or more", async ({ page }) => {
    await openChat(page);
    const meta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(meta).toContain("interactive-widget=resizes-content");
    expect(meta).toContain("viewport-fit=cover");
    const size = await planner(page).getByRole("textbox", { name: "Message" }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("the conversation and an unsent draft survive a reload; Clear forgets them", async ({ page }) => {
    await openChat(page);
    await propose(page, "Book a hotel in Antigua");
    await planner(page).getByRole("textbox", { name: "Message" }).fill("half a thought");
    await page.reload();
    await openPlanner(page);
    await expect(planner(page).getByText("You said: “Book a hotel in Antigua”")).toBeVisible();
    await expect(planner(page).getByRole("textbox", { name: "Message" })).toHaveValue("half a thought");
    page.once("dialog", (d) => void d.accept());
    await planner(page).getByRole("button", { name: "Clear" }).click();
    await expect(planner(page).getByText("You said:")).toHaveCount(0);
  });
});

// Every chat state in light, dark and Sunlight mode: no serious or critical axe issues, 44px targets.
const STATES = ["empty", "proposal", "stale", "failed"] as const;
for (const state of STATES) {
  for (const mode of ["light", "dark", "sunlight"] as Mode[]) {
    test(`axe: chat ${state}, ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openChat(page, { mode });
      if (state === "proposal" || state === "stale") await propose(page, THREE);
      if (state === "stale") {
        await changeAs(page, DEV_URL, "Sam", [{ op: "set_status", id: "activity-zipline", status: "booked" }]);
        await planner(page).getByRole("button", { name: /^Apply/ }).click();
        await expect(planner(page).getByRole("button", { name: "Review again" })).toBeVisible();
      }
      if (state === "failed") {
        await page.route("**/api/chat", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"The planner is busy."}' }));
        await planner(page).getByRole("textbox", { name: "Message" }).fill("kayak at 2pm");
        await planner(page).getByRole("button", { name: "Send message" }).click();
        await expect(planner(page).getByRole("alert")).toBeVisible();
      }
      await page.screenshot({ path: `docs/screenshots/chat-${state}-390x844-${mode}.png` });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(serious).toEqual([]);
      expect(await smallTargets(page)).toEqual([]);
      if (state === "stale") await undoLatest(page, DEV_URL, "Sam");
    });
  }
}
