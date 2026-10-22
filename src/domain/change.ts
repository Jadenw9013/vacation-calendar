import { applyOp, describeOp, OpError, touchesBooked, type Op, type OpErrorCode } from "./ops";
import { OpSchema, TripSchema } from "./schema";
import { instantOf } from "./time";
import type { Trip, TripState } from "./types";

export interface ChangeEntry {
  id: string;
  /** The version this change produced. */
  version: number;
  /** Epoch ms. */
  at: number;
  /** First name of whoever made it; "Jaden via assistant" for the assistant. */
  author: string;
  /** One plain-language line per op. */
  summary: string[];
  ops: Op[];
  /** Ops that undo this change, in the order they run. */
  inverse: Op[];
  /** Set when this change undid another. */
  undoOf?: string;
  /** The client's key for this change, so a resend from the offline outbox isn't applied twice. */
  key?: string;
}

export interface OpIssue {
  /** Index into the submitted ops, or -1 for the trip as a whole. */
  index: number;
  code: OpErrorCode;
  message: string;
}

export interface ChangeMeta {
  author: string;
  /** A person confirmed changes to booked items. */
  confirmed?: boolean;
  undoOf?: string;
  key?: string;
  now?: number;
  newId?: () => string;
}

export type Prepared = { ok: true; trip: Trip; entry: ChangeEntry } | { ok: false; issues: OpIssue[] };

export const MAX_OPS = 60;

/** Validates raw ops (from JSON, the outbox or the assistant) without applying them. */
export function parseOps(raw: unknown): { ok: true; ops: Op[] } | { ok: false; issues: OpIssue[] } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, issues: [{ index: -1, code: "invalid", message: "Nothing to change." }] };
  if (raw.length > MAX_OPS) return { ok: false, issues: [{ index: -1, code: "invalid", message: `At most ${MAX_OPS} changes at once.` }] };
  const ops: Op[] = [];
  const issues: OpIssue[] = [];
  raw.forEach((r, index) => {
    const p = OpSchema.safeParse(r);
    if (p.success) ops.push(p.data);
    else issues.push({ index, code: "invalid", message: p.error.issues.map((i) => `${i.path.join(".") || "op"}: ${i.message}`).join("; ") });
  });
  return issues.length ? { ok: false, issues } : { ok: true, ops };
}

// ---------------------------------------------------------------------------
// Card numbers: the one thing never stored, even in a private trip.

const DIGIT_RUN = /(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g;
const CVV = /\b(cvv|cvc|security code)(\s*[:#]?\s*)\d{3,4}\b/gi;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function stripCards(text: string): string {
  return text
    .replace(DIGIT_RUN, (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? "[card number removed]" : m;
    })
    .replace(CVV, (_m, word, sep) => `${word}${sep}[removed]`);
}

/** Keys holding links or ids: never touched by the scrub, so a long id in a URL survives. */
const SKIP = new Set(["url", "image", "mapsUrl", "website", "id", "itemId", "linkId", "checkId", "op", "tz", "date", "time"]);

function scrub<T>(value: T, key?: string): T {
  if (typeof value === "string") return (key && SKIP.has(key) ? value : stripCards(value)) as T;
  if (Array.isArray(value)) return value.map((v) => scrub(v, key)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k)])) as T;
  return value;
}

// ---------------------------------------------------------------------------
// Whole-trip checks after the ops ran.

export function tripProblems(trip: Trip): string[] {
  const out: string[] = [];
  const parsed = TripSchema.safeParse(trip);
  if (!parsed.success) out.push(...parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`));
  if (trip.endDate < trip.startDate) out.push("The trip ends before it starts.");
  const seen = new Set<string>();
  for (const i of trip.items) {
    if (seen.has(i.id)) out.push(`Two items share the id "${i.id}".`);
    seen.add(i.id);
    if (i.start && i.end) {
      const a = instantOf(i.start, trip.tz);
      const b = instantOf(i.end, trip.tz);
      const backwards = a !== null && b !== null ? b < a : i.end.date < i.start.date;
      if (backwards) out.push(`"${i.title}" ends before it starts.`);
    }
  }
  const todoIds = new Set<string>();
  for (const t of trip.todos) {
    if (todoIds.has(t.id)) out.push(`Two to-dos share the id "${t.id}".`);
    todoIds.add(t.id);
  }
  return out;
}

const randomId = () => Math.random().toString(36).slice(2, 10);

/**
 * Validates and applies a batch of ops to the current state. All or nothing:
 * any bad op and nothing changes. Ops address things by id, so a batch made
 * against an older version still applies cleanly to the latest one.
 */
export function prepareChange(state: TripState, raw: unknown, meta: ChangeMeta): Prepared {
  const parsed = parseOps(raw);
  if (!parsed.ok) return parsed;
  const ops = scrub(parsed.ops);

  let trip = state.trip;
  const inverse: Op[] = [];
  const summary: string[] = [];
  for (const [index, op] of ops.entries()) {
    const booked = meta.confirmed ? null : touchesBooked(trip, op);
    if (booked) {
      return {
        ok: false,
        issues: [{ index, code: "needs_confirmation", message: `“${booked.title}” is booked. Check with whoever booked it, then confirm.` }],
      };
    }
    try {
      summary.push(describeOp(trip, op));
      const r = applyOp(trip, op);
      trip = r.trip;
      inverse.unshift(...r.inverse);
    } catch (e) {
      if (e instanceof OpError) return { ok: false, issues: [{ index, code: e.code, message: e.message }] };
      throw e;
    }
  }

  const problems = tripProblems(trip);
  if (problems.length) return { ok: false, issues: problems.map((message) => ({ index: -1, code: "invalid" as const, message })) };

  return {
    ok: true,
    trip,
    entry: {
      id: (meta.newId ?? randomId)(),
      version: state.version + 1,
      at: meta.now ?? Date.now(),
      author: meta.author,
      summary,
      ops,
      inverse,
      ...(meta.undoOf ? { undoOf: meta.undoOf } : {}),
      ...(meta.key ? { key: meta.key } : {}),
    },
  };
}
