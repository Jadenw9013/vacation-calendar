import type { SegmentStatus } from "@/data/types";
import { Icon } from "./Icon";

/**
 * Status by shape and words, never color alone. Needs-action is the loudest
 * (solid fill); booked is quiet (a check and a word).
 */
export function StatusMark({ status, tentative }: { status: SegmentStatus | "plan"; tentative?: boolean }) {
  if (status === "booked") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-booked">
        <Icon name="check" className="size-4" />
        Booked
      </span>
    );
  }
  if (status === "needs-booking") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-action px-2 py-0.5 text-sm font-bold text-on-fill">
        <span aria-hidden="true">!</span>
        Not booked
      </span>
    );
  }
  if (status === "undecided") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border-2 border-action px-2 py-px text-sm font-bold text-action">
        <span aria-hidden="true">?</span>
        Undecided
      </span>
    );
  }
  if (tentative) {
    return <span className="inline-flex items-center rounded-md border border-dashed border-muted px-2 py-px text-sm font-semibold text-muted">Suggested time</span>;
  }
  return <span className="text-sm text-muted">Plan</span>;
}
