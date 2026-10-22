import { extractUrls, classifyLink } from "./links";
import { offsetOn } from "./time";
import type { Booking, Item, ItemKind, Todo, Trip, When } from "./types";

/*
 * v1 (segments, statuses, plan items, open questions) → v2 (items and to-dos).
 * Runs on the seed and on any v1 trip still in the store, so nothing typed
 * on the old site is lost.
 */

export interface V1Segment {
  id: string;
  kind: "flight" | "lodging" | "activity" | "transport";
  title: string;
  start: string | null;
  end: string | null;
  status: "booked" | "needs-booking" | "undecided";
  location: string;
  owner?: string;
  cost?: { amount: number; currency: string };
  notes?: string;
  todos?: string[];
  peakElevationM?: number;
  includesLodging?: boolean;
}

export interface V1Trip {
  name: string;
  firstDay: string;
  lastDay: string;
  homeAirport: string;
  utcOffset: string;
  partySize: number | null;
  segments: V1Segment[];
  openQuestions: { id: string; question: string; blocks: string[]; notes?: string; answer?: string }[];
  todos: string[];
  plan?: { id: string; start: string; end?: string | null; title: string; notes?: string; owner?: string; tentative?: boolean }[];
}

export const isV1 = (t: unknown): t is V1Trip => !!t && typeof t === "object" && "segments" in t && "firstDay" in t;

const AIRPORT_TZ: Record<string, string> = {
  SEA: "America/Los_Angeles",
  PDX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  DEN: "America/Denver",
  ORD: "America/Chicago",
  DFW: "America/Chicago",
  JFK: "America/New_York",
  EWR: "America/New_York",
  BOS: "America/New_York",
  ATL: "America/New_York",
  YVR: "America/Vancouver",
};

const DESTINATION_TZ: [RegExp, string][] = [
  [/guatemala/i, "America/Guatemala"],
  [/mexico/i, "America/Mexico_City"],
  [/costa rica/i, "America/Costa_Rica"],
  [/belize/i, "America/Belize"],
];

/** A fixed-offset zone for an offset nothing else matches ("-06:00" → "Etc/GMT+6"). */
function etcZone(offset: string): string {
  const h = Number(offset.slice(1, 3));
  if (h === 0) return "Etc/UTC";
  return `Etc/GMT${offset.startsWith("-") ? "+" : "-"}${h}`;
}

const minutesOf = (offset: string) => (offset.startsWith("-") ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));

/** "2026-11-24T11:30:00-08:00" → { date, time, tz } in whichever known zone has that offset that day. */
function toWhen(raw: string | null | undefined, tripTz: string, homeTz: string | undefined): When | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2}))?$/.exec(raw);
  if (!m) return null;
  const [, date, time, offset] = m;
  if (!time) return { date };
  const off = offset === "Z" ? 0 : minutesOf(offset);
  if (off === offsetOn(date, tripTz)) return { date, time };
  if (homeTz && off === offsetOn(date, homeTz)) return { date, time, tz: homeTz };
  return { date, time, tz: etcZone(offset === "Z" ? "+00:00" : offset) };
}

const KIND: Record<V1Segment["kind"], ItemKind> = { flight: "flight", lodging: "stay", activity: "activity", transport: "transport" };

/** Splits v1's one location string into a place and anything better kept as a note. */
function placeOf(location: string): { place?: Item["place"]; note?: string } {
  const loc = location.trim();
  if (!loc || /^tbd$/i.test(loc)) return {};
  if (loc.includes("→")) {
    const dest = loc.split("→").at(-1)!.trim();
    return { place: dest && !/^tbd$/i.test(dest) ? { name: dest } : undefined, note: `Route: ${loc}` };
  }
  const meet = /^meet at\s+(.+)$/i.exec(loc);
  if (meet) return { place: { name: "Meeting point", address: meet[1] } };
  const paren = /^(.*?)\s*\((assumed[^)]*)\)\s*$/i.exec(loc);
  if (paren) return { place: { name: paren[1] }, note: `Place ${paren[2]}.` };
  return { place: { name: loc } };
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

let counter = 0;
const checkId = (itemId: string) => `c_${itemId.slice(0, 40)}_${(counter++).toString(36)}`;

function segmentToItem(s: V1Segment, tz: string, homeTz: string | undefined): Item {
  const { place, note } = placeOf(s.location);
  const notes = [note, s.notes].filter(Boolean).join("\n");
  const booking: Booking | undefined =
    s.status === "booked"
      ? { state: "booked", ...(s.owner ? { by: s.owner } : {}) }
      : { state: "todo", ...(s.owner ? { by: s.owner } : {}) };
  if (s.cost) booking.price = { amount: s.cost.amount, currency: s.cost.currency };
  const email = s.notes ? EMAIL.exec(s.notes)?.[0] : undefined;
  const links = s.notes
    ? extractUrls(s.notes).map((url, i) => ({ id: `l_${s.id.slice(0, 40)}_${i}`, url, ...classifyLink(url), addedAt: 0 }))
    : [];

  const item: Item = { id: s.id, kind: KIND[s.kind], title: s.title, booking };
  const start = toWhen(s.start, tz, homeTz);
  const end = toWhen(s.end, tz, homeTz);
  if (start) item.start = start;
  // v1 wrote "same day" activities as start = end = the date: that's no end at all.
  if (end && !(start && !start.time && !end.time && end.date === start.date && s.kind !== "lodging")) item.end = end;
  if (place) item.place = place;
  if (email) item.contact = { email };
  if (links.length) item.links = links;
  if (notes) item.notes = notes;
  if (s.todos?.length) item.checklist = s.todos.map((text) => ({ id: checkId(s.id), text, done: false }));
  if (s.status === "undecided") item.maybe = true;
  if (s.includesLodging) item.sleepsHere = true;
  if (s.peakElevationM) item.peakM = s.peakElevationM;
  return item;
}

export function migrateV1(v1: V1Trip, id: string): Trip {
  const destination = v1.name;
  const tz = DESTINATION_TZ.find(([re]) => re.test(destination))?.[1] ?? etcZone(v1.utcOffset);
  const homeTz = AIRPORT_TZ[v1.homeAirport];
  const currencies = v1.segments.map((s) => s.cost?.currency).filter((c): c is string => !!c && c !== "USD");
  const currency = currencies[0] ?? (/guatemala/i.test(destination) ? "GTQ" : "USD");

  const items: Item[] = v1.segments.map((s) => segmentToItem(s, tz, homeTz));
  for (const p of v1.plan ?? []) {
    const start = toWhen(p.start, tz, homeTz);
    const end = toWhen(p.end ?? null, tz, homeTz);
    items.push({
      id: p.id,
      kind: "activity",
      title: p.title,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(p.notes ? { notes: p.notes } : {}),
      ...(p.owner ? { who: p.owner } : {}),
      ...(p.tentative ? { maybe: true } : {}),
    });
  }

  const ids = new Set(items.map((i) => i.id));
  const todos: Todo[] = [
    ...v1.openQuestions.map((q) => ({
      id: q.id,
      text: q.question,
      done: !!q.answer,
      ...(q.blocks[0] && ids.has(q.blocks[0]) ? { itemId: q.blocks[0] } : {}),
      ...(q.answer ? { note: q.answer.slice(0, 300) } : q.notes ? { note: q.notes.slice(0, 300) } : {}),
    })),
    ...v1.todos.map((text, i) => ({ id: `t_v1_${i}`, text, done: false })),
  ];

  const people = [...new Set(v1.segments.map((s) => s.owner).filter((n): n is string => !!n))];
  return {
    schema: 2,
    id,
    name: v1.name,
    destination,
    startDate: v1.firstDay,
    endDate: v1.lastDay,
    tz,
    ...(homeTz ? { homeTz } : {}),
    currency,
    homeCurrency: "USD",
    people,
    ...(v1.partySize ? { notes: `Party of ${v1.partySize}.` } : {}),
    items,
    todos,
  };
}
