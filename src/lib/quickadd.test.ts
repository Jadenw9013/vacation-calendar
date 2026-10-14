import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { draftToSegment, guessKind, missingPrompt, parseQuickAdd, type QuickParse } from "./quickadd";

/** Guatemala local time as an instant. The parser never reads the real clock. */
const gt = (local: string) => Date.parse(`${local}-06:00`);
const BEFORE = gt("2026-10-13T12:00:00");
const DURING = gt("2026-11-26T15:40:00");

type Expect =
  | { ask: "question" | "change" | "ambiguous-time" }
  | { title: string; kind: string; start: string | null; end?: string | null; outside?: boolean; missing?: string[] };

// [phrase, selected day, now, expected]
const TABLE: [string, string | null, number, Expect][] = [
  // The brief's examples.
  ["zipline thu 11am", "2026-11-26", DURING, { title: "Zipline", kind: "activity", start: "2026-11-26T11:00:00-06:00" }],
  ["shuttle to antigua saturday 8am", null, BEFORE, { title: "Shuttle to antigua", kind: "transport", start: "2026-11-28T08:00:00-06:00" }],
  ["hotel antigua nov 28 to nov 29", null, BEFORE, { title: "Hotel antigua", kind: "lodging", start: "2026-11-28", end: "2026-11-29" }],
  ["cliff jumping", "2026-11-25", DURING, { title: "Cliff jumping", kind: "activity", start: "2026-11-25" }],
  // Weekdays resolve inside the trip even before it starts.
  ["zipline thu 11am", null, BEFORE, { title: "Zipline", kind: "activity", start: "2026-11-26T11:00:00-06:00" }],
  ["kayak friday 2pm", null, BEFORE, { title: "Kayak", kind: "activity", start: "2026-11-27T14:00:00-06:00" }],
  ["sunrise hike sat 4:30am", null, BEFORE, { title: "Sunrise hike", kind: "activity", start: "2026-11-28T04:30:00-06:00" }],
  // Relative days from today, during the trip.
  ["jet ski tomorrow 5pm", null, DURING, { title: "Jet ski", kind: "activity", start: "2026-11-27T17:00:00-06:00" }],
  ["Massage at 3pm today", null, DURING, { title: "Massage", kind: "activity", start: "2026-11-26T15:00:00-06:00" }],
  ["dinner tonight 8pm", null, DURING, { title: "Dinner", kind: "activity", start: "2026-11-26T20:00:00-06:00" }],
  ["uber to market this afternoon", null, DURING, { title: "Uber to market", kind: "transport", start: "2026-11-26" }],
  // Times with no day use the selected day, and say so.
  ["lunch at noon", "2026-11-27", DURING, { title: "Lunch", kind: "activity", start: "2026-11-27T12:00:00-06:00" }],
  ["coffee tour 9am to 11am", "2026-11-27", DURING, { title: "Coffee tour", kind: "activity", start: "2026-11-27T09:00:00-06:00", end: "2026-11-27T11:00:00-06:00" }],
  ["boat to san pedro 10:30am", "2026-11-27", DURING, { title: "Boat to san pedro", kind: "transport", start: "2026-11-27T10:30:00-06:00" }],
  ["pickup at the hotel 6pm", "2026-11-28", DURING, { title: "Pickup at the hotel", kind: "transport", start: "2026-11-28T18:00:00-06:00" }],
  ["market nov 27", "2026-11-26", DURING, { title: "Market", kind: "activity", start: "2026-11-27" }],
  ["airbnb antigua nov 30", null, BEFORE, { title: "Airbnb antigua", kind: "lodging", start: "2026-11-30" }],
  // Outside Nov 24–30: flagged, not refused.
  ["dinner dec 3 7pm", null, BEFORE, { title: "Dinner", kind: "activity", start: "2026-12-03T19:00:00-06:00", outside: true }],
  ["taxi to airport dec 1 5am", null, BEFORE, { title: "Taxi to airport", kind: "transport", start: "2026-12-01T05:00:00-06:00", outside: true }],
  // Nothing guessed: no day and none selected, or no title.
  ["cliff jumping", null, BEFORE, { title: "Cliff jumping", kind: "activity", start: null, missing: ["day"] }],
  ["lunch at noon", null, BEFORE, { title: "Lunch", kind: "activity", start: null, missing: ["day"] }],
  ["breakfast 7am", null, BEFORE, { title: "Breakfast", kind: "activity", start: null, missing: ["day"] }],
  ["thu 11am", "2026-11-26", DURING, { title: "", kind: "activity", start: "2026-11-26T11:00:00-06:00", missing: ["title"] }],
  // Ambiguous hours: morning or evening isn't guessed.
  ["dinner 7", "2026-11-26", DURING, { ask: "ambiguous-time" }],
  ["drinks at 8:30", "2026-11-27", DURING, { ask: "ambiguous-time" }],
  ["dinner at 7 on friday", null, BEFORE, { ask: "ambiguous-time" }],
  // Questions and change requests go to the planner.
  ["what's next", "2026-11-26", DURING, { ask: "question" }],
  ["is the zipline booked?", null, BEFORE, { ask: "question" }],
  ["when do we leave for antigua", null, DURING, { ask: "question" }],
  ["move jet skiing to 3pm", "2026-11-26", DURING, { ask: "change" }],
  ["cancel the zipline", null, DURING, { ask: "change" }],
  ["change the hike to sunday", null, DURING, { ask: "change" }],
];

function check(r: QuickParse, want: Expect) {
  if ("ask" in want) {
    expect(r).toMatchObject({ type: "ask", reason: want.ask });
    return;
  }
  expect(r.type).toBe("draft");
  if (r.type !== "draft") return;
  expect(r.draft.title).toBe(want.title);
  expect(r.draft.kind).toBe(want.kind);
  expect(r.draft.start).toBe(want.start);
  if (want.end !== undefined) expect(r.draft.end).toBe(want.end);
  expect(r.draft.outsideTrip).toBe(!!want.outside);
  expect(r.missing).toEqual(want.missing ?? []);
}

describe("Quick Add parser", () => {
  it("has at least 25 phrases in the table", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(25);
  });

  it.each(TABLE)("%s (selected %s)", (phrase, selectedDay, nowMs, want) => {
    check(parseQuickAdd(phrase, { trip, nowMs, selectedDay }), want);
  });

  it("writes every time at -06:00, whatever the machine's zone", () => {
    for (const [phrase, selectedDay, nowMs] of TABLE) {
      const r = parseQuickAdd(phrase, { trip, nowMs, selectedDay });
      if (r.type !== "draft") continue;
      for (const m of [r.draft.start, r.draft.end]) {
        if (m && m.length > 10) expect(m.endsWith("-06:00"), `${phrase}: ${m}`).toBe(true);
      }
    }
  });

  it("says which day the date came from", () => {
    const typed = parseQuickAdd("kayak friday 2pm", { trip, nowMs: BEFORE });
    const selected = parseQuickAdd("lunch at noon", { trip, nowMs: DURING, selectedDay: "2026-11-27" });
    expect(typed.type === "draft" && typed.draft.dayFrom).toBe("text");
    expect(selected.type === "draft" && selected.draft.dayFrom).toBe("selected");
  });

  it("guesses kind from keywords, transport first", () => {
    expect(guessKind("night at the airbnb")).toBe("lodging");
    expect(guessKind("hotel shuttle")).toBe("transport");
    expect(guessKind("flight home")).toBe("transport");
    expect(guessKind("salsa class")).toBe("activity");
  });

  it("turns a draft into a valid needs-booking segment with an unknown place", () => {
    const r = parseQuickAdd("zipline thu 11am", { trip, nowMs: BEFORE });
    if (r.type !== "draft") throw new Error("expected a draft");
    const s = draftToSegment(r.draft, "needs-booking", "Jaden");
    expect(s).toMatchObject({ kind: "activity", title: "Zipline", status: "needs-booking", location: "TBD", owner: "Jaden" });
    expect(s.id).toMatch(/^activity-zipline-[a-z0-9]{4}$/);
  });

  it("asks for what's missing in a few words", () => {
    expect(missingPrompt(["day"])).toBe("Which day?");
    expect(missingPrompt(["title"])).toBe("What is it?");
  });
});
