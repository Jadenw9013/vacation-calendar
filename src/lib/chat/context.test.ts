import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { buildInstructions, localNow, todayAt } from "./setup";

/*
 * Stand-in tests: no model is called. They check the planner is told the
 * Guatemala date and time, the day on screen and the item asked about, so
 * "today", "tomorrow" and "this afternoon" resolve to the right day.
 */

const state = { trip, version: 3 };
const at = (iso: string) => Date.parse(iso);

function prompt(nowIso: string, extra: { day?: string; itemId?: string } = {}) {
  const now = at(nowIso);
  return buildInstructions({ state, author: "Sam", today: todayAt(trip.utcOffset, new Date(now)), now, ...extra });
}

describe("planner context", () => {
  it("gives the time of day in Guatemala, not the server's zone", () => {
    expect(localNow("-06:00", at("2026-11-26T21:40:00Z"))).toBe("Thu Nov 26, 3:40 PM");
    // 3 AM UTC on the 27th is still the evening of the 26th in Guatemala.
    expect(localNow("-06:00", at("2026-11-27T03:00:00Z"))).toBe("Thu Nov 26, 9:00 PM");
  });

  it("resolves today and tomorrow in Guatemala time near midnight UTC", () => {
    const p = prompt("2026-11-27T03:00:00Z");
    expect(p).toContain("Now: Thu Nov 26, 9:00 PM in Guatemala (UTC-06:00).");
    expect(p).toContain("Today: Thu Nov 26 (2026-11-26). Tomorrow: Fri Nov 27 (2026-11-27).");
  });

  it("says what this afternoon and tonight mean", () => {
    const p = prompt("2026-11-26T15:00:00-06:00");
    expect(p).toContain('"this afternoon" today 12:00 to 18:00');
    expect(p).toContain('"tonight" today after 18:00');
  });

  it("includes the day on screen and the item asked about", () => {
    const p = prompt("2026-11-26T15:00:00-06:00", { day: "2026-11-28", itemId: "activity-jet-ski" });
    expect(p).toContain("They are looking at Sat Nov 28 (2026-11-28).");
    expect(p).toContain('They tapped Ask on "Jet skiing" (id activity-jet-ski).');
  });

  it("leaves out an item that isn't in the trip", () => {
    expect(prompt("2026-11-26T15:00:00-06:00", { itemId: "nope" })).not.toContain("They tapped Ask");
  });

  it("asks for short replies", () => {
    expect(prompt("2026-11-26T15:00:00-06:00")).toContain("Keep replies to one to three short lines");
  });
});
