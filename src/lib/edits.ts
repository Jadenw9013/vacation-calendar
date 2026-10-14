import type { PlanItem, Segment } from "@/data/types";
import type { AgendaRow } from "./now";
import type { Op } from "./ops";
import { parseMoment } from "./time";

/** Shifts "YYYY-MM-DDTHH:MM:00±hh:mm" by whole minutes, keeping its offset (Guatemala has no DST). */
function shift(m: string, minutes: number): string {
  const date = new Date(Date.parse(m) + minutes * 60_000);
  const offset = m.slice(-6);
  const sign = offset.startsWith("-") ? -1 : 1;
  const local = new Date(date.getTime() + sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * 60_000);
  return `${local.toISOString().slice(0, 16)}:00${offset}`;
}

/** The ops for a new time on a row: its start, or for a checkout row its end. Same-day ends move with the start. */
export function timeChangeOps(row: AgendaRow, target: Segment | PlanItem, time: string, tripOffset: string): Op[] {
  const isPlan = row.kind === "plan";
  const current = row.verb ? target.end : target.start;
  if (!current) return [];
  const m = parseMoment(current);
  const next = time ? `${m.date}T${time}:00${m.offset ?? tripOffset}` : m.date;
  const field = row.verb ? "end" : "start";
  const changes: Record<string, string | null> = { [field]: next };
  // Keep a same-day end the same length after the start: "9 to 11" moved to 10 is "10 to 12".
  if (!row.verb && target.end && m.instant !== null && time) {
    const e = parseMoment(target.end);
    if (e.instant !== null && e.date === m.date) changes.end = shift(target.end, Math.round((Date.parse(next) - m.instant) / 60_000));
  }
  return isPlan
    ? [{ op: "update_plan_item", id: target.id, changes: changes as never }]
    : [{ op: "update_segment", id: target.id, changes: changes as never }];
}
