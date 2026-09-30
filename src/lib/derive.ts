import type { OpenQuestion, PlanItem, Segment, Trip } from "@/data/types";
import {
  addDays,
  dayRange,
  daysBetween,
  formatDay,
  formatDuration,
  formatMoment,
  isValidMoment,
  parseMoment,
  type Moment,
} from "./time";

/** Transport windows longer than this with nothing booked are flagged. */
export const TRANSPORT_GAP_MINUTES = 90;

// ---------------------------------------------------------------------------
// Validation

/** Returns human-readable problems with the data file. Empty means OK. */
export function validateTrip(trip: Trip): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const s of trip.segments) {
    if (ids.has(s.id)) errors.push(`Duplicate segment id "${s.id}"`);
    ids.add(s.id);
    for (const [field, value] of [
      ["start", s.start],
      ["end", s.end],
    ] as const) {
      if (value !== null && !isValidMoment(value)) {
        errors.push(`Segment "${s.id}": ${field} "${value}" is not YYYY-MM-DD or a datetime with offset`);
      }
    }
    if (s.start && s.end && isValidMoment(s.start) && isValidMoment(s.end)) {
      const a = parseMoment(s.start);
      const b = parseMoment(s.end);
      const backwards = a.instant !== null && b.instant !== null ? b.instant < a.instant : b.date < a.date;
      if (backwards) errors.push(`Segment "${s.id}": end is before start`);
    }
    if (s.status === "booked" && s.start === null) {
      errors.push(`Segment "${s.id}": booked but has no start date`);
    }
  }
  const pids = new Set<string>();
  for (const p of trip.plan ?? []) {
    if (pids.has(p.id)) errors.push(`Duplicate plan item id "${p.id}"`);
    pids.add(p.id);
    for (const [field, value] of [
      ["start", p.start],
      ["end", p.end ?? null],
    ] as const) {
      if (value !== null && !isValidMoment(value)) errors.push(`Plan item "${p.id}": ${field} "${value}" is not a valid date or time`);
    }
  }
  const qids = new Set<string>();
  for (const q of trip.openQuestions) {
    if (qids.has(q.id)) errors.push(`Duplicate question id "${q.id}"`);
    qids.add(q.id);
    for (const b of q.blocks) {
      if (!ids.has(b)) errors.push(`Question "${q.id}" blocks unknown segment "${b}"`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Nights

export interface NightStatus {
  /** The night that starts on the evening of this date. */
  date: string;
  /** The booked segment you sleep in (or fly through) that night, if any. */
  booked: Segment | null;
  /** Unbooked placeholders that would cover this night. */
  planned: Segment[];
}

function sleepsThere(s: Segment): boolean {
  return s.kind === "lodging" || s.includesLodging === true;
}

/** Lodging-type segment spans the night of `date` by calendar date. */
function spansNight(s: Segment, date: string): boolean {
  if (!s.start || !s.end) return false;
  return parseMoment(s.start).date <= date && parseMoment(s.end).date > date;
}

/** A flight in the air across local midnight also takes care of that night. */
function flyingThroughNight(s: Segment, date: string, utcOffset: string): boolean {
  if (s.kind !== "flight" || !s.start || !s.end) return false;
  const a = parseMoment(s.start).instant;
  const b = parseMoment(s.end).instant;
  if (a === null || b === null) return false;
  const midnight = Date.parse(`${addDays(date, 1)}T00:00:00${utcOffset}`);
  return a < midnight && b > midnight;
}

/** The nights of the trip: first day through the night before the last day. */
export function tripNights(trip: Trip): string[] {
  return dayRange(trip.firstDay, addDays(trip.lastDay, -1));
}

export function nightCoverage(trip: Trip): NightStatus[] {
  return tripNights(trip).map((date) => {
    const booked =
      trip.segments.find(
        (s) =>
          s.status === "booked" &&
          ((sleepsThere(s) && spansNight(s, date)) || flyingThroughNight(s, date, trip.utcOffset)),
      ) ?? null;
    const planned = trip.segments.filter((s) => s.status !== "booked" && sleepsThere(s) && spansNight(s, date));
    return { date, booked, planned };
  });
}

// ---------------------------------------------------------------------------
// Gaps

export type GapKind = "night" | "transport" | "return";

export interface Gap {
  id: string;
  kind: GapKind;
  /** What is missing. */
  title: string;
  /** Which night or window. */
  window: string;
  /** How long, human readable. "unknown" when a bound has no time yet. */
  duration: string;
  /** Extra context, e.g. which segments the window sits between. */
  detail?: string;
  /** Unbooked placeholder segments that would fill this gap. */
  related: string[];
  /** Date the gap starts, for ordering and grouping. null = after the timeline. */
  date: string | null;
}

function nightGaps(trip: Trip): Gap[] {
  const gaps: Gap[] = [];
  let run: NightStatus[] = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0].date;
    const last = run[run.length - 1].date;
    const n = run.length;
    const related = [...new Set(run.flatMap((r) => r.planned.map((p) => p.id)))];
    gaps.push({
      id: `night-${first}`,
      kind: "night",
      title: "Nowhere to sleep",
      window: n === 1 ? `Night of ${formatDay(first)}` : `Nights of ${formatDay(first)} – ${formatDay(last)}`,
      duration: n === 1 ? "1 night" : `${n} nights`,
      related,
      date: first,
    });
    run = [];
  };
  for (const night of nightCoverage(trip)) {
    if (night.booked) flush();
    else run.push(night);
  }
  flush();
  return gaps;
}

interface Bound {
  seg: Segment;
  start: Moment;
  end: Moment;
  /** Sort keys; a date-only moment is treated as the start (or end) of that day. */
  startKey: number;
  endKey: number;
}

function toBound(s: Segment, utcOffset: string): Bound | null {
  if (!s.start) return null;
  const start = parseMoment(s.start);
  const end = parseMoment(s.end ?? s.start);
  const key = (m: Moment, time: string) => m.instant ?? Date.parse(`${m.date}T${time}${utcOffset}`);
  return { seg: s, start, end, startKey: key(start, "00:00:00"), endKey: key(end, "23:59:59") };
}

function transportGaps(trip: Trip): Gap[] {
  const bounds = trip.segments
    .filter((s) => s.status === "booked")
    .map((s) => toBound(s, trip.utcOffset))
    .filter((b): b is Bound => b !== null)
    .sort((a, b) => a.startKey - b.startKey);

  const gaps: Gap[] = [];
  let latest: Bound | null = null; // the booked segment that ends last so far
  for (const next of bounds) {
    if (latest && next.startKey > latest.endKey) {
      const prev = latest;
      const bridged = prev.seg.kind === "transport" || next.seg.kind === "transport";
      const known = prev.end.instant !== null && next.start.instant !== null;
      const minutes = known ? Math.round((next.start.instant! - prev.end.instant!) / 60_000) : null;
      const flagged = !bridged && (minutes === null || minutes > TRANSPORT_GAP_MINUTES);
      if (flagged) {
        const related = trip.segments
          .filter(
            (s) =>
              s.status !== "booked" &&
              s.kind === "transport" &&
              s.start !== null &&
              parseMoment(s.start).date >= prev.end.date &&
              parseMoment(s.start).date <= next.start.date,
          )
          .map((s) => s.id);
        gaps.push({
          id: `transport-${prev.seg.id}-${next.seg.id}`,
          kind: "transport",
          title: "No transport booked",
          window: `${formatMoment(prev.end)} → ${formatMoment(next.start)}`,
          duration: minutes === null ? "unknown" : formatDuration(minutes),
          detail: `Between “${prev.seg.title}” and “${next.seg.title}”`,
          related,
          date: prev.end.date,
        });
      }
    }
    if (!latest || next.endKey > latest.endKey) latest = next;
  }
  return gaps;
}

function returnGap(trip: Trip): Gap[] {
  const booked = trip.segments
    .filter((s) => s.status === "booked")
    .map((s) => toBound(s, trip.utcOffset))
    .filter((b): b is Bound => b !== null)
    .sort((a, b) => a.startKey - b.startKey);
  const last = booked[booked.length - 1];
  // The outbound flight alone doesn't count: a booked flight home is a flight that comes last, after other bookings.
  if (!last || (last.seg.kind === "flight" && booked.length > 1)) return [];
  const related = trip.segments.filter((s) => s.status !== "booked" && s.kind === "flight").map((s) => s.id);
  return [
    {
      id: "return",
      kind: "return",
      title: `No flight home to ${trip.homeAirport}`,
      window: `After ${formatMoment(last.end)}`,
      duration: "unknown",
      detail: `Last booked: “${last.seg.title}”`,
      related,
      date: null,
    },
  ];
}

/** All derived gaps in chronological order, the missing return flight last. */
export function computeGaps(trip: Trip): Gap[] {
  const dated = [...nightGaps(trip), ...transportGaps(trip)].sort((a, b) =>
    a.date! === b.date! ? (a.kind === "night" ? 1 : -1) : a.date! < b.date! ? -1 : 1,
  );
  return [...dated, ...returnGap(trip)];
}

// ---------------------------------------------------------------------------
// Still to book

export interface ToBook {
  segment: Segment;
  blockedBy: OpenQuestion[];
}

export function stillToBook(trip: Trip): ToBook[] {
  return trip.segments
    .filter((s) => s.status !== "booked")
    .sort((a, b) => {
      if (a.start === b.start) return 0;
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return parseMoment(a.start).date < parseMoment(b.start).date ? -1 : 1;
    })
    .map((segment) => ({
      segment,
      blockedBy: unanswered(trip).filter((q) => q.blocks.includes(segment.id)),
    }));
}

/** Questions still waiting on a decision. */
export function unanswered(trip: Trip): OpenQuestion[] {
  return trip.openQuestions.filter((q) => !q.answer);
}

export function questionBlocks(trip: Trip, q: OpenQuestion): Segment[] {
  return q.blocks.map((id) => trip.segments.find((s) => s.id === id)).filter((s): s is Segment => !!s);
}

// ---------------------------------------------------------------------------
// Timeline

export type TimelineEventKind = "start" | "end";

export interface TimelineEvent {
  segment: Segment;
  kind: TimelineEventKind;
  at: Moment;
}

/** One line of a day's schedule: a booking event or a plan item, in time order. */
export type DayRow = { type: "event"; event: TimelineEvent } | { type: "plan"; item: PlanItem; at: Moment };

export interface TimelineDay {
  date: string;
  events: TimelineEvent[];
  /** Plan items starting this day. */
  plan: PlanItem[];
  /** Bookings and plan items merged into one schedule. */
  rows: DayRow[];
  /** null on the last day: you fly home, there's no night to cover. */
  night: NightStatus | null;
}

/** Untimed rows: checkouts, then travel, activities, plans, and check-ins last. */
const UNTIMED_ORDER = { end: 0, flight: 1, transport: 2, activity: 3, plan: 4, lodging: 5 } as const;

function rowMoment(r: DayRow): Moment {
  return r.type === "event" ? r.event.at : r.at;
}

function untimedRank(r: DayRow): number {
  if (r.type === "plan") return UNTIMED_ORDER.plan;
  return r.event.kind === "end" ? UNTIMED_ORDER.end : UNTIMED_ORDER[r.event.segment.kind];
}

/**
 * Timed rows in time order (by instant, so a Seattle departure and a
 * Guatemala arrival on the same day compare correctly); untimed rows after.
 */
export function compareRows(a: DayRow, b: DayRow): number {
  const ma = rowMoment(a);
  const mb = rowMoment(b);
  if (ma.instant === null && mb.instant === null) return untimedRank(a) - untimedRank(b);
  if (ma.instant === null) return 1;
  if (mb.instant === null) return -1;
  if (ma.instant !== mb.instant) return ma.instant - mb.instant;
  // Same minute: the booking before the plan note about it.
  return (a.type === "plan" ? 1 : 0) - (b.type === "plan" ? 1 : 0);
}

/**
 * Segments grouped by local day. A segment appears on the day it starts; if it
 * ends on a later day within the trip, it also gets an "end" event there
 * (checkout, return from the hike). Unbooked lodging is left to `night`.
 */
export function timeline(trip: Trip): TimelineDay[] {
  const nights = nightCoverage(trip);
  return dayRange(trip.firstDay, trip.lastDay).map((date, i) => {
    const events: TimelineEvent[] = [];
    for (const s of trip.segments) {
      if (!s.start) continue;
      // Unbooked lodging shows in the day's night slot instead of as an event.
      if (s.kind === "lodging" && s.status !== "booked") continue;
      const start = parseMoment(s.start);
      if (start.date === date) events.push({ segment: s, kind: "start", at: start });
      if (s.end) {
        const end = parseMoment(s.end);
        if (end.date === date && end.date !== start.date) {
          events.push({ segment: s, kind: "end", at: end });
        }
      }
    }
    // Known times first in time order; "time TBD" items after them. Among
    // untimed items, getting somewhere comes before staying there.
    events.sort((a, b) => compareRows({ type: "event", event: a }, { type: "event", event: b }));

    const plan = (trip.plan ?? []).filter((p) => parseMoment(p.start).date === date);
    const rows: DayRow[] = [
      ...events.map((event) => ({ type: "event" as const, event })),
      ...plan.map((item) => ({ type: "plan" as const, item, at: parseMoment(item.start) })),
    ].sort(compareRows);

    return { date, events, plan, rows, night: nights[i] ?? null };
  });
}

/** Days from `today` (YYYY-MM-DD) until the first day of the trip. */
export function daysUntil(trip: Trip, today: string): number {
  return daysBetween(today, trip.firstDay);
}
