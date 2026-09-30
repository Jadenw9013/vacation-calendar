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
function split(m: string | null, fallbackOffset: string) {
  if (!m) return { date: "", time: "", offset: fallbackOffset };
  return { date: m.slice(0, 10), time: m.length > 10 ? m.slice(11, 16) : "", offset: m.length > 10 ? m.slice(-6) : fallbackOffset };
}

/** Join form fields back: date only when no time, null when no date. */
function join(date: string, time: string, offset: string): string | null {
  if (!date) return null;
  return time ? `${date}T${time}:00${offset}` : date;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const field = "mt-1 w-full border border-basalt bg-card px-2 py-1.5 text-base";
const labelCls = "flex flex-col text-xs font-semibold";

function MomentFields({ name, label, value, tripOffset }: { name: string; label: string; value: string | null; tripOffset: string }) {
  const v = split(value, tripOffset);
  const offsets = [...new Set([tripOffset, "-08:00", v.offset])];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-semibold">{label}</legend>
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
      <p className="text-[11px] text-pumice">Leave the time empty if unknown. Leave both empty if even the day is unknown.</p>
    </fieldset>
  );
}

/** Add or edit a segment in a native dialog. */
export function SegmentDialog({ mode, segment }: { mode: "add" | "edit"; segment?: Segment }) {
  const { submit, busy, tripOffset } = useEditor();
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
      ops = Object.keys(changes).length ? [{ op: "update_segment", id: s.id, changes: changes as never }] : [];
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
    if (!segment || !window.confirm(`Remove “${segment.title}”?`)) return;
    if (await submit([{ op: "remove_segment", id: segment.id }])) ref.current?.close();
  }

  const s = segment;
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={
          mode === "add"
            ? "inline-flex items-center gap-1.5 rounded-lg bg-lake px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-lake-hover transition-colors"
            : "text-xs font-medium text-gray-400 hover:text-lake underline underline-offset-2 transition-colors"
        }
      >
        {mode === "add" ? "+ Add item" : "Edit"}
      </button>
      <dialog
        ref={ref}
        aria-label={mode === "add" ? "Add item" : `Edit ${s?.title}`}
        className="m-auto max-h-[90dvh] w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl border border-stone-border bg-white p-0 text-volcano shadow-2xl backdrop:bg-night/50 backdrop:backdrop-blur-xs"
      >
        {/* Keyed on the data so fields pick up changes after a save and refresh. */}
        <form key={s ? JSON.stringify(s) : "new"} onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
          <h2 className="wide text-2xl">{mode === "add" ? "Add item" : "Edit"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Kind
              <select name="kind" defaultValue={s?.kind ?? "lodging"} className={field}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
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
            <input name="title" required maxLength={200} defaultValue={s?.title} className={field} />
          </label>
          <label className={labelCls}>
            Where
            <input name="location" required maxLength={200} defaultValue={s?.location} className={field} />
          </label>
          <MomentFields name="start" label="Starts" value={s?.start ?? null} tripOffset={tripOffset} />
          <MomentFields name="end" label="Ends" value={s?.end ?? null} tripOffset={tripOffset} />
          <label className={labelCls}>
            Who&apos;s on it (first name)
            <input name="owner" maxLength={30} defaultValue={s?.owner} className={field} />
          </label>
          <label className={labelCls}>
            Notes
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={s?.notes} className={field} />
          </label>
          {mode === "edit" && (
            <label className={labelCls}>
              Add a to-do
              <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} maxLength={300} className={field} />
            </label>
          )}
          <p className="text-[11px] text-pumice">
            No confirmation numbers, phone numbers or card details: they get stripped anyway.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="submit" disabled={busy} className="bg-basalt px-4 py-2 font-bold text-ash disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => ref.current?.close()} className="px-2 py-2 text-sm underline">
              Cancel
            </button>
            {mode === "edit" && (
              <button type="button" onClick={remove} disabled={busy} className="ml-auto px-2 py-2 text-sm font-semibold text-ember underline">
                Remove
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
