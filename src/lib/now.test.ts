import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { agenda, clockLabel, dayStatuses, defaultMode, initialDay, localDate, mapsQuery, nowNext, tripDays } from "./now";

/** Guatemala local time, as an instant. Tests pass the time in; nothing reads the real clock. */
const gt = (local: string) => Date.parse(`${local}-06:00`);

describe("mode and day", () => {
  it("uses Guatemala time (UTC-6) for today's date", () => {
    expect(localDate(Date.parse("2026-11-25T05:30:00Z"), "-06:00")).toBe("2026-11-24");
    expect(localDate(Date.parse("2026-11-25T06:30:00Z"), "-06:00")).toBe("2026-11-25");
  });

  it("defaults to Trip mode from Nov 24 to Nov 30, Plan mode otherwise", () => {
    expect(defaultMode(trip, gt("2026-10-13T12:00:00"))).toBe("plan");
    expect(defaultMode(trip, gt("2026-11-23T23:59:00"))).toBe("plan");
    expect(defaultMode(trip, gt("2026-11-24T00:00:00"))).toBe("trip");
    expect(defaultMode(trip, gt("2026-11-30T23:59:00"))).toBe("trip");
    expect(defaultMode(trip, gt("2026-12-01T06:00:00"))).toBe("plan");
  });

  it("shows seven days, Tue 24 to Mon 30, opening on today or the nearest end", () => {
    expect(tripDays(trip)).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30"]);
    expect(initialDay(trip, gt("2026-11-26T08:00:00"))).toBe("2026-11-26");
    expect(initialDay(trip, gt("2026-10-13T08:00:00"))).toBe("2026-11-24");
    expect(initialDay(trip, gt("2026-12-03T08:00:00"))).toBe("2026-11-30");
  });

  it("formats the snapshot time in Guatemala time", () => {
    expect(clockLabel(gt("2026-11-26T14:14:00"), "-06:00", "2026-11-26")).toBe("2:14 PM");
    expect(clockLabel(gt("2026-11-25T09:05:00"), "-06:00", "2026-11-26")).toBe("Nov 25, 9:05 AM");
  });
});

describe("the day list", () => {
  it("labels the Seattle departure once, and nothing on Guatemala time", () => {
    const nov24 = agenda(trip, "2026-11-24");
    expect(nov24[0]).toMatchObject({ id: "flight-out", zone: "Seattle time", mapsQuery: null });
    expect(nov24.filter((r) => r.zone)).toHaveLength(1);
    expect(agenda(trip, "2026-11-26").every((r) => r.zone === null)).toBe(true);
  });

  it("lists checkouts with a verb and keeps unknown times unknown", () => {
    const nov26 = agenda(trip, "2026-11-26");
    expect(nov26[0]).toMatchObject({ id: "lodging-atitlan", verb: "Check out" });
    expect(nov26.find((r) => r.id === "activity-zipline")!.at).toBeNull();
  });

  it("points maps at the destination, and nowhere for unknown or undecided places", () => {
    expect(mapsQuery("Hotel → San Marcos La Laguna")).toBe("San Marcos La Laguna");
    expect(mapsQuery("Meet at 2 calle oriente #22, Antigua Guatemala")).toBe("2 calle oriente #22, Antigua Guatemala");
    expect(mapsQuery("TBD")).toBeNull();
    expect(mapsQuery("Guatemala City airport → airport hotel or Antigua")).toBeNull();
  });
});

describe("now / next", () => {
  it("shows the next timed item with a countdown", () => {
    const n = nowNext(trip, "2026-11-26", gt("2026-11-26T15:40:00"));
    expect(n).toMatchObject({ state: "next", countdown: "starts in 1h 20m" });
    expect(n.row!.title).toBe("Jet skiing");
  });

  it("shows the flight as in progress on the way down", () => {
    const n = nowNext(trip, "2026-11-24", gt("2026-11-24T14:00:00"));
    expect(n).toMatchObject({ state: "now", countdown: "in progress" });
    expect(n.row!.id).toBe("flight-out");
  });

  it("keeps the overnight hike in progress on its second morning", () => {
    const n = nowNext(trip, "2026-11-30", gt("2026-11-30T09:00:00"));
    expect(n.state).toBe("now");
    expect(n.row!.id).toBe("hike-acatenango");
  });

  it("falls back to an untimed item once the timed ones are over", () => {
    const n = nowNext(trip, "2026-11-26", gt("2026-11-26T18:30:00"));
    expect(n).toMatchObject({ state: "later", countdown: "Time TBD" });
  });

  it("counts down to a later day's first item, and shows nothing for a past day", () => {
    expect(nowNext(trip, "2026-11-29", gt("2026-11-28T06:30:00"))).toMatchObject({ state: "first", countdown: "in 1d" });
    expect(nowNext(trip, "2026-11-25", gt("2026-11-26T09:00:00")).state).toBe("done");
  });
});

describe("day strip", () => {
  it("flags days that need action and says where we sleep", () => {
    const days = dayStatuses(trip);
    expect(days.find((d) => d.date === "2026-11-27")).toMatchObject({ needsAction: false, sleep: "Airbnb, San Juan La Laguna" });
    expect(days.find((d) => d.date === "2026-11-30")).toMatchObject({ needsAction: true, sleepBooked: false });
  });

  it("puts the summit only on the hike day", () => {
    expect(dayStatuses(trip).filter((d) => d.peakM).map((d) => [d.date, d.peakM])).toEqual([["2026-11-29", 3976]]);
  });
});
