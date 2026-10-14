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

export type Mode = "light" | "dark" | "sunlight" | "sunlight-dark";
export const MODES: Mode[] = ["light", "dark", "sunlight", "sunlight-dark"];

export type Screen = "trip-nov26" | "trip-hike" | "plan-gaps" | "chat-open" | "proposal";
export const SCREENS: Screen[] = ["trip-nov26", "trip-hike", "plan-gaps", "chat-open", "proposal"];

export interface StartOptions {
  at?: string;
  server?: string;
  mode?: Mode;
  large?: boolean;
  author?: string | null;
}

/** Opens the app with a fake clock, a name, and the display mode. */
export async function start(page: Page, { at = AT.nov26, server = PROD_URL, mode = "light", large = false, author = "Jaden" }: StartOptions = {}) {
  await page.clock.setFixedTime(new Date(at));
  await page.emulateMedia({ colorScheme: mode === "dark" || mode === "sunlight-dark" ? "dark" : "light" });
  await page.addInitScript(
    ([author, sun, large]) => {
      if (author) localStorage.setItem("trip-author", author as string);
      if (sun) localStorage.setItem("trip-sunlight", "1");
      if (large) localStorage.setItem("trip-text", "large");
    },
    [author, mode.startsWith("sunlight"), large] as const,
  );
  await page.goto(server);
  await page.evaluate(() => document.fonts.ready);
}

export function mainNav(page: Page) {
  return page.locator('nav[aria-label="Main"]:visible');
}

export function planner(page: Page) {
  return page.getByRole("dialog", { name: "Ask the planner" });
}

export async function openPlanner(page: Page) {
  await mainNav(page).getByRole("button", { name: "Ask", exact: true }).click();
  await expect(planner(page)).toBeVisible();
}

/** Sends a message to the scripted model and waits for its proposal and the follow-up line to finish. */
export async function propose(page: Page, text: string) {
  await planner(page).getByRole("textbox", { name: "Message" }).fill(text);
  await planner(page).getByRole("button", { name: "Send message" }).click();
  await expect(planner(page).getByRole("button", { name: /^(Confirm & apply|Apply)/ })).toBeVisible({ timeout: 20_000 });
  await expect(planner(page).getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 20_000 });
}

/** Opens a screen and waits until it's settled. */
export async function openScreen(page: Page, screen: Screen, opts: Omit<StartOptions, "at" | "server"> = {}) {
  if (screen === "trip-nov26") {
    await start(page, { ...opts, at: AT.nov26 });
    await expect(page.getByText("starts in 1h 20m")).toBeVisible();
  } else if (screen === "trip-hike") {
    await start(page, { ...opts, at: AT.hike });
    await expect(page.getByText("in progress")).toBeVisible();
  } else {
    const chat = screen === "chat-open" || screen === "proposal";
    await start(page, { ...opts, at: AT.beforeTrip, server: chat ? DEV_URL : PROD_URL });
    await expect(page.getByRole("heading", { name: /Needs action/ })).toBeVisible();
    if (chat) await openPlanner(page);
    if (screen === "proposal") await propose(page, "Book a hotel in Antigua");
  }
}

/** The trip as stored on a server, straight from the API. */
export async function stored(page: Page, server: string) {
  const r = await page.request.get(`${server}/api/trip`);
  return (await r.json()) as { trip: { segments: { id: string; owner?: string; start: string | null }[]; plan?: { id: string; start: string }[] }; version: number };
}

/** Undo the latest change on a server, as the API does it. */
export async function undoLatest(page: Page, server: string, author = "Test") {
  const { version } = await stored(page, server);
  const r = await page.request.post(`${server}/api/undo`, { headers: { origin: server }, data: { expectedVersion: version, author } });
  expect(r.status()).toBe(200);
}

/** A change by someone else, through the same API the app uses. */
export async function changeAs(page: Page, server: string, author: string, ops: unknown[]) {
  const { version } = await stored(page, server);
  const r = await page.request.post(`${server}/api/ops`, { headers: { origin: server }, data: { ops, expectedVersion: version, author } });
  expect(r.status()).toBe(200);
}

/** WCAG contrast of two CSS colors (rgb() or #hex). */
export function contrast(a: string, b: string): number {
  const rgb = (c: string) =>
    c.startsWith("#")
      ? [1, 3, 5].map((i) => parseInt((c.length === 4 ? c.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : c).slice(i, i + 2), 16))
      : (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = (c: string) => {
    const [r, g, b2] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Every visible control smaller than 44x44, except inline text links and the skip link. */
export async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: { label: string; width: number; height: number }[] = [];
    const els = document.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden], dialog:not([open])")) continue;
      // Behind an open modal: not reachable, not measured.
      const modal = document.querySelector("dialog[open]:modal");
      if (modal && !modal.contains(el)) continue;
      const inlineLink = el.tagName === "A" && style.display === "inline" && !!el.closest("p, li");
      const skipLink = el.classList.contains("sr-only");
      // A checkbox sits inside a label that is the 44px target.
      const inLabel = el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox" && (el.closest("label")?.getBoundingClientRect().height ?? 0) >= 44;
      if (inlineLink || skipLink || inLabel) continue;
      if (r.width < 44 || r.height < 44) {
        out.push({ label: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.tagName, width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    return out;
  });
}
