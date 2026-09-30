"use client";

import { useState } from "react";
import type { Gap } from "@/lib/derive";
import type { Segment } from "@/data/types";
import { GapList } from "./GapList";

interface GapBannerProps {
  gaps: Gap[];
  segments: Segment[];
}

export function GapBanner({ gaps, segments }: GapBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (gaps.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-stone-border bg-white px-4 py-3 shadow-xs">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lake/15 text-lake font-bold text-sm">
          ✓
        </span>
        <div className="flex-1 text-sm font-semibold text-lake">
          All set! Every night and transfer is booked.
        </div>
      </div>
    );
  }

  const nightsCount = gaps.filter((g) => g.kind === "night").length;
  const transportCount = gaps.filter((g) => g.kind === "transport" || g.kind === "return").length;

  const parts: string[] = [];
  if (nightsCount > 0) parts.push(`${nightsCount} night${nightsCount > 1 ? "s" : ""} without lodging`);
  if (transportCount > 0) parts.push(`${transportCount} missing transport`);

  return (
    <div className="rounded-2xl border border-maya-border bg-maya-light shadow-xs transition-all overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-maya-border/20 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-maya text-white font-bold text-sm shadow-xs">
            !
          </span>
          <div className="min-w-0">
            <span className="font-serif text-base font-bold text-volcano mr-3">
              {gaps.length} {gaps.length === 1 ? "gap" : "gaps"} to fix
            </span>
            <span className="text-xs text-gray-600 font-sans hidden sm:inline">
              {parts.join(" • ")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-gray-500 shrink-0">
          <span className="text-xs font-medium sm:hidden">{gaps.length}</span>
          <svg
            className={`size-4 text-maya transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Expanded Gap List view */}
      {expanded && (
        <div className="border-t border-maya-border/60 bg-white/70 p-4">
          <GapList gaps={gaps} segments={segments} />
        </div>
      )}
    </div>
  );
}
