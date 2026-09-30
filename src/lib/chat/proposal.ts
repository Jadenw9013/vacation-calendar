import { z } from "zod";
import { computeGaps, nightCoverage, type Gap } from "@/lib/derive";
import { addDays, formatDay } from "@/lib/time";
import { prepareChange, type OpIssue, type TripState } from "@/lib/engine";
import { applyOp, OpError, type Op } from "@/lib/ops";
import type { RedactionKind } from "@/lib/redact";
import type { Trip } from "@/data/types";

/**
 * The op shape the model sees. Gemini tool schemas can't use unions, so this
 * is one flat object with every field optional; `toStrictOps` turns it into
 * the real ops from src/lib/ops.ts, which are then validated exactly like a
 * manual edit. The model never gets a way to set `confirmBooked`.
 */
const Kind = z.enum(["flight", "lodging", "activity", "transport"]);
const Status = z.enum(["booked", "needs-booking", "undecided"]);
const ClearableField = z.enum(["start", "end", "owner", "notes", "cost", "todos"]);

const SegmentFields = {
  kind: Kind.optional(),
  title: z.string().optional(),
  start: z
    .string()
    .optional()
    .describe('"YYYY-MM-DD" if only the day is known, or "YYYY-MM-DDTHH:MM:00-06:00" if the time is known. Omit if unknown.'),
  end: z.string().optional().describe("Same format as start. Omit if unknown."),
  status: Status.optional(),
  location: z.string().optional(),
  owner: z.string().optional().describe("First name only"),
  notes: z.string().optional(),
  todos: z.array(z.string()).optional(),
  includesLodging: z.boolean().optional().describe("True for an activity you sleep at, like an overnight hike"),
  costAmount: z.number().optional().describe("Only if the person stated the price"),
  costCurrency: z.enum(["USD", "GTQ"]).optional(),
};

/**
 * Deliberately forgiving: a malformed op must come back to the model as an
 * issue it can fix, not fail schema validation and kill the whole reply.
 */
export const FlatOpSchema = z.object({
  op: z.enum([
    "add_segment",
    "update_segment",
    "remove_segment",
    "set_status",
    "add_todo",
    "complete_todo",
    "resolve_question",
  ])
    .optional()
    .describe("Required. Which operation this is."),
  id: z
    .string()
    .optional()
    .describe("Existing segment id (update_segment, remove_segment, set_status) or question id (resolve_question)"),
  segment: z
    .object({
      id: z.string().describe("New unique id: lowercase letters, digits and dashes, e.g. lodging-antigua-nov28"),
      ...SegmentFields,
    })
    .optional()
    .describe("add_segment only. kind, title, status and location are required."),
  blockedBy: z.array(z.string()).optional().describe("add_segment only: open question ids this new item waits on"),
  changes: z.object(SegmentFields).optional().describe("update_segment only: fields to change"),
  clear: z
    .array(ClearableField)
    .optional()
    .describe("update_segment only: fields to empty. Clearing start or end marks it unknown."),
  status: Status.optional().describe("set_status only"),
  owner: z.string().optional().describe("set_status only: first name of who is handling it"),
  target: z.string().optional().describe('add_todo / complete_todo: a segment id, or "trip" for the trip-wide list'),
  text: z.string().optional().describe("add_todo / complete_todo: the to-do text (exact text when completing)"),
  answer: z.string().optional().describe("resolve_question only: the decision"),
});

export type FlatOp = z.infer<typeof FlatOpSchema>;

type SegmentInput = z.infer<z.ZodObject<typeof SegmentFields>> & { id?: string };

function segmentValues(s: SegmentInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["kind", "title", "start", "end", "status", "location", "owner", "notes", "todos", "includesLodging"] as const) {
    if (s[k] !== undefined) out[k] = s[k];
  }
  if (s.costAmount !== undefined) out.cost = { amount: s.costAmount, currency: s.costCurrency ?? "USD" };
  return out;
}

/** Converts model ops to strict ops. Missing fields surface as issues the model can fix. */
export function toStrictOps(flat: FlatOp[]): { ops: Op[]; issues: OpIssue[] } {
  const ops: Op[] = [];
  const issues: OpIssue[] = [];
  const need = (index: number, what: string) =>
    issues.push({ index, code: "invalid", message: `${flat[index].op} needs ${what}` });

  flat.forEach((f, index) => {
    if (!f.op) {
      issues.push({ index, code: "invalid", message: 'Every op needs an "op" field, e.g. "update_segment".' });
      return;
    }
    switch (f.op) {
      case "add_segment": {
        if (!f.segment) return need(index, "segment");
        const v = segmentValues(f.segment);
        ops.push({
          op: "add_segment",
          segment: { start: null, end: null, ...v, id: f.segment.id } as never,
          ...(f.blockedBy?.length ? { blockedBy: f.blockedBy } : {}),
        });
        return;
      }
      case "update_segment": {
        if (!f.id) return need(index, "id");
        const changes: Record<string, unknown> = f.changes ? segmentValues(f.changes) : {};
        for (const c of f.clear ?? []) changes[c] = null;
        ops.push({ op: "update_segment", id: f.id, changes: changes as never });
        return;
      }
      case "remove_segment":
        if (!f.id) return need(index, "id");
        ops.push({ op: "remove_segment", id: f.id });
        return;
      case "set_status":
        if (!f.id || !f.status) return need(index, "id and status");
        ops.push({ op: "set_status", id: f.id, status: f.status, ...(f.owner ? { owner: f.owner } : {}) });
        return;
      case "add_todo":
      case "complete_todo":
        if (!f.target || !f.text) return need(index, "target and text");
        ops.push({ op: f.op, target: f.target, text: f.text });
        return;
      case "resolve_question":
        if (!f.id || !f.answer) return need(index, "id and answer");
        ops.push({ op: "resolve_question", id: f.id, answer: f.answer });
        return;
    }
  });
  return { ops, issues };
}

export interface GapDelta {
  closes: string[];
  opens: string[];
}

const gapLabel = (g: Gap) => `${g.title}: ${g.window}`;

/** Consecutive dates as one label: "Night of Tue Nov 24" or "Nights of Thu Nov 26 – Sat Nov 28". */
function nightRuns(dates: string[]): string[] {
  const runs: string[][] = [];
  for (const d of [...dates].sort()) {
    const run = runs.at(-1);
    if (run && addDays(run.at(-1)!, 1) === d) run.push(d);
    else runs.push([d]);
  }
  return runs.map((r) =>
    r.length === 1 ? `Night of ${formatDay(r[0])}` : `Nights of ${formatDay(r[0])} – ${formatDay(r.at(-1)!)}`,
  );
}

/**
 * What a change does to the gaps. Nights are compared one by one, so merging
 * or splitting a run of empty nights doesn't read as "closes" and "opens" of
 * the same nights. Transport windows and the flight home compare by label.
 */
export function gapDelta(before: Trip, after: Trip): GapDelta {
  const emptyNights = (t: Trip) => new Set(nightCoverage(t).filter((n) => !n.booked).map((n) => n.date));
  const na = emptyNights(before);
  const nb = emptyNights(after);
  const nowBooked = [...na].filter((d) => !nb.has(d));
  const nowEmpty = [...nb].filter((d) => !na.has(d));

  const other = (t: Trip) => computeGaps(t).filter((g) => g.kind !== "night").map(gapLabel);
  const a = other(before);
  const b = other(after);

  return {
    closes: [...nightRuns(nowBooked).map((l) => `Bed booked: ${l}`), ...a.filter((g) => !b.includes(g))],
    opens: [...nightRuns(nowEmpty).map((l) => `Nowhere to sleep: ${l}`), ...b.filter((g) => !a.includes(g))],
  };
}

export interface Proposal {
  /** ready: can be applied. needs_confirmation: touches a booked item; the person must confirm. invalid: see issues. */
  status: "ready" | "needs_confirmation" | "invalid";
  summary: string;
  baseVersion: number;
  /** Strict, redacted ops, without confirmBooked. The client adds it only after the person confirms. */
  ops: Op[];
  /** One plain-language line per op. */
  changes: string[];
  gapDelta: GapDelta;
  /** Why confirmation is needed, one line per booked item touched. */
  confirmations: string[];
  issues: OpIssue[];
  redacted: RedactionKind[];
}

function withConfirmation(ops: Op[]): Op[] {
  return ops.map((o) => (o.op === "update_segment" || o.op === "remove_segment" ? { ...o, confirmBooked: true } : o));
}

function withoutConfirmation(ops: Op[]): Op[] {
  return ops.map((o) => {
    if (o.op !== "update_segment" && o.op !== "remove_segment") return o;
    const rest = { ...o };
    delete rest.confirmBooked;
    return rest;
  });
}

/** Which ops touch booked items, found by applying them one at a time without confirmation. */
function bookedTouches(trip: Trip, ops: Op[]): string[] {
  const messages: string[] = [];
  let t = trip;
  for (const op of ops) {
    try {
      t = applyOp(t, op).trip;
    } catch (e) {
      if (!(e instanceof OpError) || e.code !== "needs_confirmation") return messages;
      messages.push(e.message);
      t = applyOp(t, withConfirmation([op])[0]).trip;
    }
  }
  return messages;
}

/** Validates model ops against the current trip and describes the result. Stores nothing. */
export function buildProposal(state: TripState, summary: string, flat: FlatOp[]): Proposal {
  const empty = { changes: [], gapDelta: { closes: [], opens: [] }, confirmations: [], redacted: [] };
  const base = { summary, baseVersion: state.version };

  const converted = toStrictOps(flat);
  if (converted.issues.length) return { ...base, ...empty, status: "invalid", ops: [], issues: converted.issues };

  // Drop anything the model tried to pass as confirmation; only a person confirms.
  const ops = withoutConfirmation(converted.ops);
  const prepared = prepareChange(state, withConfirmation(ops), { author: "assistant" });
  if (!prepared.ok) return { ...base, ...empty, status: "invalid", ops, issues: prepared.issues };

  const cleanOps = withoutConfirmation(prepared.entry.ops);
  const confirmations = bookedTouches(state.trip, cleanOps);
  return {
    ...base,
    status: confirmations.length ? "needs_confirmation" : "ready",
    ops: cleanOps,
    changes: prepared.entry.summary,
    gapDelta: gapDelta(state.trip, prepared.trip),
    confirmations,
    issues: [],
    redacted: prepared.entry.redacted ?? [],
  };
}

/** Applies a proposal's ops to a copy for the on-timeline preview. null if it no longer applies. */
export function previewTrip(state: TripState, ops: Op[]): Trip | null {
  const r = prepareChange(state, withConfirmation(ops), { author: "preview" });
  return r.ok ? r.trip : null;
}

export { withConfirmation };
