import type { Trip } from "@/data/types";
import { stillToBook } from "@/lib/derive";
import { agenda, dayStatuses, localDate, nowNext, tripDays, type AgendaRow } from "@/lib/now";
import { draftToSegment, type QuickDraft } from "@/lib/quickadd-draft";
import { addDays, formatDay, formatTime, parseMoment } from "@/lib/time";
import { classifyIntent } from "./intent";
import type { FlatOp } from "./proposal";

/*
 * Runs before the model on every message. Answers the schedule questions the
 * saved trip can answer exactly, turns a clean Quick Add line into a card,
 * and sends everything else to the model.
 *
 * When unsure, it chooses the model: a wrong local answer is worse than a
 * slow right one. Patterns are anchored and short, so anything with an extra
 * clause, a pasted block, an instruction or a change request falls through.
 */

export type Routed =
  | { kind: "local"; answer: string }
  | { kind: "quickadd"; draft: QuickDraft }
  | { kind: "model"; reason: string };

export interface RouteContext {
  trip: Trip;
  nowMs: number;
  /** The day on screen in Trip mode. */
  day?: string | null;
  images?: number;
  answeringQuestion?: boolean;
  /** "Ask the planner instead": skip local answers. */
  force?: boolean;
}

/** Things that must never be answered locally: instructions, pastes, edits. */
const UNSAFE = /\b(ignore|instruction|instructions|system|prompt|pretend|jailbreak|delete|remove|cancel|move|change|add|book|update|rename|mark|set)\b|[\n\r]|https?:\/\//i;

const strip = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[?.!]+$/, "")
    .trim();

const NEXT = /^(what'?s|what is|whats) (next|up next|coming up|on next)$/;
const ON_DAY = /^(what'?s|what is|whats|what are we doing|what do we have)( on| planned| happening)?( for)? (today|tonight|tomorrow)$/;
const UNBOOKED = /^(what'?s|what is|whats) (still )?(unbooked|not booked|left to book|still to book)$|^what (still )?needs (booking|to be booked)$/;
const SLEEP = /^where (do|are|will) we (sleep|sleeping|staying|stay)( (tonight|tomorrow( night)?|on (.+)))?$/;
const WHEN = /^when(?:'s| is| does) (?:the |our |we )?([a-z][a-z' -]{1,30}?)(?: start| leave)?$/;

function line(r: AgendaRow): string {
  const time = r.at ? formatTime(r.at) : "time TBD";
  const label = r.verb ? `${r.verb}: ${r.title}` : r.title;
  const status = r.status === "booked" ? "booked" : r.status === "needs-booking" ? "not booked" : r.status === "undecided" ? "undecided" : "plan";
  return `- ${time}: ${label}${r.zone ? ` (${r.zone})` : ""} (${status})`;
}

function dayAnswer(trip: Trip, date: string, label: string): string {
  const days = tripDays(trip);
  if (date < days[0] || date > days[days.length - 1]) {
    return `${label} (${formatDay(date)}) isn't a trip day. The trip runs ${formatDay(days[0])} to ${formatDay(days[days.length - 1])}.`;
  }
  const rows = agenda(trip, date);
  const sleep = dayStatuses(trip).find((d) => d.date === date);
  const lines = rows.length ? rows.map(line) : ["- Nothing booked or planned."];
  return [`${label}, ${formatDay(date)}:`, ...lines, `Sleeping: ${sleep?.sleepBooked ? sleep.sleep : "nowhere booked yet"}.`].join("\n");
}

function nextAnswer(trip: Trip, nowMs: number): string {
  const today = localDate(nowMs, trip.utcOffset);
  const days = tripDays(trip);
  if (today > days[days.length - 1]) return "The trip is over.";
  const day = today < days[0] ? days[0] : today;
  const n = nowNext(trip, day, nowMs);
  if (!n.row) return "Nothing else is booked or planned today.";
  const at = n.row.at ? `${formatTime(n.row.at)}${n.row.zone ? ` (${n.row.zone})` : ""}` : "time TBD";
  const place = n.row.place ? `, ${n.row.place}` : "";
  const status = n.row.status === "needs-booking" ? " Not booked yet." : n.row.status === "undecided" ? " Undecided." : "";
  const lead = today < days[0] ? `The trip starts ${formatDay(days[0])}. First up` : n.state === "now" ? "Now" : "Next";
  return `${lead}: ${n.row.verb ? `${n.row.verb}: ` : ""}${n.row.title}, ${formatDay(day)} at ${at}${place}${n.countdown && n.state !== "first" ? ` (${n.countdown})` : ""}.${status}`;
}

function unbookedAnswer(trip: Trip): string {
  const rows = stillToBook(trip);
  if (!rows.length) return "Everything is booked.";
  return [
    `Still to book (${rows.length}):`,
    ...rows.map(({ segment: s }) => `- ${s.title}: ${s.start ? formatDay(parseMoment(s.start).date) : "date not picked"} (${s.status === "undecided" ? "undecided" : "not booked"})`),
  ].join("\n");
}

function sleepAnswer(trip: Trip, date: string): string | null {
  const s = dayStatuses(trip).find((d) => d.date === date);
  if (!s) return null;
  return s.sleepBooked ? `The night of ${formatDay(date)}: ${s.sleep}.` : `The night of ${formatDay(date)}: nothing booked yet.`;
}

/** "when is the hike": every item whose title has all the words. More than three matches is too vague. */
function whenAnswer(trip: Trip, what: string): string | null {
  const words = what.split(/\s+/).filter((w) => w.length > 2 && !["the", "our", "and"].includes(w));
  if (!words.length) return null;
  const hits = trip.segments.filter((s) => s.start && words.every((w) => s.title.toLowerCase().includes(w)));
  if (hits.length === 0 || hits.length > 3) return null;
  return hits
    .map((s) => {
      const m = parseMoment(s.start!);
      return `${s.title}: ${formatDay(m.date)}, ${m.time ? `${formatTime(m)}${m.offset && m.offset !== trip.utcOffset ? " (Seattle time)" : ""}` : "time TBD"} (${s.status === "booked" ? "booked" : s.status === "needs-booking" ? "not booked" : "undecided"}).`;
    })
    .join("\n");
}

/**
 * A Quick Add line: short, no punctuation beyond times, no verb, no names,
 * fully understood, inside the trip. The date parser loads only for lines
 * that pass the cheap checks, so most requests never pay for it.
 */
async function quickAddable(raw: string, ctx: RouteContext): Promise<QuickDraft | null> {
  const t = raw.trim();
  if (t.length > 60 || !/^[\p{L}0-9 :'-]+$/u.test(t) || t.split(/\s+/).length > 7) return null;
  // No instructions, edit words or question words anywhere in it.
  if (UNSAFE.test(t) || /\b(what|when|where|why|how|who|which|whats|what's)\b/i.test(t)) return null;
  if (classifyIntent(t) === "edit") return null;
  const { parseQuickAdd } = await import("@/lib/quickadd");
  const parsed = parseQuickAdd(t, { trip: ctx.trip, nowMs: ctx.nowMs, selectedDay: ctx.day });
  if (parsed.type !== "draft" || parsed.missing.length || parsed.draft.outsideTrip) return null;
  // Only lines with a day or time in them: "cliff jumping" alone is a topic, not an instruction.
  if (parsed.draft.dayFrom !== "text" && !(parsed.draft.start && parsed.draft.start.length > 10)) return null;
  return parsed.draft;
}

export async function routeMessage(raw: string, ctx: RouteContext): Promise<Routed> {
  if (ctx.force) return { kind: "model", reason: "asked for the planner" };
  if (ctx.answeringQuestion) return { kind: "model", reason: "answer to the planner's question" };
  if ((ctx.images ?? 0) > 0) return { kind: "model", reason: "screenshot" };
  const t = strip(raw);
  if (!t) return { kind: "model", reason: "empty" };

  // Local answers: short, anchored questions only, never anything with an instruction or edit word.
  if (t.length <= 60 && !UNSAFE.test(t)) {
    const today = localDate(ctx.nowMs, ctx.trip.utcOffset);
    if (NEXT.test(t)) return { kind: "local", answer: nextAnswer(ctx.trip, ctx.nowMs) };
    const onDay = ON_DAY.exec(t);
    if (onDay) {
      const which = onDay[4];
      const date = which === "tomorrow" ? addDays(today, 1) : today;
      return { kind: "local", answer: dayAnswer(ctx.trip, date, which === "tomorrow" ? "Tomorrow" : "Today") };
    }
    if (UNBOOKED.test(t)) return { kind: "local", answer: unbookedAnswer(ctx.trip) };
    const sleep = SLEEP.exec(t);
    if (sleep) {
      let date: string | null = today;
      if (sleep[4]?.startsWith("tomorrow")) date = addDays(today, 1);
      else if (sleep[6]) {
        const chrono = await import("chrono-node");
        const ref = { instant: new Date(`${ctx.trip.firstDay}T00:00:00${ctx.trip.utcOffset}`), timezone: -360 };
        const hit = chrono.parse(sleep[6], ref, { forwardDate: true })[0];
        date = hit && hit.start.isCertain("day") ? `${hit.start.get("year")}-${String(hit.start.get("month")).padStart(2, "0")}-${String(hit.start.get("day")).padStart(2, "0")}` : null;
      }
      const answer = date ? sleepAnswer(ctx.trip, date) : null;
      if (answer) return { kind: "local", answer };
      return { kind: "model", reason: "sleep question outside the trip or unclear day" };
    }
    const when = WHEN.exec(t);
    if (when) {
      const answer = whenAnswer(ctx.trip, when[1]);
      if (answer) return { kind: "local", answer };
      return { kind: "model", reason: "no clear item for when" };
    }
  }

  const draft = await quickAddable(raw, ctx);
  if (draft) return { kind: "quickadd", draft };
  return { kind: "model", reason: classifyIntent(raw) === "edit" ? "edit" : "not a schedule question" };
}

/** The new segment for a Quick Add route, as the same op shape the model sends, so it's validated the same way. */
export function quickAddOps(draft: QuickDraft): (FlatOp & { segment: { id: string } })[] {
  const s = draftToSegment(draft, "needs-booking");
  return [
    {
      op: "add_segment",
      segment: { id: s.id, kind: s.kind, title: s.title, status: s.status, location: s.location, ...(s.start ? { start: s.start } : {}), ...(s.end ? { end: s.end } : {}) },
    },
  ];
}
