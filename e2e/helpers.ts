import { expect, type Page } from "@playwright/test";
import { DEV_URL, PROD_URL } from "../playwright.config";

export const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

/** Guatemala local time. Tests fake the browser clock; the app never reads a test date. */
export const AT = {
  nov26: "2026-11-26T15:40:00-06:00",
  hike: "2026-11-29T10:00:00-06:00",
  beforeTrip: "2026-10-13T12:00:00-06:00",
} as const;

export type Screen = "trip-nov26" | "trip-hike" | "plan-gaps" | "chat-open" | "proposal";
export const SCREENS: Screen[] = ["trip-nov26", "trip-hike", "plan-gaps", "chat-open", "proposal"];

/** Chat screens need the scripted model, which only runs in dev; everything else uses the production build. */
async function start(page: Page, at: string, server: string = PROD_URL) {
  await page.clock.setFixedTime(new Date(at));
  // The name picker only appears when someone edits; set a name so the chat can send.
  await page.addInitScript(() => localStorage.setItem("trip-author", "Jaden"));
  await page.goto(server);
}

function mainNav(page: Page) {
  return page.locator('nav[aria-label="Main"]:visible');
}

/** Opens a screen and waits until it's settled. */
export async function openScreen(page: Page, screen: Screen) {
  if (screen === "trip-nov26") {
    await start(page, AT.nov26);
    await expect(page.getByText("starts in 1h 20m")).toBeVisible();
  } else if (screen === "trip-hike") {
    await start(page, AT.hike);
    await expect(page.getByText("in progress")).toBeVisible();
  } else {
    await start(page, AT.beforeTrip, screen === "chat-open" || screen === "proposal" ? DEV_URL : PROD_URL);
    await expect(page.getByRole("heading", { name: /Needs action/ })).toBeVisible();
    if (screen === "chat-open" || screen === "proposal") {
      await mainNav(page).getByRole("button", { name: "Ask", exact: true }).click();
      await expect(page.getByRole("complementary", { name: "Ask the planner" })).toBeVisible();
    }
    if (screen === "proposal") {
      await page.getByRole("textbox", { name: "Message" }).fill("Book a hotel in Antigua");
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.getByRole("button", { name: /^(Confirm & apply|Apply)$/ })).toBeVisible({ timeout: 20_000 });
      // The planner's follow-up has finished streaming.
      await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 20_000 });
    }
  }
  // Fonts and layout settle.
  await page.evaluate(() => document.fonts.ready);
}

/** WCAG relative-luminance contrast of two CSS colors. */
export function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}
