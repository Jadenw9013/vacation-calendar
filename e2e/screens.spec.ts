import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { contrast, MODES, openScreen, SCREENS, smallTargets, start, VIEWPORTS, type Mode } from "./helpers";

/*
 * Every screen at every size: a screenshot, no sideways scroll, 44px targets.
 * At phone size: axe in light, dark and Sunlight mode.
 */

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    test(`${screen} at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openScreen(page, screen);
      await page.screenshot({ path: `docs/screenshots/${screen}-${vp.width}x${vp.height}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
      expect(await smallTargets(page), "touch targets under 44x44").toEqual([]);
    });
  }
}

for (const screen of SCREENS) {
  for (const mode of ["light", "dark", "sunlight"] as Mode[]) {
    test(`axe: ${screen}, ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openScreen(page, screen, { mode });
      if (mode !== "light") await page.screenshot({ path: `docs/screenshots/${screen}-390x844-${mode}.png` });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(serious).toEqual([]);
    });
  }
}

// Contrast targets: primary 12:1 (Sunlight 15:1), secondary and status labels 7:1, on every background they sit on.
for (const mode of MODES) {
  test(`contrast: ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await start(page, { mode });
    const t = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const v = (n: string) => css.getPropertyValue(`--${n}`).trim();
      return Object.fromEntries(
        ["canvas", "surface", "sunken", "ink", "muted", "booked", "action", "action-soft", "now", "now-soft", "on-fill"].map((n) => [n, v(n)]),
      );
    });
    const min = (fg: string, bgs: string[]) => Math.min(...bgs.map((bg) => contrast(t[fg], t[bg])));
    const backgrounds = ["canvas", "surface", "sunken"];
    const primary = min("ink", [...backgrounds, "action-soft", "now-soft"]);
    const secondary = min("muted", [...backgrounds, "action-soft"]);
    const status = Math.min(
      min("booked", ["canvas", "surface"]),
      min("action", ["canvas", "surface", "action-soft"]),
      min("now", ["canvas", "surface", "now-soft"]),
      contrast(t["on-fill"], t.action), // the "Not booked" badge
      contrast(t["on-fill"], t.now), // "in progress"
    );
    // The time text in a list row, measured on the page itself.
    const time = await page.evaluate(() => {
      const el = document.querySelector("ol time")!;
      let bg = "";
      for (let e: Element | null = el; e && (!bg || bg.endsWith(", 0)")); e = e.parentElement) bg = getComputedStyle(e).backgroundColor;
      return [getComputedStyle(el).color, bg];
    });
    const timeRatio = contrast(time[0], time[1]);
    console.log(`CONTRAST ${mode}: primary ${primary}:1, secondary ${secondary}:1, status ${status}:1, time text ${timeRatio}:1`);
    expect(primary).toBeGreaterThanOrEqual(mode.startsWith("sunlight") ? 15 : 12);
    expect(secondary).toBeGreaterThanOrEqual(7);
    expect(status).toBeGreaterThanOrEqual(7);
    expect(timeRatio).toBeGreaterThanOrEqual(12);
  });
}
