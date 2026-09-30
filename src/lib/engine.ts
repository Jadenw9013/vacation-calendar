import type { Trip } from "@/data/types";
import { validateTrip } from "./derive";
import { applyOp, OpError, OpSchema, type Op, type OpErrorCode } from "./ops";
import { redact, type RedactionKind } from "./redact";

export interface TripState {
  trip: Trip;
  /** Increments by one on every applied change. */
  version: number;
}

export interface ChangeEntry {
  id: string;
  /** The trip version this change produced. */
  version: number;
  /** ISO timestamp. */
  at: string;
  /** First name from the who's-talking picker. Bookkeeping, not authentication. */
  author: string;
  /** One plain-language line per op. */
  summary: string[];
  ops: Op[];
  /** Ops that undo this change, in run order. */
  inverse: Op[];
  /** Set when this change is an undo of another. */
  undoOf?: string;
  /** Kinds of sensitive text stripped from the ops before storing. */
  redacted?: RedactionKind[];
}

export interface OpIssue {
  /** Index into the submitted ops, or -1 for problems with the resulting trip. */
  index: number;
  code: OpErrorCode;
  message: string;
}

export type PrepareResult =
  | { ok: true; trip: Trip; entry: ChangeEntry }
  | { ok: false; issues: OpIssue[] };

export interface ChangeMeta {
  author: string;
  undoOf?: string;
  /** Injected for tests. */
  now?: () => Date;
  newId?: () => string;
}

/** Keys whose string values are structured data, never free text. */
const STRUCTURED_KEYS = new Set(["op", "id", "kind", "status", "start", "end", "owner", "target", "currency"]);

function redactDeep<T>(value: T, found: Set<RedactionKind>, key?: string): T {
  if (typeof value === "string") {
    if (key && STRUCTURED_KEYS.has(key)) return value;
    const r = redact(value);
    r.removed.forEach((k) => found.add(k));
    return r.text as T;
  }
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, found, key)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactDeep(v, found, k)]),
    ) as T;
  }
  return value;
}

/** Validates raw ops (e.g. from JSON) without applying them. */
export function parseOps(raw: unknown): { ok: true; ops: Op[] } | { ok: false; issues: OpIssue[] } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, issues: [{ index: -1, code: "invalid", message: "ops must be a non-empty array" }] };
  }
  if (raw.length > 50) {
    return { ok: false, issues: [{ index: -1, code: "invalid", message: "At most 50 ops per change" }] };
  }
  const ops: Op[] = [];
  const issues: OpIssue[] = [];
  raw.forEach((r, index) => {
    const parsed = OpSchema.safeParse(r);
    if (parsed.success) ops.push(parsed.data);
    else
      issues.push({
        index,
        code: "invalid",
        message: parsed.error.issues.map((i) => `${i.path.join(".") || "op"}: ${i.message}`).join("; "),
      });
  });
  return issues.length ? { ok: false, issues } : { ok: true, ops };
}

/**
 * Validates, redacts and applies ops to a copy of the trip. Nothing is stored:
 * repositories call this, then write the result with a version check. The
 * chat preview (gap delta) uses it the same way.
 */
export function prepareChange(state: TripState, rawOps: unknown, meta: ChangeMeta): PrepareResult {
  const parsed = parseOps(rawOps);
  if (!parsed.ok) return parsed;

  const found = new Set<RedactionKind>();
  const ops = redactDeep(parsed.ops, found);

  let trip = state.trip;
  const inverseChunks: Op[][] = [];
  const summary: string[] = [];
  for (const [index, op] of ops.entries()) {
    try {
      const applied = applyOp(trip, op);
      trip = applied.trip;
      inverseChunks.push(applied.inverse);
      summary.push(applied.description);
    } catch (e) {
      if (e instanceof OpError) return { ok: false, issues: [{ index, code: e.code, message: e.message }] };
      throw e;
    }
  }

  const problems = validateTrip(trip);
  if (problems.length) {
    return { ok: false, issues: problems.map((message) => ({ index: -1, code: "invalid" as const, message })) };
  }

  const entry: ChangeEntry = {
    id: (meta.newId ?? (() => crypto.randomUUID()))(),
    version: state.version + 1,
    at: (meta.now ?? (() => new Date()))().toISOString(),
    author: meta.author,
    summary,
    ops,
    // Undo runs the per-op inverses last-to-first.
    inverse: inverseChunks.reverse().flat(),
  };
  if (meta.undoOf) entry.undoOf = meta.undoOf;
  if (found.size) entry.redacted = [...found];
  return { ok: true, trip, entry };
}
