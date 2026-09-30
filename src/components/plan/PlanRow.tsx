"use client";

import type { PlanItem } from "@/data/types";
import { formatTime, parseMoment, type Moment } from "@/lib/time";
import { useEditor } from "@/components/edit/EditorProvider";
import { PlanDialog } from "./PlanDialog";

type Ghost = "added" | "changed" | "removed";

/**
 * A step in the day's plan: lighter than a booking card, with the time in a
 * left column so a day reads as a schedule. Suggested times say so until
 * someone keeps them.
 */
export function PlanRow({ item, at, ghost, flash }: { item: PlanItem; at: Moment; ghost?: Ghost; flash?: boolean }) {
  const { submit, busy } = useEditor();
  const end = item.end ? parseMoment(item.end) : null;

  return (
    <li
      className={`group flex gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/70 ${flash ? "flash" : ""} ${
        ghost === "removed" ? "line-through opacity-50" : ghost ? "ring-2 ring-dashed ring-lake" : ""
      }`}
    >
      <div className="w-16 shrink-0 pt-0.5 text-right font-mono text-xs leading-tight">
        <span className={at.time ? "font-semibold text-volcano" : "text-gray-400"}>{at.time ? formatTime(at) : "Anytime"}</span>
        {end?.time && <span className="block text-[10px] text-gray-400">to {formatTime(end)}</span>}
      </div>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.tentative ? "border-2 border-dashed border-gray-400" : "bg-lake"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-volcano">
          {item.title}
          {item.tentative && (
            <span className="ml-2 rounded-full border border-dashed border-gray-400 px-1.5 py-px align-middle text-[10px] font-semibold text-gray-500 no-underline">
              Suggested
            </span>
          )}
          {ghost && ghost !== "removed" && <span className="ml-2 text-[10px] font-bold text-lake">Proposed</span>}
        </p>
        {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
        {item.owner && <p className="text-[11px] text-gray-400">{item.owner} is on it</p>}
      </div>
      {!ghost && (
        <div className="flex shrink-0 items-start gap-2 text-xs">
          {item.tentative && (
            <button
              type="button"
              disabled={busy}
              onClick={() => submit([{ op: "update_plan_item", id: item.id, changes: { tentative: null } }])}
              title="Keep this time: it's no longer just a suggestion"
              className="rounded-lg border border-lake px-2 py-0.5 font-semibold text-lake hover:bg-lake hover:text-white disabled:opacity-50"
            >
              Keep
            </button>
          )}
          <PlanDialog mode="edit" item={item} trigger="Edit" triggerClassName="text-gray-400 underline underline-offset-2 hover:text-lake" />
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(`Remove “${item.title}” from the plan?`) && submit([{ op: "remove_plan_item", id: item.id }])}
            aria-label={`Remove ${item.title}`}
            className="text-gray-300 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  );
}
