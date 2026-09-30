import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { dayInfo } from "./places";

describe("dayInfo", () => {
  const days = dayInfo(trip);
  const on = (d: string) => days.find((x) => x.date === d)!;

  it("covers every day including the departure day", () => {
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
    ]);
    expect(on("2026-12-01").sleep.kind).toBe("home");
  });

  it("works out place and elevation from where you sleep", () => {
    expect(on("2026-11-25")).toMatchObject({ place: "Lake Atitlán", elevationM: 1562, peak: false });
    expect(on("2026-11-25").sleep).toMatchObject({ kind: "booked", night: 1, of: 1 });
  });

  it("uses the summit from the data on the hike day, and camping for the night", () => {
    const d = on("2026-11-29");
    expect(d).toMatchObject({ elevationM: 3976, peak: true });
    expect(d.sleep.kind === "booked" && d.sleep.segment.id).toBe("hike-acatenango");
  });

  it("marks unbooked nights as open with the planned location", () => {
    expect(on("2026-11-24").sleep).toMatchObject({ kind: "open", location: "Near GUA airport or Antigua" });
  });

  it("doesn't pick a side of an undecided 'X or Y' location; uses where the flight lands", () => {
    expect(on("2026-11-24")).toMatchObject({ place: "Guatemala City", elevationM: 1502 });
  });
});
