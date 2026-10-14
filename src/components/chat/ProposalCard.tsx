"use client";

import { useState } from "react";
import type { Proposal } from "@/lib/chat/proposal";
import type { Op } from "@/lib/ops";
import { useEditor } from "@/components/edit/EditorProvider";
import { useTripChat } from "./ChatProvider";

const MARK: Record<Op["op"], string> = {
  add_segment: "+",
  update_segment: "~",
  remove_segment: "−",
  set_status: "~",
  add_todo: "+",
  complete_todo: "✓",
  resolve_question: "✓",
  update_trip: "~",
  add_plan_item: "+",
  update_plan_item: "~",
  remove_plan_item: "−",
};

/** Segment ids a proposal adds or changes, for the post-apply flash. */
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

export function ProposalCard({ toolCallId, proposal, latest }: { toolCallId: string; proposal: Proposal; latest: boolean }) {
  const { apply, busy } = useEditor();
  const { outcomes, setOutcome, flash, prefill, send } = useTripChat();
  const [error, setError] = useState<string | null>(null);
  const outcome = outcomes[toolCallId];
  const p = proposal;

  async function onApply() {
    setError(null);
    const r = await apply(p.ops, { expectedVersion: p.baseVersion, confirmed: p.status === "needs_confirmation" });
    if (r.kind === "applied") {
      setOutcome(toolCallId, "applied");
      flash(touched(p.ops));
    } else if (r.kind === "conflict") {
      setOutcome(toolCallId, "stale");
      send("The trip changed before that could be applied. Please redo that proposal against the current trip.");
    } else if (r.kind === "rejected") {
      setError(r.issues.map((i) => i.message).join(" "));
    } else if (r.kind === "error") {
      setError(r.message);
    }
  }

  if (p.status === "invalid") {
    return (
      <div className="border-l-4 border-line py-1 pl-3 text-base text-muted">
        Draft rejected by the checks: {p.issues.map((i) => i.message).join(" ")}
      </div>
    );
  }

  const settled = outcome ?? (latest ? null : "discarded");
  return (
    <article
      aria-label={`Proposal: ${p.summary}`}
      className={`rounded-2xl border-2 bg-surface p-4 text-base ${
        settled === "applied" ? "border-booked" : settled ? "border-line" : "border-now"
      }`}
    >
      <p className="text-sm font-bold tracking-wide text-now uppercase">{settled ? "Proposal" : "Proposed change"}</p>
      <h3 className="text-lg font-bold">{p.summary}</h3>
      <ul className="mt-2 flex flex-col gap-1.5">
        {p.changes.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="w-3 shrink-0 font-bold text-muted">
              {MARK[p.ops[i]?.op] ?? "•"}
            </span>
            <span>{c}</span>
          </li>
        ))}
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
      {p.gapDelta.closes.length === 0 && p.gapDelta.opens.length === 0 && (
        <p className="mt-2 text-muted">No change to the gaps.</p>
      )}

      {p.confirmations.length > 0 && !settled && (
        <div className="mt-3 rounded-xl border-2 border-action bg-action-soft p-3">
          {p.confirmations.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
      )}
      {p.redacted.length > 0 && (
        <p className="mt-2 text-muted">Booking codes, contact details, card digits and full names were left out on purpose.</p>
      )}
      {error && <p className="mt-3 rounded-xl border-2 border-action bg-action-soft p-3 font-semibold">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {settled === "applied" && <span className="font-bold text-booked">✓ Applied to the trip</span>}
        {settled === "discarded" && <span className="text-muted">Discarded</span>}
        {settled === "stale" && <span className="text-muted">The trip changed first; asked for a new version.</span>}
        {!settled && (
          <>
            <button
              onClick={onApply}
              disabled={busy}
              className="min-h-11 rounded-xl bg-ink px-5 font-bold text-canvas disabled:opacity-50"
            >
              {p.status === "needs_confirmation" ? "Confirm & apply" : "Apply"}
            </button>
            <button
              onClick={() => setOutcome(toolCallId, "discarded")}
              className="min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-sunken"
            >
              Discard
            </button>
            <button
              onClick={() => prefill("Change that: ")}
              className="min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-sunken"
            >
              Tweak
            </button>
          </>
        )}
      </div>
    </article>
  );
}
