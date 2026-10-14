import * as chrono from "chrono-node";
import type { Trip } from "@/data/types";
import { localDate, tripDays } from "./now";

/*
 * Quick Add: "zipline thu 11am" → a new item, parsed on the device with no
 * model involved. Anything it can't read for certain it leaves blank and says
 * so; questions and change requests go to the planner instead.
 */

import type { Missing, QuickDraft } from "./quickadd-draft";

export { draftToSegment, missingPrompt } from "./quickadd-draft";
export type { Missing, QuickDraft, QuickKind, QuickStatus } from "./quickadd-draft";

export type QuickParse =
  | { type: "empty" }
  /** Not something to add: send it to the planner. */
  | { type: "ask"; reason: "question" | "change" | "ambiguous-time"; message: string }
  | { type: "draft"; draft: QuickDraft; missing: Missing[] };

export interface QuickContext {
  trip: Trip;
  nowMs: number;
  /** The day selected in Trip mode, if any. Words like "thu" and "11am" resolve around it. */
  selectedDay?: string | null;
}

const QUESTION = /^(what|what's|whats|when|where|who|why|how|which|is|are|do|does|did|can|could|should|would|will|any|anything)\b/i;
const CHANGE = /^(move|change|reschedule|push|shift|cancel|delete|remove|rename|update|swap|switch|replace|undo|mark|make|set)\b/i;

const LODGING = /\b(hotel|airbnb|stay|night|nights|hostel|lodge|guesthouse|posada)\b/i;
const TRANSPORT = /\b(shuttle|transfer|taxi|uber|flight|fly|bus|boat|ferry|lancha|tuk ?tuk|drive|pickup|pick-up)\b/i;

/** A bare hour with no am/pm ("dinner 7", "drinks at 8:30"): could be morning or evening. */
const BARE_HOUR = /(?:^|\s)(?:at\s+)?(1[0-2]|0?[1-9])(?::[0-5]\d)?(?=\s|$)/i;

/** Transport words win: "hotel pickup" is a ride, not a bed. */
export function guessKind(text: string): QuickDraft["kind"] {
  if (TRANSPORT.test(text)) return "transport";
  if (LODGING.test(text)) return "lodging";
  return "activity";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** chrono's parsed components as an IsoMoment at a fixed offset: never the machine's zone. */
function toMoment(c: chrono.ParsedComponents, offset: string, withTime: boolean): string {
  const date = `${c.get("year")}-${pad(c.get("month")!)}-${pad(c.get("day")!)}`;
  return withTime ? `${date}T${pad(c.get("hour")!)}:${pad(c.get("minute") ?? 0)}:00${offset}` : date;
}

/** Words that name a day without a date: "tonight" and "this afternoon" are today. */
const DAY_WORDS = /\b(today|tonight|tomorrow|this (morning|afternoon|evening))\b/i;

function hasDay(c: chrono.ParsedComponents, said: string): boolean {
  return c.isCertain("day") || c.isCertain("weekday") || c.isCertain("month") || DAY_WORDS.test(said);
}

function cleanTitle(rest: string): string {
  const t = rest
    .replace(/\s+/g, " ")
    .trim()
    // Words left dangling where the date was: "dinner at", "hike on", "stay from".
    .replace(/\s+(at|on|from|for|by|this|next|the|around|until|till)$/i, "")
    .replace(/^(at|on|from|for|by)\s+/i, "")
    .replace(/[,.;:-]+$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** The day "thu" and "11am" are relative to: the selected day, else today during the trip, else the trip's first day. */
export function referenceDay({ trip, nowMs, selectedDay }: QuickContext): string {
  if (selectedDay) return selectedDay;
  const today = localDate(nowMs, trip.utcOffset);
  const days = tripDays(trip);
  return today < days[0] ? days[0] : today;
}

export function parseQuickAdd(input: string, ctx: QuickContext): QuickParse {
  const text = input.trim();
  if (!text) return { type: "empty" };
  if (text.endsWith("?") || QUESTION.test(text)) {
    return { type: "ask", reason: "question", message: "That sounds like a question. Ask the planner instead." };
  }
  if (CHANGE.test(text)) {
    return { type: "ask", reason: "change", message: "That's a change to something already planned. Ask the planner, or use the item's menu." };
  }

  const offset = ctx.trip.utcOffset;
  const ref = referenceDay(ctx);
  // Midnight of the reference day, so "thu" and "11am" land on or after it.
  const instant = new Date(`${ref}T00:00:00${offset}`);
  const tz = (offset.startsWith("-") ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
  const [hit] = chrono.parse(text, { instant, timezone: tz }, { forwardDate: true });

  const rest = hit ? text.slice(0, hit.index) + " " + text.slice(hit.index + hit.text.length) : text;
  const startC = hit?.start;
  const hourCertain = !!startC?.isCertain("hour");
  const said = (hit?.text ?? "").toLowerCase();
  const noonOrMidnight = /\b(noon|midday|midnight)\b/.test(said);

  // "dinner 7" or "at 7:30" with no am/pm: don't pick a half of the day for them.
  const bareInRest = BARE_HOUR.test(rest);
  const bareInHit = hourCertain && !startC!.isCertain("meridiem") && !noonOrMidnight && startC!.get("hour")! < 12;
  if (bareInRest || bareInHit) {
    return { type: "ask", reason: "ambiguous-time", message: "Morning or evening? Add am or pm, like “dinner 7pm”." };
  }

  const title = cleanTitle(rest);
  const kind = guessKind(text);

  let start: string | null = null;
  let end: string | null = null;
  let dayFrom: QuickDraft["dayFrom"] = null;

  if (startC && hasDay(startC, said)) {
    start = toMoment(startC, offset, hourCertain);
    dayFrom = "text";
    if (hit!.end && hasDay(hit!.end, said)) end = toMoment(hit!.end, offset, hit!.end.isCertain("hour"));
    else if (hit!.end?.isCertain("hour")) end = toMoment(hit!.end, offset, true);
  } else if (ctx.selectedDay) {
    // A time with no day, or no date words at all: the day on screen, labelled as such.
    const day = ctx.selectedDay;
    start = hourCertain ? `${day}T${pad(startC!.get("hour")!)}:${pad(startC!.get("minute") ?? 0)}:00${offset}` : day;
    dayFrom = "selected";
    if (hit?.end?.isCertain("hour")) end = `${day}T${pad(hit.end.get("hour")!)}:${pad(hit.end.get("minute") ?? 0)}:00${offset}`;
  }

  const days = tripDays(ctx.trip);
  const date = start?.slice(0, 10);
  const outsideTrip = !!date && (date < days[0] || date > days[days.length - 1]);

  const missing: Missing[] = [];
  if (!title) missing.push("title");
  if (!start) missing.push("day");

  return { type: "draft", draft: { title, kind, start, end, dayFrom, outsideTrip }, missing };
}
