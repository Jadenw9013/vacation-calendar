"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import type { PlanItem } from "@/data/types";
import type { Op } from "@/lib/ops";
import { useEditor } from "@/components/edit/EditorProvider";
import { field, join, labelCls, MomentFields, slug } from "@/components/edit/SegmentDialog";

/** Add or edit one step of a day's plan. */
export function PlanDialog({
  mode,
  item,
  date,
  trigger,
  triggerClassName,
}: {
  mode: "add" | "edit";
  item?: PlanItem;
  /** Default day for a new item. */
  date?: string;
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const { submit, busy, tripOffset } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    const start = join(get("startDate"), get("startTime"), get("startOffset"));
    const end = get("endTime") ? join(get("startDate"), get("endTime"), get("startOffset")) : null;
    const title = get("title");
    const notes = get("notes");
    const owner = get("owner");
    if (!start || !title) return;

    let ops: Op[];
    if (mode === "add") {
      const id = `plan-${slug(title) || "item"}-${Math.random().toString(36).slice(2, 6)}`;
      ops = [
        {
          op: "add_plan_item",
          item: { id, start, title, ...(end ? { end } : {}), ...(notes ? { notes } : {}), ...(owner ? { owner } : {}) },
        },
      ];
    } else {
      const it = item!;
      const changes: Record<string, unknown> = {};
      if (start !== it.start) changes.start = start;
      if ((end ?? null) !== (it.end ?? null)) changes.end = end;
      if (title !== it.title) changes.title = title;
      if (notes !== (it.notes ?? "")) changes.notes = notes || null;
      if (owner !== (it.owner ?? "")) changes.owner = owner || null;
      // Editing a suggested time and saving means someone has looked at it.
      if (it.tentative) changes.tentative = null;
      ops = Object.keys(changes).length ? [{ op: "update_plan_item", id: it.id, changes: changes as never }] : [];
    }
    if (!ops.length) return ref.current?.close();
    if (await submit(ops)) {
      if (mode === "add") form.reset();
      ref.current?.close();
    }
  }

  const endTime = item?.end && item.end.length > 10 ? item.end.slice(11, 16) : "";
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={triggerClassName}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={mode === "add" ? "Add to the day plan" : `Edit ${item?.title}`}
        className="m-auto max-h-[90dvh] w-[min(30rem,calc(100vw-1.5rem))] rounded-3xl border border-stone-border bg-white p-0 text-volcano shadow-2xl backdrop:bg-night/50 backdrop:backdrop-blur-xs"
      >
        <form key={item ? JSON.stringify(item) : `new-${date}`} onSubmit={onSubmit} className="flex flex-col gap-3.5 p-5">
          <div>
            <h2 className="font-serif text-2xl font-bold">{mode === "add" ? "Add to the plan" : "Edit plan step"}</h2>
            <p className="text-xs text-gray-500">A timed step in the day, like &ldquo;leave for Panajachel&rdquo;. Not a booking.</p>
          </div>
          <label className={labelCls}>
            What
            <input name="title" required maxLength={200} defaultValue={item?.title} placeholder="Leave for Panajachel" className={field} />
          </label>
          <MomentFields name="start" label="When" value={item?.start ?? null} tripOffset={tripOffset} fallbackDate={date} />
          <label className={labelCls}>
            Until (optional)
            <input type="time" name="endTime" defaultValue={endTime} className={field} />
          </label>
          <label className={labelCls}>
            Notes
            <textarea name="notes" rows={2} maxLength={2000} defaultValue={item?.notes} className={field} />
          </label>
          <label className={labelCls}>
            Who&apos;s running it (first name, optional)
            <input name="owner" maxLength={30} defaultValue={item?.owner} className={field} />
          </label>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={busy} className="rounded-xl bg-lake px-4 py-2 text-sm font-bold text-white hover:bg-lake-hover disabled:opacity-50">
              Save
            </button>
            <button type="button" onClick={() => ref.current?.close()} className="px-2 py-2 text-sm text-gray-500 underline">
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
