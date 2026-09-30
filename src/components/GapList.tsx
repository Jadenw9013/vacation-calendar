import type { Segment } from "@/data/types";
import type { Gap } from "@/lib/derive";

const WHAT: Record<Gap["kind"], string> = {
  night: "No bed",
  transport: "No transport",
  return: "No way home",
};

export function GapList({ gaps, segments }: { gaps: Gap[]; segments: Segment[] }) {
  if (!gaps.length) {
    return <p className="border border-scree bg-card p-4 font-semibold text-lake">No gaps. Every night and transfer is booked.</p>;
  }
  const title = (id: string) => segments.find((s) => s.id === id)?.title ?? id;
  return (
    <ul className="flex flex-col gap-3">
      {gaps.map((g) => (
        <li key={g.id} className="flex border border-scree bg-card">
          <span aria-hidden className="hazard w-3 shrink-0" />
          <div className="min-w-0 flex-1 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="font-bold">
                <span className="hazard-label mr-2 px-1 text-xs uppercase">{WHAT[g.kind]}</span>
                {g.title}
              </h3>
              <span className="font-mono text-sm font-semibold">{g.duration}</span>
            </div>
            <p className="mt-1 font-mono text-sm [overflow-wrap:anywhere]">{g.window}</p>
            {g.detail && <p className="mt-1 text-sm text-pumice">{g.detail}</p>}
            {g.related.length > 0 && (
              <p className="mt-1 text-sm text-pumice">
                To book: {g.related.map(title).join(" · ")}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
