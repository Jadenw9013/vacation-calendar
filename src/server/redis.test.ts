import { afterEach, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";
import { RedisBackend, TripStore, type RedisLike } from "./store";

const { jar } = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => void jar.set(name, value),
}) }));
import { joinedTrips, readSession, writeAccount } from "./auth";
import { setStoreForTests } from "./db";

const summary = { id: "guatemala", name: "Guatemala", startDate: "2026-11-28", endDate: "2026-12-05" };

/** Use the installed SDK's command decoder, with the production setting. MemoryBackend
 * cannot reproduce Redis returning alternating hash fields and values. */
function redisWithHashes(hashes: Record<string, string[]>): RedisLike {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const [, key] = JSON.parse(init!.body as string);
    return Response.json({ result: hashes[key] ?? [] });
  });
  const redis = new Redis({ url: "https://redis.test", token: "test-only", automaticDeserialization: false, enableAutoPipelining: false, responseEncoding: false });
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    mget: vi.fn().mockResolvedValue([null, null]),
    lrange: vi.fn().mockResolvedValue([]),
    hgetall: (key) => redis.hgetall<Record<string, string>>(key),
    hset: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  jar.clear();
  setStoreForTests(undefined);
});

describe("production Redis hashes", () => {
  it("lists a joined trip from the SDK's raw HGETALL response", async () => {
    const store = new TripStore(new RedisBackend(redisWithHashes({ trips: [summary.id, JSON.stringify(summary)] })));
    expect(await store.list([summary.id])).toEqual([summary]);
  });

  it("uses trip IDs as membership keys so remembered sign-in still grants access", async () => {
    const backend = new RedisBackend(redisWithHashes({ "account:person:trips": ["guatemala", "Ana", "japan", "Sam"] }));
    expect(await backend.accountTrips("person")).toEqual({ guatemala: "Ana", japan: "Sam" });
    expect(await backend.accountTrips("new-person")).toEqual({});
  });

  it("preserves names that happen to be JSON keywords", async () => {
    const backend = new RedisBackend(redisWithHashes({ "account:person:trips": ["guatemala", "null"] }));
    expect(await backend.accountTrips("person")).toEqual({ guatemala: "null" });
  });

  it("also supports object responses from compatible Redis clients", async () => {
    const redis = redisWithHashes({});
    redis.hgetall = vi.fn().mockResolvedValue({ guatemala: JSON.stringify(summary) });
    expect(await new TripStore(new RedisBackend(redis)).list([summary.id])).toEqual([summary]);
  });

  it("loads the signed-in home trip list and reopens a trip without another sign-in", async () => {
    vi.stubEnv("SESSION_SECRET", "redis-regression-test-secret");
    const account = { id: "a".repeat(64), name: "Ana", email: "ana@example.com" };
    const store = new TripStore(new RedisBackend(redisWithHashes({
      trips: [summary.id, JSON.stringify(summary)],
      [`account:${account.id}:trips`]: [summary.id, "Ana"],
    })));
    setStoreForTests(store);
    await writeAccount(account);
    const ids = await joinedTrips();
    expect(ids).toEqual(["guatemala"]);
    expect(await store.list(ids)).toEqual([summary]);
    expect(await readSession("guatemala")).toEqual({ tripId: "guatemala", name: "Ana", accountId: account.id });
    expect(await readSession("someone-elses-trip")).toBeNull();
  });
});
