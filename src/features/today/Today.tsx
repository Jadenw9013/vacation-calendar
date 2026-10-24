"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { dayRows, nightOf, nights, nowNext, phase, stayOn, toBook, tripDays, type Row } from "@/domain/derive";
import { directionsUrl, mapsEmbedUrl, mapsSearchUrl, routeUrl, telUrl, whatsappUrl } from "@/domain/links";
import { daysBetween, formatDay, formatDuration, formatRange, formatTime, monthDay, todayIn, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import { useClock } from "@/client/hooks";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Avatar, KindChip } from "@/ui/badges";
import { Icon, type IconName } from "@/ui/Icon";
import { ActionChip, btn, useCopy } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { ItemRow, rowTitle, timeLabel } from "../shared";
import { SyncLine } from "../SyncLine";

/**
 * Today: what's next and how to get there, where you sleep tonight, and the
 * rest of the day. Before the trip it opens on day one with a countdown.
 */
export function Today({ day: chosen, go, serverNow }: { day?: string; go: (v: View) => void; serverNow: number }) {
  const { trip, me } = useTrip();
  const nowMs = useClock(serverNow);
  const compose = useCompose();
  const today = todayIn(trip.tz, nowMs);
  const when = phase(trip, nowMs);
  const day = chosen ?? (when === "during" ? today : trip.startDate);
  const rows = dayRows(trip, day);
  const timed = rows.filter((r) => r.at !== null);
  const untimed = rows.filter((r) => r.at === null);
  const isToday = day === today;
  const nn = isToday ? nowNext(trip, day, nowMs) : null;
  const ticketRow = nn ? (nn.now ?? nn.next) : (timed[0] ?? null);
  const ticketLabel = nn?.now ? "Now" : nn?.next ? "Next" : "First up";
  const stay = stayOn(trip, day);
  const open = (item: Item) => go({ tab: "item", itemId: item.id });
  const people = [...new Set([me, ...trip.people])];
  const coverSrc = trip.cover || "/lake-atitlan-hero.jpg";

  const quickCircles: { label: string; icon: IconName; tone: string; onClick: () => void }[] = [
    { label: "Itinerary", icon: "today", tone: "bg-k-flight-soft text-k-flight", onClick: () => go({ tab: "plan" }) },
    { label: "Bookings", icon: "ticket", tone: "bg-k-activity-soft text-k-activity", onClick: () => go({ tab: "todo" }) },
    { label: "Saved", icon: "heart", tone: "bg-k-food-soft text-k-food", onClick: () => go({ tab: "plan", section: "ideas" }) },
    { label: "Posts", icon: "image", tone: "bg-accent-soft text-accent", onClick: () => go({ tab: "plan", section: "posts" }) },
    { label: "Members", icon: "users", tone: "bg-k-stay-soft text-k-stay", onClick: () => go({ tab: "trip" }) },
  ];

  return (
    <div className="flex flex-col gap-5 px-3 pt-3 sm:px-4 md:px-0">
      {/* Trip Hero Card (matching mobile & desktop reference image) */}
      <header className="flex flex-col gap-4">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-[#0f1322] p-5 text-[#f2f4fc] shadow-lift sm:p-6">
          <div className="cover-photo absolute inset-0">
            <Image
              src={coverSrc}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 72rem"
              unoptimized={coverSrc.startsWith("http")}
              className="object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d17] via-[#0b0d17]/65 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d17]/80 via-[#0b0d17]/35 to-transparent" />
          </div>

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#cbd5f5]">
                  {formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}
                </p>
                <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{trip.name}</h1>
              </div>
              <Countdown when={when} startDate={trip.startDate} today={today} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => go({ tab: "trip" })}
                aria-label={`People: ${people.join(", ")}`}
                className="flex shrink-0 -space-x-2 rounded-full bg-[#131728]/80 p-1 pr-2.5 backdrop-blur-md transition-colors hover:bg-[#1b2138]"
              >
                {people.slice(0, 4).map((p) => (
                  <span key={p} className="rounded-full ring-2 ring-[#0f1322]">
                    <Avatar name={p} size="sm" />
                  </span>
                ))}
                {people.length > 4 && <span className="ml-3 self-center text-xs font-bold text-white">+{people.length - 4}</span>}
              </button>

              <button
                type="button"
                onClick={() => go({ tab: "plan" })}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-[#131728]/85 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-md transition-colors hover:bg-[#1b2138]"
              >
                Full Itinerary
                <Icon name="chevronRight" className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Circular Quick-Action Pills (matching mobile mockup in reference image) */}
        <div className="grid grid-cols-5 gap-2 py-1 md:hidden">
          {quickCircles.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.onClick}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <span className={`flex size-12 items-center justify-center rounded-full border border-line ${q.tone}`}>
                <Icon name={q.icon} className="size-5" />
              </span>
              <span className="truncate text-[11px] font-semibold text-muted">{q.label}</span>
            </button>
          ))}
        </div>

        {/* Day Strip */}
        <DayStrip
          days={tripDays(trip)}
          selected={day}
          today={today}
          noBed={new Set(nights(trip).filter((n) => !n.stay).map((n) => n.date))}
          onPick={(d) => go({ tab: "today", day: d })}
        />
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        {/* Highlighted Ticket + Tonight's Stay + Before Trip */}
        <div className="flex flex-col gap-4">
          {ticketRow && (
            <Ticket
              row={ticketRow}
              label={ticketLabel}
              minutes={nn?.now ? null : (nn?.minutesToNext ?? null)}
              onOpen={() => open(ticketRow.item)}
            />
          )}

          <Tonight
            stay={stay}
            day={day}
            last={day === trip.endDate}
            onOpen={open}
            onFind={() => compose({ ask: true, text: `Find us a place to stay the night of ${formatDay(day)}`, day })}
            onAdd={() => compose({ day, kind: "stay", text: "" })}
          />

          {when === "before" && day === trip.startDate && <BeforeTrip onTodo={() => go({ tab: "todo" })} />}

          {/* Day's Google Map Card */}
          <section
            aria-label="Day map"
            className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4 shadow-lift sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name="pin" className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-extrabold">{weekday(day)} Map</h2>
                  <p className="text-xs text-muted">
                    {ticketRow?.item.place?.name || stay?.place?.name || trip.destination}
                  </p>
                </div>
              </div>
              <a
                href={
                  routeUrl(
                    rows.map((r) => r.item),
                    trip,
                  ) ?? mapsSearchUrl(ticketRow?.item.place?.name || stay?.place?.name || trip.destination)
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-sunken px-3 text-xs font-bold text-accent hover:bg-accent-soft"
              >
                Google Maps
                <Icon name="external" className="size-3.5" />
              </a>
            </div>
            <div className="h-44 w-full overflow-hidden rounded-2xl border border-line bg-[#0d1324]">
              <iframe
                src={mapsEmbedUrl(
                  ticketRow?.item.place?.address ||
                    ticketRow?.item.place?.name ||
                    stay?.place?.address ||
                    stay?.place?.name ||
                    trip.destination,
                  12,
                )}
                title={`Google Map for ${formatDay(day)}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="size-full border-0 [filter:invert(90%)_hue-rotate(180deg)_brightness(95%)_contrast(92%)]"
              />
            </div>
          </section>
        </div>

        {/* Selected Day Schedule Card */}
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-lift">
          <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
            <h2 className="text-xl font-extrabold">
              {weekday(day, true)}, {monthDay(day)}
              {isToday && <span className="ml-2 align-middle text-sm font-bold text-accent">Today</span>}
            </h2>
            <button
              type="button"
              onClick={() => compose({ day })}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent-soft px-3 text-xs font-bold text-accent transition-colors hover:bg-accent hover:text-on-accent"
            >
              <Icon name="plus" className="size-3.5" />
              Add to {weekday(day)}
            </button>
          </div>

          <section aria-label={`Everything on ${formatDay(day)}`}>
            {rows.length === 0 ? (
              <p className="py-4 text-base text-muted">Nothing planned yet for this day.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {timed.map((r) => (
                  <ItemRow key={r.key} row={r} item={r.item} onOpen={() => open(r.item)} />
                ))}
                {untimed.map((r) => (
                  <ItemRow key={r.key} row={r} item={r.item} onOpen={() => open(r.item)} />
                ))}
              </ol>
            )}
          </section>

          <SyncLine />
        </div>
      </div>
    </div>
  );
}

function Countdown({ when, startDate, today }: { when: ReturnType<typeof phase>; startDate: string; today: string }) {
  if (when !== "before") return null;
  const n = daysBetween(today, startDate);
  return (
    <p className="shrink-0 rounded-full border border-white/15 bg-[#131728]/85 px-3 py-1 text-xs font-bold text-[#c4b5fd] backdrop-blur-md">
      {n === 1 ? "Tomorrow" : `In ${n} days`}
    </p>
  );
}

function DayStrip({
  days,
  selected,
  today,
  noBed,
  onPick,
}: {
  days: string[];
  selected: string;
  today: string;
  noBed: Set<string>;
  onPick: (d: string) => void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector("[aria-current='date']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  return (
    <ul ref={ref} className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="Trip days">
      {days.map((d) => {
        const sel = d === selected;
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-current={sel ? "date" : undefined}
              aria-label={`${weekday(d, true)} ${monthDay(d)}${d === today ? ", today" : ""}${noBed.has(d) ? ", nowhere to stay yet" : ""}`}
              className={`flex h-16 w-13 flex-col items-center justify-center rounded-2xl border leading-none transition-colors ${
                sel
                  ? "border-accent bg-accent text-on-accent shadow-lift"
                  : "border-line bg-surface text-ink hover:bg-sunken"
              } ${d === today && !sel ? "ring-2 ring-accent ring-inset" : ""}`}
            >
              <span className="text-xs font-semibold">{weekday(d)}</span>
              <span className="tnum mt-1 text-lg font-extrabold">{Number(d.slice(8))}</span>
              <span aria-hidden="true" className={`mt-0.5 size-1.5 rounded-full ${noBed.has(d) ? "bg-todo" : "bg-transparent"}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The one loud thing on the screen: what's next, when, and one tap to get there or call. */
function Ticket({ row, label, minutes, onOpen }: { row: Row; label: string; minutes: number | null; onOpen: () => void }) {
  const { trip } = useTrip();
  const copy = useCopy();
  const item = row.item;
  const place = item.place?.address || item.place?.name;
  // A flight's place is where it lands: no use for directions on the way out.
  const dir = item.kind !== "flight" && (row.part === "start" || item.kind === "stay") ? directionsUrl(item.place, trip) : null;
  const c = item.contact;
  return (
    <section aria-label={label} className="overflow-hidden rounded-3xl bg-ticket text-on-ticket shadow-lift">
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 px-5 pt-4 pb-5 text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-base font-bold">{label}</span>
          {minutes !== null && minutes >= 0 && <span className="text-base font-semibold">in {formatDuration(minutes)}</span>}
        </span>
        <time className="tnum text-5xl leading-none font-bold tracking-tight">{row.when.time ? formatTime(row.when.time) : "Anytime"}</time>
        {row.when.tz && row.when.tz !== trip.tz && <span className="text-sm font-semibold">{timeLabel(row.when, trip)?.replace(/^[\d:]+ [AP]M /, "")}</span>}
        <span className="mt-2 text-xl leading-snug font-bold">{rowTitle(row)}</span>
        {place && <span className="text-base">{place}</span>}
      </button>
      {(dir || c?.phone || c?.whatsapp || item.booking?.confirmation) && (
        <div className="perforation mx-5 flex flex-wrap gap-2 pt-4 pb-5">
          {dir && (
            <ActionChip icon="directions" href={dir} tone="ticket">
              Directions
            </ActionChip>
          )}
          {c?.phone && (
            <ActionChip icon="phone" href={telUrl(c.phone)} tone="ticket">
              Call
            </ActionChip>
          )}
          {c?.whatsapp && (
            <ActionChip icon="whatsapp" href={whatsappUrl(c.whatsapp)} tone="ticket">
              WhatsApp
            </ActionChip>
          )}
          {item.booking?.confirmation && (
            <ActionChip icon="copy" onClick={() => copy(item.booking!.confirmation!, "Confirmation")} tone="ticket">
              {item.booking.confirmation}
            </ActionChip>
          )}
        </div>
      )}
    </section>
  );
}

function Tonight({
  stay,
  day,
  last,
  onOpen,
  onFind,
  onAdd,
}: {
  stay: Item | null;
  day: string;
  last: boolean;
  onOpen: (i: Item) => void;
  onFind: () => void;
  onAdd: () => void;
}) {
  const { trip } = useTrip();
  const copy = useCopy();
  if (last) return null;
  if (!stay) {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-dashed border-todo bg-todo-soft p-5">
        <p className="flex items-center gap-2 text-base font-bold text-todo">
          <Icon name="bed" />
          Nowhere to stay tonight yet
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onFind} className={btn.secondary}>
            <Icon name="sparkles" />
            Find options
          </button>
          <button type="button" onClick={onAdd} className={btn.quiet}>
            <Icon name="plus" />
            Add a stay
          </button>
        </div>
      </section>
    );
  }
  const n = nightOf(stay, day);
  const checkIn = stay.start?.date === day ? timeLabel(stay.start, trip) : null;
  const dir = directionsUrl(stay.place, trip);
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <button type="button" onClick={() => onOpen(stay)} className="flex w-full items-start gap-3 text-left">
        <KindChip kind={stay.kind} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-muted">
            Tonight{n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
            {checkIn ? `. Check in ${checkIn}` : ""}
          </span>
          <span className="block text-lg leading-snug font-bold">{stay.title}</span>
          {(stay.place?.address || stay.place?.name) && (
            <span className="block text-base text-muted">{stay.place.address || stay.place.name}</span>
          )}
        </span>
        <Icon name="chevronRight" className="mt-1 size-4 text-muted" />
      </button>
      {(dir || stay.booking?.confirmation) && (
        <div className="mt-3 flex flex-wrap gap-2 pl-9">
          {dir && (
            <ActionChip icon="directions" href={dir}>
              Directions
            </ActionChip>
          )}
          {stay.booking?.confirmation && (
            <ActionChip icon="copy" onClick={() => copy(stay.booking!.confirmation!, "Confirmation")}>
              {stay.booking.confirmation}
            </ActionChip>
          )}
        </div>
      )}
    </section>
  );
}

function BeforeTrip({ onTodo }: { onTodo: () => void }) {
  const { trip } = useTrip();
  const n = toBook(trip).length;
  if (!n) return null;
  return (
    <button
      type="button"
      onClick={onTodo}
      className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 text-left shadow-lift transition-colors hover:bg-sunken"
    >
      <Icon name="todo" className="size-6 text-todo" />
      <span className="flex-1 text-base">
        <span className="font-bold">
          {n} {n === 1 ? "thing" : "things"} to book
        </span>{" "}
        before you go
      </span>
      <Icon name="chevronRight" className="size-4 text-muted" />
    </button>
  );
}
