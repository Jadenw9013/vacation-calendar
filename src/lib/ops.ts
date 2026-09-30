import { z } from "zod";
import type { OpenQuestion, Segment, Trip } from "@/data/types";
import { formatDay, isValidMoment, parseMoment } from "./time";

// ---------------------------------------------------------------------------
// Field schemas

const moment = z.string().refine(isValidMoment, {
  message: 'Use "YYYY-MM-DD" or a datetime with offset like "2026-11-28T08:00:00-06:00"',
});

/** First names only: the site must never hold full names. */
export const FirstName = z
  .string()
  .trim()
  .regex(/^\p{L}[\p{L}'-]{0,29}$/u, "First name only, one word");

const SegmentId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Lowercase letters, digits and dashes");

const Kind = z.enum(["flight", "lodging", "activity", "transport"]);
const Status = z.enum(["booked", "needs-booking", "undecided"]);
const Money = z.object({ amount: z.number().nonnegative().max(1_000_000), currency: z.enum(["USD", "GTQ"]) }).strict();
const Title = z.string().trim().min(1).max(200);
const Location = z.string().trim().min(1).max(200);
const Notes = z.string().trim().max(2000);
const TodoText = z.string().trim().min(1).max(300);
const Todos = z.array(TodoText).max(50);
const Elevation = z.number().int().positive().max(9000);

export const SegmentSchema = z
  .object({
    id: SegmentId,
    kind: Kind,
    title: Title,
    start: moment.nullable(),
    end: moment.nullable(),
    status: Status,
    location: Location,
    owner: FirstName.optional(),
    cost: Money.optional(),
    notes: Notes.optional(),
    todos: Todos.optional(),
    includesLodging: z.boolean().optional(),
    peakElevationM: Elevation.optional(),
  })
  .strict();

/**
 * Fields to change. For optional fields, null removes the field. For start
 * and end, null means "unknown" (their normal empty value).
 */
const SegmentPatch = z
  .object({
    kind: Kind,
    title: Title,
    start: moment.nullable(),
    end: moment.nullable(),
    status: Status,
    location: Location,
    owner: FirstName.nullable(),
    cost: Money.nullable(),
    notes: Notes.nullable(),
    todos: Todos.nullable(),
    includesLodging: z.boolean().nullable(),
    peakElevationM: Elevation.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

/** "trip" targets the trip-wide to-do list; anything else is a segment id. */
const TodoTarget = z.union([z.literal("trip"), SegmentId]);

// ---------------------------------------------------------------------------
// Operations

export const OpSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("add_segment"),
      segment: SegmentSchema,
      /** Open question ids that should list this segment as blocked. */
      blockedBy: z.array(z.string().min(1).max(64)).max(10).optional(),
      /** Position in the segment list; appends when omitted. Used by undo. */
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("update_segment"),
      id: SegmentId,
      changes: SegmentPatch,
      /** Required to change the times of a booked segment. */
      confirmBooked: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("remove_segment"),
      id: SegmentId,
      /** Required to remove a booked segment. */
      confirmBooked: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("set_status"),
      id: SegmentId,
      status: Status,
      /** Omit to leave the owner as is; null clears it. */
      owner: FirstName.nullable().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("add_todo"),
      target: TodoTarget,
      text: TodoText,
      /** Insert position; appends when omitted. Used by undo to restore order. */
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({ op: z.literal("complete_todo"), target: TodoTarget, text: TodoText }).strict(),
  z
    .object({
      op: z.literal("update_trip"),
      /** Trip-level settings. Manual edits only: not offered to the planner. */
      changes: z
        .object({
          lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
          partySize: z.number().int().positive().max(30).nullable(),
        })
        .partial()
        .strict()
        .refine((c) => Object.keys(c).length > 0, "No fields to change"),
    })
    .strict(),
  z
    .object({
      op: z.literal("resolve_question"),
      id: z.string().min(1).max(64),
      /** The decision. null reopens the question. */
      answer: z.string().trim().min(1).max(500).nullable(),
    })
    .strict(),
]);

export type Op = z.infer<typeof OpSchema>;
export type OpName = Op["op"];

// ---------------------------------------------------------------------------
// Applying one op

export type OpErrorCode = "not_found" | "duplicate" | "needs_confirmation" | "invalid";

export class OpError extends Error {
  constructor(
    public code: OpErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface Applied {
  trip: Trip;
  /** Ops that undo this one, in the order they must run. */
  inverse: Op[];
  /** Plain-language line for diffs and the activity log. */
  description: string;
}

function findSegment(trip: Trip, id: string): [Segment, number] {
  const i = trip.segments.findIndex((s) => s.id === id);
  if (i < 0) throw new OpError("not_found", `No segment with id "${id}"`);
  return [trip.segments[i], i];
}

function findQuestion(trip: Trip, id: string): [OpenQuestion, number] {
  const i = trip.openQuestions.findIndex((q) => q.id === id);
  if (i < 0) throw new OpError("not_found", `No open question with id "${id}"`);
  return [trip.openQuestions[i], i];
}

function when(m: string | null): string {
  if (!m) return "date unknown";
  return formatDay(parseMoment(m).date);
}

type PatchField =
  | "kind"
  | "title"
  | "start"
  | "end"
  | "status"
  | "location"
  | "owner"
  | "cost"
  | "notes"
  | "todos"
  | "includesLodging"
  | "peakElevationM";
type Patch = Partial<Record<PatchField, unknown>>;

/** Fields that are nullable in their own right; for the rest, null means "remove". */
const NULL_IS_VALUE = new Set<PatchField>(["start", "end"]);

function applyPatch(seg: Segment, changes: Patch): Segment {
  const next: Record<string, unknown> = { ...seg };
  for (const [k, v] of Object.entries(changes) as [PatchField, unknown][]) {
    if (v === null && !NULL_IS_VALUE.has(k)) delete next[k];
    else next[k] = v;
  }
  return next as unknown as Segment;
}

function show(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function todoList(trip: Trip, target: string): { list: string[]; label: string; set: (t: Trip, l: string[]) => Trip } {
  if (target === "trip") {
    return { list: trip.todos, label: "the trip", set: (t, l) => ({ ...t, todos: l }) };
  }
  const [seg, i] = findSegment(trip, target);
  return {
    list: seg.todos ?? [],
    label: `“${seg.title}”`,
    set: (t, l) => {
      const segments = [...t.segments];
      const next: Segment = { ...segments[i], todos: l };
      if (!l.length) delete next.todos;
      segments[i] = next;
      return { ...t, segments };
    },
  };
}

/**
 * Applies a single validated op to a trip, returning a new trip (the input is
 * never mutated) and the ops that undo it. Throws OpError.
 */
export function applyOp(trip: Trip, op: Op): Applied {
  switch (op.op) {
    case "add_segment": {
      if (trip.segments.some((s) => s.id === op.segment.id)) {
        throw new OpError("duplicate", `A segment with id "${op.segment.id}" already exists`);
      }
      const at = op.index === undefined ? trip.segments.length : Math.min(op.index, trip.segments.length);
      const segments = [...trip.segments.slice(0, at), op.segment, ...trip.segments.slice(at)];
      const links = new Set(op.blockedBy ?? []);
      for (const qid of links) findQuestion(trip, qid);
      const openQuestions = trip.openQuestions.map((q) =>
        links.has(q.id) && !q.blocks.includes(op.segment.id) ? { ...q, blocks: [...q.blocks, op.segment.id] } : q,
      );
      return {
        trip: { ...trip, segments, openQuestions },
        inverse: [{ op: "remove_segment", id: op.segment.id, confirmBooked: true }],
        description: `Add “${op.segment.title}” (${op.segment.kind}, ${when(op.segment.start)}, ${op.segment.status})`,
      };
    }

    case "remove_segment": {
      const [seg, i] = findSegment(trip, op.id);
      if (seg.status === "booked" && !op.confirmBooked) {
        throw new OpError("needs_confirmation", `“${seg.title}” is booked. Removing it needs confirmation.`);
      }
      const segments = trip.segments.filter((_, j) => j !== i);
      // Unlink from questions so none points at a missing segment; undo relinks.
      const blockedBy = trip.openQuestions.filter((q) => q.blocks.includes(seg.id)).map((q) => q.id);
      const openQuestions = trip.openQuestions.map((q) =>
        q.blocks.includes(seg.id) ? { ...q, blocks: q.blocks.filter((b) => b !== seg.id) } : q,
      );
      return {
        trip: { ...trip, segments, openQuestions },
        inverse: [{ op: "add_segment", segment: seg, index: i, ...(blockedBy.length ? { blockedBy } : {}) }],
        description: `Remove “${seg.title}”${seg.status === "booked" ? " (was booked)" : ""}`,
      };
    }

    case "update_segment": {
      const [seg, i] = findSegment(trip, op.id);
      const changes = op.changes as Patch;
      const timesChange = (["start", "end"] as const).some((k) => k in changes && changes[k] !== seg[k]);
      if (seg.status === "booked" && timesChange && !op.confirmBooked) {
        throw new OpError(
          "needs_confirmation",
          `“${seg.title}” is booked. Changing its times needs confirmation, and probably a call to whoever it's booked with.`,
        );
      }
      const before: Patch = {};
      const lines: string[] = [];
      for (const k of Object.keys(changes) as PatchField[]) {
        const old = (seg as unknown as Record<string, unknown>)[k];
        before[k] = old === undefined ? null : old;
        if (show(old) !== show(changes[k])) lines.push(`${k} ${show(old)} → ${show(changes[k])}`);
      }
      const segments = [...trip.segments];
      segments[i] = applyPatch(seg, changes);
      return {
        trip: { ...trip, segments },
        inverse: [{ op: "update_segment", id: op.id, changes: before as never, confirmBooked: true }],
        description: `Change “${seg.title}”: ${lines.join("; ") || "no visible change"}`,
      };
    }

    case "set_status": {
      const [seg, i] = findSegment(trip, op.id);
      const next: Segment = { ...seg, status: op.status };
      if (op.owner === null) delete next.owner;
      else if (op.owner !== undefined) next.owner = op.owner;
      const segments = [...trip.segments];
      segments[i] = next;
      const ownerNote = op.owner !== undefined && op.owner !== seg.owner ? `, owner ${show(seg.owner)} → ${show(op.owner)}` : "";
      return {
        trip: { ...trip, segments },
        inverse: [{ op: "set_status", id: seg.id, status: seg.status, owner: seg.owner ?? null }],
        description: `Mark “${seg.title}” ${op.status} (was ${seg.status})${ownerNote}`,
      };
    }

    case "add_todo": {
      const { list, label, set } = todoList(trip, op.target);
      const at = op.index === undefined ? list.length : Math.min(op.index, list.length);
      const next = [...list.slice(0, at), op.text, ...list.slice(at)];
      return {
        trip: set(trip, next),
        inverse: [{ op: "complete_todo", target: op.target, text: op.text }],
        description: `Add to-do for ${label}: “${op.text}”`,
      };
    }

    case "complete_todo": {
      const { list, label, set } = todoList(trip, op.target);
      const at = list.indexOf(op.text);
      if (at < 0) throw new OpError("not_found", `No to-do “${op.text}” on ${label}`);
      return {
        trip: set(trip, list.filter((_, j) => j !== at)),
        inverse: [{ op: "add_todo", target: op.target, text: op.text, index: at }],
        description: `Tick off for ${label}: “${op.text}”`,
      };
    }

    case "update_trip": {
      const c = op.changes;
      if (c.lastDay !== undefined && c.lastDay <= trip.firstDay) {
        throw new OpError("invalid", "The last day has to be after the first day.");
      }
      const before: { lastDay?: string; partySize?: number | null } = {};
      const lines: string[] = [];
      if (c.lastDay !== undefined) {
        before.lastDay = trip.lastDay;
        lines.push(`last day ${formatDay(trip.lastDay)} → ${formatDay(c.lastDay)}`);
      }
      if (c.partySize !== undefined) {
        before.partySize = trip.partySize;
        lines.push(`party size ${trip.partySize ?? "—"} → ${c.partySize ?? "—"}`);
      }
      return {
        trip: { ...trip, ...c },
        inverse: [{ op: "update_trip", changes: before }],
        description: `Change the trip: ${lines.join("; ")}`,
      };
    }

    case "resolve_question": {
      const [q, i] = findQuestion(trip, op.id);
      const next: OpenQuestion = { ...q };
      if (op.answer === null) delete next.answer;
      else next.answer = op.answer;
      const openQuestions = [...trip.openQuestions];
      openQuestions[i] = next;
      return {
        trip: { ...trip, openQuestions },
        inverse: [{ op: "resolve_question", id: q.id, answer: q.answer ?? null }],
        description:
          op.answer === null ? `Reopen “${q.question}”` : `Decide “${q.question}”: ${op.answer}`,
      };
    }
  }
}
