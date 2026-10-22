"use client";

import { rowVerb, type Row } from "@/domain/derive";
import { formatDay, formatTime, zoneName } from "@/domain/time";
import type { Item, Trip, When } from "@/domain/types";
import { useTrip } from "@/client/store";
import { Icon, KIND_ICON } from "@/ui/Icon";

/** "7:00 PM", plus the zone in words when it isn't the trip's ("11:30 AM Pacific Time"). */
export function timeLabel(when: When | null | undefined, trip: Pick<Trip, "tz">): string | null {
  if (!when?.time) return null;
  const t = formatTime(when.time);
  return when.tz && when.tz !== trip.tz ? `${t} ${zoneName(when.tz)}` : t;
}

/** "Thu Nov 26, 7:00 PM" or "Thu Nov 26". */
export function whenLabel(when: When | null | undefined, trip: Pick<Trip, "tz">): string {
  if (!when) return "No day yet";
  const t = timeLabel(when, trip);
  return t ? `${formatDay(when.date)}, ${t}` : formatDay(when.date);
}

/** "Check out: Lumina" for end rows and check-ins, else the title. */
export function rowTitle(row: Row): string {
  const verb = rowVerb(row);
  return verb ? `${verb}: ${row.item.title}` : row.item.title;
}

/** Small marks after a title: booked, needs booking, maybe, saved links. */
export function Marks({ item }: { item: Item }) {
  const links = item.links?.length ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
      {item.booking?.state === "booked" && (
        <span className="inline-flex items-center gap-1 font-semibold text-accent">
          <Icon name="check" className="size-4" />
          Booked
        </span>
      )}
      {item.booking?.state === "todo" && (
        <span className="inline-flex items-center gap-1 font-semibold text-todo">
          <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-current" />
          To book
        </span>
      )}
      {item.maybe && <span className="rounded-md bg-sunken px-1.5 font-semibold text-muted">Maybe</span>}
      {links > 0 && (
        <span className="inline-flex items-center gap-1 text-muted">
          <Icon name="link" className="size-3.5" />
          {links}
        </span>
      )}
    </span>
  );
}

/** One line in a day or a list: time, icon, title, where. Taps through to the item's page. */
export function ItemRow({ row, item, onOpen, showDate }: { row?: Row; item: Item; onOpen: () => void; showDate?: boolean }) {
  const { trip, justChanged } = useTrip();
  const when = row ? row.when : item.start;
  const zone = when?.time && when.tz && when.tz !== trip.tz ? zoneName(when.tz).replace(/ Time$/, "") : null;
  const title = row ? rowTitle(row) : item.title;
  const place = item.place?.name || item.place?.address;
  return (
    <li className={justChanged.has(item.id) ? "just-changed rounded-xl" : ""}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left hover:bg-sunken/60">
        <span className="w-[4.75rem] shrink-0 pt-0.5 text-right">
          {showDate && when && <span className="block text-sm font-semibold text-muted">{formatDay(when.date)}</span>}
          {when?.time ? (
            <time className="block text-base leading-tight font-bold">{formatTime(when.time)}</time>
          ) : (
            !showDate && <span className="block text-sm text-muted">Anytime</span>
          )}
          {zone && <span className="block text-xs text-muted">{zone}</span>}
        </span>
        <Icon name={KIND_ICON[item.kind]} className={`mt-0.5 size-5 ${row?.part === "end" ? "text-muted" : "text-ink"}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`text-base leading-snug font-semibold ${row?.part === "end" ? "text-muted" : ""}`}>{title}</span>
          {place && row?.part !== "end" && <span className="truncate text-sm text-muted">{place}</span>}
          {row?.part !== "end" && <Marks item={item} />}
        </span>
        <Icon name="chevronRight" className="mt-1 size-4 text-muted" />
      </button>
    </li>
  );
}
