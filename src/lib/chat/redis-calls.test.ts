import { describe, expect, it } from "vitest";
import { trip as seed } from "@/data/trip";
import { mockModel } from "@/lib/llm/mock";
import { RedisTripRepository, type RedisLike } from "@/lib/repo/redis";
import { handleChat } from "./pipeline";

/*
 * Redis calls per chat request and per Apply, counted on the real Redis
 * repository with a recording stand-in for the Upstash client. Commands
 * issued in the same tick are one round trip: @upstash/redis pipelines them
 * automatically (enableAutoPipelining defaults to true in 1.39).
 */

function recordingRedis() {
  const store = new Map<string, string>();
  const list: string[] = [];
  const log = { commands: [] as string[], trips: 0 };
  let batchOpen = false;
  // A reply comes back after a network round trip, not in the same tick.
  const note = async (cmd: string) => {
    log.commands.push(cmd);
    if (!batchOpen) {
      batchOpen = true;
      log.trips++;
      setTimeout(() => (batchOpen = false), 0);
    }
    await new Promise((r) => setTimeout(r, 2));
  };
  const redis: RedisLike = {
    async get(k) {
      await note("GET");
      return store.get(k) ?? null;
    },
    async set(k, v) {
      await note("SET");
      store.set(k, v);
      return "OK";
    },
    async lrange() {
      await note("LRANGE");
      return list;
    },
    async eval(script, keys, args) {
      await note("EVAL");
      if (script.includes("EXISTS")) {
        if (!store.has(keys[1])) {
          store.set(keys[0], args[0]);
          store.set(keys[1], "1");
        }
        return 1;
      }
      if (store.get(keys[1]) !== args[0]) return 0;
      store.set(keys[0], args[1]);
      store.set(keys[1], String(Number(args[0]) + 1));
      list.unshift(args[2]);
      return 1;
    },
  };
  return { redis, log };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("Redis round trips", () => {
  it("a chat request reads the trip once: 2 commands, 1 round trip", async () => {
    process.env.CHAT_MOCK = "eval";
    const { redis, log } = recordingRedis();
    const repo = new RedisTripRepository(redis, seed);
    await repo.get(); // seed the store first, as the page load does
    await tick();
    log.commands = [];
    log.trips = 0;
    const res = await handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "Move the volcano hike to Nov 30." }] }], author: "Sam", outcomes: {} }),
      }),
      { repo, models: [mockModel()], vision: false },
    );
    await res.text();
    expect(log.commands).toEqual(["GET", "GET"]);
    expect(log.trips).toBe(1);
  });

  it("an Apply: read, then compare-and-set (2 round trips, 3 commands)", async () => {
    const { redis, log } = recordingRedis();
    const repo = new RedisTripRepository(redis, seed);
    await repo.get();
    await tick();
    log.commands = [];
    log.trips = 0;
    const r = await repo.applyOps([{ op: "set_status", id: "activity-zipline", status: "booked" }], 1, { author: "Sam" });
    expect(r.ok).toBe(true);
    expect(log.commands).toEqual(["GET", "GET", "EVAL"]);
    expect(log.trips).toBe(2);
  });
});
