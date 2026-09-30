import type { Segment, Trip } from "@/data/types";
import { nightCoverage, type NightStatus } from "./derive";
import { daysBetween, parseMoment } from "./time";

/**
 * Where the group is each day, worked out from the trip data rather than
 * hardcoded by date, so it stays right when plans move. Elevations are
 * approximate town/lake levels; the only summit figure comes from the data.
 */
const PLACES: { match: RegExp; name: string; elevationM: number }[] = [
  { match: /antigua/i, name: "Antigua", elevationM: 1530 },
  { match: /atitl|san marcos|san juan|san pedro|panajachel|santiago/i, name: "Lake Atitlán", elevationM: 1562 },
  { match: /guatemala city|\bGUA\b|airport/i, name: "Guatemala City", elevationM: 1502 },
];

function placeOf(text: string | undefined): { name: string; elevationM: number } | null {
  if (!text) return null;
  // "A → B": you end up at B.
  const dest = text.split("→").at(-1)!;
  // "Near GUA airport or Antigua" hasn't been decided, so it says nothing about where you'll be.
  if (/\bor\b|\band\/or\b/i.test(dest)) return null;
  return PLACES.find((p) => p.match.test(dest)) ?? null;
}

/** Where the day's last timed arrival leaves you, e.g. the airport on the day you land. */
function arrivalPlace(trip: Trip, date: string): { name: string; elevationM: number } | null {
  const arrivals = trip.segments
    .filter((s) => s.status === "booked" && (s.kind === "flight" || s.kind === "transport") && s.end && parseMoment(s.end).date === date)
    .sort((a, b) => (parseMoment(a.end!).instant ?? 0) - (parseMoment(b.end!).instant ?? 0));
  return placeOf(arrivals.at(-1)?.location);
}

export type Sleep =
  | { kind: "booked"; segment: Segment; night: number; of: number }
  | { kind: "open"; location: string | null }
  | { kind: "home" };

export interface DayInfo {
  date: string;
  /** "Lake Atitlán", "Antigua"… null when nothing says where. */
  place: string | null;
  /** Highest point that day: a summit from the data, else the town's level. */
  elevationM: number | null;
  /** True when elevationM is a summit rather than where you sleep. */
  peak: boolean;
  sleep: Sleep;
}

function nightOf(seg: Segment, date: string): { night: number; of: number } {
  const start = parseMoment(seg.start!).date;
  const end = parseMoment(seg.end!).date;
  return { night: daysBetween(start, date) + 1, of: Math.max(1, daysBetween(start, end)) };
}

export function dayInfo(trip: Trip): DayInfo[] {
  const nights = new Map<string, NightStatus>(nightCoverage(trip).map((n) => [n.date, n]));
  let previousPlace: { name: string; elevationM: number } | null = null;

  const days: DayInfo[] = [];
  for (let d = trip.firstDay; d <= trip.lastDay; d = nextDay(d)) {
    const n = nights.get(d);
    let sleep: Sleep;
    let place: { name: string; elevationM: number } | null = null;
    if (!n) {
      sleep = { kind: "home" };
      place = previousPlace;
    } else if (n.booked && n.booked.kind !== "flight") {
      sleep = { kind: "booked", segment: n.booked, ...nightOf(n.booked, d) };
      place = placeOf(n.booked.location) ?? placeOf(n.booked.title);
    } else {
      const planned = n.planned[0];
      sleep = { kind: "open", location: planned?.location ?? null };
      place = placeOf(planned?.location);
    }
    // Nothing decided for the night: go by where you arrive that day, else where you were.
    if (!place) place = arrivalPlace(trip, d) ?? previousPlace;

    const summit = trip.segments
      .filter((s) => s.peakElevationM && s.start && parseMoment(s.start).date === d)
      .reduce((m, s) => Math.max(m, s.peakElevationM!), 0);

    days.push({
      date: d,
      place: place?.name ?? null,
      elevationM: summit || place?.elevationM || null,
      peak: summit > 0,
      sleep,
    });
    if (place) previousPlace = place;
  }
  return days;
}

function nextDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}
