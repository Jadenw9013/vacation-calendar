"use client";

import Image from "next/image";
import { useState } from "react";
import { dayRows, ideas, nightOf, stayOn, tripDays } from "@/domain/derive";
import { routeUrl } from "@/domain/links";
import { formatRange, monthDay, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import type { PlanSection, View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { PostGrid, postsOf } from "../posts/Posts";
import { ItemRow } from "../shared";
import { SyncLine } from "../SyncLine";
import { PastePlan } from "./PastePlan";

/**
 * Plan, laid out like a profile: the trip at the top with its numbers, then
 * Days (every day in order), Ideas (saved with no day) and Posts (every
 * saved TikTok, Reel and video as a grid).
 */
export function Plan({ section = "days", go }: { section?: PlanSection; go: (v: View) => void }) {
  const { trip, me } = useTrip();
  const compose = useCompose();
  const [pasting, setPasting] = useState(false);
  const open = (item: Item) => go({ tab: "item", itemId: item.id });
  const saved = ideas(trip);
  const posts = postsOf(trip);
  const days = tripDays(trip);
  const planned = trip.items.filter((i) => i.start).length;
  const people = [...new Set([me, ...trip.people])];

  const tabs: { id: PlanSection; label: string; count: number }[] = [
    { id: "days", label: "Days", count: days.length },
    { id: "ideas", label: "Ideas", count: saved.length },
    { id: "posts", label: "Posts", count: posts.length },
  ];

  return (
    <div className="itinerary-view flex flex-col gap-5">
      <header className="flex flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {trip.cover && (
          <div className="cover-photo relative h-36 overflow-hidden rounded-3xl bg-sunken sm:h-48">
            <Image src={trip.cover} alt="" fill priority sizes="(max-width: 768px) 100vw, 42rem" className="object-cover" />
          </div>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{trip.name}</h1>
            <p className="text-base text-muted">{formatRange(trip.startDate, trip.endDate)}</p>
          </div>
          <button type="button" onClick={() => go({ tab: "trip" })} aria-label={`People: ${people.join(", ")}`} className="flex shrink-0 -space-x-2 rounded-full p-1 hover:bg-sunken">
            {people.slice(0, 5).map((p) => (
              <span key={p} className="rounded-full ring-2 ring-canvas">
                <Avatar name={p} />
              </span>
            ))}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 py-1">
          <button type="button" onClick={() => compose({ ask: true, text: "Help me refine this itinerary. What would you adjust, and what still needs arranging?" })} className={btn.primary}><Icon name="sparkles" className="size-4" />Plan with your assistant</button>
          <button type="button" onClick={() => setPasting(true)} className={btn.secondary}><Icon name="plan" className="size-4" />Paste a travel plan</button>
        </div>
        <dl className="grid grid-cols-3 rounded-2xl bg-surface py-2 text-center">
          {[
            [days.length, "days"],
            [planned, "plans"],
            [posts.length, "posts"],
          ].map(([n, l]) => (
            <div key={l}>
              <dt className="sr-only">{l}</dt>
              <dd className="tnum text-xl leading-tight font-bold">{n}</dd>
              <dd aria-hidden="true" className="text-sm text-muted">
                {l}
              </dd>
            </div>
          ))}
        </dl>
        <div role="tablist" aria-label="Plan" className="grid grid-cols-3 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={section === t.id}
              onClick={() => go({ tab: "plan", section: t.id })}
              className={`-mb-px flex min-h-11 items-center justify-center gap-1.5 border-b-2 text-base font-semibold ${
                section === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.count > 0 && t.id !== "days" && <span className="tnum rounded-full bg-sunken px-1.5 text-xs text-muted">{t.count}</span>}
            </button>
          ))}
        </div>
      </header>

      {pasting && <PastePlan onClose={() => setPasting(false)} />}
      <div className="flex flex-col gap-8 px-4" role="tabpanel">
        {trip.items.length === 0 && (
          <section aria-label="Start planning" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-xl font-bold">Make this trip yours</h2>
            <p className="text-base text-muted">Start with a stay or flight, save ideas for later, or use the + button to import booking screenshots.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => compose({ day: trip.startDate, kind: "stay" })} className={btn.primary}>Add a stay</button>
              <button type="button" onClick={() => compose({ day: trip.startDate, kind: "flight" })} className={btn.secondary}>Add a flight</button>
              <button type="button" onClick={() => compose({})} className={btn.secondary}>Save an idea</button>
            </div>
          </section>
        )}
        {section === "days" && days.map((d) => <Day key={d} date={d} last={d === trip.endDate} onOpen={open} onAdd={() => compose({ day: d })} />)}

        {section === "ideas" && (
          <section aria-label="Ideas">
            {saved.length === 0 ? (
              <p className="py-2 text-base text-muted">Nothing saved without a day. Type something with no day in the + box, or paste a link.</p>
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
        )}

        {section === "posts" && (
          <section aria-label="Saved posts" className="flex flex-col gap-3">
            {posts.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-5">
                <div className="flex gap-2">
                  {(["tiktok", "instagram", "youtube"] as const).map((n) => (
                    <span key={n} className="flex size-10 items-center justify-center rounded-xl bg-sunken">
                      <Icon name={n} />
                    </span>
                  ))}
                </div>
                <p className="text-base">
                  <span className="font-bold">Save the TikToks, Reels and videos that made you want to go.</span> Paste a link in the + box, or share it to the app from TikTok or
                  Instagram on Android. They show up here and on the item they&apos;re about.
                </p>
                <button type="button" onClick={() => compose({})} className={btn.primary}>
                  <Icon name="link" />
                  Paste a link
                </button>
              </div>
            ) : (
              <PostGrid entries={posts} showItem go={go} />
            )}
          </section>
        )}

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
    <section id={`day-${date}`} aria-labelledby={`day-${date}-title`} className="itinerary-day scroll-mt-4">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 id={`day-${date}-title`} className="text-lg leading-tight font-bold">
            {weekday(date, true)}, {monthDay(date)}
          </h2>
          {!last &&
            (stay ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <Icon name="bed" className="size-4 text-k-stay" />
                <span className="truncate">
                  {stay.title}
                  {n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
                </span>
              </p>
            ) : (
              <p className="mt-1">
                <StatusPill status="missing" label="No place to stay yet" />
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
