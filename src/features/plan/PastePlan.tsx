"use client";

import { useMemo, useState } from "react";
import { useTrip } from "@/client/store";
import { newId } from "@/domain/ids";
import { parsePlan, PLAN_EXAMPLE, planRowItem, planRowProblem, samePlanItem, type PlanRow } from "@/domain/planImport";
import type { ItemKind } from "@/domain/types";
import { Sheet } from "@/ui/Sheet";
import { btn, field, label } from "@/ui/kit";

export function PastePlan({ onClose }: { onClose: () => void }) {
  const { trip, me, apply } = useTrip();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => parsePlan(text, trip), [text, trip]);
  const selected = rows?.filter((row) => row.selected) ?? [];
  const invalid = selected.some((row) => planRowProblem(row, trip.tz));
  const update = (index: number, changes: Partial<PlanRow>) => setRows((prev) => prev!.map((row, i) => i === index ? { ...row, ...changes } : row));

  async function save() {
    if (busy || invalid || !selected.length || selected.length > 60) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apply(selected.map((row) => ({ op: "item.add", item: planRowItem(row, newId("i"), me) })), { message: `Added ${selected.length} plans` });
      if (result.ok) onClose();
      else setError(result.error);
    } catch { setError("Could not save this plan. Your review is still here; try again."); }
    finally { setBusy(false); }
  }

  return <Sheet open onClose={onClose} title="Paste a travel plan" wide>
    <div className="flex flex-col gap-4 pt-1">
      {!rows ? <>
        <p className="text-base text-muted">Paste your itinerary, then review every item before saving. Works without AI or a connection.</p>
        <p className="text-sm text-muted">Use a date (YYYY-MM-DD) or “Day 1” on its own line, then one plan per line. Times use 24-hour format or am/pm. “Ideas” starts an undated list. Day 1 is {trip.startDate}.</p>
        <label className={label}>Your travel plan
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} maxLength={30000} placeholder={PLAN_EXAMPLE} className={`${field} resize-y`} />
        </label>
        <button type="button" className={`${btn.quiet} self-start`} onClick={() => setText(PLAN_EXAMPLE)}>Use example</button>
        <details className="text-sm text-muted"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Optional booking details</summary>
          <p>Add “Stay:” or “Flight:” before a title. Add details after |, for example: end: day 4 11:00 | booked | confirmation: ABC123. Flights can include tz: Asia/Tokyo | end tz: America/Los_Angeles. Other details are kept in notes. Stays default to one night; check the checkout date in review. Unrecognized lines are kept as items for you to correct or deselect.</p>
        </details>
        {preview.length > 200 && <p role="alert" className="text-danger">This plan has more than 200 lines to review. Split it into smaller sections first.</p>}
        <button type="button" disabled={!preview.length || preview.length > 200} onClick={() => { setRows(preview); setError(null); }} className={btn.primary}>Review {preview.length || ""} items</button>
      </> : <>
        <p className="text-base text-muted">Check names, dates and booking details. Matches in the trip or this paste start unchecked. Undated items go to Ideas. Times default to {trip.tz.replace(/_/g, " ")}.</p>
        <button type="button" disabled={busy} onClick={() => setRows(null)} className={`${btn.secondary} self-start`}>Edit pasted text</button>
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <legend className="sr-only">Review imported items</legend>
          {rows.map((row, index) => <section key={index} aria-label={`Item ${index + 1}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line p-3">
            <label className="flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" checked={row.selected} onChange={(e) => update(index, { selected: e.target.checked })} className="size-5" />Include item {index + 1}<span className="text-sm text-muted">Line {row.line}</span></label>
            {trip.items.some((item) => samePlanItem(item, row)) && <p className="text-sm text-todo">Already on this trip. Select only if you want another copy.</p>}
            {rows.slice(0, index).some((earlier) => samePlanItem(planRowItem(earlier, "preview", me), row)) && <p className="text-sm text-todo">Matches an earlier item in this paste. Select only if you want another copy.</p>}
            <label className={label}>Title<input value={row.title} maxLength={200} onChange={(e) => update(index, { title: e.target.value })} className={field} /></label>
            <label className={label}>Kind<select value={row.kind} onChange={(e) => update(index, { kind: e.target.value as ItemKind })} className={field}>{["stay", "flight", "transport", "activity", "food", "other"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>Day<input type="date" value={row.date} onChange={(e) => update(index, { date: e.target.value, ...(!e.target.value ? { time: "", endDate: "", endTime: "" } : {}) })} className={field} /></label>
              <label className={label}>Time<input type="time" value={row.time} onChange={(e) => update(index, { time: e.target.value })} className={field} /></label>
              <label className={label}>{row.kind === "stay" ? "Check-out date" : "End date"}<input type="date" value={row.endDate} onChange={(e) => update(index, { endDate: e.target.value })} className={field} /></label>
              <label className={label}>End time<input type="time" value={row.endTime} onChange={(e) => update(index, { endTime: e.target.value })} className={field} /></label>
            </div>
            {(row.kind === "flight" || row.tz || row.endTz) && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={label}>Departure time zone<input value={row.tz ?? ""} onChange={(e) => update(index, { tz: e.target.value })} placeholder={trip.tz} className={field} /></label>
              <label className={label}>Arrival time zone<input value={row.endTz ?? ""} onChange={(e) => update(index, { endTz: e.target.value })} placeholder={trip.tz} className={field} /></label>
            </div>}
            {!row.date && <p className="text-sm text-muted">Saved to Ideas.</p>}
            {row.date && (row.date < trip.startDate || row.date > trip.endDate || row.endDate > trip.endDate) && <p className="text-sm text-todo">Outside the trip dates. Adjust the dates here or edit the trip details.</p>}
            <label className={label}>Reservation<select value={row.booking} onChange={(e) => update(index, { booking: e.target.value as PlanRow["booking"] })} className={field}><option value="none">No reservation needed</option><option value="todo">Needs booking</option><option value="booked">Already booked</option></select></label>
            {row.booking !== "none" && <label className={label}>Confirmation number<input value={row.confirmation} maxLength={100} onChange={(e) => update(index, { confirmation: e.target.value })} className={field} /></label>}
            <label className={label}>Notes<textarea value={row.notes} maxLength={5000} rows={2} onChange={(e) => update(index, { notes: e.target.value })} className={field} /></label>
            {row.selected && planRowProblem(row, trip.tz) && <p role="alert" className="text-sm text-danger">{planRowProblem(row, trip.tz)}</p>}
          </section>)}
        </fieldset>
        {selected.length > 60 && <p role="alert" className="text-danger">Import up to 60 items at once. Uncheck some items or split the pasted plan.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <button type="button" disabled={busy || !selected.length || selected.length > 60 || invalid} onClick={() => void save()} className={btn.primary}>{busy ? "Saving…" : `Add ${selected.length} items to trip`}</button>
      </>}
    </div>
  </Sheet>;
}
