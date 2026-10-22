"use client";

import { useEffect, useRef } from "react";
import { dayRows, nightOf, nowNext, phase, stayOn, toBook, tripDays, type Row } from "@/domain/derive";
import { directionsUrl, telUrl, whatsappUrl } from "@/domain/links";
import { daysBetween, formatDay, formatDuration, formatTime, monthDay, todayIn, weekday } from "@/domain/time";
import type { Item } from "@/domain/types";
import { useClock } from "@/client/hooks";
import type { View } from "@/client/router";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { ActionChip, btn, useCopy } from "@/ui/kit";
import { useCompose } from "../composer/Composer";
import { ItemRow, rowTitle, timeLabel } from "../shared";
import { SyncLine } from "../SyncLine";

/**
 * Today: what's next and how to get there, where you sleep tonight, and the
 * rest of the day. Before the trip it opens on day one with a countdown.
 */
export function Today({ day: chosen, go, serverNow }: { day?: string; go: (v: View) => void; serverNow: number }) {
  const { trip } = useTrip();
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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">{trip.name}</h1>
          <Countdown when={when} startDate={trip.startDate} today={today} />
        </div>
        <DayStrip days={tripDays(trip)} selected={day} today={today} onPick={(d) => go({ tab: "today", day: d })} />
      </header>

      <div className="flex flex-col gap-5 px-4">
        <h2 className="text-xl font-bold">
          {weekday(day, true)}, {monthDay(day)}
          {isToday && <span className="ml-2 align-middle text-base font-semibold text-accent">Today</span>}
        </h2>

        {ticketRow && <Ticket row={ticketRow} label={ticketLabel} minutes={nn?.now ? null : nn?.minutesToNext ?? null} onOpen={() => open(ticketRow.item)} />}

        <Tonight stay={stay} day={day} last={day === trip.endDate} onOpen={open} onFind={() => compose({ ask: true, text: `Find us a place to stay the night of ${formatDay(day)}`, day })} onAdd={() => compose({ day, kind: "stay", text: "" })} />

        <section aria-label={`Everything on ${formatDay(day)}`}>
          {rows.length === 0 ? (
            <p className="py-2 text-base text-muted">Nothing planned yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {timed.map((r) => (
                <ItemRow key={r.key} row={r} item={r.item} onOpen={() => open(r.item)} />
              ))}
              {untimed.map((r) => (
                <ItemRow key={r.key} row={r} item={r.item} onOpen={() => open(r.item)} />
              ))}
            </ol>
          )}
          <button type="button" onClick={() => compose({ day })} className={`${btn.quiet} mt-1 -ml-3`}>
            <Icon name="plus" />
            Add to {weekday(day)}
          </button>
        </section>

        {when === "before" && day === trip.startDate && <BeforeTrip onTodo={() => go({ tab: "todo" })} />}

        <SyncLine />
      </div>
    </div>
  );
}

function Countdown({ when, startDate, today }: { when: ReturnType<typeof phase>; startDate: string; today: string }) {
  if (when !== "before") return null;
  const n = daysBetween(today, startDate);
  return <p className="shrink-0 text-base font-semibold text-muted">{n === 1 ? "Tomorrow" : `In ${n} days`}</p>;
}

function DayStrip({ days, selected, today, onPick }: { days: string[]; selected: string; today: string; onPick: (d: string) => void }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    ref.current?.querySelector("[aria-current='date']")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  return (
    <ul ref={ref} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="Trip days">
      {days.map((d) => {
        const sel = d === selected;
        return (
          <li key={d}>
            <button
              type="button"
              onClick={() => onPick(d)}
              aria-current={sel ? "date" : undefined}
              aria-label={`${weekday(d, true)} ${monthDay(d)}${d === today ? ", today" : ""}`}
              className={`flex h-14 w-12 flex-col items-center justify-center rounded-2xl leading-none ${
                sel ? "bg-ink text-canvas" : "bg-surface text-ink hover:bg-sunken"
              } ${d === today && !sel ? "ring-2 ring-accent ring-inset" : ""}`}
            >
              <span className="text-xs font-semibold">{weekday(d)}</span>
              <span className="tnum mt-1 text-lg font-bold">{Number(d.slice(8))}</span>
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

function Tonight({ stay, day, last, onOpen, onFind, onAdd }: { stay: Item | null; day: string; last: boolean; onOpen: (i: Item) => void; onFind: () => void; onAdd: () => void }) {
  const { trip } = useTrip();
  const copy = useCopy();
  if (last) return null;
  if (!stay) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-todo bg-todo-soft p-4">
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
    <section className="rounded-2xl bg-surface p-4">
      <button type="button" onClick={() => onOpen(stay)} className="flex w-full items-start gap-3 text-left">
        <Icon name={stay.kind === "flight" ? "plane" : "bed"} className="mt-0.5 size-6 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-muted">
            Tonight{n && n.of > 1 ? `, night ${n.night} of ${n.of}` : ""}
            {checkIn ? `. Check in ${checkIn}` : ""}
          </span>
          <span className="block text-lg leading-snug font-bold">{stay.title}</span>
          {(stay.place?.address || stay.place?.name) && <span className="block text-base text-muted">{stay.place.address || stay.place.name}</span>}
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
    <button type="button" onClick={onTodo} className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-left hover:bg-sunken">
      <Icon name="todo" className="size-6 text-todo" />
      <span className="flex-1 text-base">
        <span className="font-bold">{n} {n === 1 ? "thing" : "things"} to book</span> before you go
      </span>
      <Icon name="chevronRight" className="size-4 text-muted" />
    </button>
  );
}
