"use client";

import { useRef } from "react";
import Image from "next/image";
import type { Trip } from "@/data/types";
import { agenda, clockLabel, dayStatuses, localDate, nowNext, type DayStatus, type NowNext } from "@/lib/now";
import { formatTime, monthDay, weekday } from "@/lib/time";
import { useTripChat } from "@/components/chat/ChatProvider";
import { InstallHint } from "@/components/shell/Settings";
import { Icon } from "@/components/ui/Icon";
import { StatusMark } from "@/components/ui/StatusMark";
import { AgendaItem, MapsLink, rowTitle } from "./AgendaItem";

export interface SnapshotInfo {
  online: boolean;
  /** When this copy of the trip came from the server. */
  savedAt: number;
  /** A copy is kept on this device. */
  stored: boolean;
}

/**
 * Trip mode: one day at a time, read-only. What's on now, what's next and
 * where, then the rest of the day.
 */
export function TripToday({
  trip,
  now,
  day,
  onDay,
  snapshot,
}: {
  trip: Trip;
  now: number;
  day: string;
  onDay: (date: string) => void;
  snapshot: SnapshotInfo;
}) {
  const days = dayStatuses(trip);
  const today = localDate(now, trip.utcOffset);
  const status = days.find((d) => d.date === day) ?? days[0];
  const rows = agenda(trip, day);
  const card = nowNext(trip, day, now);
  const index = days.findIndex((d) => d.date === day);
  const touch = useRef<{ x: number; y: number } | null>(null);

  function step(by: number) {
    const next = days[index + by];
    if (next) onDay(next.date);
  }

  return (
    <div
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        // A clear sideways swipe changes day; the chips do the same with a tap.
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <div className="sticky top-0 z-30 border-b border-line bg-canvas pt-[env(safe-area-inset-top)] md:top-16">
        <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
          <DayStrip days={days} selected={day} today={today} onDay={onDay} />
          <DayHeading status={status} isToday={day === today} />
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
        <NowCard card={card} />

        <section aria-labelledby="day-list">
          <h2 id="day-list" className="sr-only">
            Everything on {weekday(day, true)}, {monthDay(day)}
          </h2>
          {rows.length > 0 ? (
            <ol className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
              {rows.map((r) => (
                <AgendaItem key={r.key} row={r} extra={<AskAbout title={rowTitle(r)} online={snapshot.online} />} />
              ))}
            </ol>
          ) : (
            <p className="rounded-2xl border border-line bg-surface p-4 text-base text-muted">Nothing booked or planned for this day.</p>
          )}
        </section>

        <p className="flex items-center gap-2 text-base text-muted" role="status">
          {!snapshot.online && <Icon name="offline" className="size-5 shrink-0" />}
          {snapshot.online
            ? snapshot.stored
              ? `Saved on this phone, updated ${clockLabel(snapshot.savedAt, trip.utcOffset, today)}`
              : `Updated ${clockLabel(snapshot.savedAt, trip.utcOffset, today)}`
            : `Offline, showing saved copy from ${clockLabel(snapshot.savedAt, trip.utcOffset, today)}`}
        </p>

        <InstallHint compact />

        <figure className="relative h-44 overflow-hidden rounded-3xl bg-sunken md:h-56">
          <Image
            src="/volcano-sidebar-night.jpg"
            alt="Volcán de Fuego erupting at night, seen through the pines on Acatenango"
            fill
            sizes="(max-width: 672px) 100vw, 672px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden="true" />
          <figcaption className="absolute inset-x-0 bottom-0 p-4 text-lg font-semibold text-[#fff]">Same friends. Higher places.</figcaption>
        </figure>
      </div>
    </div>
  );
}

function DayStrip({ days, selected, today, onDay }: { days: DayStatus[]; selected: string; today: string; onDay: (d: string) => void }) {
  return (
    // Seven 44px chips 8px apart need 356px: they fit a 360px phone edge to edge, and scroll on their own (never the page) below that.
    <div className="-mx-4 overflow-x-auto px-0.5 [scrollbar-width:none]">
      <ul className="mx-auto flex w-max gap-2" aria-label="Trip days">
        {days.map((d) => {
          const isSel = d.date === selected;
          const isToday = d.date === today;
          const label = `${weekday(d.date, true)} ${monthDay(d.date)}${isToday ? ", today" : ""}${d.needsAction ? ", has things to book" : ""}`;
          return (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => onDay(d.date)}
                aria-pressed={isSel}
                aria-label={label}
                className={`flex h-16 w-11 flex-col items-center justify-start rounded-xl border-2 pt-1.5 leading-none ${
                  isSel ? "border-ink bg-ink text-canvas" : isToday ? "border-now bg-surface text-ink" : "border-line bg-surface text-ink"
                }`}
              >
                <span className="text-sm leading-none font-medium">{weekday(d.date)}</span>
                <span className="tnum mt-1 text-lg leading-none font-bold">{Number(d.date.slice(8))}</span>
                {d.needsAction && (
                  <span aria-hidden="true" className="mt-1.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-action text-[11px] leading-none font-black text-on-fill">
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DayHeading({ status, isToday }: { status: DayStatus; isToday: boolean }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <h1 className="font-display text-2xl leading-tight font-semibold">
        {weekday(status.date, true)}, {monthDay(status.date)}
        {isToday && <span className="ml-2 align-middle font-sans text-base font-semibold text-now">Today</span>}
      </h1>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
        <span className="min-w-0">
          <Icon name="bed" className="mr-1.5 inline size-5 align-[-0.25em] text-muted" />
          <span className="text-muted">Sleeping tonight: </span>
          {status.sleepBooked && <strong className="font-semibold">{status.sleep}</strong>}
        </span>
        {!status.sleepBooked && <StatusMark status="needs-booking" />}
        {status.peakM && (
          <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 text-sm font-semibold">
            <Icon name="mountain" className="size-4" />
            {status.peakM.toLocaleString("en-US")} m summit
          </span>
        )}
      </p>
    </div>
  );
}

const CARD_LABEL: Record<NowNext["state"], string> = {
  now: "Now",
  next: "Next",
  later: "Later today",
  first: "First up",
  done: "Done",
  none: "Nothing scheduled",
};

function NowCard({ card }: { card: NowNext }) {
  const { row, state, countdown } = card;
  const live = state === "now" || state === "next";
  return (
    <section
      aria-labelledby="now-card-label"
      className={`rounded-2xl border-2 bg-surface p-4 ${live ? "border-now" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p id="now-card-label" className={`text-sm font-bold tracking-wide uppercase ${live ? "text-now" : "text-muted"}`}>
          {CARD_LABEL[state]}
        </p>
        {countdown && (
          <p className={`tnum rounded-full px-3 py-1 text-base font-bold ${state === "now" ? "bg-now text-on-fill" : "bg-now-soft text-now"}`}>{countdown}</p>
        )}
      </div>

      {row ? (
        <>
          <h2 className="mt-1 text-2xl leading-tight font-bold">{rowTitle(row)}</h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xl font-bold">
            {row.at ? (
              <time dateTime={row.at.raw} className="tnum">
                {formatTime(row.at)}
                {row.until && ` – ${formatTime(row.until)}`}
              </time>
            ) : (
              <span className="text-muted">Time TBD</span>
            )}
            {row.zone && <span className="text-base font-semibold text-muted">{row.zone}</span>}
          </p>
          {row.place && <p className="mt-1 text-base text-muted">{row.place}</p>}
          {(row.status === "needs-booking" || row.status === "undecided") && (
            <p className="mt-2">
              <StatusMark status={row.status} />
            </p>
          )}
          {row.mapsQuery && (
            <div className="mt-3">
              <MapsLink query={row.mapsQuery} primary />
            </div>
          )}
        </>
      ) : (
        <p className="mt-1 text-base text-muted">
          {state === "done" ? "This day is over. Pick another day above." : "Nothing booked or planned for the rest of this day."}
        </p>
      )}
    </section>
  );
}

/** "Ask about this" in a row's detail. Chat needs a connection. */
function AskAbout({ title, online }: { title: string; online: boolean }) {
  const { prefill, available } = useTripChat();
  if (!available) return null;
  return (
    <button
      type="button"
      disabled={!online}
      onClick={() => prefill(`About “${title}”: `)}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-base font-semibold hover:bg-sunken disabled:opacity-60"
      title={online ? undefined : "The planner needs a connection"}
    >
      <Icon name="ask" />
      {online ? "Ask" : "Ask (needs a connection)"}
    </button>
  );
}
