import type { Segment, SegmentStatus } from "@/data/types";

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
