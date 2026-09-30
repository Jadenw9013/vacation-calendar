import type { IsoMoment } from "@/data/types";

/**
 * A parsed IsoMoment. Times are kept as written (local to wherever the
 * segment happens), so display never depends on the viewer's time zone.
 */
export interface Moment {
  raw: IsoMoment;
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** Local time "HH:MM", or null when only the day is known. */
  time: string | null;
  /** "-06:00" etc., or null when only the day is known. */
  offset: string | null;
  /** Epoch ms, or null when only the day is known. */
  instant: number | null;
}

const MOMENT_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2}))?$/;

export function parseMoment(raw: IsoMoment): Moment {
  const m = MOMENT_RE.exec(raw);
  if (!m) throw new Error(`Not a valid date or datetime with offset: "${raw}"`);
  const [, date, time, offset] = m;
  return {
    raw,
    date,
    time: time ?? null,
    offset: offset ?? null,
    instant: time ? Date.parse(raw) : null,
  };
}

export function isValidMoment(raw: string): boolean {
  return MOMENT_RE.test(raw) && !Number.isNaN(Date.parse(raw.length === 10 ? `${raw}T00:00:00Z` : raw));
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Inclusive list of dates from `first` to `last`. */
export function dayRange(first: string, last: string): string[] {
  const out: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function weekday(date: string, long = false): string {
  return (long ? WEEKDAYS_LONG : WEEKDAYS)[utcDate(date).getUTCDay()];
}

/** "Nov 24" */
export function monthDay(date: string): string {
  const d = utcDate(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Tue Nov 24" */
export function formatDay(date: string): string {
  return `${weekday(date)} ${monthDay(date)}`;
}

/** "11:30 AM", or "time TBD". */
export function formatTime(m: Moment): string {
  if (!m.time) return "time TBD";
  const [h, min] = m.time.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

/** "Tue Nov 24, 11:52 PM" or "Mon Nov 30, time TBD". */
export function formatMoment(m: Moment): string {
  return `${formatDay(m.date)}, ${formatTime(m)}`;
}

/** "45m", "14h 8m", "2d 20h 30m". */
export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}
