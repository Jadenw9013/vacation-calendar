"use client";

import { useId, useState, type ReactNode } from "react";
import { mapsUrl, type AgendaRow } from "@/lib/now";
import { formatTime } from "@/lib/time";
import { Icon } from "@/components/ui/Icon";
import { StatusMark } from "@/components/ui/StatusMark";
import { OwnerLine } from "./ItemActions";

export type Ghost = "added" | "changed" | "removed";

const GHOST_LABEL: Record<Ghost, string> = {
  added: "Proposed",
  changed: "Proposed change",
  removed: "Would be removed",
};

/** "5:00 PM", or "TBD" when only the day is known. */
export function TimeText({ row, className = "" }: { row: AgendaRow; className?: string }) {
  return row.at ? (
    <time dateTime={row.at.raw} className={`tnum font-bold text-ink ${className}`}>
      {formatTime(row.at)}
    </time>
  ) : (
    <span className={`font-bold text-muted ${className}`}>TBD</span>
  );
}

export function rowTitle(row: AgendaRow): string {
  return row.verb ? `${row.verb}: ${row.title}` : row.title;
}

export function MapsLink({ query, label = "Open in Maps", primary }: { query: string; label?: string; primary?: boolean }) {
  return (
    <a
      href={mapsUrl(query)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-base font-semibold ${
        primary ? "bg-ink text-canvas" : "border border-line text-ink hover:bg-sunken"
      }`}
    >
      <Icon name="map" />
      {label}
      <span className="sr-only"> for {query} (opens Google Maps)</span>
    </a>
  );
}

/**
 * One row of a day: time, title, place, status. At most three lines until
 * tapped; tapping opens the notes inline. `actions` is the Plan mode menu.
 */
export function AgendaItem({
  row,
  actions,
  extra,
  ghost,
  flash,
}: {
  row: AgendaRow;
  /** One overflow menu (Plan mode). Trip mode passes nothing: read-only. */
  actions?: ReactNode;
  /** Extra controls inside the expanded detail, e.g. Ask. */
  extra?: ReactNode;
  ghost?: Ghost;
  flash?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const hasDetail = !!(row.notes || row.todos.length || row.mapsQuery || row.peakM || row.until || row.zone || extra || row.place);

  return (
    <li
      className={`flex items-start gap-2 ${flash ? "flash" : ""} ${
        ghost ? `rounded-xl border-2 border-dashed px-2 ${ghost === "removed" ? "border-line opacity-70" : "border-now"}` : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={hasDetail ? open : undefined}
          aria-controls={hasDetail ? detailId : undefined}
          disabled={!hasDetail}
          className="flex min-h-11 w-full items-start gap-2 py-3 text-left disabled:cursor-default sm:gap-3"
        >
          <span className="w-[6.25rem] shrink-0 pt-px text-xl leading-tight whitespace-nowrap">
            <TimeText row={row} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {ghost && <span className="text-sm font-bold text-now">{GHOST_LABEL[ghost]}</span>}
            <span className={`text-base leading-snug font-semibold ${open ? "" : "line-clamp-2"} ${ghost === "removed" ? "line-through" : ""}`}>
              {rowTitle(row)}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {row.status !== "plan" || row.tentative ? <StatusMark status={row.status} tentative={row.tentative} /> : null}
              <OwnerLine row={row} />
              {(row.place || row.zone) && (
                <span className={`min-w-0 text-base text-muted ${open ? "" : "truncate"}`}>
                  {[row.zone, row.place].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </span>
          {/* With a menu beside it (Plan mode) the title needs the room more than the hint. */}
          {hasDetail && !actions && (
            <Icon name="chevronDown" className={`mt-1 size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </button>

        {open && hasDetail && (
          <div id={detailId} className="mb-3 flex flex-col gap-3 text-base sm:ml-[7rem]">
            {row.until && (
              <p>
                Until <TimeText row={{ ...row, at: row.until }} className="text-base" />
              </p>
            )}
            {row.peakM && (
              <p className="font-semibold">
                ▲ Summit {row.peakM.toLocaleString("en-US")} m ({Math.round(row.peakM * 3.28084).toLocaleString("en-US")} ft)
              </p>
            )}
            {row.notes && <p className="whitespace-pre-line">{row.notes}</p>}
            {row.todos.length > 0 && (
              <ul className="list-disc pl-5">
                {row.todos.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
            {(row.mapsQuery || extra) && (
              <div className="flex flex-wrap gap-2">
                {row.mapsQuery && <MapsLink query={row.mapsQuery} />}
                {extra}
              </div>
            )}
          </div>
        )}
      </div>
      {actions && <div className="shrink-0 pt-0.5">{actions}</div>}
    </li>
  );
}
