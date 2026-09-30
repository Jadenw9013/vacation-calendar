"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Segment, SegmentKind, SegmentStatus } from "@/data/types";
import type { Op } from "@/lib/ops";
import { useEditor } from "./EditorProvider";

const KINDS: SegmentKind[] = ["lodging", "transport", "activity", "flight"];
const STATUSES: [SegmentStatus, string][] = [
  ["booked", "Booked"],
  ["needs-booking", "Needs booking"],
  ["undecided", "Undecided"],
];

/** Split an IsoMoment into form fields. */
export function split(m: string | null, fallbackOffset: string, fallbackDate?: string) {
  if (!m) return { date: fallbackDate ?? "", time: "", offset: fallbackOffset };
  return { date: m.slice(0, 10), time: m.length > 10 ? m.slice(11, 16) : "", offset: m.length > 10 ? m.slice(-6) : fallbackOffset };
}

/** Join form fields back: date only when no time, null when no date. */
export function join(date: string, time: string, offset: string): string | null {
  if (!date) return null;
  return time ? `${date}T${time}:00${offset}` : date;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export const field = "mt-1 w-full rounded-xl border border-stone-border bg-stone-light/40 px-3 py-2 text-sm text-volcano outline-none focus:border-lake focus:bg-white focus:ring-2 focus:ring-lake/20 transition-all";
export const labelCls = "flex flex-col text-xs font-semibold text-gray-700";

export function MomentFields({
  name,
  label,
  value,
  tripOffset,
  fallbackDate,
}: {
  name: string;
  label: string;
  value: string | null;
  tripOffset: string;
  fallbackDate?: string;
}) {
  const v = split(value, tripOffset, fallbackDate);
  const offsets = [...new Set([tripOffset, "-08:00", v.offset])];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-semibold text-gray-700">{label}</legend>
      <div className="grid grid-cols-[1fr_6.5rem_6rem] gap-2">
        <input type="date" name={`${name}Date`} defaultValue={v.date} aria-label={`${label} date`} className={field} />
        <input type="time" name={`${name}Time`} defaultValue={v.time} aria-label={`${label} time`} className={field} />
        <select name={`${name}Offset`} defaultValue={v.offset} aria-label={`${label} time zone`} className={field}>
          {offsets.map((o) => (
            <option key={o} value={o}>
              {o === tripOffset ? "Guatemala" : o === "-08:00" ? "Seattle" : `UTC${o}`}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-gray-400">Leave time empty if unknown. Leave both empty if day is unknown.</p>
    </fieldset>
  );
}

export function SegmentDialog({
  mode,
  segment,
  initialDate,
  initialKind,
  initialTitle,
  initialLocation,
  triggerLabel,
  triggerClassName,
}: {
  mode: "add" | "edit";
  segment?: Segment;
  initialDate?: string;
  initialKind?: SegmentKind;
  initialTitle?: string;
  initialLocation?: string;
  triggerLabel?: React.ReactNode;
  triggerClassName?: string;
}) {
  const { tripOffset, submit, busy } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [newTodo, setNewTodo] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const values = {
      kind: get("kind") as SegmentKind,
      title: get("title"),
      start: join(get("startDate"), get("startTime"), get("startOffset")),
      end: join(get("endDate"), get("endTime"), get("endOffset")),
      status: get("status") as SegmentStatus,
      location: get("location"),
    };
    const owner = get("owner");
    const notes = get("notes");

    let ops: Op[];
    if (mode === "add") {
      const id = `${values.kind}-${slug(values.title) || "item"}-${Math.random().toString(36).slice(2, 6)}`;
      ops = [
        {
          op: "add_segment",
          segment: { id, ...values, ...(owner ? { owner } : {}), ...(notes ? { notes } : {}) },
        },
      ];
    } else {
      const s = segment!;
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) if (v !== s[k as keyof Segment]) changes[k] = v;
      if (owner !== (s.owner ?? "")) changes.owner = owner || null;
      if (notes !== (s.notes ?? "")) changes.notes = notes || null;
      ops = Object.keys(changes).length ? [{ op: "update_segment", id: s.id, changes: changes as never, confirmBooked: true }] : [];
      if (newTodo.trim()) ops.push({ op: "add_todo", target: s.id, text: newTodo.trim() });
    }
    if (!ops.length) return ref.current?.close();
    if (await submit(ops)) {
      setNewTodo("");
      if (mode === "add") form.reset();
      ref.current?.close();
    }
  }

  async function remove() {
    if (!segment) return;
    const isBooked = segment.status === "booked";
    const confirmMsg = isBooked
      ? `“${segment.title}” is marked as BOOKED.\n\nAre you sure you want to delete it from the trip?`
      : `Delete “${segment.title}”?`;
    if (!window.confirm(confirmMsg)) return;
    if (await submit([{ op: "remove_segment", id: segment.id, confirmBooked: true }])) {
      ref.current?.close();
    }
  }

  const s = segment;
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={
          triggerClassName
            ? triggerClassName
            : mode === "add"
              ? "inline-flex items-center gap-1.5 rounded-xl bg-lake px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-lake-hover transition-colors"
              : "text-xs font-medium text-gray-400 hover:text-lake underline underline-offset-2 transition-colors"
        }
      >
        {triggerLabel ?? (mode === "add" ? "+ Add item" : "Edit")}
      </button>

      <dialog
        ref={ref}
        aria-label={mode === "add" ? "Add item" : `Edit ${s?.title}`}
        className="m-auto max-h-[90dvh] w-[min(34rem,calc(100vw-1.5rem))] rounded-3xl border border-stone-border bg-white p-0 text-volcano shadow-2xl backdrop:bg-night/50 backdrop:backdrop-blur-xs"
      >
        <form key={s ? JSON.stringify(s) : `${initialDate}-${initialKind}`} onSubmit={onSubmit} className="flex flex-col gap-3.5 p-6">
          <div className="flex items-center justify-between border-b border-stone-border/80 pb-3">
            <h2 className="font-serif text-2xl font-bold text-volcano">
              {mode === "add" ? "Add event" : `Edit ${s?.title}`}
            </h2>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="flex size-7 items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Kind
              <select name="kind" defaultValue={s?.kind ?? initialKind ?? "lodging"} className={field}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Status
              <select name="status" defaultValue={s?.status ?? "needs-booking"} className={field}>
                {STATUSES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelCls}>
            Title
            <input name="title" defaultValue={s?.title ?? initialTitle ?? ""} required maxLength={200} placeholder="e.g. Hotel Las Farolas" className={field} />
          </label>

          <label className={labelCls}>
            Location
            <input name="location" defaultValue={s?.location ?? initialLocation ?? ""} required maxLength={200} placeholder="e.g. Antigua or Lake Atitlán" className={field} />
          </label>

          <MomentFields name="start" label="Start" value={s?.start ?? null} tripOffset={tripOffset} fallbackDate={initialDate} />
          <MomentFields name="end" label="End" value={s?.end ?? null} tripOffset={tripOffset} fallbackDate={initialDate} />

          <label className={labelCls}>
            Who booked / is on it?
            <input name="owner" defaultValue={s?.owner ?? ""} maxLength={30} placeholder="First name only" className={field} />
          </label>

          <label className={labelCls}>
            Notes
            <textarea name="notes" rows={2} maxLength={2000} defaultValue={s?.notes} placeholder="Any details..." className={field} />
          </label>

          {mode === "edit" && (
            <label className={labelCls}>
              Add a to-do item
              <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} maxLength={300} placeholder="New todo item..." className={field} />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-stone-border/80 mt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-lake px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-lake-hover transition-colors disabled:opacity-50"
            >
              Save event
            </button>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-xl border border-stone-border bg-white px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>

            {mode === "edit" && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Delete event
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
