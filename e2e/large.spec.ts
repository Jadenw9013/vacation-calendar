import { expect, test } from "@playwright/test";
import { openScreen } from "./helpers";

// Large text at phone widths: screenshots, no sideways scroll, nothing cut off.
for (const width of [360, 390]) {
  for (const screen of ["trip-nov26", "chat-open"] as const) {
    test(`Large text: ${screen} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 360 ? 740 : 844 });
      await openScreen(page, screen, { large: true });
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("18px");
      await page.screenshot({ path: `docs/screenshots/large-${screen}-${width}x${width === 360 ? 740 : 844}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Text that's cut off rather than wrapped, outside the places that truncate on purpose (with …).
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("h1, h2, h3, p, button, label, dt, dd")]
          .filter((el) => el.getClientRects().length && !el.closest(".truncate, .line-clamp-2, .sr-only") && el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent?.trim().slice(0, 40)),
      );
      expect(clipped).toEqual([]);
    });
  }
}
