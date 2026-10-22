import { describe, expect, it } from "vitest";
import { SEED_TRIP_ID } from "../seed";
import { MemoryBackend, TripStore } from "../store";
import { buildTools, type ChangeResult } from "./tools";

/** The assistant's tools against a fresh in-memory copy of the seed trip. */
async function setup() {
  const store = new TripStore(new MemoryBackend());
  await store.get(SEED_TRIP_ID);
  const tools = buildTools({ store, tripId: SEED_TRIP_ID, me: "Jaden", trip: async () => (await store.get(SEED_TRIP_ID))!.trip });
  const run = async (name: "add_items" | "update_items" | "remove_items", input: unknown) =>
    (await (tools[name].execute as (i: unknown, o: unknown) => Promise<ChangeResult>)(input, { toolCallId: "t", messages: [] })) as ChangeResult;
  const trip = async () => (await store.get(SEED_TRIP_ID))!.trip;
  return { run, trip };
}

describe("assistant tools", () => {
  it("adds items at once, with the place and contact it found", async () => {
    const { run, trip } = await setup();
    const r = await run("add_items", {
      items: [{ title: "Dinner at Sabe Rico", kind: "food", date: "2026-11-28", time: "19:30", address: "6a Avenida Norte 7, Antigua", phone: "+502 5555 0100", booking: "todo" }],
    });
    expect(r.ok).toBe(true);
    const added = (await trip()).items.find((i) => i.title === "Dinner at Sabe Rico")!;
    expect(added.place?.address).toBe("6a Avenida Norte 7, Antigua");
    expect(added.contact?.phone).toBe("+502 5555 0100");
    expect(added.booking?.state).toBe("todo");
  });

  it("never removes by itself", async () => {
    const { run, trip } = await setup();
    const r = await run("remove_items", { ids: ["activity-cliff-jumping"] });
    expect(r.ok).toBe(false);
    expect("needsConfirmation" in r && r.needsConfirmation).toBe(true);
    expect((await trip()).items.some((i) => i.id === "activity-cliff-jumping")).toBe(true);
  });

  it("applies the rest of a batch and holds back the booked item's new dates", async () => {
    const { run, trip } = await setup();
    const r = await run("update_items", {
      updates: [
        { id: "activity-zipline", time: "11:00" },
        { id: "lodging-nov26-28", date: "2026-11-27" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok || !("entryId" in r)) return;
    expect(r.pending?.ops).toHaveLength(1);
    const t = await trip();
    expect(t.items.find((i) => i.id === "activity-zipline")!.start?.time).toBe("11:00");
    expect(t.items.find((i) => i.id === "lodging-nov26-28")!.start?.date).toBe("2026-11-26");
  });

  it("only puts people from the group on an item, never a host or guide", async () => {
    const { run, trip } = await setup();
    await run("add_items", { items: [{ title: "Casa Cielo", kind: "stay", who: "Lucía" }, { title: "Market run", kind: "activity", who: "jaden" }] });
    const t = await trip();
    expect(t.items.find((i) => i.title === "Casa Cielo")!.who).toBeUndefined();
    expect(t.items.find((i) => i.title === "Market run")!.who).toBe("Jaden");
  });
});
