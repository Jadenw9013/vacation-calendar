import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import type { Segment, Trip } from "@/data/types";
import { prepareChange, type TripState } from "./engine";
import { SegmentSchema, type Op } from "./ops";

const base = (): TripState => ({ trip: structuredClone(seed), version: 1 });
const meta = { author: "Sam", now: () => new Date("2026-10-01T12:00:00Z"), newId: () => "change-1" };

function apply(state: TripState, ops: unknown[]) {
  const r = prepareChange(state, ops, meta);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r;
}

/** Order of a question's `blocks` list carries no meaning; undo may relink at the end. */
const normalise = (t: Trip): Trip => ({
  ...t,
  openQuestions: t.openQuestions.map((q) => ({ ...q, blocks: [...q.blocks].sort() })),
});

/** Applies ops, then their inverse, and checks the trip is back where it started. */
function roundTrip(ops: unknown[], state = base()) {
  const forward = apply(state, ops);
  const back = apply({ trip: forward.trip, version: forward.entry.version }, forward.entry.inverse);
  expect(normalise(back.trip)).toEqual(normalise(state.trip));
  return forward;
}

const seg = (id: string) => (t: Trip) => t.segments.find((s) => s.id === id);

const hotel: Segment = {
  id: "lodging-casa-santo-domingo",
  kind: "lodging",
  title: "Hotel Casa Santo Domingo",
  start: "2026-11-28",
  end: "2026-11-29",
  status: "needs-booking",
  location: "Antigua",
  owner: "Sam",
};

describe("seed data", () => {
  it("passes the segment schema, so undoing a removal can always re-add it", () => {
    for (const s of seed.segments) expect(SegmentSchema.safeParse(s).success, s.id).toBe(true);
  });
});

describe("add_segment", () => {
  it("adds, closes the gap once booked, and undoes", () => {
    const r = roundTrip([{ op: "add_segment", segment: hotel }]);
    expect(seg(hotel.id)(r.trip)).toEqual(hotel);
    expect(r.entry.summary[0]).toContain("Hotel Casa Santo Domingo");
  });

  it("links a new segment to open questions", () => {
    const r = roundTrip([{ op: "add_segment", segment: hotel, blockedBy: ["q-lake-length"] }]);
    expect(r.trip.openQuestions.find((q) => q.id === "q-lake-length")!.blocks).toContain(hotel.id);
  });

  it("rejects linking to a question that doesn't exist", () => {
    const r = prepareChange(base(), [{ op: "add_segment", segment: hotel, blockedBy: ["q-nope"] }], meta);
    expect(r.ok || r.issues[0].code).toBe("not_found");
  });

  it("rejects a duplicate id", () => {
    const r = prepareChange(base(), [{ op: "add_segment", segment: { ...hotel, id: "flight-out" } }], meta);
    expect(r.ok || r.issues[0].code).toBe("duplicate");
  });

  it("rejects a full name as owner", () => {
    const r = prepareChange(base(), [{ op: "add_segment", segment: { ...hotel, owner: "Sam Smith" } }], meta);
    expect(r.ok).toBe(false);
  });

  it("rejects a made-up field", () => {
    const r = prepareChange(base(), [{ op: "add_segment", segment: { ...hotel, confirmation: "X" } }], meta);
    expect(r.ok).toBe(false);
  });
});

describe("update_segment", () => {
  it("changes fields and undoes, including removing and restoring optional ones", () => {
    const r = roundTrip([
      { op: "update_segment", id: "lodging-nov26-28", changes: { title: "Antigua hotel", owner: "Ana", notes: null } },
    ]);
    const s = seg("lodging-nov26-28")(r.trip)!;
    expect(s.title).toBe("Antigua hotel");
    expect(s.owner).toBe("Ana");
    expect(s.notes).toBeUndefined();
  });

  it("allows setting a start to null (unknown)", () => {
    const r = roundTrip([{ op: "update_segment", id: "transport-to-lake", changes: { start: null } }]);
    expect(seg("transport-to-lake")(r.trip)!.start).toBeNull();
  });

  it("allows non-time edits to a booked segment without confirmation", () => {
    roundTrip([{ op: "update_segment", id: "lodging-atitlan", changes: { notes: "Gate code by text" } }]);
  });

  it("requires confirmation to change a booked segment's times, enforced in code", () => {
    const move: Op = {
      op: "update_segment",
      id: "hike-acatenango",
      changes: { start: "2026-11-30T06:30:00-06:00", end: "2026-12-01" },
    };
    const r = prepareChange(base(), [move], meta);
    expect(r.ok || r.issues[0].code).toBe("needs_confirmation");
    roundTrip([{ ...move, confirmBooked: true }]);
  });

  it("rejects an empty change and an id change", () => {
    expect(prepareChange(base(), [{ op: "update_segment", id: "flight-out", changes: {} }], meta).ok).toBe(false);
    expect(prepareChange(base(), [{ op: "update_segment", id: "flight-out", changes: { id: "x" } }], meta).ok).toBe(false);
  });

  it("rejects an edit that leaves the trip invalid (end before start)", () => {
    const r = prepareChange(base(), [{ op: "update_segment", id: "lodging-nov30", changes: { end: "2026-11-29" } }], meta);
    expect(r.ok || r.issues[0].message).toContain("end is before start");
  });
});

describe("remove_segment", () => {
  it("removes an unbooked segment, unlinks it from questions, and undo relinks it", () => {
    const r = roundTrip([{ op: "remove_segment", id: "lodging-nov30" }]);
    expect(seg("lodging-nov30")(r.trip)).toBeUndefined();
    expect(r.trip.openQuestions.some((q) => q.blocks.includes("lodging-nov30"))).toBe(false);
  });

  it("requires confirmation to remove a booked segment", () => {
    const r = prepareChange(base(), [{ op: "remove_segment", id: "lodging-atitlan" }], meta);
    expect(r.ok || r.issues[0].code).toBe("needs_confirmation");
    roundTrip([{ op: "remove_segment", id: "lodging-atitlan", confirmBooked: true }]);
  });

  it("rejects an unknown id", () => {
    const r = prepareChange(base(), [{ op: "remove_segment", id: "nope" }], meta);
    expect(r.ok || r.issues[0].code).toBe("not_found");
  });
});

describe("set_status", () => {
  it("sets status and owner, and undoes both", () => {
    const r = roundTrip([{ op: "set_status", id: "lodging-nov24", status: "booked", owner: "Sam" }]);
    expect(seg("lodging-nov24")(r.trip)).toMatchObject({ status: "booked", owner: "Sam" });
  });

  it("leaves the owner alone when omitted", () => {
    const start = apply(base(), [{ op: "set_status", id: "lodging-nov24", status: "needs-booking", owner: "Ana" }]);
    const r = apply({ trip: start.trip, version: 2 }, [{ op: "set_status", id: "lodging-nov24", status: "booked" }]);
    expect(seg("lodging-nov24")(r.trip)!.owner).toBe("Ana");
  });
});

describe("todos", () => {
  it("adds to a segment and to the trip, and undoes", () => {
    const r = roundTrip([
      { op: "add_todo", target: "lodging-atitlan", text: "Ask about early check-in" },
      { op: "add_todo", target: "trip", text: "Print boarding passes" },
    ]);
    expect(seg("lodging-atitlan")(r.trip)!.todos).toEqual(["Ask about early check-in"]);
    expect(r.trip.todos.at(-1)).toBe("Print boarding passes");
  });

  it("completes and restores to the same position", () => {
    const text = seed.segments.find((s) => s.id === "hike-acatenango")!.todos![2];
    const r = roundTrip([{ op: "complete_todo", target: "hike-acatenango", text }]);
    expect(seg("hike-acatenango")(r.trip)!.todos).not.toContain(text);
  });

  it("drops the empty todos field when the last one is completed", () => {
    const added = apply(base(), [{ op: "add_todo", target: "lodging-atitlan", text: "One thing" }]);
    const done = apply({ trip: added.trip, version: 2 }, [{ op: "complete_todo", target: "lodging-atitlan", text: "One thing" }]);
    expect("todos" in seg("lodging-atitlan")(done.trip)!).toBe(false);
  });

  it("rejects completing a to-do that doesn't exist", () => {
    const r = prepareChange(base(), [{ op: "complete_todo", target: "trip", text: "Nope" }], meta);
    expect(r.ok || r.issues[0].code).toBe("not_found");
  });
});

describe("resolve_question", () => {
  it("records an answer, unblocks, and undoes", () => {
    const r = roundTrip([{ op: "resolve_question", id: "q-return-date", answer: "Dec 1, morning flight" }]);
    expect(r.trip.openQuestions.find((q) => q.id === "q-return-date")!.answer).toBe("Dec 1, morning flight");
  });

  it("reopens with a null answer", () => {
    const decided = apply(base(), [{ op: "resolve_question", id: "q-return-date", answer: "Dec 1" }]);
    const r = apply({ trip: decided.trip, version: 2 }, [{ op: "resolve_question", id: "q-return-date", answer: null }]);
    expect(r.trip.openQuestions.find((q) => q.id === "q-return-date")!.answer).toBeUndefined();
  });
});

describe("update_trip", () => {
  it("moves the last day and sets party size, and undoes", () => {
    const r = roundTrip([{ op: "update_trip", changes: { lastDay: "2026-12-02", partySize: 4 } }]);
    expect(r.trip).toMatchObject({ lastDay: "2026-12-02", partySize: 4 });
  });

  it("rejects a last day on or before the first day", () => {
    const r = prepareChange(base(), [{ op: "update_trip", changes: { lastDay: "2026-11-24" } }], meta);
    expect(r.ok).toBe(false);
  });
});

describe("batches", () => {
  it("applies several ops in order and undoes them in reverse", () => {
    const r = roundTrip([
      { op: "add_segment", segment: hotel },
      { op: "set_status", id: hotel.id, status: "booked" },
      { op: "add_todo", target: hotel.id, text: "Ask them to hold luggage on Nov 29" },
    ]);
    expect(r.entry.inverse.map((o) => o.op)).toEqual(["complete_todo", "set_status", "remove_segment"]);
  });

  it("is all-or-nothing: one bad op rejects the batch and reports its index", () => {
    const r = prepareChange(base(), [{ op: "add_segment", segment: hotel }, { op: "remove_segment", id: "nope" }], meta);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].index).toBe(1);
  });

  it("rejects unknown ops, empty batches and oversized batches", () => {
    expect(prepareChange(base(), [{ op: "delete_everything" }], meta).ok).toBe(false);
    expect(prepareChange(base(), [], meta).ok).toBe(false);
    expect(prepareChange(base(), Array(51).fill({ op: "remove_segment", id: "x" }), meta).ok).toBe(false);
  });

  it("never mutates the input trip", () => {
    const state = base();
    const before = structuredClone(state);
    apply(state, [{ op: "remove_segment", id: "lodging-atitlan", confirmBooked: true }]);
    expect(state).toEqual(before);
  });
});

describe("redaction on the way in", () => {
  it("strips confirmation and phone numbers from free text and records that it did", () => {
    const r = apply(base(), [
      {
        op: "add_segment",
        segment: { ...hotel, notes: "Confirmation number: HX9TQA2. Call +502 7832 0000 to change." },
      },
    ]);
    const notes = seg(hotel.id)(r.trip)!.notes!;
    expect(notes).not.toContain("HX9TQA2");
    expect(notes).not.toContain("7832");
    expect(r.entry.redacted).toEqual(expect.arrayContaining(["confirmation", "phone-or-card"]));
    expect(JSON.stringify(r.entry.ops)).not.toContain("HX9TQA2");
  });
});
