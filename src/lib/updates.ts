import type { Trip } from "@/data/types";
import type { ChangeEntry } from "./engine";
import type { Op } from "./ops";
import { formatDay, formatTime, parseMoment } from "./time";

/*
 * The change log as plain sentences for the Updates sheet:
 * "Sam moved “Jet skiing” to 3:00 PM, 10 minutes ago."
 */

/** The title an op is about, from the trip, else from the server's own line for it (which names removed things too). */
function titleOf(op: Op, trip: Trip, line: string | undefined): string {
  const id = "id" in op ? op.id : op.op === "add_segment" ? op.segment.id : op.op === "add_plan_item" ? op.item.id : null;
  const fromTrip = id ? (trip.segments.find((s) => s.id === id)?.title ?? trip.plan?.find((p) => p.id === id)?.title) : null;
  if (fromTrip) return fromTrip;
  const quoted = line?.match(/“([^”]+)”/)?.[1];
  return quoted ?? "an item";
}

function moved(start: string | null, previousDay?: string): string {
  if (!start) return "to no set day";
  const m = parseMoment(start);
  if (!m.time) return `to ${formatDay(m.date)}`;
  return previousDay === m.date ? `to ${formatTime(m)}` : `to ${formatDay(m.date)}, ${formatTime(m)}`;
}

const STATUS = { booked: "booked", "needs-booking": "not booked", undecided: "undecided" } as const;

/** One op as the end of a sentence that starts with a name: "moved “Jet skiing” to 3:00 PM". */
export function describeOpPlain(op: Op, trip: Trip, line?: string): string {
  const t = `“${titleOf(op, trip, line)}”`;
  switch (op.op) {
    case "add_segment":
      return op.segment.start ? `added ${t} on ${formatDay(parseMoment(op.segment.start).date)}` : `added ${t}`;
    case "remove_segment":
      return `removed ${t}`;
    case "update_segment": {
      const c = op.changes as Record<string, unknown>;
      const current = trip.segments.find((s) => s.id === op.id);
      if ("start" in c) return `moved ${t} ${moved(c.start as string | null, current?.start ? parseMoment(current.start).date : undefined)}`;
      if ("end" in c) return `changed when ${t} ends`;
      if ("title" in c) return `renamed it ${t}`;
      if ("status" in c) return `marked ${t} as ${STATUS[c.status as keyof typeof STATUS]}`;
      return `updated ${t}`;
    }
    case "set_status": {
      // Same status, new owner: someone claimed it, or let it go.
      const same = !!line?.includes(`${op.status} (was ${op.status})`);
      if (op.owner && same) return `is booking ${t}`;
      if (op.owner === null && same) return `isn't booking ${t} any more`;
      return `marked ${t} as ${STATUS[op.status]}`;
    }
    case "add_plan_item":
      return `added ${t} to the plan`;
    case "update_plan_item": {
      const c = op.changes as Record<string, unknown>;
      if ("start" in c) return `moved ${t} ${moved(c.start as string)}`;
      if ("tentative" in c) return `kept the time for ${t}`;
      return `updated ${t}`;
    }
    case "remove_plan_item":
      return `took ${t} off the plan`;
    case "add_todo":
      return `added a to-do: “${op.text}”`;
    case "complete_todo":
      return `ticked off “${op.text}”`;
    case "resolve_question":
      return op.answer ? `decided: ${op.answer}` : "reopened a question";
    case "update_trip":
      return "changed the trip settings";
  }
}

/** "Sam moved “Jet skiing” to 3:00 PM" (the time ago is added where it's shown). */
export function describeEntry(entry: ChangeEntry, trip: Trip): string {
  if (entry.undoOf) return `${entry.author} undid a change`;
  const parts = entry.ops.map((op, i) => describeOpPlain(op, trip, entry.summary[i]));
  const shown = parts.length > 3 ? [...parts.slice(0, 2), `made ${parts.length - 2} more changes`] : parts;
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : shown[0];
  return `${entry.author} ${joined}`;
}

/** "10 minutes ago", "yesterday", "just now". */
export function timeAgo(at: string, nowMs: number): string {
  const secs = Math.round((Date.parse(at) - nowMs) / 1000);
  if (Math.abs(secs) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const mins = Math.round(secs / 60);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** Ids of the segments and plan steps an entry changed. */
export function touchedIds(entry: ChangeEntry): string[] {
  return opsTouched(entry.ops);
}

/** Ids of the segments and plan steps a list of ops changes. */
export function opsTouched(ops: Op[]): string[] {
  return ops.flatMap((o) =>
    o.op === "add_segment" ? [o.segment.id] : o.op === "add_plan_item" ? [o.item.id] : "id" in o ? [o.id] : [],
  );
}

/** Changes by other people since this device last looked. Your own don't count. */
export function unread(entries: ChangeEntry[], seenMs: number, me: string): ChangeEntry[] {
  return entries.filter((e) => Date.parse(e.at) > seenMs && e.author !== me);
}

/** Item id → when someone else last changed it, for the "Updated" markers. */
export function changedSince(entries: ChangeEntry[], sinceMs: number, me: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of unread(entries, sinceMs, me)) {
    const at = Date.parse(e.at);
    for (const id of touchedIds(e)) out.set(id, Math.max(out.get(id) ?? 0, at));
  }
  return out;
}
