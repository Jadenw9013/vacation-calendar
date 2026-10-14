import { describe, expect, it } from "vitest";
import { checkModelSettings, MODEL_SETTINGS, PROVIDERS } from "./config";

describe("model settings", () => {
  it("default to low thinking with a generous output cap", () => {
    expect(MODEL_SETTINGS.thinkingLevel).toBe("low");
    expect(MODEL_SETTINGS.maxOutputTokens).toBeGreaterThanOrEqual(8192);
    expect(checkModelSettings()).toBeNull();
  });

  it("refuse minimal on gemini-3.8-flash, with a clear message", () => {
    const problem = checkModelSettings({ ...MODEL_SETTINGS, model: "gemini-3.8-flash", thinkingLevel: "minimal" }, PROVIDERS);
    expect(problem).toBe('Thinking level "minimal" isn\'t supported by gemini-3.8-flash (it accepts low, medium, high). Set CHAT_THINKING_LEVEL to one of those.');
  });

  it("refuse a level that doesn't exist, and a cap too small for thinking", () => {
    expect(checkModelSettings({ ...MODEL_SETTINGS, thinkingLevel: "max" as never })).toMatch(/isn't a thinking level/);
    expect(checkModelSettings({ ...MODEL_SETTINGS, maxOutputTokens: 1000 })).toMatch(/too small/);
  });
});
