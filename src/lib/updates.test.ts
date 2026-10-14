import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { prepareChange, type ChangeEntry, type TripState } from "./engine";
import { changedSince, describeEntry, timeAgo, unread } from "./updates";

/** A real change-log entry, made the way the server makes one. */
function change(state: TripState, ops: unknown, author: string, at: string): { entry: ChangeEntry; state: TripState } {
  const r = prepareChange(state, ops, { author });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  const entry = { ...r.entry, at };
  return { entry, state: { trip: r.trip, version: entry.version } };
}

const start: TripState = { trip: seed, version: 1 };

describe("Updates", () => {
  it("says who moved what, to when", () => {
    const { entry, state } = change(start, [{ op: "update_segment", id: "activity-jet-ski", changes: { start: "2026-11-26T15:00:00-06:00" } }], "Sam", "2026-11-26T20:00:00Z");
    expect(describeEntry(entry, state.trip)).toBe("Sam moved “Jet skiing” to 3:00 PM");
  });

  it("says who claimed something and who let it go", () => {
    const claim = change(start, [{ op: "set_status", id: "activity-zipline", status: "needs-booking", owner: "Sam" }], "Sam", "2026-11-26T20:00:00Z");
    expect(describeEntry(claim.entry, claim.state.trip)).toBe("Sam is booking “Zip lining”");
    const drop = change(claim.state, [{ op: "set_status", id: "activity-zipline", status: "needs-booking", owner: null }], "Sam", "2026-11-26T20:05:00Z");
    expect(describeEntry(drop.entry, drop.state.trip)).toBe("Sam isn't booking “Zip lining” any more");
  });

  it("names removed items from the log, and lists several changes", () => {
    const { entry, state } = change(
      start,
      [
        { op: "remove_segment", id: "activity-cliff-jumping" },
        { op: "set_status", id: "activity-zipline", status: "booked" },
      ],
      "Ana",
      "2026-11-26T20:00:00Z",
    );
    expect(describeEntry(entry, state.trip)).toBe("Ana removed “Cliff jumping” and marked “Zip lining” as booked");
  });

  it("gives the time ago in plain words", () => {
    const now = Date.parse("2026-11-26T20:10:00Z");
    expect(timeAgo("2026-11-26T20:00:00Z", now)).toBe("10 minutes ago");
    expect(timeAgo("2026-11-26T20:09:50Z", now)).toBe("just now");
    expect(timeAgo("2026-11-26T17:10:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-11-25T20:00:00Z", now)).toBe("yesterday");
  });

  it("counts other people's changes since last seen, not your own", () => {
    const a = change(start, [{ op: "set_status", id: "activity-zipline", status: "booked" }], "Sam", "2026-11-26T20:00:00Z");
    const b = change(a.state, [{ op: "set_status", id: "activity-jet-ski", status: "booked" }], "Jaden", "2026-11-26T20:01:00Z");
    const entries = [b.entry, a.entry];
    expect(unread(entries, Date.parse("2026-11-26T19:00:00Z"), "Jaden")).toHaveLength(1);
    expect(unread(entries, Date.parse("2026-11-26T20:00:30Z"), "Jaden")).toHaveLength(0);
    expect([...changedSince(entries, Date.parse("2026-11-26T19:00:00Z"), "Jaden").keys()]).toEqual(["activity-zipline"]);
  });
});
