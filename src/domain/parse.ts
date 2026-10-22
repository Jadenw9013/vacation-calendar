import * as chrono from "chrono-node";
import { extractUrls } from "./links";
import { offsetOn, todayIn } from "./time";
import type { ItemKind, Trip, When } from "./types";

/*
 * The one box: "zipline thu 11am", "dinner 7 at Sabe Rico", a pasted link, or
 * a question. Parsed on the device, so adding works with no signal and no AI.
 * When it has to guess (morning or evening), it guesses and shows the guess
 * in the preview instead of asking.
 */

export interface Draft {
  title: string;
  kind: ItemKind;
  /** Missing: saved as an idea with no day. */
  start?: When;
  end?: When;
  /** "Sabe Rico" from "dinner at Sabe Rico". */
  placeName?: string;
  /** Where the day came from: the words typed, or the day on screen. */
  dayFrom: "text" | "selected" | null;
  /** AM/PM wasn't said; the preview should show the guess. */
  guessedTime: boolean;
  /** The day is outside the trip's dates. */
  outsideTrip: boolean;
}

export type Parsed =
  | { type: "empty" }
  /** A question or a change request: the assistant's job. */
  | { type: "ask" }
  /** Contains links: save them (with any words around them as the title or note). */
  | { type: "links"; urls: string[]; rest: string }
  | { type: "item"; draft: Draft };

export interface ParseContext {
  trip: Pick<Trip, "startDate" | "endDate" | "tz">;
  nowMs: number;
  /** The day on screen, if any: "11am" with no day means that day. */
  day?: string | null;
}

const QUESTION =
  /^(what|what's|whats|when|where|who|why|how|which|is|are|do|does|did|can|could|should|would|will|any|anything|find|suggest|recommend|plan|help|tell|show|compare|explain|translate)\b/i;
const CHANGE = /^(move|change|reschedule|push|shift|cancel|delete|remove|rename|update|swap|switch|replace|undo|mark|make|set)\b/i;

const KIND_WORDS: [RegExp, ItemKind][] = [
  [/\b(flight|fly|flying|airline|[A-Z]{2} ?\d{2,4})\b/, "flight"],
  [/\b(shuttle|transfer|taxi|uber|bus|boat|ferry|lancha|tuk ?tuk|drive|pickup|pick-up|train|car rental|rental car)\b/i, "transport"],
  [/\b(hotel|airbnb|hostel|lodge|guesthouse|posada|stay|check[- ]?in|resort|camping)\b/i, "stay"],
  [/\b(dinner|lunch|breakfast|brunch|coffee|cafe|café|restaurant|drinks|bar|eat|food|tacos|pupusas|bakery|market)\b/i, "food"],
];

export function guessKind(text: string): ItemKind {
  for (const [re, kind] of KIND_WORDS) if (re.test(text)) return kind;
  return "activity";
}

/** AM or PM when nobody said: meals decide it, else small hours are afternoon. */
function guessHour(hour: number, text: string): number {
  if (hour >= 12) return hour;
  if (/\b(dinner|drinks|bar|supper|party|show|concert)\b/i.test(text)) return hour === 12 ? 12 : hour + 12;
  if (/\b(breakfast|brunch|coffee|sunrise)\b/i.test(text)) return hour;
  if (/\blunch\b/i.test(text)) return hour <= 5 ? hour + 12 : hour;
  return hour >= 1 && hour <= 6 ? hour + 12 : hour;
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAY_WORDS = /\b(today|tonight|tomorrow|this (morning|afternoon|evening))\b/i;
const BARE_HOUR = /(?:^|\s)(?:at\s+)?(1[0-2]|0?[1-9])(?::([0-5]\d))?(?=\s|$)/i;

function cleanTitle(rest: string): string {
  const t = rest
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(at|on|from|for|by|this|next|the|around|until|till)$/i, "")
    .replace(/^(at|on|from|for|by)\s+/i, "")
    .replace(/[,.;:-]+$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

/** "dinner at Sabe Rico" → "Sabe Rico". Only a capitalised or multi-word name, never "at home". */
function placeFrom(title: string): string | undefined {
  const m = /\b(?:at|@)\s+(.{3,80})$/i.exec(title);
  if (!m) return undefined;
  const name = m[1].trim();
  if (/^(home|the hotel|the airbnb|night|noon|midnight)$/i.test(name)) return undefined;
  return name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** The day "thu" and "11am" are counted from: the day on screen, today during the trip, else the first day. */
export function referenceDay({ trip, nowMs, day }: ParseContext): string {
  if (day) return day;
  const today = todayIn(trip.tz, nowMs);
  return today < trip.startDate || today > trip.endDate ? trip.startDate : today;
}

export function parseLine(input: string, ctx: ParseContext): Parsed {
  const text = input.trim();
  if (!text) return { type: "empty" };
  const urls = extractUrls(text);
  if (urls.length) {
    let rest = text;
    for (const u of urls) rest = rest.replace(u, " ");
    return { type: "links", urls, rest: rest.replace(/\s+/g, " ").trim() };
  }
  if (text.endsWith("?") || QUESTION.test(text) || CHANGE.test(text) || text.length > 120 || text.includes("\n")) return { type: "ask" };

  const ref = referenceDay(ctx);
  const tz = ctx.trip.tz;
  const instant = new Date(Date.parse(`${ref}T00:00:00Z`) - offsetOn(ref, tz) * 60_000);
  const [hit] = chrono.parse(text, { instant, timezone: offsetOn(ref, tz) }, { forwardDate: true });

  let rest = hit ? `${text.slice(0, hit.index)} ${text.slice(hit.index + hit.text.length)}` : text;
  const said = (hit?.text ?? "").toLowerCase();
  const c = hit?.start;
  const kind = guessKind(text);

  let date: string | null = null;
  let dayFrom: Draft["dayFrom"] = null;
  if (c && (c.isCertain("day") || c.isCertain("weekday") || c.isCertain("month") || DAY_WORDS.test(said))) {
    date = `${c.get("year")}-${pad(c.get("month")!)}-${pad(c.get("day")!)}`;
    dayFrom = "text";
  } else if (ctx.day) {
    date = ctx.day;
    dayFrom = "selected";
  }

  let time: string | undefined;
  let guessedTime = false;
  if (c?.isCertain("hour")) {
    let h = c.get("hour")!;
    if (!c.isCertain("meridiem") && !/\b(noon|midday|midnight)\b/.test(said)) {
      guessedTime = h < 12;
      h = guessHour(h, text);
    }
    time = `${pad(h)}:${pad(c.get("minute") ?? 0)}`;
  } else {
    // "dinner 7" or "at 7:30": chrono leaves a lone number alone.
    const bare = BARE_HOUR.exec(rest);
    if (bare) {
      const h = guessHour(Number(bare[1]), text);
      time = `${pad(h)}:${bare[2] ?? "00"}`;
      guessedTime = true;
      rest = rest.replace(bare[0], " ");
    }
  }
  // A time with no day at all: the reference day.
  if (time && !date) {
    date = ref;
    dayFrom = "selected";
  }

  let end: When | undefined;
  const e = hit?.end;
  if (date && e) {
    const endDate = e.isCertain("day") || e.isCertain("weekday") ? `${e.get("year")}-${pad(e.get("month")!)}-${pad(e.get("day")!)}` : date;
    end = { date: endDate, ...(e.isCertain("hour") ? { time: `${pad(e.get("hour")!)}:${pad(e.get("minute") ?? 0)}` } : {}) };
  }

  let title = cleanTitle(rest);
  const placeName = placeFrom(title);
  if (placeName) title = title.replace(/(\b(?:at|@)\s+).{3,80}$/i, `$1${placeName}`);
  const outsideTrip = !!date && (date < ctx.trip.startDate || date > ctx.trip.endDate);
  return {
    type: "item",
    draft: {
      title,
      kind,
      ...(date ? { start: { date, ...(time ? { time } : {}) } } : {}),
      ...(end ? { end } : {}),
      placeName,
      dayFrom,
      guessedTime,
      outsideTrip,
    },
  };
}
