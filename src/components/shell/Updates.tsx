"use client";

import type { Trip } from "@/data/types";
import type { ChangeEntry } from "@/lib/engine";
import { describeEntry, timeAgo } from "@/lib/updates";
import { useEditor } from "@/components/edit/EditorProvider";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { useMarkSeen } from "./useUpdates";

/** The change log in plain sentences, newest first. Closing it marks everything as seen. */
export function UpdatesSheet({
  open,
  onClose,
  entries,
  trip,
  nowMs,
  seenMs,
  online,
}: {
  open: boolean;
  onClose: () => void;
  entries: ChangeEntry[];
  trip: Trip;
  nowMs: number;
  /** Changes after this, by other people, are marked New. */
  seenMs: number;
  online: boolean;
}) {
  const { undo, busy, author } = useEditor();
  const markSeen = useMarkSeen();

  const latest = entries[0] ? Date.parse(entries[0].at) : 0;

  return (
    <Sheet
      open={open}
      onClose={() => {
        // Marked seen on the way out, so "New" stays visible while reading.
        markSeen.all(latest);
        onClose();
      }}
      title="Updates"
    >
      {entries.length === 0 ? (
        <p className="py-2 text-base text-muted">No changes yet. Everything is as first entered.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {entries.slice(0, 30).map((e, i) => {
            const isNew = Date.parse(e.at) > seenMs && e.author !== author;
            return (
              <li key={e.id} className="flex flex-col gap-1 py-3">
                <p className="text-base">
                  {isNew && <span className="mr-2 rounded-md border-2 border-now px-1.5 text-sm font-bold text-now">New</span>}
                  {describeEntry(e, trip)}, <span className="text-muted">{timeAgo(e.at, nowMs)}.</span>
                </p>
                {i === 0 && (
                  <button
                    type="button"
                    onClick={undo}
                    disabled={busy || !online}
                    className="mt-1 inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-line px-4 text-base font-semibold hover:bg-sunken disabled:opacity-60"
                  >
                    <Icon name="chevronLeft" />
                    {online ? "Undo this" : "Undo needs a connection"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

/** The button that opens Updates, with how many are new. */
export function UpdatesButton({ count, onClick, onPhoto }: { count: number; onClick: () => void; onPhoto?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold ${
        onPhoto ? "bg-surface text-ink" : "border border-line hover:bg-sunken"
      }`}
    >
      Updates
      {count > 0 && (
        <span className="tnum rounded-full bg-now px-2 text-sm font-bold text-on-fill">
          {count}
          <span className="sr-only"> new</span>
        </span>
      )}
    </button>
  );
}
