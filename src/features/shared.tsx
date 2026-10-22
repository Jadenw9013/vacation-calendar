"use client";

import { rowVerb, type Row } from "@/domain/derive";
import { isPost } from "@/domain/links";
import { formatDay, formatTime, zoneName } from "@/domain/time";
import type { Item, Trip, When } from "@/domain/types";
import { useTrip } from "@/client/store";
import { KindChip, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { PostImage } from "./posts/Posts";

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

/** Status pills after a title: booked, to book, maybe; and how many links are saved. */
export function Marks({ item }: { item: Item }) {
  const links = (item.links ?? []).filter((l) => !isPost(l.kind)).length;
  const posts = (item.links ?? []).length - links;
  if (!item.booking && !item.maybe && !links && !posts) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {item.booking?.state === "booked" && <StatusPill status="booked" />}
      {item.booking?.state === "todo" && <StatusPill status="todo" />}
      {item.maybe && <StatusPill status="maybe" />}
      {posts > 0 && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="image" className="size-3.5" />
          {posts}
        </span>
      )}
      {links > 0 && (
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="link" className="size-3.5" />
          {links}
        </span>
      )}
    </span>
  );
}

/** One line in a day or a list: time, kind, title, where, status, and a saved post's picture. Taps through to the item. */
export function ItemRow({ row, item, onOpen, showDate }: { row?: Row; item: Item; onOpen: () => void; showDate?: boolean }) {
  const { trip, tripId, justChanged } = useTrip();
  const when = row ? row.when : item.start;
  const zone = when?.time && when.tz && when.tz !== trip.tz ? zoneName(when.tz).replace(/ Time$/, "") : null;
  const title = row ? rowTitle(row) : item.title;
  const place = item.place?.name || item.place?.address;
  const ending = row?.part === "end";
  const post = ending ? undefined : item.links?.find((l) => isPost(l.kind));
  return (
    <li className={justChanged.has(item.id) ? "just-changed rounded-xl" : ""}>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-xl px-1 py-3 text-left hover:bg-sunken/60">
        <span className="w-[4.75rem] shrink-0 pt-1.5 text-right whitespace-nowrap">
          {showDate && when && <span className="block text-sm font-semibold text-muted">{formatDay(when.date)}</span>}
          {when?.time ? (
            <time className="block text-[0.95rem] leading-tight font-bold">{formatTime(when.time)}</time>
          ) : (
            !showDate && <span className="block text-sm text-muted">Anytime</span>
          )}
          {zone && <span className="block text-xs text-muted">{zone}</span>}
        </span>
        <span className={ending ? "opacity-60" : ""}>
          <KindChip kind={item.kind} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
          <span className={`text-base leading-snug font-semibold ${ending ? "text-muted" : ""}`}>{title}</span>
          {place && !ending && <span className="truncate text-sm text-muted">{place}</span>}
          {!ending && <Marks item={item} />}
        </span>
        {post ? (
          <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-sunken" aria-hidden="true">
            <PostImage tripId={tripId} entry={{ link: post, item }} />
          </span>
        ) : (
          <Icon name="chevronRight" className="mt-2.5 size-4 text-muted" />
        )}
      </button>
    </li>
  );
}
