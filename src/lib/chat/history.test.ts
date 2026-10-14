import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { trip } from "@/data/trip";
import { compactHistory, HISTORY_MESSAGES } from "./history";
import { buildInstructions, compactTrip, focusIds } from "./setup";

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const card = (id: string, summary: string): UIMessage =>
  ({
    id,
    role: "assistant",
    parts: [{ type: "tool-propose_changes", toolCallId: `c-${id}`, state: "output-available", input: { ops: [{ op: "remove_segment", id: "x" }] }, output: { summary, status: "ready", ops: [{ op: "remove_segment", id: "x" }], changes: ["…"] } }],
  }) as unknown as UIMessage;

describe("conversation sent to the model", () => {
  it("keeps the last six messages, starting on the person's", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => (i % 2 ? card(`a${i}`, `P${i}`) : user(`u${i}`, `m${i}`)));
    const out = compactHistory(msgs);
    expect(out.length).toBeLessThanOrEqual(HISTORY_MESSAGES);
    expect(out[0].role).toBe("user");
  });

  it("cuts older proposals to one line and keeps the newest whole", () => {
    const out = compactHistory([user("u1", "a"), card("a1", "Old one"), user("u2", "b"), card("a2", "New one")], { "c-a1": "discarded" });
    const [old, latest] = [out[1].parts[0], out[3].parts[0]] as unknown as { output: Record<string, unknown> }[];
    expect(old.output).toEqual({ summary: "Old one", status: "ready", outcome: "discarded" });
    expect(latest.output).toMatchObject({ summary: "New one", ops: [{ op: "remove_segment", id: "x" }] });
  });
});

describe("trip sent to the model", () => {
  it("gives every item id, kind, short title, times, status, owner; notes only for the ones in focus", () => {
    const focus = focusIds(trip, "Move the volcano hike to Nov 30. When does Acatenango finish?");
    expect([...focus]).toContain("hike-acatenango");
    const t = compactTrip(trip, focus);
    const hike = t.segments.find((s) => s.id === "hike-acatenango")!;
    const zip = t.segments.find((s) => s.id === "activity-zipline")!;
    expect(hike).toHaveProperty("notes");
    expect(zip).not.toHaveProperty("notes");
    expect(Object.keys(zip).sort()).toEqual(["end", "id", "kind", "start", "status", "title"]);
  });

  it("includes notes for the item tapped Ask on even if the message doesn't name it", () => {
    expect([...focusIds(trip, "can we do this earlier?", "activity-jet-ski")]).toEqual(["activity-jet-ski"]);
  });

  it("puts the fixed rules first and the per-request part last", () => {
    const a = buildInstructions({ state: { trip, version: 1 }, author: "Sam", today: "2026-11-26", message: "hi" });
    const b = buildInstructions({ state: { trip, version: 9 }, author: "Ana", today: "2026-11-27", message: "move the hike" });
    const split = (s: string) => s.slice(0, s.indexOf("--- This request ---"));
    expect(split(a)).toBe(split(b));
    expect(split(a).length).toBeGreaterThan(2000);
  });
});
