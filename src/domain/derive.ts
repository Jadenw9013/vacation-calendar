import { addDays, dayRange, instantOf, todayIn, zonedInstant } from "./time";
import type { Item, Money, Trip, When } from "./types";

/*
 * Everything worked out from the trip rather than stored: days, nights, what
 * a day looks like, what's next, what's left to book. Nothing here nags by
 * itself; screens decide what to show and when.
 */

export function tripDays(trip: Trip): string[] {
  return dayRange(trip.startDate, trip.endDate);
}

/** The nights: first day through the night before the day you go home. */
export function tripNights(trip: Trip): string[] {
  return dayRange(trip.startDate, addDays(trip.endDate, -1));
}

const sleepsIn = (i: Item) => (i.kind === "stay" || i.sleepsHere === true) && !i.maybe;

/** A stay (or an overnight activity) covers the night of `date` by calendar date. */
function coversNight(i: Item, date: string): boolean {
  if (!i.start) return false;
  const from = i.start.date;
  const to = i.end?.date ?? addDays(from, 1);
  return from === to ? from === date : from <= date && date < to;
}

/** A flight in the air across local midnight takes care of that night too. */
function flyingOvernight(i: Item, date: string, tz: string): boolean {
  if (i.kind !== "flight" || !i.start?.time || !i.end?.time) return false;
  const a = instantOf(i.start, tz)!;
  const b = instantOf(i.end, tz)!;
  const midnight = zonedInstant(addDays(date, 1), "00:00", tz);
  return a < midnight && b > midnight;
}

export interface Night {
  date: string;
  /** Where you sleep, if anywhere is planned. */
  stay: Item | null;
}

export function nights(trip: Trip): Night[] {
  return tripNights(trip).map((date) => ({
    date,
    stay: trip.items.find((i) => (sleepsIn(i) && coversNight(i, date)) || flyingOvernight(i, date, trip.tz)) ?? null,
  }));
}

export function stayOn(trip: Trip, date: string): Item | null {
  return nights(trip).find((n) => n.date === date)?.stay ?? null;
}

/** Which night of a stay this is: "night 2 of 3". */
export function nightOf(stay: Item, date: string): { night: number; of: number } | null {
  if (!stay.start) return null;
  const from = stay.start.date;
  const to = stay.end?.date ?? addDays(from, 1);
  const of = Math.max(1, dayRange(from, addDays(to, -1)).length);
  const night = dayRange(from, date).length;
  return night >= 1 && night <= of ? { night, of } : null;
}

// ---------------------------------------------------------------------------
// A day

export type RowPart = "start" | "end";

export interface Row {
  key: string;
  item: Item;
  /** "end" rows are checkouts, landings and returns on a later day. */
  part: RowPart;
  when: When;
  /** Epoch ms, or null when only the day is known. */
  at: number | null;
}

/** "Check out", "Land", "Back from"; null for a plain start row. */
export function rowVerb(row: Row): string | null {
  if (row.part === "start") return row.item.kind === "stay" ? "Check in" : null;
  if (row.item.kind === "stay") return "Check out";
  if (row.item.kind === "flight") return "Land";
  return "Back from";
}

/** Everything on a day: timed rows in time order, then the ones with no time yet. */
export function dayRows(trip: Trip, date: string): Row[] {
  const rows: Row[] = [];
  for (const item of trip.items) {
    if (!item.start) continue;
    if (item.start.date === date) rows.push({ key: `${item.id}:start`, item, part: "start", when: item.start, at: instantOf(item.start, trip.tz) });
    const end = item.end;
    if (end && end.date === date && end.date !== item.start.date && item.kind !== "food") {
      rows.push({ key: `${item.id}:end`, item, part: "end", when: end, at: instantOf(end, trip.tz) });
    }
  }
  return rows.sort((a, b) => {
    if (a.at !== null && b.at !== null) return a.at - b.at;
    if (a.at !== null) return -1;
    if (b.at !== null) return 1;
    // Untimed: checkouts first, check-ins last, the rest by title.
    const rank = (r: Row) => (r.part === "end" ? 0 : r.item.kind === "stay" ? 2 : 1);
    return rank(a) - rank(b) || a.item.title.localeCompare(b.item.title);
  });
}

/** Items with no day yet: saved ideas. */
export function ideas(trip: Trip): Item[] {
  return trip.items.filter((i) => !i.start);
}

// ---------------------------------------------------------------------------
// Now and next

export interface NowNext {
  /** Happening right now (started, not yet ended). */
  now: Row | null;
  /** The next timed thing today, or tomorrow's first if today is done. */
  next: Row | null;
  /** Minutes until `next` starts. */
  minutesToNext: number | null;
}

export function nowNext(trip: Trip, date: string, nowMs: number): NowNext {
  const rows = dayRows(trip, date).filter((r) => r.at !== null);
  let now: Row | null = null;
  for (const r of rows) {
    if (r.part !== "start" || r.at! > nowMs) continue;
    const end = r.item.end ? instantOf(r.item.end, trip.tz) : null;
    if (end !== null && end > nowMs && r.item.kind !== "stay") now = r;
  }
  const next = rows.find((r) => r.at! > nowMs && r !== now) ?? null;
  return { now, next, minutesToNext: next ? Math.round((next.at! - nowMs) / 60_000) : null };
}

/** The day to open on: today during the trip, else the first day. */
export function initialDay(trip: Trip, nowMs: number): string {
  const today = todayIn(trip.tz, nowMs);
  if (today < trip.startDate || today > trip.endDate) return trip.startDate;
  return today;
}

export type Phase = "before" | "during" | "after";

export function phase(trip: Trip, nowMs: number): Phase {
  const today = todayIn(trip.tz, nowMs);
  if (today < trip.startDate) return "before";
  if (today > trip.endDate) return "after";
  return "during";
}

// ---------------------------------------------------------------------------
// Things to sort out

/** Items someone said need booking, soonest first; ideas last. */
export function toBook(trip: Trip): Item[] {
  return trip.items
    .filter((i) => i.booking?.state === "todo")
    .sort((a, b) => (a.start?.date ?? "9999").localeCompare(b.start?.date ?? "9999") || a.title.localeCompare(b.title));
}

export type Missing =
  | { kind: "nights"; from: string; to: string; count: number }
  | { kind: "flight-home" };

/** Nights with nowhere to sleep (runs merged), and the flight home if there's a flight out but none back. */
export function missing(trip: Trip): Missing[] {
  const out: Missing[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push({ kind: "nights", from: run[0], to: run[run.length - 1], count: run.length });
    run = [];
  };
  for (const n of nights(trip)) {
    if (n.stay) flush();
    else run.push(n.date);
  }
  flush();

  const flights = trip.items.filter((i) => i.kind === "flight" && !i.maybe);
  const out_ = flights.some((f) => f.start && f.start.date <= trip.startDate);
  const back = flights.some((f) => f.start && f.start.date >= addDays(trip.endDate, -1));
  if (out_ && !back) out.push({ kind: "flight-home" });
  return out;
}

/** Booked and quoted prices, added up per currency. */
export function costs(trip: Trip): { currency: string; booked: number; toBook: number }[] {
  const by = new Map<string, { booked: number; toBook: number }>();
  for (const i of trip.items) {
    const p: Money | undefined = i.booking?.price;
    if (!p) continue;
    const row = by.get(p.currency) ?? { booked: 0, toBook: 0 };
    if (i.booking!.state === "booked") row.booked += p.amount;
    else row.toBook += p.amount;
    by.set(p.currency, row);
  }
  return [...by].map(([currency, v]) => ({ currency, ...v }));
}
