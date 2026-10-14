"use client";

import { useRef, useState } from "react";
import type { SegmentStatus, Trip } from "@/data/types";
import type { Proposal } from "@/lib/chat/proposal";
import type { Op } from "@/lib/ops";
import { addDays, dayRange, formatDay, formatTime, parseMoment } from "@/lib/time";
import { useEditor } from "@/components/edit/EditorProvider";
import { field } from "@/components/edit/SegmentDialog";
import { useTripChat } from "./ChatProvider";

const STATUS: Record<SegmentStatus, string> = { booked: "booked", "needs-booking": "needs booking", undecided: "undecided" };

/** Segment and plan ids a set of ops adds or changes, for the post-apply flash. */
function touched(ops: Op[]): string[] {
  return ops.flatMap((o) =>
    o.op === "add_segment"
      ? [o.segment.id]
      : o.op === "add_plan_item"
        ? [o.item.id]
        : o.op === "update_segment" || o.op === "set_status" || o.op === "update_plan_item"
          ? [o.id]
          : [],
  );
}

/** "Thu Nov 26, 3:00 PM", or "Thu Nov 26, time TBD": never a guessed time. */
function when(m: string | null | undefined): string {
  if (!m) return "day not set";
  const p = parseMoment(m);
  return `${formatDay(p.date)}, ${p.time ? formatTime(p) : "time TBD"}`;
}

/** One change in words, from the op itself, so an edit shows up before it's applied. */
export function describeOp(op: Op, trip: Trip, fallback: string): { head: string; detail?: string } {
  const title = (id: string) => trip.segments.find((s) => s.id === id)?.title ?? trip.plan?.find((p) => p.id === id)?.title ?? id;
  switch (op.op) {
    case "add_segment": {
      const s = op.segment;
      return { head: `Add “${s.title}”`, detail: `${s.kind} · ${when(s.start)} · ${STATUS[s.status]}` };
    }
    case "update_segment": {
      const c = op.changes as Record<string, unknown>;
      const parts: string[] = [];
      if ("title" in c) parts.push(`title “${c.title}”`);
      if ("start" in c) parts.push(`starts ${when(c.start as string | null)}`);
      if ("end" in c) parts.push(`ends ${when(c.end as string | null)}`);
      if ("status" in c) parts.push(STATUS[c.status as SegmentStatus]);
      if ("location" in c) parts.push(`at ${c.location}`);
      if ("owner" in c) parts.push(c.owner ? `${c.owner} on it` : "nobody on it");
      if ("notes" in c) parts.push("notes changed");
      return { head: `Change “${title(op.id)}”`, detail: parts.join(" · ") || undefined };
    }
    case "remove_segment":
      return { head: `Remove “${title(op.id)}”` };
    case "set_status":
      return { head: `Mark “${title(op.id)}” as ${STATUS[op.status]}`, detail: op.owner ? `${op.owner} on it` : undefined };
    case "add_plan_item":
      return { head: `Plan: ${op.item.title}`, detail: `${when(op.item.start)}${op.item.tentative ? " · suggested time" : ""}` };
    case "update_plan_item": {
      const c = op.changes as Record<string, unknown>;
      const parts = [
        "title" in c ? `title “${c.title}”` : null,
        "start" in c ? `at ${when(c.start as string)}` : null,
        "tentative" in c ? "time kept" : null,
      ].filter(Boolean);
      return { head: `Change plan step “${title(op.id)}”`, detail: parts.join(" · ") || undefined };
    }
    case "remove_plan_item":
      return { head: `Remove plan step “${title(op.id)}”` };
    default:
      return { head: fallback };
  }
}

/** The title and start an op sets, if it's one a person can edit here. */
function editable(op: Op): { title?: string; start?: string | null } | null {
  if (op.op === "add_segment") return { title: op.segment.title, start: op.segment.start };
  if (op.op === "add_plan_item") return { title: op.item.title, start: op.item.start };
  if (op.op === "update_segment" || op.op === "update_plan_item") {
    const c = op.changes as Record<string, unknown>;
    if (!("title" in c) && !("start" in c)) return null;
    return { title: c.title as string | undefined, start: c.start as string | null | undefined };
  }
  return null;
}

function withEdit(op: Op, title: string | undefined, start: string | null | undefined): Op {
  const t = title?.trim();
  if (op.op === "add_segment") return { ...op, segment: { ...op.segment, ...(t ? { title: t } : {}), ...(start !== undefined ? { start } : {}) } };
  if (op.op === "add_plan_item") return { ...op, item: { ...op.item, ...(t ? { title: t } : {}), ...(start ? { start, tentative: false } : {}) } };
  if (op.op === "update_segment" || op.op === "update_plan_item") {
    const c = { ...(op.changes as Record<string, unknown>) };
    if (t && "title" in c) c.title = t;
    if (start !== undefined && "start" in c) c.start = start;
    return { ...op, changes: c } as Op;
  }
  return op;
}

export function ProposalCard({
  toolCallId,
  proposal,
  latest,
  trip,
  said,
}: {
  toolCallId: string;
  proposal: Proposal;
  latest: boolean;
  trip: Trip;
  /** What the person typed that led to this, echoed so a misreading is obvious. */
  said?: string;
}) {
  const { apply, busy, version } = useEditor();
  const { outcomes, setOutcome, flash, prefill, send } = useTripChat();
  const [error, setError] = useState<string | null>(null);
  const p = proposal;
  const [checked, setChecked] = useState<boolean[]>(() => p.ops.map(() => true));
  const [edits, setEdits] = useState<Record<number, Op>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const applying = useRef(false);
  const outcome = outcomes[toolCallId];

  if (p.status === "invalid") {
    return (
      <div className="rounded-xl border-2 border-line p-3 text-base">
        Couldn&apos;t draft that: {p.issues.map((i) => i.message).join(" ")} Try saying it another way, or use Quick add above.
      </div>
    );
  }

  const ops = p.ops.map((o, i) => edits[i] ?? o);
  const chosen = ops.filter((_, i) => checked[i]);
  // Drafted against an older trip than the one on screen: don't apply it blind.
  const behind = p.baseVersion < version;
  const settled = outcome ?? (latest ? null : "discarded");
  const stale = settled === "stale" || (!settled && behind);

  async function onApply() {
    if (applying.current || !chosen.length) return;
    applying.current = true; // a double tap applies once
    setError(null);
    try {
      const r = await apply(chosen, { expectedVersion: p.baseVersion, confirmed: p.status === "needs_confirmation" });
      if (r.kind === "applied") {
        setOutcome(toolCallId, "applied");
        flash(touched(chosen));
      } else if (r.kind === "conflict") {
        setOutcome(toolCallId, "stale");
      } else if (r.kind === "rejected") {
        setError(`${r.issues.map((i) => i.message).join(" ")} Edit the change, or untick it and apply the rest.`);
      } else if (r.kind === "error") {
        setError(`${r.message} Nothing was changed; try again.`);
      }
    } finally {
      applying.current = false;
    }
  }

  const n = chosen.length;
  const label = n < ops.length ? `Apply ${n} of ${ops.length}` : p.status === "needs_confirmation" ? "Confirm & apply" : "Apply";

  return (
    <article
      aria-label={`Proposal: ${p.summary}`}
      className={`rounded-2xl border-2 bg-surface text-base ${settled === "applied" ? "border-booked" : settled || stale ? "border-line" : "border-now"}`}
    >
      <div className="p-4 pb-2">
        <p className="text-sm font-bold tracking-wide text-now uppercase">{settled === "applied" ? "Applied" : "Proposed change"}</p>
        <h3 className="text-lg font-bold">{p.summary}</h3>
        {said && <p className="mt-1 text-muted">You said: “{said.length > 140 ? `${said.slice(0, 140)}…` : said}”</p>}

        <ul className="mt-3 flex flex-col gap-2">
          {ops.map((op, i) => {
            const d = describeOp(op, trip, p.changes[i] ?? op.op);
            const canEdit = !settled && !stale && editable(op);
            return (
              <li key={i} className="flex flex-col gap-2 rounded-xl border border-line p-2">
                <div className="flex items-start gap-2">
                  {!settled && !stale ? (
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 py-1">
                      <input
                        type="checkbox"
                        checked={checked[i]}
                        onChange={(e) => setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))}
                        className="mt-0.5 size-6 shrink-0 accent-[var(--ink)]"
                        aria-label={`Include: ${d.head}`}
                      />
                      <span className={checked[i] ? "" : "text-muted line-through"}>
                        <span className="font-semibold">{d.head}</span>
                        {d.detail && <span className="block text-muted">{d.detail}</span>}
                      </span>
                    </label>
                  ) : (
                    <span className="min-w-0 flex-1 py-1">
                      <span className="font-semibold">{d.head}</span>
                      {d.detail && <span className="block text-muted">{d.detail}</span>}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(editing === i ? null : i)}
                      aria-expanded={editing === i}
                      className="min-h-11 shrink-0 rounded-xl border border-line px-3 font-semibold hover:bg-sunken"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editing === i && canEdit && (
                  <EditChange
                    op={op}
                    trip={trip}
                    onSave={(next) => {
                      setEdits((e) => ({ ...e, [i]: next }));
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {(p.gapDelta.closes.length > 0 || p.gapDelta.opens.length > 0) && (
          <div className="mt-3 flex flex-col gap-1">
            {p.gapDelta.closes.length > 0 && (
              <p>
                <span className="font-bold text-booked">✓ Closes:</span> {p.gapDelta.closes.join("; ")}
              </p>
            )}
            {p.gapDelta.opens.length > 0 && (
              <p>
                <span className="font-bold text-action">! Opens:</span> {p.gapDelta.opens.join("; ")}
              </p>
            )}
          </div>
        )}
        {p.confirmations.length > 0 && !settled && (
          <div className="mt-3 rounded-xl border-2 border-action bg-action-soft p-3">
            {p.confirmations.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        )}
        {p.redacted.length > 0 && <p className="mt-2 text-muted">Booking codes, contact details, card digits and full names were left out on purpose.</p>}
        {error && (
          <p role="alert" className="mt-3 rounded-xl border-2 border-action bg-action-soft p-3 font-semibold">
            {error}
          </p>
        )}
      </div>

      {/* Stays in reach at the bottom of the chat while the card is on screen. */}
      <div className="sticky bottom-0 flex flex-col gap-2 rounded-b-2xl border-t border-line bg-surface p-4 pt-3">
        {settled === "applied" && <p className="font-bold text-booked">✓ Applied. Undo from the bar below for 10 seconds, or later from Updates.</p>}
        {settled === "discarded" && <p className="text-muted">Discarded. Nothing changed.</p>}
        {stale && (
          <>
            <p className="font-semibold">Someone changed the trip after this was drafted, so it wasn&apos;t applied.</p>
            <button
              type="button"
              onClick={() => {
                setOutcome(toolCallId, "stale");
                send(`The trip changed since that proposal. Please redo it against the current trip: ${p.summary}`);
              }}
              className="min-h-12 self-start rounded-xl bg-ink px-5 font-bold text-canvas"
            >
              Review again
            </button>
          </>
        )}
        {!settled && !stale && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onApply} disabled={busy || n === 0} className="min-h-12 rounded-xl bg-ink px-5 font-bold text-canvas disabled:opacity-50">
                {label}
              </button>
              <button onClick={() => setOutcome(toolCallId, "discarded")} className="min-h-12 rounded-xl border border-line px-4 font-semibold hover:bg-sunken">
                Discard
              </button>
              <button onClick={() => prefill("Change that: ")} className="min-h-12 rounded-xl border border-line px-4 font-semibold hover:bg-sunken">
                Tweak
              </button>
            </div>
            <p className="text-muted">Undo for 10 seconds, or later from Updates.</p>
          </>
        )}
      </div>
    </article>
  );
}

function EditChange({ op, trip, onSave, onCancel }: { op: Op; trip: Trip; onSave: (op: Op) => void; onCancel: () => void }) {
  const e = editable(op)!;
  const start = e.start ? parseMoment(e.start) : null;
  const days = dayRange(trip.firstDay, addDays(trip.lastDay, 0));
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        const title = String(f.get("title") ?? "");
        const day = String(f.get("day") ?? "");
        const time = String(f.get("time") ?? "");
        const offset = start?.offset ?? trip.utcOffset;
        const next = e.start === undefined ? undefined : day ? (time ? `${day}T${time}:00${offset}` : day) : null;
        onSave(withEdit(op, title, next));
      }}
      className="flex flex-col gap-3 border-t border-line pt-2"
    >
      {e.title !== undefined && (
        <label className="flex flex-col text-sm font-semibold">
          Title
          <input name="title" defaultValue={e.title} maxLength={200} className={field} />
        </label>
      )}
      {e.start !== undefined && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col text-sm font-semibold">
            Day
            <select name="day" defaultValue={start?.date ?? ""} className={field}>
              <option value="">Not set</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDay(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-semibold">
            Time (empty: TBD)
            <input name="time" type="time" defaultValue={start?.time ?? ""} className={field} />
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <button className="min-h-11 rounded-xl bg-ink px-4 font-bold text-canvas">Use this</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-line px-4 font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
