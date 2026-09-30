import type { Trip } from "@/data/types";
import { prepareChange, type ChangeEntry, type TripState } from "@/lib/engine";
import { HISTORY_LIMIT, type ApplyMeta, type ApplyResult, type TripRepository } from "./types";

/** In-process store for tests and local dev without Redis. Resets on restart. */
export class MemoryTripRepository implements TripRepository {
  private state: TripState;
  private log: ChangeEntry[] = [];

  constructor(seed: Trip) {
    this.state = { trip: structuredClone(seed), version: 1 };
  }

  async get(): Promise<TripState> {
    return structuredClone(this.state);
  }

  async applyOps(ops: unknown, expectedVersion: number, meta: ApplyMeta): Promise<ApplyResult> {
    if (expectedVersion !== this.state.version) return { ok: false, reason: "conflict", state: await this.get() };
    const prepared = prepareChange(this.state, ops, meta);
    if (!prepared.ok) return { ok: false, reason: "invalid", issues: prepared.issues, state: await this.get() };
    this.state = { trip: prepared.trip, version: prepared.entry.version };
    this.log.unshift(prepared.entry);
    this.log.length = Math.min(this.log.length, HISTORY_LIMIT);
    return { ok: true, state: await this.get(), entry: structuredClone(prepared.entry) };
  }

  async history(limit = HISTORY_LIMIT): Promise<ChangeEntry[]> {
    return structuredClone(this.log.slice(0, limit));
  }
}
