import type { Segment, SegmentStatus } from "@/data/types";

const LABEL: Record<SegmentStatus, string> = {
  booked: "Booked",
  "needs-booking": "Needs booking",
  undecided: "Undecided",
};

/** Shape + word, so status never depends on color alone. */
function Mark({ status }: { status: SegmentStatus }) {
  if (status === "booked") return <span aria-hidden className="inline-block size-2.5 bg-lake" />;
  if (status === "needs-booking") return <span aria-hidden className="inline-block size-2.5 border-2 border-basalt" />;
  return <span aria-hidden className="inline-block size-3 rounded-full border-2 border-dashed border-basalt" />;
}

export function StatusTag({ status }: { status: SegmentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${status === "booked" ? "text-lake" : "text-basalt"}`}
    >
      <Mark status={status} />
      {LABEL[status]}
    </span>
  );
}

export function OwnerTag({ segment }: { segment: Segment }) {
  if (segment.status === "booked") {
    return <span className="text-xs text-pumice">Booked by {segment.owner ?? "—"}</span>;
  }
  return segment.owner ? (
    <span className="text-xs text-pumice">{segment.owner} is on it</span>
  ) : (
    <span className="text-xs font-semibold">Nobody on it</span>
  );
}

/** Card chrome: solid for booked, dashed for anything still open. */
export function cardClass(status: SegmentStatus): string {
  return status === "booked" ? "border border-scree bg-card" : "border-2 border-dashed border-pumice bg-transparent";
}
