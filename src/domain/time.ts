/*
 * Dates and wall-clock times. Dates are "YYYY-MM-DD" strings and times are
 * "HH:MM", always local to where the thing happens, so what's shown never
 * depends on the viewer's own zone. Zone math goes through Intl only.
 */

import type { When } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const date = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
};
export const isTime = (s: unknown): s is string => typeof s === "string" && TIME_RE.test(s);

export function isZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
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

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function weekday(date: string, long = false): string {
  return (long ? WEEKDAYS_LONG : WEEKDAYS)[utc(date).getUTCDay()];
}

/** "Nov 24" */
export function monthDay(date: string): string {
  const d = utc(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Tue Nov 24" */
export function formatDay(date: string): string {
  return `${weekday(date)} ${monthDay(date)}`;
}

/** "Nov 24 – 30" or "Nov 28 – Dec 1". */
export function formatRange(first: string, last: string): string {
  const a = utc(first);
  const b = utc(last);
  return a.getUTCMonth() === b.getUTCMonth() ? `${monthDay(first)} – ${b.getUTCDate()}` : `${monthDay(first)} – ${monthDay(last)}`;
}

/** "13:05" → "1:05 PM". */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall-clock date and time in `tz` at epoch `ms`. */
export function localParts(ms: number, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Minutes `tz` is ahead of UTC at epoch `ms` (Guatemala: -360). */
function offsetMinutes(ms: number, tz: string): number {
  const p = Object.fromEntries(partsFormatter(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** Epoch ms of a wall-clock date and time in `tz`. */
export function zonedInstant(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMinutes(guess, tz) * 60_000;
  // Near a DST change the offset at the first answer can differ; one more pass settles it.
  return guess - offsetMinutes(first, tz) * 60_000;
}

/** Minutes `tz` is ahead of UTC at midnight on `date` (Guatemala: -360). */
export function offsetOn(date: string, tz: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - zonedInstant(date, "00:00", tz)) / 60_000);
}

/** When something happens, as epoch ms; null when only the day is known. */
export function instantOf(when: When | null | undefined, tripTz: string): number | null {
  if (!when?.time) return null;
  return zonedInstant(when.date, when.time, when.tz ?? tripTz);
}

/** Today's date at the destination. */
export function todayIn(tz: string, now = Date.now()): string {
  return localParts(now, tz).date;
}

/** "Pacific Time", "Central Standard Time": the zone in words, for labels like "11:30 AM Pacific Time". */
export function zoneName(tz: string, at = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longGeneric" }).formatToParts(new Date(at));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/** "45m", "3h 10m", "2d 4h". */
export function formatDuration(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if ((m && !d) || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}
