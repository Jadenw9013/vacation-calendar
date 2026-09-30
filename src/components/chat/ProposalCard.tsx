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
};

/** Segment ids a proposal adds or changes, for the post-apply flash. */
function touched(ops: Op[]): string[] {
  return ops.flatMap((o) =>
    o.op === "add_segment" ? [o.segment.id] : o.op === "update_segment" || o.op === "set_status" ? [o.id] : [],
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
      <div className="border-l-4 border-pumice py-1 pl-3 text-xs text-pumice">
        Draft rejected by the checks: {p.issues.map((i) => i.message).join(" ")}
      </div>
    );
  }

  const settled = outcome ?? (latest ? null : "discarded");
  return (
    <article
      aria-label={`Proposal: ${p.summary}`}
      className={`rounded-2xl border bg-white p-4 text-sm shadow-xs ${
        settled === "applied"
          ? "border-lake ring-1 ring-lake/30"
          : settled
            ? "border-stone-border opacity-70"
            : "border-maya-border/80 bg-maya-light/20"
      }`}
    >
      <h3 className="font-serif font-bold text-volcano text-base">{p.summary}</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-gray-700">
        {p.changes.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="w-3 shrink-0 font-mono font-bold text-lake">
              {MARK[p.ops[i]?.op] ?? "•"}
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>

      {(p.gapDelta.closes.length > 0 || p.gapDelta.opens.length > 0) && (
        <div className="mt-2.5 flex flex-col gap-1 text-xs">
          {p.gapDelta.closes.length > 0 && (
            <p className="text-lake font-medium">
              <span className="font-bold">Closes:</span> {p.gapDelta.closes.join("; ")}
            </p>
          )}
          {p.gapDelta.opens.length > 0 && (
            <p className="text-maya font-medium">
              <span className="font-bold">Opens:</span> {p.gapDelta.opens.join("; ")}
            </p>
          )}
        </div>
      )}
      {p.gapDelta.closes.length === 0 && p.gapDelta.opens.length === 0 && (
        <p className="mt-2 text-xs text-gray-400">No change to the gaps.</p>
      )}

      {p.confirmations.length > 0 && !settled && (
        <div className="mt-2 rounded-lg bg-maya-light border border-maya-border p-2 text-xs text-maya font-medium">
          {p.confirmations.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
      )}
      {p.redacted.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">Booking codes, contact details, card digits and full names were left out on purpose.</p>
      )}
      {error && <p className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2 text-xs font-semibold text-red-700">{error}</p>}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {settled === "applied" && <span className="font-bold text-lake text-xs">✓ Applied to trip</span>}
        {settled === "discarded" && <span className="text-xs text-gray-400">Discarded</span>}
        {settled === "stale" && <span className="text-xs text-gray-400">The trip changed first; asked for a new version.</span>}
        {!settled && (
          <>
            <button
              onClick={onApply}
              disabled={busy}
              className="rounded-lg bg-lake px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-lake-hover disabled:opacity-50 transition-colors"
            >
              {p.status === "needs_confirmation" ? "Confirm & apply" : "Apply"}
            </button>
            <button
              onClick={() => setOutcome(toolCallId, "discarded")}
              className="rounded-lg border border-stone-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={() => prefill("Change that: ")}
              className="rounded-lg border border-stone-border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 transition-colors"
            >
              Tweak
            </button>
          </>
        )}
      </div>
    </article>
  );
}
