import { guessKind } from "./parse";
import { addDays, instantOf, isDate, isTime, isZone } from "./time";
import type { BookingState, Item, ItemKind, Trip } from "./types";

export interface PlanRow {
  line: number;
  title: string;
  kind: ItemKind;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  tz?: string;
  endTz?: string;
  booking: "none" | BookingState;
  confirmation: string;
  notes: string;
  selected: boolean;
}

export const PLAN_EXAMPLE = `Day 1
09:00 Breakfast at the market
15:00 Stay: Casa Oaxaca | end: day 4 11:00 | booked | confirmation: CASA-123
Day 2
10:00 Activity: Explore the old town
19:00 Food: Dinner with friends
Ideas
Activity: Cooking class`;

/** Explicit dates, day headings and pipe-separated details. No model or network. */
export function parsePlan(text: string, trip: Pick<Trip, "startDate" | "items">): PlanRow[] {
  let day = "";
  const rows: PlanRow[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim().replace(/^(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, "").replace(/\*\*/g, "");
    if (!line) continue;
    if (/^(ideas|unscheduled|someday)\s*:?$/i.test(line)) { day = ""; continue; }
    const heading = line.match(/^(\d{4}-\d{2}-\d{2})(?:\s*[:–—-]\s*.*)?$/);
    if (heading) { day = heading[1]; continue; }
    const numbered = line.match(/^day\s+(\d{1,3})(?:\s*[:–—-]\s*.*)?$/i);
    if (numbered && Number(numbered[1]) > 0) { day = addDays(trip.startDate, Number(numbered[1]) - 1); continue; }
    const [main, ...details] = line.split(/\s*\|\s*/);
    let title = main;
    let date = day;
    let time = "";
    const dated = title.match(/^(\d{4}-\d{2}-\d{2})\s+/);
    if (dated) { date = dated[1]; title = title.slice(dated[0].length); }
    const timed = title.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*[-–—]\s*|\s+)/i);
    if (timed) {
      let hour = Number(timed[1]);
      const meridiem = timed[3]?.toLowerCase();
      if (meridiem && hour >= 1 && hour <= 12) hour = hour % 12 + (meridiem === "pm" ? 12 : 0);
      time = `${String(hour).padStart(2, "0")}:${timed[2] ?? "00"}${meridiem && (Number(timed[1]) < 1 || Number(timed[1]) > 12) ? meridiem : ""}`;
      title = title.slice(timed[0].length);
    }
    const typed = title.match(/^(stay|hotel|flight|transport|activity|food|other)\s*:\s*/i);
    const kind = typed ? ({ hotel: "stay" }[typed[1].toLowerCase()] ?? typed[1].toLowerCase()) as ItemKind : guessKind(title);
    if (typed) title = title.slice(typed[0].length);
    const row: PlanRow = { line: index + 1, title, kind, date, time, endDate: "", endTime: "", booking: "none", confirmation: "", notes: "", selected: true };
    for (const detail of details) {
      const end = detail.match(/^end:\s*(\d{4}-\d{2}-\d{2}|day\s+\d{1,3})(?:\s+(\d{2}:\d{2}))?$/i);
      if (end) {
        row.endDate = /^day/i.test(end[1]) ? addDays(trip.startDate, Number(end[1].replace(/day\s+/i, "")) - 1) : end[1];
        row.endTime = end[2] ?? "";
      } else if (/^(booked|needs booking)$/i.test(detail)) row.booking = /^booked$/i.test(detail) ? "booked" : "todo";
      else if (/^tz:/i.test(detail)) row.tz = detail.replace(/^tz:\s*/i, "");
      else if (/^end tz:/i.test(detail)) row.endTz = detail.replace(/^end tz:\s*/i, "");
      else if (/^confirmation:/i.test(detail)) { row.confirmation = detail.replace(/^confirmation:\s*/i, ""); row.booking = "booked"; }
      else row.notes = [row.notes, detail.replace(/^notes:\s*/i, "")].filter(Boolean).join("\n");
    }
    if (kind === "stay" && date && isDate(date) && !row.endDate) row.endDate = addDays(date, 1);
    row.selected = !trip.items.some((item) => samePlanItem(item, row)) && !rows.some((earlier) => samePlanItem(planRowItem(earlier, "preview", "Planner"), row));
    rows.push(row);
  }
  return rows;
}

export function samePlanItem(item: Item, row: PlanRow): boolean {
  return item.title.trim().toLowerCase() === row.title.trim().toLowerCase() && item.kind === row.kind && (item.start?.date ?? "") === row.date && (item.start?.time ?? "") === (row.date ? row.time : "");
}

export function planRowProblem(row: PlanRow, tripTz = "UTC"): string | null {
  if (!row.title.trim() || row.title.length > 200) return "Use a title of 1–200 characters.";
  if (row.notes.length > 5000) return "Keep notes to 5,000 characters.";
  if (row.confirmation.length > 100) return "Keep confirmation numbers to 100 characters.";
  if (row.tz && !isZone(row.tz) || row.endTz && !isZone(row.endTz)) return "Choose a valid time zone, such as America/Los_Angeles.";
  if (row.date && !isDate(row.date) || row.endDate && !isDate(row.endDate)) return "Choose a valid date.";
  if (row.time && !isTime(row.time) || row.endTime && !isTime(row.endTime)) return "Use a 24-hour time, such as 14:30.";
  if (!row.date && (row.time || row.endDate || row.endTime)) return "Choose a day, or clear the times and end date to save an idea.";
  if (row.endTime && !row.endDate) return "Choose an end date for the end time.";
  if (row.endDate) {
    const item = planRowItem(row, "preview", "Planner");
    const start = instantOf(item.start!, tripTz);
    const end = instantOf(item.end!, tripTz);
    const backwards = start !== null && end !== null ? end < start : row.endDate < row.date;
    if (backwards) return "The end must be after the start.";
  }
  return null;
}

export function planRowItem(row: PlanRow, id: string, who: string): Item {
  return {
    id, title: row.title.trim(), kind: row.kind, who,
    ...(row.date ? { start: { date: row.date, ...(row.time ? { time: row.time } : {}), ...(row.tz ? { tz: row.tz } : {}) } } : {}),
    ...(row.date && row.endDate ? { end: { date: row.endDate, ...(row.endTime ? { time: row.endTime } : {}), ...(row.endTz ? { tz: row.endTz } : {}) } } : {}),
    ...(row.booking !== "none" ? { booking: { state: row.booking, ...(row.confirmation ? { confirmation: row.confirmation } : {}) } } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
  };
}
