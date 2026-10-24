"use client";

import Image from "next/image";
import { useState } from "react";
import { dayRows, ideas, nightOf, stayOn, toBook, tripDays } from "@/domain/derive";
import { directionsUrl, mapsEmbedUrl, mapsSearchUrl, routeUrl } from "@/domain/links";
import { formatDay, formatRange, formatTime, monthDay, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import type { PlanSection, View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar, KindChip, KIND_LABEL, StatusPill } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { PostGrid, postsOf } from "../posts/Posts";
import { ItemRow } from "../shared";
import { SyncLine } from "../SyncLine";
import { PastePlan } from "./PastePlan";

const PLACE_THUMBS = [
  "/lake-atitlan-hero.jpg",
  "/antigua-hotel.jpg",
  "/guatemala-hero-sunset.jpg",
  "/hotel-room-night.jpg",
  "/volcano-sidebar-night.jpg",
  "/flight-sunset-wing.jpg",
];

/**
 * Plan: redesigned Voyroo trip dashboard with hero cover banner, stat cards,
 * two-column itinerary + interactive Google Maps/saved/bookings widgets, and Ask Voyroo assistant bar.
 */
export function Plan({ section = "days", go, onShare }: { section?: PlanSection; go: (v: View) => void; onShare?: () => void }) {
  const { trip, me } = useTrip();
  const compose = useCompose();
  const [pasting, setPasting] = useState(false);
  const [askText, setAskText] = useState("");
  const [mapTab, setMapTab] = useState<"map" | "stops">("map");
  const [activeStop, setActiveStop] = useState<string | null>(null);
  const open = (item: Item) => go({ tab: "item", itemId: item.id });
  const saved = ideas(trip);
  const posts = postsOf(trip);
  const days = tripDays(trip);
  const planned = trip.items.filter((i) => i.start).length;
  const bookedItems = trip.items.filter((i) => i.booking?.state === "booked");
  const pendingBookings = toBook(trip);
  const allBookings = [...bookedItems, ...pendingBookings];
  const people = [...new Set([me, ...trip.people])];
  const coverSrc = trip.cover || "/lake-atitlan-hero.jpg";

  const tabs: { id: PlanSection; label: string; count: number }[] = [
    { id: "days", label: "Days", count: days.length },
    { id: "ideas", label: "Ideas", count: saved.length },
    { id: "posts", label: "Posts", count: posts.length },
  ];

  // Places to highlight in Top Saved Places (saved ideas first, then activities/food/stays)
  const highlightedPlaces = [...saved, ...trip.items.filter((i) => i.start && i.kind !== "flight")].slice(0, 4);

  // All unique stops across trip items
  const allStopNames = Array.from(
    new Set(
      [
        ...trip.items.map((i) => i.place?.name || i.place?.address || (i.kind === "stay" ? i.title : null)).filter((x): x is string => !!x),
        trip.destination,
      ].filter(Boolean),
    ),
  );
  const mapStops = allStopNames.slice(0, 3);

  const activeMapQuery = activeStop
    ? activeStop.toLowerCase().includes(trip.destination.toLowerCase())
      ? activeStop
      : `${activeStop}, ${trip.destination}`
    : trip.destination;
  const embedSrc = mapsEmbedUrl(activeMapQuery, activeStop ? 13 : 9);

  const fullRoute =
    routeUrl(
      trip.items.filter((i) => i.start && i.place).slice(0, 6),
      trip,
    ) ?? mapsSearchUrl(trip.destination);

  return (
    <div className="itinerary-view flex flex-col gap-5 px-3 pt-3 sm:px-4 md:px-0">
      {/* Hero Banner */}
      <header className="flex flex-col gap-4">
        <div className="relative min-h-48 overflow-hidden rounded-3xl border border-line bg-[#0f1322] p-5 text-[#f2f4fc] shadow-lift sm:min-h-60 sm:p-7">
          <div className="cover-photo absolute inset-0">
            <Image
              src={coverSrc}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 72rem"
              unoptimized={coverSrc.startsWith("http")}
              className="object-cover opacity-65"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d17] via-[#0b0d17]/65 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d17]/85 via-[#0b0d17]/35 to-transparent" />
          </div>

          <div className="relative z-10 flex h-full min-h-36 flex-col justify-between gap-4 sm:min-h-44">
            <div className="flex items-start justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#131728]/85 px-3 py-1 text-xs font-semibold text-[#e2e8f0] backdrop-blur-md">
                <Icon name="pin" className="size-3.5 text-[#a78bfa]" />
                {trip.destination}
              </span>
              <button
                type="button"
                onClick={() => go({ tab: "trip" })}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-[#131728]/80 px-3 py-1.5 text-xs font-semibold text-[#f2f4fc] backdrop-blur-md transition-colors hover:bg-[#1b2138]"
              >
                <Icon name="image" className="size-3.5 text-[#a78bfa]" />
                Edit Trip
              </button>
            </div>

            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wide text-[#cbd5f5] sm:text-sm">
                  {formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}
                </p>
                <h1 className="mt-1 text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl">
                  {trip.name}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => go({ tab: "trip" })}
                    aria-label={`People: ${people.join(", ")}`}
                    className="flex shrink-0 -space-x-2 rounded-full bg-[#131728]/80 p-1 pr-2.5 backdrop-blur-md transition-colors hover:bg-[#1b2138]"
                  >
                    {people.slice(0, 5).map((p) => (
                      <span key={p} className="rounded-full ring-2 ring-[#0f1322]">
                        <Avatar name={p} size="sm" />
                      </span>
                    ))}
                    <span className="ml-3 self-center text-xs font-bold text-[#e2e8f0]">
                      {people.length} {people.length === 1 ? "member" : "members"}
                    </span>
                  </button>
                  {onShare && (
                    <button
                      type="button"
                      onClick={onShare}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/15 bg-[#1b2138]/90 px-3.5 py-1 text-xs font-bold text-white backdrop-blur-md transition-colors hover:bg-[#252d4a]"
                    >
                      <Icon name="users" className="size-3.5 text-[#a78bfa]" />
                      Invite
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    compose({
                      ask: true,
                      text: "Help me refine this itinerary. What would you adjust, and what still needs arranging?",
                    })
                  }
                  className={btn.primary}
                >
                  <Icon name="sparkles" className="size-4" />
                  Plan with your assistant
                </button>
                <button type="button" onClick={() => setPasting(true)} className={btn.secondary}>
                  <Icon name="plan" className="size-4" />
                  Paste a travel plan
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section Tabs (Days / Ideas / Posts) */}
        <div className="flex items-center justify-between gap-4 border-b border-line px-1">
          <div role="tablist" aria-label="Plan" className="flex flex-1 gap-2 sm:flex-initial sm:gap-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={section === t.id}
                onClick={() => go({ tab: "plan", section: t.id })}
                className={`-mb-px flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors sm:flex-initial sm:px-4 sm:text-base ${
                  section === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                <Icon name={t.id === "days" ? "today" : t.id === "ideas" ? "heart" : "image"} className="size-4" />
                {t.label}
                {t.count > 0 && t.id !== "days" && (
                  <span className="tnum rounded-full bg-sunken px-2 py-0.5 text-xs text-muted">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => go({ tab: "todo" })}
              className="flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Icon name="ticket" className="size-4 text-k-activity" />
              Bookings ({allBookings.length})
            </button>
            <button
              type="button"
              onClick={() => go({ tab: "trip" })}
              className="flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              <Icon name="wallet" className="size-4 text-k-stay" />
              Expenses & Settings
            </button>
          </div>
        </div>

        {/* Stat Cards Row */}
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-lift">
            <dt className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-k-flight-soft text-k-flight">
              <span className="sr-only">Days</span>
              <Icon name="today" className="size-5" />
            </dt>
            <dd className="min-w-0">
              <span className="tnum block text-xl leading-tight font-extrabold">{days.length}</span>
              <span aria-hidden="true" className="block truncate text-xs font-medium text-muted">
                Days
              </span>
            </dd>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-lift">
            <dt className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <span className="sr-only">Planned Stops</span>
              <Icon name="pin" className="size-5" />
            </dt>
            <dd className="min-w-0">
              <span className="tnum block text-xl leading-tight font-extrabold">{planned}</span>
              <span aria-hidden="true" className="block truncate text-xs font-medium text-muted">
                Planned Stops
              </span>
            </dd>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-lift">
            <dt className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-k-activity-soft text-k-activity">
              <span className="sr-only">Bookings</span>
              <Icon name="ticket" className="size-5" />
            </dt>
            <dd className="min-w-0">
              <span className="tnum block text-xl leading-tight font-extrabold">{bookedItems.length}</span>
              <span aria-hidden="true" className="block truncate text-xs font-medium text-muted">
                Bookings
              </span>
            </dd>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-lift">
            <dt className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-k-food-soft text-k-food">
              <span className="sr-only">Saved Places</span>
              <Icon name="heart" className="size-5" />
            </dt>
            <dd className="min-w-0">
              <span className="tnum block text-xl leading-tight font-extrabold">{saved.length + posts.length}</span>
              <span aria-hidden="true" className="block truncate text-xs font-medium text-muted">
                Saved Places
              </span>
            </dd>
          </div>
        </dl>
      </header>

      {pasting && <PastePlan onClose={() => setPasting(false)} />}

      {/* Two-Column Dashboard Content */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Left Column: Main Tabpanel + Ask Voyroo Card */}
        <div className="flex min-w-0 flex-col gap-6" role="tabpanel">
          <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface p-4 shadow-lift sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-tight">
                {section === "days" ? "Upcoming Itinerary" : section === "ideas" ? "Saved Places & Ideas" : "Saved Posts"}
              </h2>
              {section === "days" && (
                <button
                  type="button"
                  onClick={() => go({ tab: "today" })}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-sunken px-3.5 text-xs font-bold text-ink transition-colors hover:border-accent"
                >
                  Day-by-Day View
                  <Icon name="chevronRight" className="size-3.5" />
                </button>
              )}
            </div>

            {trip.items.length === 0 && (
              <section aria-label="Start planning" className="flex flex-col gap-3 rounded-2xl border border-line bg-sunken/50 p-4">
                <h3 className="text-lg font-bold">Make this trip yours</h3>
                <p className="text-sm text-muted">
                  Start with a stay or flight, save ideas for later, or use the + button to import booking screenshots.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => compose({ day: trip.startDate, kind: "stay" })} className={btn.primary}>
                    Add a stay
                  </button>
                  <button type="button" onClick={() => compose({ day: trip.startDate, kind: "flight" })} className={btn.secondary}>
                    Add a flight
                  </button>
                  <button type="button" onClick={() => compose({})} className={btn.secondary}>
                    Save an idea
                  </button>
                </div>
              </section>
            )}

            {section === "days" && (
              <div className="flex flex-col gap-7">
                {days.map((d) => (
                  <Day key={d} date={d} last={d === trip.endDate} onOpen={open} onAdd={() => compose({ day: d })} />
                ))}
              </div>
            )}

            {section === "ideas" && (
              <section aria-label="Ideas">
                {saved.length === 0 ? (
                  <p className="py-2 text-base text-muted">
                    Nothing saved without a day. Type something with no day in the + box, or paste a link.
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {saved.map((i) => (
                      <ItemRow key={i.id} item={i} onOpen={() => open(i)} />
                    ))}
                  </ul>
                )}
                <button type="button" onClick={() => compose({})} className={`${btn.quiet} mt-2 -ml-3`}>
                  <Icon name="plus" />
                  Save an idea
                </button>
              </section>
            )}

            {section === "posts" && (
              <section aria-label="Saved posts" className="flex flex-col gap-3">
                {posts.length === 0 ? (
                  <div className="flex flex-col items-start gap-3 rounded-2xl bg-sunken/50 p-5">
                    <div className="flex gap-2">
                      {(["tiktok", "instagram", "youtube"] as const).map((n) => (
                        <span key={n} className="flex size-10 items-center justify-center rounded-xl bg-surface">
                          <Icon name={n} />
                        </span>
                      ))}
                    </div>
                    <p className="text-base">
                      <span className="font-bold">Save the TikToks, Reels and videos that made you want to go.</span> Paste a link in the + box, or share it to the app from TikTok or Instagram on Android. They show up here and on the item they&apos;re about.
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
          </div>

          {/* Ask Voyroo Card (matching bottom-left of reference image) */}
          <section
            aria-label="Ask Voyroo"
            className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-lift"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-accent/15 via-k-stay/15 to-k-food/10 opacity-80"
            />
            <div className="relative z-10 flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name="sparkles" className="size-4" />
                </span>
                <h2 className="text-lg font-extrabold">Ask Voyroo</h2>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = askText.trim();
                  setAskText("");
                  compose({ ask: true, text: q || "Help me plan the next step of our trip." });
                }}
                className="flex items-center gap-2 rounded-2xl border border-line bg-canvas p-1.5 pl-4 focus-within:border-accent"
              >
                <input
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  placeholder="Plan, find, or ask anything about your trip…"
                  aria-label="Ask Voyroo anything about your trip"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
                />
                <button
                  type="submit"
                  aria-label="Send to Voyroo"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent transition-transform active:scale-95"
                >
                  <Icon name="send" className="size-4" />
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {[
                  ["Create a day plan", `Plan a great day in ${trip.destination} around what we have booked.`],
                  ["Find restaurants", `Where should we eat in ${trip.destination}?`],
                  ["Budget tips", `What are smart budget and money tips for ${trip.destination}?`],
                  ["Local tips", `What local tips should we know before arriving in ${trip.destination}?`],
                ].map(([labelText, prompt]) => (
                  <button
                    key={labelText}
                    type="button"
                    onClick={() => compose({ ask: true, text: prompt })}
                    className="min-h-9 rounded-full border border-line bg-sunken/70 px-3.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
                  >
                    {labelText}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <SyncLine />
        </div>

        {/* Right Column: Map Card, Top Saved Places, and Bookings */}
        <aside aria-label="Trip overview widgets" className="flex min-w-0 flex-col gap-6">
          {/* Interactive Google Maps & Route Stops Card */}
          <section
            aria-label="Trip route map"
            className="relative flex flex-col gap-3.5 overflow-hidden rounded-3xl border border-line bg-[#0f1528] p-4 text-[#f2f4fc] shadow-lift sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Map view mode"
                className="inline-flex rounded-full border border-white/10 bg-[#13182b] p-1 text-xs font-bold"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mapTab === "map"}
                  onClick={() => setMapTab("map")}
                  className={`rounded-full px-3.5 py-1 transition-colors ${
                    mapTab === "map" ? "bg-[#5b21b6] text-white" : "text-[#9ca6c7] hover:text-white"
                  }`}
                >
                  Map
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mapTab === "stops"}
                  onClick={() => setMapTab("stops")}
                  className={`rounded-full px-3.5 py-1 transition-colors ${
                    mapTab === "stops" ? "bg-[#5b21b6] text-white" : "text-[#9ca6c7] hover:text-white"
                  }`}
                >
                  Stops ({allStopNames.length})
                </button>
              </div>
              <a
                href={fullRoute}
                target="_blank"
                rel="noreferrer"
                aria-label="Open route in Google Maps"
                className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-[#13182b] text-white transition-colors hover:bg-[#1f2742]"
              >
                <Icon name="external" className="size-4" />
              </a>
            </div>

            {mapTab === "map" ? (
              <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d1324]">
                <iframe
                  key={embedSrc}
                  src={embedSrc}
                  title={`Google Map of ${activeMapQuery}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="size-full border-0 [filter:invert(90%)_hue-rotate(180deg)_brightness(95%)_contrast(92%)]"
                />

                {/* Interactive Stop Pin Overlay Pills */}
                <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex flex-col items-start gap-1.5">
                  {mapStops.map((stop, idx) => {
                    const selected = activeStop === stop;
                    return (
                      <button
                        key={stop}
                        type="button"
                        onClick={() => setActiveStop(selected ? null : stop)}
                        style={{ marginLeft: `${idx * 12}px` }}
                        className={`pointer-events-auto inline-flex max-w-[92%] items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold shadow-lift backdrop-blur-md transition-colors ${
                          selected
                            ? "border-[#a78bfa] bg-[#5b21b6] text-white"
                            : "border-white/15 bg-[#13182b]/90 text-white hover:bg-[#1f2742]"
                        }`}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-[#8b5cf6] text-[10px] text-white">
                          <Icon name="pin" className="size-2.5" />
                        </span>
                        <span className="truncate">{stop}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {allStopNames.map((stop, idx) => {
                  const stopQuery = stop.toLowerCase().includes(trip.destination.toLowerCase())
                    ? stop
                    : `${stop}, ${trip.destination}`;
                  return (
                    <li
                      key={stop}
                      className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#161c33] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveStop(stop);
                          setMapTab("map");
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left font-bold text-white hover:text-[#c4b5fd]"
                      >
                        <span className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-[#5b21b6] text-[11px] text-white">
                          {idx + 1}
                        </span>
                        <span className="truncate">{stop}</span>
                      </button>
                      <a
                        href={mapsSearchUrl(stopQuery)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${stop} in Google Maps`}
                        className="shrink-0 rounded-lg border border-white/10 bg-[#1f2742] px-2.5 py-1 font-semibold text-[#c4b5fd] hover:bg-[#2a3558]"
                      >
                        Maps ↗
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#cbd5f5]">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="pin" className="size-3.5 shrink-0 text-[#a78bfa]" />
                <span className="truncate font-semibold">{activeStop ?? trip.destination}</span>
                {activeStop && (
                  <button
                    type="button"
                    onClick={() => setActiveStop(null)}
                    className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-white/20"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={directionsUrl({ name: activeStop ?? trip.destination }, trip) ?? fullRoute}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-[#93c5fd] hover:underline"
                >
                  Directions
                </a>
                <a href={fullRoute} target="_blank" rel="noreferrer" className="font-bold text-[#c4b5fd] hover:underline">
                  Open full map →
                </a>
              </div>
            </div>
          </section>

          {/* Top Saved Places Card */}
          <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-lift">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold">Top Saved Places</h2>
              <button
                type="button"
                onClick={() => go({ tab: "plan", section: "ideas" })}
                className="text-xs font-bold text-accent hover:underline"
              >
                View All
              </button>
            </div>

            {highlightedPlaces.length === 0 ? (
              <p className="text-sm text-muted">Save ideas or places to see them highlighted here.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {highlightedPlaces.map((place, idx) => (
                  <li key={place.id}>
                    <button
                      type="button"
                      onClick={() => open(place)}
                      className="group flex w-full flex-col gap-2 text-left"
                    >
                      <span className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-sunken">
                        <Image
                          src={PLACE_THUMBS[idx % PLACE_THUMBS.length]}
                          alt=""
                          fill
                          sizes="180px"
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full bg-white text-[#e11d48] shadow">
                          <Icon name="heart" className="size-3.5" />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">{place.title}</span>
                        <span className="block truncate text-xs text-muted">{place.place?.name || KIND_LABEL[place.kind]}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Bookings Card */}
          <section className="flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5 shadow-lift">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-extrabold">Bookings</h2>
              <button
                type="button"
                onClick={() => go({ tab: "todo" })}
                className="text-xs font-bold text-accent hover:underline"
              >
                View All
              </button>
            </div>

            {allBookings.length === 0 ? (
              <p className="text-sm text-muted">No reservations tracked yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {allBookings.slice(0, 3).map((bItem) => (
                  <li key={bItem.id}>
                    <button
                      type="button"
                      onClick={() => open(bItem)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-sunken/50 p-3 text-left transition-colors hover:bg-sunken"
                    >
                      <KindChip kind={bItem.kind} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{bItem.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {bItem.start
                            ? `${formatDay(bItem.start.date)}${bItem.start.time ? ` · ${formatTime(bItem.start.time)}` : ""}`
                            : "Date TBD"}
                        </span>
                      </span>
                      <StatusPill
                        status={bItem.booking?.state === "booked" ? "booked" : "todo"}
                        label={bItem.booking?.state === "booked" ? "Confirmed" : "To book"}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
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
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-lg bg-accent-soft px-2 py-0.5 text-xs font-extrabold text-accent">
              {monthDay(date)}
            </span>
            <h2 id={`day-${date}-title`} className="text-lg leading-tight font-bold">
              {weekday(date, true)}, {monthDay(date)}
            </h2>
          </div>
          {!last &&
            (stay ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <Icon name="bed" className="size-4 text-k-stay" />
                <span className="truncate">
                  {stay.title}
                  {n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
                </span>
              </p>
            ) : (
              <p className="mt-1.5">
                <StatusPill status="missing" label="No place to stay yet" />
              </p>
            ))}
          {last && <p className="mt-1 text-sm text-muted">Travel home</p>}
        </div>
        {route && (
          <a href={route} target="_blank" rel="noreferrer" className={`${btn.quiet} shrink-0 text-sm`}>
            <Icon name="route" className="size-4" />
            Route
          </a>
        )}
      </div>
      {rows.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1.5">
          {rows.map((r) => (
            <ItemRow key={r.key} row={r} item={r.item} onOpen={() => onOpen(r.item)} />
          ))}
        </ol>
      )}
      <button type="button" onClick={onAdd} className={`${btn.quiet} mt-1.5 -ml-3 text-sm`}>
        <Icon name="plus" />
        Add
      </button>
    </section>
  );
}
