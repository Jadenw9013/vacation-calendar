import { describe, expect, it } from "vitest";
import { trip as realTrip } from "@/data/trip";
import type { Segment, Trip } from "@/data/types";
import { computeGaps, nightCoverage, stillToBook, timeline, validateTrip } from "./derive";
import { formatDuration, parseMoment } from "./time";

function makeTrip(segments: Segment[], overrides: Partial<Trip> = {}): Trip {
  return {
    name: "Test",
    firstDay: "2026-11-24",
    lastDay: "2026-11-26",
    homeAirport: "SEA",
    utcOffset: "-06:00",
    partySize: null,
    segments,
    openQuestions: [],
    todos: [],
    ...overrides,
  };
}

const outbound: Segment = {
  id: "out",
  kind: "flight",
  title: "Out",
  start: "2026-11-24T11:30:00-08:00",
  end: "2026-11-24T23:52:00-06:00",
  status: "booked",
  location: "SEA → GUA",
};

const home: Segment = {
  id: "home",
  kind: "flight",
  title: "Home",
  start: "2026-11-26T23:00:00-06:00",
  end: "2026-11-27T07:00:00-08:00",
  status: "booked",
  location: "GUA → SEA",
};

function lodging(id: string, start: string, end: string, status: Segment["status"] = "booked"): Segment {
  return { id, kind: "lodging", title: id, start, end, status, location: "x" };
}

function transport(id: string, start: string, end: string): Segment {
  return { id, kind: "transport", title: id, start, end, status: "booked", location: "x" };
}

describe("time helpers", () => {
  it("parses datetimes with offsets and date-only values", () => {
    expect(parseMoment("2026-11-24T23:52:00-06:00")).toMatchObject({ date: "2026-11-24", time: "23:52", offset: "-06:00" });
    expect(parseMoment("2026-11-30")).toMatchObject({ date: "2026-11-30", time: null, instant: null });
    expect(() => parseMoment("Nov 30")).toThrow();
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(848)).toBe("14h 8m");
    expect(formatDuration(4110)).toBe("2d 20h 30m");
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("the real trip data", () => {
  it("is valid", () => {
    expect(validateTrip(realTrip)).toEqual([]);
  });

  it("has the unbooked nights from TRIP-DATA.md", () => {
    const unbooked = nightCoverage(realTrip).filter((n) => !n.booked).map((n) => n.date);
    expect(unbooked).toEqual(["2026-11-24", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-30"]);
  });

  it("derives gaps 1–6 from TRIP-DATA.md", () => {
    const gaps = computeGaps(realTrip).map((g) => [g.kind, g.window, g.duration]);
    expect(gaps).toEqual([
      ["transport", "Tue Nov 24, 11:52 PM → Wed Nov 25, 2:00 PM", "14h 8m"],
      ["night", "Night of Tue Nov 24", "1 night"],
      ["transport", "Thu Nov 26, 10:00 AM → Sun Nov 29, 6:30 AM", "2d 20h 30m"],
      ["night", "Nights of Thu Nov 26 – Sat Nov 28", "3 nights"],
      ["night", "Night of Mon Nov 30", "1 night"],
      ["return", "After Mon Nov 30, time TBD", "unknown"],
    ]);
  });

  it("lists every unbooked segment with its blocking questions", () => {
    const rows = stillToBook(realTrip);
    expect(rows.every((r) => r.segment.status !== "booked")).toBe(true);
    expect(rows.at(-1)!.segment.id).toBe("flight-home"); // undated goes last
    const lake = rows.find((r) => r.segment.id === "lodging-nov26-28")!;
    expect(lake.blockedBy.map((q) => q.id)).toContain("q-lake-length");
  });
});

describe("night coverage", () => {
  it("counts a lodging segment for each night from check-in date to the night before checkout", () => {
    const t = makeTrip([lodging("a", "2026-11-24T15:00:00-06:00", "2026-11-26T10:00:00-06:00")]);
    expect(nightCoverage(t).map((n) => n.booked?.id ?? null)).toEqual(["a", "a", null]);
  });

  it("ignores placeholders when deciding coverage but reports them as planned", () => {
    const t = makeTrip([lodging("p", "2026-11-24", "2026-11-25", "undecided")]);
    const [first] = nightCoverage(t);
    expect(first.booked).toBeNull();
    expect(first.planned.map((p) => p.id)).toEqual(["p"]);
  });

  it("counts an activity that includes lodging", () => {
    const hike: Segment = {
      id: "hike",
      kind: "activity",
      title: "Hike",
      start: "2026-11-25T06:30:00-06:00",
      end: "2026-11-26",
      status: "booked",
      location: "x",
      includesLodging: true,
    };
    expect(nightCoverage(makeTrip([hike])).map((n) => n.booked?.id ?? null)).toEqual([null, "hike", null]);
  });

  it("counts a red-eye flight across local midnight, but not one landing before midnight", () => {
    const t = makeTrip([outbound, home]);
    const nights = nightCoverage(t);
    expect(nights[0].booked).toBeNull(); // outbound lands 11:52 PM
    expect(nights[2].booked?.id).toBe("home"); // departs 11 PM, lands next day
  });

  it("merges consecutive empty nights into one gap and recomputes when data changes", () => {
    const t = makeTrip([outbound, home]);
    expect(computeGaps(t).filter((g) => g.kind === "night").map((g) => g.duration)).toEqual(["2 nights"]);

    const edited = makeTrip([outbound, lodging("a", "2026-11-25T00:30:00-06:00", "2026-11-26T11:00:00-06:00"), home]);
    expect(computeGaps(edited).filter((g) => g.kind === "night").map((g) => g.window)).toEqual(["Night of Tue Nov 24"]);
  });
});

describe("transport gaps", () => {
  it("flags a window over 90 minutes between two non-transport segments", () => {
    const t = makeTrip([outbound, lodging("a", "2026-11-25T14:00:00-06:00", "2026-11-26T10:00:00-06:00"), home]);
    const windows = computeGaps(t).filter((g) => g.kind === "transport").map((g) => g.duration);
    expect(windows).toEqual(["14h 8m", "13h"]);
  });

  it("does not flag a window of 90 minutes or less", () => {
    const t = makeTrip([
      lodging("a", "2026-11-24T14:00:00-06:00", "2026-11-25T10:00:00-06:00"),
      lodging("b", "2026-11-25T11:30:00-06:00", "2026-11-26T10:00:00-06:00"),
    ]);
    expect(computeGaps(t).filter((g) => g.kind === "transport")).toEqual([]);
  });

  it("does not flag waiting time next to a booked transport segment", () => {
    const t = makeTrip([
      outbound,
      transport("shuttle", "2026-11-25T00:15:00-06:00", "2026-11-25T01:30:00-06:00"),
      lodging("a", "2026-11-25T14:00:00-06:00", "2026-11-26T10:00:00-06:00"),
    ]);
    expect(computeGaps(t).filter((g) => g.kind === "transport")).toEqual([]);
  });

  it("ignores overlapping segments (an activity inside a lodging stay)", () => {
    const stay = lodging("a", "2026-11-24T14:00:00-06:00", "2026-11-26T10:00:00-06:00");
    const tour: Segment = { ...transport("t", "2026-11-25T09:00:00-06:00", "2026-11-25T12:00:00-06:00"), kind: "activity" };
    expect(computeGaps(makeTrip([stay, tour])).filter((g) => g.kind === "transport")).toEqual([]);
  });

  it("reports an unknown length when a bound has no time", () => {
    const t = makeTrip([
      lodging("a", "2026-11-24T14:00:00-06:00", "2026-11-25T10:00:00-06:00"),
      lodging("b", "2026-11-26", "2026-11-27"),
    ]);
    const [gap] = computeGaps(t).filter((g) => g.kind === "transport");
    expect(gap.duration).toBe("unknown");
  });
});

describe("return flight", () => {
  it("flags a missing flight home", () => {
    expect(computeGaps(makeTrip([outbound])).some((g) => g.kind === "return")).toBe(true);
  });

  it("is satisfied by a booked flight after everything else", () => {
    const t = makeTrip([outbound, lodging("a", "2026-11-25T00:30:00-06:00", "2026-11-26T11:00:00-06:00"), home]);
    expect(computeGaps(t).some((g) => g.kind === "return")).toBe(false);
  });
});

describe("validation", () => {
  it("catches bad dates, duplicate ids and dangling question references", () => {
    const t = makeTrip([lodging("a", "Nov 24", "2026-11-25"), lodging("a", "2026-11-25", "2026-11-24")], {
      openQuestions: [{ id: "q", question: "?", blocks: ["missing"] }],
    });
    const errors = validateTrip(t);
    expect(errors.some((e) => e.includes("not YYYY-MM-DD"))).toBe(true);
    expect(errors.some((e) => e.includes("Duplicate segment id"))).toBe(true);
    expect(errors.some((e) => e.includes("end is before start"))).toBe(true);
    expect(errors.some((e) => e.includes('unknown segment "missing"'))).toBe(true);
  });
});

describe("timeline", () => {
  it("groups by local day with end events for multi-day segments and keeps unbooked lodging out of events", () => {
    const days = timeline(realTrip);
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
    ]);
    const nov26 = days[2].events.map((e) => [e.segment.id, e.kind]);
    expect(nov26).toContainEqual(["lodging-atitlan", "end"]);
    expect(days.flatMap((d) => d.events).some((e) => e.segment.id === "lodging-nov24")).toBe(false);
    expect(days[0].events[0].segment.id).toBe("flight-out");
  });
});
