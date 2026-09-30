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
      className={`border-2 bg-card p-3 text-sm ${settled === "applied" ? "border-lake" : settled ? "border-scree opacity-70" : "border-dashed border-basalt"}`}
    >
      <h3 className="font-bold">{p.summary}</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {p.changes.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="w-3 shrink-0 font-mono font-bold">
              {MARK[p.ops[i]?.op] ?? "•"}
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>

      {(p.gapDelta.closes.length > 0 || p.gapDelta.opens.length > 0) && (
        <div className="mt-2 flex flex-col gap-1 text-xs">
          {p.gapDelta.closes.length > 0 && (
            <p>
              <span className="font-bold text-lake">Closes:</span> {p.gapDelta.closes.join("; ")}
            </p>
          )}
          {p.gapDelta.opens.length > 0 && (
            <p>
              <span className="hazard-label px-1 font-bold">Opens:</span> {p.gapDelta.opens.join("; ")}
            </p>
          )}
        </div>
      )}
      {p.gapDelta.closes.length === 0 && p.gapDelta.opens.length === 0 && (
        <p className="mt-2 text-xs text-pumice">No change to the gaps.</p>
      )}

      {p.confirmations.length > 0 && !settled && (
        <div className="hazard-label mt-2 p-2 text-xs">
          {p.confirmations.map((c) => (
            <p key={c} className="font-semibold">
              {c}
            </p>
          ))}
        </div>
      )}
      {p.redacted.length > 0 && (
        <p className="mt-2 text-xs text-pumice">Confirmation, phone or card numbers were left out on purpose.</p>
      )}
      {error && <p className="hazard-label mt-2 p-2 text-xs font-semibold">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {settled === "applied" && <span className="font-bold text-lake">■ Applied</span>}
        {settled === "discarded" && <span className="text-pumice">Discarded</span>}
        {settled === "stale" && <span className="text-pumice">The trip changed first; asked for a new version.</span>}
        {!settled && (
          <>
            <button onClick={onApply} disabled={busy} className="bg-basalt px-3 py-1.5 font-bold text-ash disabled:opacity-50">
              {p.status === "needs_confirmation" ? "Confirm and apply" : "Apply"}
            </button>
            <button onClick={() => setOutcome(toolCallId, "discarded")} className="px-1 py-1.5 underline underline-offset-2">
              Discard
            </button>
            <button onClick={() => prefill("Change that: ")} className="px-1 py-1.5 underline underline-offset-2">
              Tweak
            </button>
          </>
        )}
      </div>
    </article>
  );
}
