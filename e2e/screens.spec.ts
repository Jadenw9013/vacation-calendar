import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { contrast, openScreen, SCREENS, VIEWPORTS } from "./helpers";

/*
 * Audit steps 1, 2, 4 and 5: every screen at every size gets a screenshot, a
 * horizontal-scroll check and a touch-target check; at phone size, axe runs in
 * light and dark.
 */

interface Offender {
  label: string;
  width: number;
  height: number;
}

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    test(`${screen} at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await openScreen(page, screen);
      await page.screenshot({ path: `docs/screenshots/${screen}-${vp.width}x${vp.height}.png` });

      // Step 2: never wider than the screen.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);

      // Step 4: every visible control at least 44x44 CSS px; inline text links are exempt.
      const offenders: Offender[] = await page.evaluate(() => {
        const out: { label: string; width: number; height: number }[] = [];
        const els = document.querySelectorAll<HTMLElement>(
          'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])',
        );
        for (const el of els) {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || el.closest("[hidden], dialog:not([open])")) continue;
          const inlineLink = el.tagName === "A" && style.display === "inline" && !!el.closest("p, li");
          // The skip link is hidden until focused, then full size.
          const skipLink = el.classList.contains("sr-only") && el.matches(".focus\\:not-sr-only");
          if (inlineLink || skipLink) continue;
          if (r.width < 44 || r.height < 44) {
            const label = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 40) || el.tagName;
            out.push({ label, width: Math.round(r.width), height: Math.round(r.height) });
          }
        }
        return out;
      });
      expect(offenders, "touch targets under 44x44").toEqual([]);
    });
  }
}

for (const screen of SCREENS) {
  for (const scheme of ["light", "dark"] as const) {
    test(`axe: ${screen}, ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openScreen(page, screen);
      if (scheme === "dark") await page.screenshot({ path: `docs/screenshots/${screen}-390x844-dark.png` });
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      expect(serious).toEqual([]);
    });
  }
}

// Step 5: the numbers asked for in the report.
for (const scheme of ["light", "dark"] as const) {
  test(`contrast of times and needs-action, ${scheme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme });
    await openScreen(page, "trip-nov26");
    const colors = await page.evaluate(() => {
      const bg = (el: Element | null): string => {
        for (let e = el; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c && !c.endsWith(", 0)") && c !== "transparent") return c;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      const time = document.querySelector("ol time")!;
      const badge = document.querySelector("ol span.bg-action")!;
      return {
        time: [getComputedStyle(time).color, bg(time)],
        action: [getComputedStyle(badge).color, bg(badge)],
      };
    });
    const time = contrast(colors.time[0], colors.time[1]);
    const action = contrast(colors.action[0], colors.action[1]);
    console.log(`CONTRAST ${scheme}: time text ${time}:1, needs-action badge ${action}:1`);
    expect(time).toBeGreaterThanOrEqual(7);
    expect(action).toBeGreaterThanOrEqual(7);
  });
}
