import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { MemoryTripRepository } from "./memory";
import { RedisTripRepository, type RedisLike } from "./redis";
import type { TripRepository } from "./types";

/**
 * Minimal stand-in for Upstash: stores strings and runs our two Lua scripts
 * by recognising them. Tests the repository's glue (serialisation, version
 * keys, seeding, conflict path), not Redis itself.
 */
class FakeRedis implements RedisLike {
  data = new Map<string, string>();
  lists = new Map<string, string[]>();
  /** Runs before the next eval, to simulate another writer racing us. */
  beforeEval?: () => void;

  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
    return "OK";
  }
  async lrange(key: string, start: number, stop: number) {
    return (this.lists.get(key) ?? []).slice(start, stop + 1);
  }
  async eval(script: string, keys: string[], args: string[]) {
    this.beforeEval?.();
    this.beforeEval = undefined;
    if (script.includes("EXISTS")) {
      if (this.data.has(keys[1])) return 0;
      this.data.set(keys[0], args[0]);
      this.data.set(keys[1], "1");
      return 1;
    }
    if (this.data.get(keys[1]) !== args[0]) return 0;
    this.data.set(keys[0], args[1]);
    this.data.set(keys[1], String(Number(args[0]) + 1));
    const list = [args[2], ...(this.lists.get(keys[2]) ?? [])].slice(0, Number(args[3]));
    this.lists.set(keys[2], list);
    return 1;
  }
}

const add = [{ op: "add_todo", target: "trip", text: "Pack headlamps" }];
const meta = { author: "Sam" };

const impls: [string, () => { repo: TripRepository; redis?: FakeRedis }][] = [
  ["memory", () => ({ repo: new MemoryTripRepository(seed) })],
  [
    "redis",
    () => {
      const redis = new FakeRedis();
      return { repo: new RedisTripRepository(redis, seed), redis };
    },
  ],
];

describe.each(impls)("%s repository", (_name, make) => {
  it("seeds from trip.ts at version 1", async () => {
    const { repo } = make();
    const state = await repo.get();
    expect(state.version).toBe(1);
    expect(state.trip).toEqual(seed);
  });

  it("applies with a version check and logs the change", async () => {
    const { repo } = make();
    const r = await repo.applyOps(add, 1, meta);
    expect(r.ok).toBe(true);
    const state = await repo.get();
    expect(state.version).toBe(2);
    expect(state.trip.todos).toContain("Pack headlamps");
    const [entry] = await repo.history();
    expect(entry).toMatchObject({ version: 2, author: "Sam", ops: add });
  });

  it("rejects a stale version as a conflict without writing", async () => {
    const { repo } = make();
    await repo.applyOps(add, 1, meta);
    const r = await repo.applyOps([{ op: "add_todo", target: "trip", text: "Other" }], 1, meta);
    expect(r).toMatchObject({ ok: false, reason: "conflict" });
    if (!r.ok) expect(r.state.version).toBe(2);
    expect((await repo.get()).trip.todos).not.toContain("Other");
  });

  it("rejects invalid ops without bumping the version", async () => {
    const { repo } = make();
    const r = await repo.applyOps([{ op: "remove_segment", id: "lodging-atitlan" }], 1, meta);
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect((await repo.get()).version).toBe(1);
    expect(await repo.history()).toEqual([]);
  });

  it("undoes by applying the inverse as a new, logged change", async () => {
    const { repo } = make();
    await repo.applyOps([{ op: "remove_segment", id: "lodging-atitlan", confirmBooked: true }], 1, meta);
    const [latest] = await repo.history(1);
    const undo = await repo.applyOps(latest.inverse, 2, { author: "Ana", undoOf: latest.id });
    expect(undo.ok).toBe(true);
    const state = await repo.get();
    expect(state.version).toBe(3);
    expect(state.trip.segments.find((s) => s.id === "lodging-atitlan")).toEqual(
      seed.segments.find((s) => s.id === "lodging-atitlan"),
    );
    const [undoEntry] = await repo.history(1);
    expect(undoEntry).toMatchObject({ undoOf: latest.id, author: "Ana" });
  });

  it("returns history newest first", async () => {
    const { repo } = make();
    await repo.applyOps(add, 1, meta);
    await repo.applyOps([{ op: "complete_todo", target: "trip", text: "Pack headlamps" }], 2, meta);
    expect((await repo.history()).map((e) => e.version)).toEqual([3, 2]);
  });
});

describe("redis repository races", () => {
  it("reports a conflict when another writer lands between read and write", async () => {
    const redis = new FakeRedis();
    const repo = new RedisTripRepository(redis, seed);
    await repo.get(); // seed
    redis.beforeEval = () => redis.data.set("trip:v1:version", "2");
    const r = await repo.applyOps(add, 1, meta);
    expect(r).toMatchObject({ ok: false, reason: "conflict" });
  });
});
