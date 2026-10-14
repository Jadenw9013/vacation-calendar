"use client";

import { useState, type FormEvent } from "react";
import type { PlanItem, Segment, Trip } from "@/data/types";
import type { AgendaRow } from "@/lib/now";
import { timeChangeOps } from "@/lib/edits";
import { formatTime, parseMoment } from "@/lib/time";
import { useTripChat } from "@/components/chat/ChatProvider";
import { useEditor } from "@/components/edit/EditorProvider";
import { field, labelCls, primaryBtn, secondaryBtn } from "@/components/edit/SegmentDialog";
import { NameGate } from "@/components/quickadd/NameGate";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

const btn = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-base font-semibold hover:bg-sunken disabled:opacity-60";

/** A small sheet with one time field. Booked items still ask before their times change. */
export function ChangeTime({ row, target, trip, online }: { row: AgendaRow; target: Segment | PlanItem; trip: Trip; online: boolean }) {
  const { submit, busy } = useEditor();
  const [open, setOpen] = useState(false);
  const current = row.verb ? target.end : target.start;
  if (!current) return null;
  const m = parseMoment(current);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const time = String(new FormData(e.currentTarget).get("time") ?? "");
    const ops = timeChangeOps(row, target, time, trip.utcOffset);
    if (ops.length && (await submit(ops))) setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!online} className={btn}>
        <Icon name="today" />
        {online ? "Change time" : "Change time (needs a connection)"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${row.verb ? `${row.verb} time` : "Time"}: ${row.title}`}>
        <NameGate>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 py-2">
            <label className={labelCls}>
              New time{m.offset && m.offset !== trip.utcOffset ? " (Seattle time)" : " (Guatemala time)"}
              <input type="time" name="time" defaultValue={m.time ?? ""} className={`${field} text-xl font-bold`} />
            </label>
            <p className="text-base text-muted">
              Now {m.time ? formatTime(m) : "time TBD"}. Clear the field to make it &ldquo;time TBD&rdquo;.
              {row.status === "booked" && " It's booked, so you'll be asked to confirm."}
            </p>
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className={`${primaryBtn} min-h-12`}>
                Save time
              </button>
              <button type="button" onClick={() => setOpen(false)} className={`${secondaryBtn} min-h-12`}>
                Cancel
              </button>
            </div>
          </form>
        </NameGate>
      </Sheet>
    </>
  );
}

/** Opens the planner with this item attached, so "can we move this?" needs no explaining. */
export function AskAboutItem({ id, title, online }: { id: string; title: string; online: boolean }) {
  const { askAbout, available } = useTripChat();
  if (!available) return null;
  return (
    <button type="button" disabled={!online} onClick={() => askAbout({ id, title })} className={btn}>
      <Icon name="ask" />
      {online ? "Ask" : "Ask (needs a connection)"}
    </button>
  );
}

/**
 * "I'll book it": puts your name on something that still needs booking, so
 * two people don't book the same zipline. Writes through set_status.
 */
export function ClaimButton({ segment, online }: { segment: Segment; online: boolean }) {
  const { submit, busy, author, openPicker } = useEditor();
  if (segment.status !== "needs-booking") return null;
  const mine = !!author && segment.owner === author;
  if (segment.owner && !mine) return null;
  return (
    <button
      type="button"
      disabled={!online || busy}
      onClick={() => {
        if (!author) return openPicker();
        void submit([{ op: "set_status", id: segment.id, status: segment.status, owner: mine ? null : author }]);
      }}
      className={btn}
    >
      {mine ? "Not me" : "I'll book it"}
    </button>
  );
}

/** "Sam is booking this", under a needs-booking item someone has claimed. */
export function OwnerLine({ row }: { row: AgendaRow }) {
  if (!row.owner || row.kind === "plan") return null;
  return (
    <span className="text-base font-semibold text-ink">
      {row.status === "booked" ? `Booked by ${row.owner}` : `${row.owner} is booking this`}
    </span>
  );
}
