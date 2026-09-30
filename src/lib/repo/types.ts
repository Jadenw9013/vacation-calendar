import type { ChangeEntry, OpIssue, TripState } from "@/lib/engine";

export type ApplyResult =
  | { ok: true; state: TripState; entry: ChangeEntry }
  /** Someone else changed the trip since `expectedVersion`. Regenerate against `state`. */
  | { ok: false; reason: "conflict"; state: TripState }
  | { ok: false; reason: "invalid"; issues: OpIssue[]; state: TripState };

export interface ApplyMeta {
  author: string;
  undoOf?: string;
}

/** The only way anything reads or writes the trip. */
export interface TripRepository {
  /** Current trip and version. Seeds from src/data/trip.ts when the store is empty. */
  get(): Promise<TripState>;
  /** Applies ops atomically if the stored version still equals `expectedVersion`. */
  applyOps(ops: unknown, expectedVersion: number, meta: ApplyMeta): Promise<ApplyResult>;
  /** Most recent change first. */
  history(limit?: number): Promise<ChangeEntry[]>;
}

export const HISTORY_LIMIT = 200;
