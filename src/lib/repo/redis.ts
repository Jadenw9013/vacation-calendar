import type { Trip } from "@/data/types";
import { prepareChange, type ChangeEntry, type TripState } from "@/lib/engine";
import { HISTORY_LIMIT, type ApplyMeta, type ApplyResult, type TripRepository } from "./types";

/** The subset of the @upstash/redis client this repository uses. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { nx: true }): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const KEY = {
  state: "trip:v1:state",
  version: "trip:v1:version",
  log: "trip:v1:log",
};

/**
 * Compare-and-set in one round trip: write only if the stored version is
 * still the one the change was prepared against.
 * KEYS: state, version, log. ARGV: expected version, new state, log entry, log limit.
 */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[2])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(tonumber(ARGV[1]) + 1))
redis.call('LPUSH', KEYS[3], ARGV[3])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[4]) - 1)
return 1
`;

/** Seeds both keys only if the store is empty, so two cold starts can't clobber each other. */
const SEED_SCRIPT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], '1')
return 1
`;

function parse<T>(raw: unknown): T {
  // @upstash/redis may hand back parsed JSON unless automaticDeserialization is off.
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
}

export class RedisTripRepository implements TripRepository {
  constructor(
    private redis: RedisLike,
    private seed: Trip,
  ) {}

  async get(): Promise<TripState> {
    let [trip, version] = await Promise.all([this.redis.get(KEY.state), this.redis.get(KEY.version)]);
    if (trip === null || version === null) {
      await this.redis.eval(SEED_SCRIPT, [KEY.state, KEY.version], [JSON.stringify(this.seed)]);
      [trip, version] = await Promise.all([this.redis.get(KEY.state), this.redis.get(KEY.version)]);
    }
    return { trip: parse<Trip>(trip), version: Number(version) };
  }

  async applyOps(ops: unknown, expectedVersion: number, meta: ApplyMeta): Promise<ApplyResult> {
    const state = await this.get();
    if (state.version !== expectedVersion) return { ok: false, reason: "conflict", state };
    const prepared = prepareChange(state, ops, meta);
    if (!prepared.ok) return { ok: false, reason: "invalid", issues: prepared.issues, state };

    const written = await this.redis.eval(
      CAS_SCRIPT,
      [KEY.state, KEY.version, KEY.log],
      [String(expectedVersion), JSON.stringify(prepared.trip), JSON.stringify(prepared.entry), String(HISTORY_LIMIT)],
    );
    // Lost a race between our read and the script: someone else wrote first.
    if (Number(written) !== 1) return { ok: false, reason: "conflict", state: await this.get() };
    return { ok: true, state: { trip: prepared.trip, version: prepared.entry.version }, entry: prepared.entry };
  }

  async history(limit = HISTORY_LIMIT): Promise<ChangeEntry[]> {
    const rows = await this.redis.lrange(KEY.log, 0, Math.min(limit, HISTORY_LIMIT) - 1);
    return rows.map((r) => parse<ChangeEntry>(r));
  }
}
