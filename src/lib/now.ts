import type { Segment, SegmentKind, SegmentStatus, Trip } from "@/data/types";
import { timeline, type DayRow } from "./derive";
import { dayInfo } from "./places";
import { addDays, dayRange, formatDuration, formatTime, monthDay, parseMoment, type Moment } from "./time";

/*
 * "What's happening now" for Trip mode. Everything takes the current time as
 * an argument, so tests pass a fixed date instead of faking the clock.
 */

export type Mode = "trip" | "plan";

/** "YYYY-MM-DD" at `nowMs` in a fixed UTC offset like "-06:00". */
export function localDate(nowMs: number, offset: string): string {
  return new Date(nowMs + offsetMinutes(offset) * 60_000).toISOString().slice(0, 10);
}

function offsetMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [h, m] = offset.slice(1).split(":").map(Number);
  return sign * (h * 60 + m);
}

/** Epoch ms of local midnight at the start of `date` in `offset`. */
function startOfDay(date: string, offset: string): number {
  return Date.parse(`${date}T00:00:00${offset}`);
}

/** "2:14 PM", or "Nov 25, 2:14 PM" when not on `today`. */
export function clockLabel(ms: number, offset: string, today?: string): string {
  const local = new Date(ms + offsetMinutes(offset) * 60_000).toISOString();
  const m = parseMoment(`${local.slice(0, 16)}${offset}`);
  return today && m.date !== today ? `${monthDay(m.date)}, ${formatTime(m)}` : formatTime(m);
}

/** The days with a night: the day strip in Trip mode (Tue 24 to Mon 30). */
export function tripDays(trip: Trip): string[] {
  return dayRange(trip.firstDay, addDays(trip.lastDay, -1));
}

/** Trip mode while we're there (Guatemala time), Plan mode otherwise. */
export function defaultMode(trip: Trip, nowMs: number): Mode {
  const today = localDate(nowMs, trip.utcOffset);
  const days = tripDays(trip);
  return today >= days[0] && today <= days[days.length - 1] ? "trip" : "plan";
}

/** Today when it's a trip day; otherwise the nearest end of the trip. */
export function initialDay(trip: Trip, nowMs: number): string {
  const today = localDate(nowMs, trip.utcOffset);
  const days = tripDays(trip);
  if (today < days[0]) return days[0];
  if (today > days[days.length - 1]) return days[days.length - 1];
  return today;
}

// ---------------------------------------------------------------------------
// The day's list

export interface AgendaRow {
  key: string;
  /** Segment or plan item id. */
  id: string;
  kind: SegmentKind | "plan";
  /** "Check out", "Back from"… for the end of a multi-day booking. */
  verb: string | null;
  title: string;
  /** null when only the day is known. */
  at: Moment | null;
  /** End time, only when it's the same day and known. */
  until: Moment | null;
  /** "Seattle time" when the time isn't Guatemala time. */
  zone: string | null;
  place: string | null;
  status: SegmentStatus | "plan";
  tentative: boolean;
  notes: string | null;
  todos: string[];
  /** Summit height, for the item that climbs. */
  peakM: number | null;
  /** Search text for a maps link, or null when there's nowhere definite. */
  mapsQuery: string | null;
}

const END_VERB: Record<SegmentKind, string> = {
  lodging: "Check out",
  flight: "Land",
  activity: "Back from",
  transport: "Arrive",
};

const ZONES: Record<string, string> = {
  "-08:00": "Seattle time",
  "-07:00": "Pacific time",
  "-05:00": "Eastern time",
};

/** Labels a time that isn't in the trip's own zone, once, on that item. */
export function zoneLabel(m: Moment | null, tripOffset: string): string | null {
  if (!m?.offset || m.offset === tripOffset) return null;
  return ZONES[m.offset] ?? `UTC${m.offset}`;
}

/** Where a location points on a map: the destination of "A → B"; nothing for undecided or unknown places. */
export function mapsQuery(location: string | undefined): string | null {
  if (!location) return null;
  const dest = location.split("→").at(-1)!.trim();
  if (!dest || /^tbd$/i.test(dest) || /\bor\b|\band\/or\b|\(assumed/i.test(dest)) return null;
  // "Meet at 2 calle oriente #22, Antigua Guatemala": the address is the useful part.
  return dest.replace(/^meet at\s+/i, "");
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function placeText(location: string | undefined): string | null {
  if (!location || /^tbd$/i.test(location.trim())) return null;
  return location;
}

/** One timeline row (booking event or plan step) as a list row. */
export function toAgendaRow(r: DayRow, tripOffset: string): AgendaRow {
  if (r.type === "plan") {
    const it = r.item;
    const end = it.end ? parseMoment(it.end) : null;
    return {
      key: it.id,
      id: it.id,
      kind: "plan",
      verb: null,
      title: it.title,
      at: r.at.time ? r.at : null,
      until: end?.time && end.date === r.at.date ? end : null,
      zone: zoneLabel(r.at, tripOffset),
      place: null,
      status: "plan",
      tentative: !!it.tentative,
      notes: it.notes ?? null,
      todos: [],
      peakM: null,
      mapsQuery: null,
    };
  }
  const { segment: s, kind, at } = r.event;
  const isEnd = kind === "end";
  const end = !isEnd && s.end ? parseMoment(s.end) : null;
  return {
    key: `${s.id}-${kind}`,
    id: s.id,
    kind: s.kind,
    verb: isEnd ? END_VERB[s.kind] : null,
    title: s.title,
    at: at.time ? at : null,
    until: end?.time && end.date === at.date ? end : null,
    zone: zoneLabel(at, tripOffset),
    place: placeText(s.location),
    status: s.status,
    tentative: false,
    notes: s.notes ?? null,
    todos: s.todos ?? [],
    peakM: s.peakElevationM ?? null,
    // A flight's "location" is its route; there's nowhere to walk to.
    mapsQuery: s.kind === "flight" ? null : mapsQuery(s.location),
  };
}

/** Everything on `date`, in the same order the planner uses: timed first, then untimed. */
export function agenda(trip: Trip, date: string): AgendaRow[] {
  const day = timeline(trip).find((d) => d.date === date);
  return day ? day.rows.map((r) => toAgendaRow(r, trip.utcOffset)) : [];
}

// ---------------------------------------------------------------------------
// Now / next

export type NowState = "now" | "next" | "later" | "first" | "done" | "none";

export interface NowNext {
  state: NowState;
  row: AgendaRow | null;
  /** "starts in 1h 20m", "in progress", "Time TBD"… */
  countdown: string | null;
}

function shortDuration(minutes: number): string {
  // Days and hours are enough once it's more than a day away.
  if (minutes >= 1440) return formatDuration(Math.round(minutes / 60) * 60).replace(/ 0m$/, "");
  return formatDuration(Math.max(1, minutes));
}

function endMs(s: Segment, offset: string): number | null {
  if (!s.end) return null;
  const e = parseMoment(s.end);
  return e.instant ?? startOfDay(addDays(e.date, 1), e.offset ?? offset);
}

/**
 * The card at the top of Trip mode. On today: what's in progress, else the
 * next timed item. On a later day: its first item. On a past day: nothing.
 */
export function nowNext(trip: Trip, date: string, nowMs: number): NowNext {
  const today = localDate(nowMs, trip.utcOffset);
  const rows = agenda(trip, date);
  const timed = rows.filter((r) => r.at?.instant != null);

  if (date < today) return { state: "done", row: null, countdown: null };

  if (date > today) {
    const first = timed[0] ?? rows[0] ?? null;
    if (!first) return { state: "none", row: null, countdown: null };
    const mins = first.at?.instant != null ? Math.round((first.at.instant - nowMs) / 60_000) : null;
    return { state: "first", row: first, countdown: mins === null ? "Time TBD" : `in ${shortDuration(mins)}` };
  }

  // Today. Something running across now, from any day (the overnight hike on its second morning).
  const running = trip.segments.find((s) => {
    if (s.kind === "lodging" || !s.start) return false;
    const start = parseMoment(s.start).instant;
    const end = endMs(s, trip.utcOffset);
    return start !== null && end !== null && start <= nowMs && nowMs < end;
  });
  if (running) {
    const row = rows.find((r) => r.id === running.id && !r.verb) ?? rows.find((r) => r.id === running.id) ?? fromSegment(trip, running);
    return { state: "now", row, countdown: "in progress" };
  }

  const next = timed.find((r) => r.at!.instant! > nowMs);
  if (next) return { state: "next", row: next, countdown: `starts in ${shortDuration(Math.round((next.at!.instant! - nowMs) / 60_000))}` };

  const untimed = rows.find((r) => !r.at && !r.verb);
  if (untimed) return { state: "later", row: untimed, countdown: "Time TBD" };
  return { state: "none", row: null, countdown: null };
}

function fromSegment(trip: Trip, s: Segment): AgendaRow {
  const at = parseMoment(s.start!);
  return toAgendaRow({ type: "event", event: { segment: s, kind: "start", at } }, trip.utcOffset);
}

// ---------------------------------------------------------------------------
// Day strip and header

export interface DayStatus {
  date: string;
  /** Something that day still needs booking or deciding, or the night has no bed. */
  needsAction: boolean;
  /** "Sleeping tonight: …" */
  sleep: string;
  sleepBooked: boolean;
  /** Summit height when the day climbs one. */
  peakM: number | null;
}

export function dayStatuses(trip: Trip): DayStatus[] {
  const info = new Map(dayInfo(trip).map((d) => [d.date, d]));
  return tripDays(trip).map((date) => {
    const di = info.get(date)!;
    const rows = agenda(trip, date);
    const open = rows.some((r) => r.status === "needs-booking" || r.status === "undecided");
    let sleep: string;
    let sleepBooked = true;
    if (di.sleep.kind === "booked") {
      sleep = di.sleep.segment.includesLodging ? `Camping: ${di.sleep.segment.title}` : di.sleep.segment.title;
    } else if (di.sleep.kind === "home") {
      sleep = "Flying home";
    } else {
      sleep = "Nowhere booked yet";
      sleepBooked = false;
    }
    return { date, needsAction: open || !sleepBooked, sleep, sleepBooked, peakM: di.peak ? di.elevationM : null };
  });
}
