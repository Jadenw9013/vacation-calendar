import { beforeEach, describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { MemoryTripRepository } from "@/lib/repo/memory";
import { POST } from "./route";

const holder = globalThis as unknown as { tripRepo?: MemoryTripRepository };
const body = (key?: string) => ({ ops: [{ op: "set_status", id: "activity-zipline", status: "booked" }], expectedVersion: 1, author: "Sam", ...(key ? { key } : {}) });
const post = (b: unknown) => POST(new Request("http://localhost/api/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));

describe("Apply is idempotent", () => {
  beforeEach(() => {
    holder.tripRepo = new MemoryTripRepository(seed);
  });

  it("the same key twice applies once and returns the first result", async () => {
    const first = await post(body("apply-key-123"));
    const second = await post(body("apply-key-123"));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [a, b] = [await first.json(), await second.json()];
    expect(b.replayed).toBe(true);
    expect(b.entry.id).toBe(a.entry.id);
    expect((await holder.tripRepo!.get()).version).toBe(2);
    expect(await holder.tripRepo!.history()).toHaveLength(1);
  });

  it("without a key, a resend is a conflict (still never applied twice)", async () => {
    await post(body());
    const again = await post(body());
    expect(again.status).toBe(409);
    expect((await holder.tripRepo!.get()).version).toBe(2);
  });

  it("a different key against an old version is a real conflict", async () => {
    await post(body("apply-key-aaa"));
    expect((await post(body("apply-key-bbb"))).status).toBe(409);
  });
});
