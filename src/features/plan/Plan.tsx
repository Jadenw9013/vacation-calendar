"use client";

import Image from "next/image";
import { dayRows, ideas, nightOf, stayOn, tripDays } from "@/domain/derive";
import { routeUrl } from "@/domain/links";
import { formatRange, monthDay, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { ItemRow } from "../shared";
import { SyncLine } from "../SyncLine";

/** Plan: every day in order, where you sleep, and the ideas not on a day yet. */
export function Plan({ go }: { go: (v: View) => void }) {
  const { trip } = useTrip();
  const compose = useCompose();
  const open = (item: Item) => go({ tab: "item", itemId: item.id });
  const saved = ideas(trip);

  return (
    <div className="flex flex-col gap-6">
      <header className="relative overflow-hidden px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {trip.cover && (
          <div className="cover-photo relative mb-4 h-36 overflow-hidden rounded-3xl bg-sunken sm:h-48">
            <Image src={trip.cover} alt="" fill priority sizes="(max-width: 768px) 100vw, 42rem" className="object-cover" />
          </div>
        )}
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <p className="text-base text-muted">
          {formatRange(trip.startDate, trip.endDate)}
          {trip.people.length > 0 && `, with ${trip.people.join(", ")}`}
        </p>
      </header>

      <div className="flex flex-col gap-8 px-4">
        {tripDays(trip).map((d) => (
          <Day key={d} date={d} last={d === trip.endDate} onOpen={open} onAdd={() => compose({ day: d })} />
        ))}

        <section aria-labelledby="ideas">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h2 id="ideas" className="text-lg font-bold">
              Ideas
            </h2>
            <span className="text-sm text-muted">Not on a day yet</span>
          </div>
          {saved.length === 0 ? (
            <p className="py-2 text-base text-muted">Paste a TikTok, a Reel or any link to save it here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {saved.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={() => open(i)} />
              ))}
            </ul>
          )}
          <button type="button" onClick={() => compose({})} className={`${btn.quiet} mt-1 -ml-3`}>
            <Icon name="plus" />
            Save an idea
          </button>
        </section>

        <SyncLine />
      </div>
    </div>
  );
}

function Day({ date, last, onOpen, onAdd }: { date: string; last: boolean; onOpen: (i: Item) => void; onAdd: () => void }) {
  const { trip } = useTrip();
  const rows = dayRows(trip, date);
  const stay = last ? null : stayOn(trip, date);
  const n = stay ? nightOf(stay, date) : null;
  const route = routeUrl(
    rows.filter((r) => r.part === "start").map((r) => r.item),
    trip,
  );
  return (
    <section id={`day-${date}`} aria-labelledby={`day-${date}-title`} className="scroll-mt-4">
      <div className="flex items-start justify-between gap-3 border-b-2 border-ink pb-2">
        <div className="min-w-0">
          <h2 id={`day-${date}-title`} className="text-lg leading-tight font-bold">
            {weekday(date, true)}, {monthDay(date)}
          </h2>
          {!last &&
            (stay ? (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Icon name="bed" className="size-4" />
                <span className="truncate">
                  {stay.title}
                  {n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
                </span>
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-todo">
                <Icon name="bed" className="size-4" />
                No place to stay yet
              </p>
            ))}
          {last && <p className="text-sm text-muted">Travel home</p>}
        </div>
        {route && (
          <a href={route} target="_blank" rel="noreferrer" className={`${btn.quiet} shrink-0 text-sm`}>
            <Icon name="route" className="size-4" />
            Route
          </a>
        )}
      </div>
      {rows.length > 0 && (
        <ol className="divide-y divide-line">
          {rows.map((r) => (
            <ItemRow key={r.key} row={r} item={r.item} onOpen={() => onOpen(r.item)} />
          ))}
        </ol>
      )}
      <button type="button" onClick={onAdd} className={`${btn.quiet} mt-1 -ml-3`}>
        <Icon name="plus" />
        Add
      </button>
    </section>
  );
}
