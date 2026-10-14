import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { timeChangeOps } from "./edits";
import { agenda } from "./now";

const row = (date: string, id: string, verb = false) => agenda(trip, date).find((r) => r.id === id && !!r.verb === verb)!;
const seg = (id: string) => trip.segments.find((s) => s.id === id)!;

describe("Change time", () => {
  it("sets a time on a date-only item, at Guatemala time", () => {
    expect(timeChangeOps(row("2026-11-26", "activity-zipline"), seg("activity-zipline"), "11:30", trip.utcOffset)).toEqual([
      { op: "update_segment", id: "activity-zipline", changes: { start: "2026-11-26T11:30:00-06:00" } },
    ]);
  });

  it("moves a timed item and keeps its offset", () => {
    expect(timeChangeOps(row("2026-11-26", "activity-jet-ski"), seg("activity-jet-ski"), "15:00", trip.utcOffset)).toEqual([
      { op: "update_segment", id: "activity-jet-ski", changes: { start: "2026-11-26T15:00:00-06:00" } },
    ]);
  });

  it("changes a checkout row's end, not its start", () => {
    const [op] = timeChangeOps(row("2026-11-26", "lodging-atitlan", true), seg("lodging-atitlan"), "11:00", trip.utcOffset);
    expect(op).toEqual({ op: "update_segment", id: "lodging-atitlan", changes: { end: "2026-11-26T11:00:00-06:00" } });
  });

  it("clears to time TBD when the field is empty", () => {
    const [op] = timeChangeOps(row("2026-11-26", "activity-jet-ski"), seg("activity-jet-ski"), "", trip.utcOffset);
    expect(op).toMatchObject({ changes: { start: "2026-11-26" } });
  });

  it("keeps a same-day end the same length after the start, and plan items use update_plan_item", () => {
    const item = { id: "plan-tour", start: "2026-11-27T09:00:00-06:00", end: "2026-11-27T11:00:00-06:00", title: "Coffee tour" };
    const t = { ...trip, plan: [item] };
    const r = agenda(t, "2026-11-27").find((x) => x.id === "plan-tour")!;
    expect(timeChangeOps(r, item, "10:00", trip.utcOffset)).toEqual([
      { op: "update_plan_item", id: "plan-tour", changes: { start: "2026-11-27T10:00:00-06:00", end: "2026-11-27T12:00:00-06:00" } },
    ]);
  });
});
