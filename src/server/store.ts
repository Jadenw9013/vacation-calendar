import "server-only";
import { prepareChange, type ChangeEntry, type ChangeMeta, type OpIssue } from "@/domain/change";
import { isV1 } from "@/domain/migrate";
import type { Trip, TripState } from "@/domain/types";
import { seedTrip, SEED_TRIP_ID } from "./seed";

/*
 * Every trip read and write goes through TripStore. The backend is Redis in
 * production and a Map in tests and local dev; the rules live here once.
 *
 * Writes rebase: ops address things by id, so they're applied to whatever
 * is stored now, not to the version the person was looking at. A write only
 * fails if what it touches is gone or the result doesn't validate.
 */

export const HISTORY_LIMIT = 200;

export interface TripSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cover?: string;
}

/** The few storage primitives TripStore needs. */
export interface Backend {
  read(id: string): Promise<{ state: string; version: number } | null>;
  /** Writes state and log entry only if the version is still `expected`. Returns false if someone wrote first. */
  cas(id: string, expected: number, state: string, entry: string, logLimit: number): Promise<boolean>;
  /** Writes a trip only if none exists under the id. */
  init(id: string, state: string): Promise<boolean>;
  log(id: string, limit: number): Promise<string[]>;
  getPass(id: string): Promise<string | null>;
  /** Sets the passcode hash only if there is none yet. */
  claimPass(id: string, hash: string): Promise<boolean>;
  setPass(id: string, hash: string): Promise<void>;
  index(): Promise<Record<string, string>>;
  putIndex(id: string, summary: string): Promise<void>;
  /** Increments a counter that expires after `ttlSeconds`; returns the new count. */
  hit(key: string, ttlSeconds: number): Promise<number>;
  /** The v1 trip, if the old single-trip keys exist. */
  legacy(): Promise<string | null>;
}

export type ApplyResult =
  | { ok: true; state: TripState; entry: ChangeEntry; replayed?: boolean }
  | { ok: false; reason: "invalid"; issues: OpIssue[]; state: TripState }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "busy" };

const parse = <T>(raw: unknown): T => (typeof raw === "string" ? JSON.parse(raw) : raw) as T;

const summaryOf = (t: Trip): TripSummary => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, ...(t.cover ? { cover: t.cover } : {}) });

export class TripStore {
  constructor(private db: Backend) {}

  /** The current trip, or null. The original trip is created from the old store or the seed the first time it's asked for. */
  async get(id: string): Promise<TripState | null> {
    let row = await this.db.read(id);
    if (!row && id === SEED_TRIP_ID) {
      const legacy = await this.db.legacy();
      const v1 = legacy ? parse<unknown>(legacy) : null;
      const trip = v1 && isV1(v1) ? seedTrip(id, v1) : seedTrip(id);
      if (await this.db.init(id, JSON.stringify(trip))) await this.db.putIndex(id, JSON.stringify(summaryOf(trip)));
      row = await this.db.read(id);
    }
    if (!row) return null;
    return { trip: parse<Trip>(row.state), version: row.version };
  }

  async create(trip: Trip, passHash: string): Promise<boolean> {
    if (!(await this.db.init(trip.id, JSON.stringify(trip)))) return false;
    await this.db.setPass(trip.id, passHash);
    await this.db.putIndex(trip.id, JSON.stringify(summaryOf(trip)));
    return true;
  }

  async list(ids?: string[]): Promise<TripSummary[]> {
    const all = await this.db.index();
    return Object.values(all)
      .map((s) => parse<TripSummary>(s))
      .filter((s) => !ids || ids.includes(s.id))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  /** Applies ops to the latest stored trip, retrying if another write lands in between. */
  async apply(id: string, ops: unknown, meta: ChangeMeta): Promise<ApplyResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const state = await this.get(id);
      if (!state) return { ok: false, reason: "not_found" };
      if (meta.key) {
        // A resend (double tap, offline outbox retry): hand back the first result instead of applying twice.
        const earlier = (await this.history(id, 30)).find((e) => e.key === meta.key);
        if (earlier) return { ok: true, state, entry: earlier, replayed: true };
      }
      const prepared = prepareChange(state, ops, meta);
      if (!prepared.ok) return { ok: false, reason: "invalid", issues: prepared.issues, state };
      const written = await this.db.cas(id, state.version, JSON.stringify(prepared.trip), JSON.stringify(prepared.entry), HISTORY_LIMIT);
      if (written) {
        const before = state.trip;
        const t = prepared.trip;
        if (t.name !== before.name || t.startDate !== before.startDate || t.endDate !== before.endDate || t.cover !== before.cover) {
          await this.db.putIndex(id, JSON.stringify(summaryOf(t)));
        }
        return { ok: true, state: { trip: t, version: prepared.entry.version }, entry: prepared.entry };
      }
    }
    return { ok: false, reason: "busy" };
  }

  /** Undoes one change by applying its inverse to the latest trip. A person asked, so booked items need no extra confirmation. */
  async undo(id: string, entryId: string, author: string): Promise<ApplyResult | { ok: false; reason: "no_entry" }> {
    const entry = (await this.history(id)).find((e) => e.id === entryId);
    if (!entry) return { ok: false, reason: "no_entry" };
    return this.apply(id, entry.inverse, { author, undoOf: entry.id, confirmed: true });
  }

  async history(id: string, limit = HISTORY_LIMIT): Promise<ChangeEntry[]> {
    return (await this.db.log(id, Math.min(limit, HISTORY_LIMIT))).map((r) => parse<ChangeEntry>(r));
  }

  getPass(id: string) {
    return this.db.getPass(id);
  }
  claimPass(id: string, hash: string) {
    return this.db.claimPass(id, hash);
  }
  setPass(id: string, hash: string) {
    return this.db.setPass(id, hash);
  }
  hit(key: string, ttlSeconds: number) {
    return this.db.hit(key, ttlSeconds);
  }
}

// ---------------------------------------------------------------------------
// Backends

export class MemoryBackend implements Backend {
  private states = new Map<string, { state: string; version: number }>();
  private logs = new Map<string, string[]>();
  private passes = new Map<string, string>();
  private idx = new Map<string, string>();
  private counters = new Map<string, { n: number; until: number }>();

  constructor(private legacyTrip: string | null = null) {}

  async read(id: string) {
    return this.states.get(id) ?? null;
  }
  async cas(id: string, expected: number, state: string, entry: string, logLimit: number) {
    const cur = this.states.get(id);
    if (!cur || cur.version !== expected) return false;
    this.states.set(id, { state, version: expected + 1 });
    const log = [entry, ...(this.logs.get(id) ?? [])].slice(0, logLimit);
    this.logs.set(id, log);
    return true;
  }
  async init(id: string, state: string) {
    if (this.states.has(id)) return false;
    this.states.set(id, { state, version: 1 });
    return true;
  }
  async log(id: string, limit: number) {
    return (this.logs.get(id) ?? []).slice(0, limit);
  }
  async getPass(id: string) {
    return this.passes.get(id) ?? null;
  }
  async claimPass(id: string, hash: string) {
    if (this.passes.has(id)) return false;
    this.passes.set(id, hash);
    return true;
  }
  async setPass(id: string, hash: string) {
    this.passes.set(id, hash);
  }
  async index() {
    return Object.fromEntries(this.idx);
  }
  async putIndex(id: string, summary: string) {
    this.idx.set(id, summary);
  }
  async hit(key: string, ttlSeconds: number) {
    const now = Date.now();
    const c = this.counters.get(key);
    const next = c && c.until > now ? { n: c.n + 1, until: c.until } : { n: 1, until: now + ttlSeconds * 1000 };
    this.counters.set(key, next);
    return next.n;
  }
  async legacy() {
    return this.legacyTrip;
  }
}

/** The subset of the @upstash/redis client used here. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { nx?: true }): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const k = (id: string) => ({ state: `t:${id}:state`, version: `t:${id}:version`, log: `t:${id}:log`, pass: `t:${id}:pass` });

/** KEYS: state, version, log. ARGV: expected version, new state, log entry, log limit. */
const CAS = `
local current = redis.call('GET', KEYS[2])
if current ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], tostring(tonumber(ARGV[1]) + 1))
redis.call('LPUSH', KEYS[3], ARGV[3])
redis.call('LTRIM', KEYS[3], 0, tonumber(ARGV[4]) - 1)
return 1
`;

/** KEYS: state, version. ARGV: state. */
const INIT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], '1')
return 1
`;

/** KEYS: counter. ARGV: ttl seconds. */
const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end
return n
`;

export class RedisBackend implements Backend {
  constructor(private redis: RedisLike) {}

  async read(id: string) {
    const [state, version] = await this.redis.mget(k(id).state, k(id).version);
    return state === null || version === null ? null : { state: typeof state === "string" ? state : JSON.stringify(state), version: Number(version) };
  }
  async cas(id: string, expected: number, state: string, entry: string, logLimit: number) {
    const keys = k(id);
    return Number(await this.redis.eval(CAS, [keys.state, keys.version, keys.log], [String(expected), state, entry, String(logLimit)])) === 1;
  }
  async init(id: string, state: string) {
    return Number(await this.redis.eval(INIT, [k(id).state, k(id).version], [state])) === 1;
  }
  async log(id: string, limit: number) {
    const rows = await this.redis.lrange(k(id).log, 0, limit - 1);
    return rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r)));
  }
  async getPass(id: string) {
    return this.redis.get(k(id).pass);
  }
  async claimPass(id: string, hash: string) {
    return (await this.redis.set(k(id).pass, hash, { nx: true })) !== null;
  }
  async setPass(id: string, hash: string) {
    await this.redis.set(k(id).pass, hash);
  }
  async index() {
    const all = (await this.redis.hgetall("trips")) ?? {};
    return Object.fromEntries(Object.entries(all).map(([key, v]) => [key, typeof v === "string" ? v : JSON.stringify(v)]));
  }
  async putIndex(id: string, summary: string) {
    await this.redis.hset("trips", { [id]: summary });
  }
  async hit(key: string, ttlSeconds: number) {
    return Number(await this.redis.eval(HIT, [`rl:${key}`], [String(ttlSeconds)]));
  }
  async legacy() {
    const v = await this.redis.get("trip:v1:state");
    return v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
  }
}
