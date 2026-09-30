import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import type { TripState } from "@/lib/engine";
import { buildProposal, previewTrip, type FlatOp } from "./proposal";
import { buildInstructions, buildTools, todayAt } from "./setup";

const state = (): TripState => ({ trip: structuredClone(seed), version: 7 });

const hotelNov28: FlatOp = {
  op: "add_segment",
  segment: {
    id: "lodging-casa-santo-domingo",
    kind: "lodging",
    title: "Hotel Casa Santo Domingo",
    start: "2026-11-28",
    end: "2026-11-29",
    status: "booked",
    location: "Antigua",
    owner: "Sam",
  },
};

describe("buildProposal", () => {
  it("describes a valid change with its gap delta", () => {
    const p = buildProposal(state(), "Add Antigua hotel", [hotelNov28]);
    expect(p.status).toBe("ready");
    expect(p.baseVersion).toBe(7);
    expect(p.changes[0]).toContain("Hotel Casa Santo Domingo");
    expect(p.gapDelta.closes).toContain("Bed booked: Night of Sat Nov 28");
    expect(p.gapDelta.opens.some((o) => o.startsWith("Nowhere to sleep"))).toBe(false);
    // The old lake→hike transport window splits around the new hotel.
    expect(p.gapDelta.closes).toContain("No transport booked: Thu Nov 26, 10:00 AM → Sun Nov 29, 6:30 AM");
    expect(p.ops[0]).toMatchObject({ op: "add_segment", segment: { start: "2026-11-28", end: "2026-11-29" } });
  });

  it("fills unknown start/end with null instead of inventing them", () => {
    const p = buildProposal(state(), "Flight home Dec 1", [
      {
        op: "add_segment",
        segment: { id: "flight-home-dec1", kind: "flight", title: "Flight home", status: "needs-booking", location: "GUA → SEA" },
      },
    ]);
    expect(p.status).toBe("ready");
    expect(p.ops[0]).toMatchObject({ segment: { start: null, end: null } });
  });

  it("flags booked items for a person to confirm, and the model can't pre-confirm", () => {
    const flat = [{ op: "remove_segment", id: "lodging-atitlan", confirmBooked: true } as unknown as FlatOp];
    const p = buildProposal(state(), "Delete Atitlán", flat);
    expect(p.status).toBe("needs_confirmation");
    expect(p.confirmations[0]).toContain("is booked");
    expect(JSON.stringify(p.ops)).not.toContain("confirmBooked");
  });

  it("reports nights one by one when a removal merges empty runs", () => {
    const p = buildProposal(state(), "Delete Atitlán", [{ op: "remove_segment", id: "lodging-atitlan" }]);
    expect(p.gapDelta.opens).toContain("Nowhere to sleep: Night of Wed Nov 25");
    expect(p.gapDelta.closes.some((c) => c.includes("Night"))).toBe(false);
  });

  it("flags moving the booked hike", () => {
    const p = buildProposal(state(), "Move hike", [
      { op: "update_segment", id: "hike-acatenango", changes: { start: "2026-11-30T06:30:00-06:00", end: "2026-12-01" } },
    ]);
    expect(p.status).toBe("needs_confirmation");
  });

  it("clears fields via `clear`", () => {
    const p = buildProposal(state(), "Unknown start", [{ op: "update_segment", id: "transport-to-lake", clear: ["start"] }]);
    expect(p.ops[0]).toMatchObject({ op: "update_segment", changes: { start: null } });
    expect(p.status).toBe("ready");
  });

  it("strips confirmation and phone numbers from proposed text", () => {
    const p = buildProposal(state(), "Add hotel", [
      { ...hotelNov28, segment: { ...hotelNov28.segment!, notes: "Confirmation: K7XQ2P9, front desk +502 7832 0000" } },
    ]);
    expect(JSON.stringify(p.ops)).not.toMatch(/K7XQ2P9|7832/);
    expect(p.redacted).toEqual(expect.arrayContaining(["confirmation", "phone-or-card"]));
  });

  it("reports a missing op field as an issue instead of dropping it", () => {
    const p = buildProposal(state(), "x", [{ id: "flight-out", changes: { notes: "x" } } as FlatOp]);
    expect(p.status).toBe("invalid");
    expect(p.issues[0].message).toContain('"op"');
  });

  it("returns issues the model can act on", () => {
    expect(buildProposal(state(), "x", [{ op: "remove_segment" }]).issues[0].message).toContain("needs id");
    expect(buildProposal(state(), "x", [{ op: "remove_segment", id: "nope" }]).status).toBe("invalid");
    const fullName = buildProposal(state(), "x", [{ ...hotelNov28, segment: { ...hotelNov28.segment!, owner: "Sam Smith" } }]);
    expect(fullName.status).toBe("invalid");
  });

  it("previews the trip after a proposal, including ones that need confirmation", () => {
    const p = buildProposal(state(), "Delete Atitlán", [{ op: "remove_segment", id: "lodging-atitlan" }]);
    const preview = previewTrip(state(), p.ops)!;
    expect(preview.segments.some((s) => s.id === "lodging-atitlan")).toBe(false);
  });
});

describe("chat setup", () => {
  it("computes today in the trip's time zone", () => {
    // 03:00 UTC on Sep 30 is still Sep 29 in Guatemala.
    expect(todayAt("-06:00", new Date("2026-09-30T03:00:00Z"))).toBe("2026-09-29");
    expect(todayAt("-06:00", new Date("2026-09-30T07:00:00Z"))).toBe("2026-09-30");
  });

  it("puts the speaker, date, data, gaps and proposal outcomes in the instructions", () => {
    const text = buildInstructions({ state: state(), author: "Ana", today: "2026-09-29", outcomes: { call_1: "discarded" } });
    expect(text).toContain("Who is talking: Ana");
    expect(text).toContain("Tue Sep 29");
    expect(text).toContain("lodging-atitlan");
    expect(text).toContain("Nights of Thu Nov 26 – Sat Nov 28");
    expect(text).toContain("Proposal call_1: discarded");
  });

  it("propose_changes validates against the latest stored state and never writes", async () => {
    let reads = 0;
    const tools = buildTools(async () => {
      reads++;
      return state();
    });
    const out = await tools.propose_changes.execute!(
      { summary: "Add hotel", ops: [hotelNov28] },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(reads).toBe(1);
    expect(out).toMatchObject({ status: "ready", baseVersion: 7 });
  });
});
