"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { PlanItem, Segment, SegmentStatus } from "@/data/types";
import { addDays, daysBetween, monthDay, parseMoment, weekday } from "@/lib/time";
import { useTripChat } from "@/components/chat/ChatProvider";
import { useEditor } from "@/components/edit/EditorProvider";
import { field, labelCls, primaryBtn, secondaryBtn, SegmentDialog } from "@/components/edit/SegmentDialog";
import { Icon } from "@/components/ui/Icon";
import { Sheet, SheetAction } from "@/components/ui/Sheet";
import { PlanDialog } from "./PlanDialog";

/** The one control on each item: a 44px "…" that opens its actions. */
export function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Actions for ${label}`}
      aria-haspopup="dialog"
      className="flex size-11 items-center justify-center rounded-xl text-ink hover:bg-sunken"
    >
      <Icon name="more" className="size-6" />
    </button>
  );
}

function OfflineNote({ online }: { online: boolean }) {
  if (online) return null;
  return <p className="mb-2 rounded-xl bg-sunken p-3 text-base">You&apos;re offline. Editing and the planner need a connection, so these are paused.</p>;
}

const STATUS_LABEL: Record<SegmentStatus, string> = {
  booked: "Mark as booked",
  "needs-booking": "Mark as not booked",
  undecided: "Mark as undecided",
};

/** Edit, status, move to another day, ask, delete: for one booking. */
export function SegmentActions({ segment, online, days }: { segment: Segment; online: boolean; days: string[] }) {
  const { submit, busy } = useEditor();
  const { prefill, available } = useTripChat();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const s = segment;

  async function remove() {
    setMenu(false);
    const msg =
      s.status === "booked" ? `“${s.title}” is booked.\n\nDelete it from the trip anyway?` : `Delete “${s.title}” from the trip?`;
    if (!window.confirm(msg)) return;
    await submit([{ op: "remove_segment", id: s.id, confirmBooked: true }]);
  }

  return (
    <>
      <MenuButton label={s.title} onClick={() => setMenu(true)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title={s.title}>
        <OfflineNote online={online} />
        <div className="flex flex-col gap-2">
          <SheetAction disabled={!online || busy} onClick={() => (setMenu(false), setEditing(true))}>
            Edit details…
          </SheetAction>
          {(Object.keys(STATUS_LABEL) as SegmentStatus[])
            .filter((st) => st !== s.status)
            .map((st) => (
              <SheetAction
                key={st}
                disabled={!online || busy}
                onClick={() => {
                  setMenu(false);
                  void submit([{ op: "set_status", id: s.id, status: st }]);
                }}
              >
                {STATUS_LABEL[st]}
              </SheetAction>
            ))}
          {s.start && (
            <SheetAction disabled={!online || busy} onClick={() => (setMenu(false), setMoving(true))}>
              Move to another day…
            </SheetAction>
          )}
          {available && (
            <SheetAction disabled={!online} onClick={() => (setMenu(false), prefill(`About “${s.title}”: `))}>
              Ask the planner about this
            </SheetAction>
          )}
          <SheetAction tone="danger" disabled={!online || busy} onClick={remove}>
            Delete…
          </SheetAction>
        </div>
      </Sheet>
      {editing && <SegmentDialog mode="edit" segment={s} open onClose={() => setEditing(false)} />}
      {moving && <MoveSheet segment={s} days={days} onClose={() => setMoving(false)} />}
    </>
  );
}

/** Shifts start and end by the same number of days, keeping times and zones. */
export function shiftedTimes(s: Segment, toDate: string): { start: string; end?: string } {
  const from = parseMoment(s.start!).date;
  const by = daysBetween(from, toDate);
  const shift = (m: string) => `${addDays(m.slice(0, 10), by)}${m.slice(10)}`;
  return { start: shift(s.start!), ...(s.end ? { end: shift(s.end) } : {}) };
}

function MoveSheet({ segment: s, days, onClose }: { segment: Segment; days: string[]; onClose: () => void }) {
  const { submit, busy } = useEditor();
  const current = parseMoment(s.start!).date;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const to = String(new FormData(e.currentTarget).get("day") ?? "");
    if (!to || to === current) return onClose();
    // No pre-confirmation: moving a booked item asks first, through the usual check.
    if (await submit([{ op: "update_segment", id: s.id, changes: shiftedTimes(s, to) }])) onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Move “${s.title}”`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 py-2">
        <label className={labelCls}>
          New day
          <select name="day" defaultValue={current} className={field}>
            {days.map((d) => (
              <option key={d} value={d}>
                {weekday(d, true)}, {monthDay(d)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-base text-muted">Times stay the same; a stay keeps its number of nights.</p>
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className={primaryBtn}>
            Move
          </button>
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** Edit, keep a suggested time, ask, remove: for one plan step. */
export function PlanItemActions({ item, online }: { item: PlanItem; online: boolean }) {
  const { submit, busy } = useEditor();
  const { prefill, available } = useTripChat();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <MenuButton label={item.title} onClick={() => setMenu(true)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title={item.title}>
        <OfflineNote online={online} />
        <div className="flex flex-col gap-2">
          <SheetAction disabled={!online || busy} onClick={() => (setMenu(false), setEditing(true))}>
            Edit…
          </SheetAction>
          {item.tentative && (
            <SheetAction
              disabled={!online || busy}
              onClick={() => {
                setMenu(false);
                void submit([{ op: "update_plan_item", id: item.id, changes: { tentative: null } }]);
              }}
            >
              Keep this time
            </SheetAction>
          )}
          {available && (
            <SheetAction disabled={!online} onClick={() => (setMenu(false), prefill(`About “${item.title}”: `))}>
              Ask the planner about this
            </SheetAction>
          )}
          <SheetAction
            tone="danger"
            disabled={!online || busy}
            onClick={() => {
              setMenu(false);
              if (window.confirm(`Remove “${item.title}” from the plan?`)) void submit([{ op: "remove_plan_item", id: item.id }]);
            }}
          >
            Remove…
          </SheetAction>
        </div>
      </Sheet>
      {editing && <PlanDialog mode="edit" item={item} open onClose={() => setEditing(false)} />}
    </>
  );
}

/** Generic menu for anything else with a few actions (a gap, a day). */
export function ActionsMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuButton label={label} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="flex flex-col gap-2">{children(() => setOpen(false))}</div>
      </Sheet>
    </>
  );
}
