"use client";

import { useEffect, useRef, useState } from "react";
import type { Segment, SegmentStatus } from "@/data/types";
import { useEditor } from "./edit/EditorProvider";

const LABEL: Record<SegmentStatus, string> = {
  booked: "Booked",
  "needs-booking": "Needs booking",
  undecided: "Undecided",
};

/** Status Styles (not color alone): Solid fill + check, dashed + !, dotted + ? */
export function StatusTag({ status }: { status: SegmentStatus }) {
  if (status === "booked") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-lake px-3 py-1 text-xs font-semibold text-white shadow-xs">
        <span className="flex size-3.5 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
          <svg className="size-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        {LABEL[status]}
      </span>
    );
  }

  if (status === "needs-booking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-maya bg-maya-light px-3 py-1 text-xs font-semibold text-maya shadow-xs">
        <span className="flex size-3.5 items-center justify-center rounded-full bg-maya text-[10px] font-bold text-white" aria-hidden="true">
          !
        </span>
        {LABEL[status]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dotted border-gray-400 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-xs">
      <span className="flex size-3.5 items-center justify-center rounded-full border border-gray-400 text-[10px] font-bold text-gray-600" aria-hidden="true">
        ?
      </span>
      {LABEL[status]}
    </span>
  );
}

/** Interactive 1-click status dropdown to quickly toggle Booked, Needs booking, or Undecided */
export function StatusDropdown({ segment }: { segment: Segment }) {
  const { submit, busy } = useEditor();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  async function handleSelect(newStatus: SegmentStatus) {
    setOpen(false);
    if (newStatus === segment.status) return;
    await submit([
      {
        op: "set_status",
        id: segment.id,
        status: newStatus,
      },
    ]);
  }

  return (
    <div className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy}
        title="Click to change booking status"
        className="group flex items-center gap-1 cursor-pointer transition-transform hover:scale-102 active:scale-98 focus:outline-none"
      >
        <StatusTag status={segment.status} />
        <svg
          className="size-3 text-gray-400 group-hover:text-gray-700 transition-colors"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 min-w-44 rounded-2xl border border-stone-border bg-white p-1.5 shadow-xl">
          <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Set Status
          </p>
          {(["booked", "needs-booking", "undecided"] as SegmentStatus[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleSelect(st)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                segment.status === st ? "bg-stone-light/80 text-volcano" : "hover:bg-stone-light/50 text-gray-600"
              }`}
            >
              <StatusTag status={st} />
              {segment.status === st && <span className="text-lake font-bold text-xs pr-1">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OwnerTag({ segment }: { segment: Segment }) {
  if (segment.status === "booked") {
    return <span className="text-xs text-gray-500">Booked by {segment.owner ?? "—"}</span>;
  }
  return segment.owner ? (
    <span className="text-xs text-gray-500">{segment.owner} is on it</span>
  ) : (
    <span className="text-xs font-semibold text-maya">Nobody on it</span>
  );
}

/** Card chrome: solid for booked, dashed for anything still open */
export function cardClass(status: SegmentStatus): string {
  if (status === "booked") {
    return "border border-stone-border bg-white rounded-xl shadow-xs hover:border-gray-300 transition-colors";
  }
  if (status === "needs-booking") {
    return "border-2 border-dashed border-maya bg-maya-light/60 rounded-xl shadow-xs hover:bg-maya-light/80 transition-colors";
  }
  return "border border-stone-border bg-white/90 rounded-xl shadow-xs hover:border-gray-300 transition-colors";
}
