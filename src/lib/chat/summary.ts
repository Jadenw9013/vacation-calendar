import type { Trip } from "@/data/types";
import type { Op } from "@/lib/ops";
import { formatDay, formatTime, parseMoment } from "@/lib/time";

/*
 * The title on a proposal card, written by the server from the ops, never by
 * the model: the model's output is only the ops, which is shorter (faster)
 * and can't say something the ops don't do.
 */

const STATUS = { booked: "booked", "needs-booking": "not booked", undecided: "undecided" } as const;

function title(trip: Trip, id: string): string {
  return trip.segments.find((s) => s.id === id)?.title ?? trip.plan?.find((p) => p.id === id)?.title ?? trip.openQuestions.find((q) => q.id === id)?.question ?? id;
}

function when(m: string | null | undefined): string {
  if (!m) return "no set day";
  const p = parseMoment(m);
  return p.time ? `${formatDay(p.date)}, ${formatTime(p)}` : formatDay(p.date);
}

/** For rows: an unknown time says so, never left to look like it was stated. */
function whenTbd(m: string | null | undefined): string {
  if (!m) return "no set day";
  const p = parseMoment(m);
  return `${formatDay(p.date)}, ${p.time ? formatTime(p) : "time TBD"}`;
}

/** One op as a short title: "Add Hotel Aurora Antigua", "Move Jet skiing to Thu Nov 26, 3:00 PM". */
export function opTitle(op: Op, trip: Trip): string {
  switch (op.op) {
    case "add_segment":
      return `Add ${op.segment.title}`;
    case "update_segment": {
      const c = op.changes as Record<string, unknown>;
      const t = title(trip, op.id);
      if ("start" in c) return `Move ${t} to ${when(c.start as string | null)}`;
      if ("end" in c) return `Change when ${t} ends`;
      if ("status" in c) return `Mark ${t} as ${STATUS[c.status as keyof typeof STATUS]}`;
      if ("title" in c) return `Rename ${t}`;
      return `Change ${t}`;
    }
    case "remove_segment":
      return `Remove ${title(trip, op.id)}`;
    case "set_status": {
      const seg = trip.segments.find((s) => s.id === op.id);
      if (op.owner && seg?.status === op.status) return `${op.owner} is on ${title(trip, op.id)}`;
      return `Mark ${title(trip, op.id)} as ${STATUS[op.status]}`;
    }
    case "add_todo":
      return op.target === "trip" ? `Add to-do: ${op.text}` : `Add to-do for ${title(trip, op.target)}`;
    case "complete_todo":
      return `Done: ${op.text}`;
    case "resolve_question":
      return op.answer ? `Decide: ${title(trip, op.id).replace(/\?$/, "")}` : `Reopen: ${title(trip, op.id)}`;
    case "add_plan_item":
      return `Plan: ${op.item.title}`;
    case "update_plan_item":
      return "start" in (op.changes as Record<string, unknown>) ? `Move ${title(trip, op.id)} to ${when((op.changes as { start: string }).start)}` : `Change ${title(trip, op.id)}`;
    case "remove_plan_item":
      return `Take ${title(trip, op.id)} off the plan`;
    case "update_trip":
      return "Change trip settings";
  }
}

/** The card title for a whole proposal. */
export function summarizeOps(ops: Op[], trip: Trip): string {
  if (ops.length === 0) return "No changes";
  if (ops.length === 1) return opTitle(ops[0], trip);
  // A day plan: every op adds a step on the same day.
  const plans = ops.filter((o): o is Extract<Op, { op: "add_plan_item" }> => o.op === "add_plan_item");
  if (plans.length === ops.length) {
    const days = new Set(plans.map((p) => parseMoment(p.item.start).date));
    if (days.size === 1) return `Plan for ${formatDay([...days][0])}: ${ops.length} steps`;
  }
  return `${opTitle(ops[0], trip)}, and ${ops.length - 1} more change${ops.length > 2 ? "s" : ""}`;
}

export interface ChangeRow {
  verb: "Add" | "Change" | "Remove" | "Done" | "Decide";
  title: string;
  /** What it is now, for changes and removals. */
  before?: string;
  /** What it will be. */
  after?: string;
}

const KIND = { lodging: "stay", transport: "transport", activity: "activity", flight: "flight" } as const;

/** One row per op, before and after, written from the ops and the trip as it is now. */
export function opRows(ops: Op[], trip: Trip): ChangeRow[] {
  return ops.map((op): ChangeRow => {
    switch (op.op) {
      case "add_segment": {
        const s = op.segment;
        return { verb: "Add", title: s.title, after: [KIND[s.kind], whenTbd(s.start), STATUS[s.status], s.owner && `${s.owner} on it`].filter(Boolean).join(" · ") };
      }
      case "update_segment": {
        const seg = trip.segments.find((s) => s.id === op.id);
        const c = op.changes as Record<string, unknown>;
        const before: string[] = [];
        const after: string[] = [];
        const pair = (b: string, a: string) => {
          before.push(b);
          after.push(a);
        };
        if ("start" in c) pair(`starts ${whenTbd(seg?.start)}`, `starts ${whenTbd(c.start as string | null)}`);
        if ("end" in c) pair(`ends ${whenTbd(seg?.end)}`, `ends ${whenTbd(c.end as string | null)}`);
        if ("status" in c) pair(STATUS[seg?.status ?? "undecided"], STATUS[c.status as keyof typeof STATUS]);
        if ("title" in c) pair(`“${seg?.title}”`, `“${c.title}”`);
        if ("location" in c) pair(seg?.location ?? "no place", String(c.location ?? "no place"));
        if ("owner" in c) pair(seg?.owner ? `${seg.owner} on it` : "nobody on it", c.owner ? `${c.owner} on it` : "nobody on it");
        if ("notes" in c) pair("notes", "notes changed");
        return { verb: "Change", title: seg?.title ?? op.id, before: before.join(" · "), after: after.join(" · ") };
      }
      case "remove_segment": {
        const seg = trip.segments.find((s) => s.id === op.id);
        return { verb: "Remove", title: seg?.title ?? op.id, before: seg ? `${whenTbd(seg.start)} · ${STATUS[seg.status]}` : undefined };
      }
      case "set_status": {
        const seg = trip.segments.find((s) => s.id === op.id);
        const who = (o: string | null | undefined) => (o ? `${o} on it` : "nobody on it");
        return {
          verb: "Change",
          title: seg?.title ?? op.id,
          before: [STATUS[seg?.status ?? "undecided"], op.owner !== undefined && who(seg?.owner)].filter(Boolean).join(" · "),
          after: [STATUS[op.status], op.owner !== undefined && who(op.owner)].filter(Boolean).join(" · "),
        };
      }
      case "add_todo":
        return { verb: "Add", title: `To-do: ${op.text}`, after: op.target === "trip" ? "trip list" : `for ${title(trip, op.target)}` };
      case "complete_todo":
        return { verb: "Done", title: op.text };
      case "resolve_question":
        return { verb: "Decide", title: title(trip, op.id), after: op.answer ?? "reopened" };
      case "add_plan_item":
        return { verb: "Add", title: `Plan: ${op.item.title}`, after: `${whenTbd(op.item.start)}${op.item.tentative ? " · suggested time" : ""}` };
      case "update_plan_item": {
        const item = trip.plan?.find((p) => p.id === op.id);
        const c = op.changes as Record<string, unknown>;
        return {
          verb: "Change",
          title: item?.title ?? op.id,
          before: "start" in c ? whenTbd(item?.start) : undefined,
          after: "start" in c ? whenTbd(c.start as string) : "tentative" in c ? "time kept" : "details changed",
        };
      }
      case "remove_plan_item":
        return { verb: "Remove", title: `Plan: ${title(trip, op.id)}` };
      case "update_trip":
        return { verb: "Change", title: "Trip settings" };
    }
  });
}
