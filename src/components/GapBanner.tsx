"use client";

import { useState } from "react";
import type { Segment } from "@/data/types";
import type { Gap } from "@/lib/derive";
import { GapList } from "./GapList";

/**
 * The one summary of what's missing, sitting on the night strip it describes.
 * Unbooked nights also show inline on their day; transfers and the flight
 * home only show here, so the details expand from this line.
 */
export function GapSummary({ gaps, segments }: { gaps: Gap[]; segments: Segment[] }) {
  const [expanded, setExpanded] = useState(false);

  if (gaps.length === 0) {
    return <span className="text-xs font-semibold text-lake">✓ Every night and transfer is booked</span>;
  }

  const nights = gaps.filter((g) => g.kind === "night").length;
  const moves = gaps.filter((g) => g.kind === "transport" || g.kind === "return").length;
  const parts: string[] = [];
  if (nights) parts.push(`${nights} ${nights === 1 ? "stretch" : "stretches"} without a bed`);
  if (moves) parts.push(`${moves} ${moves === 1 ? "move" : "moves"} not booked`);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-maya hover:underline underline-offset-2"
      >
        <span className="flex size-4 items-center justify-center rounded-full bg-maya text-[10px] font-bold text-white">!</span>
        {parts.join(" · ")}
        <svg
          className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {expanded && (
        <div className="order-last mt-2 w-full rounded-2xl border border-maya-border bg-white/80 p-4">
          <GapList gaps={gaps} segments={segments} />
        </div>
      )}
    </>
  );
}
