"use client";

import type { OpenQuestion, Segment } from "@/data/types";
import type { NightStatus, TimelineDay, TimelineEvent } from "@/lib/derive";
import { formatMoment, formatTime, monthDay, parseMoment, weekday, type Moment } from "@/lib/time";
import { useTripChat } from "./chat/ChatProvider";
import { TodoItem } from "./edit/Controls";
import { SegmentDialog } from "./edit/SegmentDialog";
import { OwnerTag, StatusTag, cardClass } from "./Status";

export type Ghost = "added" | "changed" | "removed";

const GHOST_LABEL: Record<Ghost, string> = {
  added: "Proposed",
  changed: "Proposed change",
  removed: "Would be removed",
};

const DAY_ELEVATIONS: Record<string, string> = {
  "2026-11-24": "1,502 m",
  "2026-11-25": "1,562 m",
  "2026-11-26": "1,562 m",
  "2026-11-27": "1,530 m",
  "2026-11-28": "1,530 m",
  "2026-11-29": "3,976 m",
  "2026-11-30": "1,502 m",
};

export function AskButton({ about }: { about: string }) {
  const { prefill, available } = useTripChat();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => prefill(`About ${about}: `)}
      className="text-xs font-medium text-gray-500 hover:text-lake underline underline-offset-2 transition-colors"
    >
      Ask
    </button>
  );
}

function SegmentIcon({ kind, isGap }: { kind: string; isGap?: boolean }) {
  if (kind === "flight") {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.8-.2-1.6.1-2.1.7l-.2.2c-.6.7-.5 1.7.2 2.2L7 13l-3 3-2.5-.5c-.4-.1-.8.1-1.1.4l-.2.2c-.3.4-.3 1 0 1.4l3.2 3.2c.4.4 1 .4 1.4 0l.2-.2c.3-.3.5-.7.4-1.1L5 17l3-3 3.2 3.7c.5.7 1.5.8 2.2.2l.2-.2c.6-.5.9-1.3.7-2.1z" />
        </svg>
      </div>
    );
  }
  if (kind === "lodging") {
    return (
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isGap ? "bg-maya/15 text-maya" : "bg-lake/15 text-lake"}`}>
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
        </svg>
      </div>
    );
  }
  if (kind === "transport") {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.7 2 10.9 2 11.2V16c0 .6.4 1 1 1h2m0 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0m10 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-antigua/20 text-antigua">
      <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
      </svg>
    </div>
  );
}

function zoneNote(m: Moment, tripOffset: string): string | null {
  if (!m.offset || m.offset === tripOffset) return null;
  const [h, min] = m.offset.slice(1).split(":");
  return `UTC${m.offset[0] === "-" ? "−" : "+"}${Number(h)}${min === "00" ? "" : `:${min}`}`;
}

function untilText(e: TimelineEvent): string | null {
  if (e.kind === "end") return null;
  if (!e.segment.end) return null;
  const end = parseMoment(e.segment.end);
  if (end.date === e.at.date) return end.time ? `until ${formatTime(end)}` : null;
  return `until ${formatMoment(end)}`;
}

function EventRow({
  e,
  tripOffset,
  ghost,
  flash,
}: {
  e: TimelineEvent;
  tripOffset: string;
  ghost?: Ghost;
  flash: boolean;
}) {
  const s = e.segment;
  const zone = zoneNote(e.at, tripOffset);
  const until = untilText(e);
  const isEnd = e.kind === "end";

  if (isEnd) {
    return (
      <li className="flex items-center gap-3 py-1 pl-14 text-xs text-gray-500">
        <span className="font-mono">{e.at.time ? formatTime(e.at) : "TBD"}</span>
        <span>{s.kind === "flight" ? "Lands" : "Checkout"}: {s.title}</span>
      </li>
    );
  }

  const chrome = ghost
    ? ghost === "removed"
      ? "border-2 border-dashed border-gray-300 p-3 line-through opacity-60 rounded-xl"
      : "border-2 border-dashed border-lake bg-white p-3 rounded-xl"
    : `${cardClass(s.status)} p-3.5`;

  return (
    <li className={`flex flex-col gap-2 transition-all ${flash ? "flash" : ""}`}>
      <article className={`${chrome} flex flex-col gap-2`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <SegmentIcon kind={s.kind} isGap={s.status === "needs-booking"} />
            <div className="min-w-0">
              <h4 className="font-semibold text-volcano text-sm sm:text-base leading-snug truncate">
                {s.title}
              </h4>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {e.at.time && (
                  <span className="font-mono font-medium text-gray-700">
                    {formatTime(e.at)}
                  </span>
                )}
                {!e.at.time && <span className="font-mono">Time TBD</span>}
                {until && <span className="font-mono">({until})</span>}
                {zone && <span className="text-gray-400">{zone}</span>}
                {s.location && <span>· {s.location}</span>}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <StatusTag status={s.status} />
            {!ghost && <SegmentDialog mode="edit" segment={s} />}
          </div>
        </div>

        {s.peakElevationM && (
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-maya pl-13">
            <span>▲ {s.peakElevationM.toLocaleString("en-US")} m</span>
            <span className="text-gray-400">· {Math.floor(s.peakElevationM * 3.28084).toLocaleString("en-US")} ft summit</span>
          </div>
        )}

        {(s.notes || (s.todos && s.todos.length > 0)) && (
          <div className="pl-13 pt-1 border-t border-stone-border/60 flex flex-col gap-1.5 text-xs text-gray-600">
            {s.notes && <p>{s.notes}</p>}
            {s.todos && s.todos.length > 0 && (
              <ul className="flex flex-col gap-1">
                {s.todos.map((t) => (
                  <TodoItem key={t} target={s.id} text={t} />
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pl-13 text-xs text-gray-400">
          <OwnerTag segment={s} />
          <AskButton about={`“${s.title}”`} />
        </div>
      </article>
    </li>
  );
}

function Tonight({ night, questions }: { night: NightStatus; questions: OpenQuestion[] }) {
  if (night.booked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-border bg-white p-3.5 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <SegmentIcon kind="lodging" isGap={false} />
          <div className="min-w-0">
            <h4 className="font-semibold text-volcano text-sm sm:text-base leading-snug truncate">
              {night.booked.title}
            </h4>
            <p className="text-xs text-gray-500">
              {night.booked.location} · 1 night
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <StatusTag status="booked" />
          <SegmentDialog mode="edit" segment={night.booked} />
        </div>
      </div>
    );
  }

  const planned = night.planned;
  const location = planned[0]?.location || "Guatemala City";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-maya bg-maya-light/60 p-3.5 shadow-xs hover:bg-maya-light/90 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <SegmentIcon kind="lodging" isGap={true} />
        <div className="min-w-0">
          <h4 className="font-semibold text-volcano text-sm sm:text-base leading-snug truncate">
            No lodging booked
          </h4>
          <p className="text-xs text-maya font-medium">
            {location} · Night needs coverage
          </p>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <StatusTag status="needs-booking" />
        <svg
          className="size-4 text-maya shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}

export function Timeline({
  days,
  tripOffset,
  questions,
  ghosts = {},
  highlight,
}: {
  days: TimelineDay[];
  tripOffset: string;
  questions: OpenQuestion[];
  ghosts?: Record<string, Ghost>;
  highlight?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-8">
      {days.map((d) => {
        const elevation = DAY_ELEVATIONS[d.date] || "1,500 m";
        return (
          <section key={d.date} id={`day-${d.date}`} className="relative pl-6">
            {/* Timeline vertical rail line */}
            <div className="absolute left-2.5 top-3 bottom-0 w-0.5 bg-gray-200" aria-hidden="true" />

            {/* Day Header with node dot & elevation */}
            <div className="relative mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="absolute -left-6 size-3 rounded-full bg-lake ring-4 ring-stone-light" aria-hidden="true" />
                <h3 className="font-serif font-bold text-lg sm:text-xl text-volcano">
                  {weekday(d.date, true)}, {monthDay(d.date)}
                </h3>
              </div>
              <div className="flex items-center gap-1 font-mono text-xs font-medium text-gray-500">
                <svg className="size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
                </svg>
                <span>{elevation}</span>
              </div>
            </div>

            {/* Day Events list */}
            <div className="flex flex-col gap-3">
              {d.events.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {d.events.map((e) => (
                    <EventRow
                      key={`${e.segment.id}-${e.kind}`}
                      e={e}
                      tripOffset={tripOffset}
                      ghost={ghosts[e.segment.id]}
                      flash={!!highlight?.has(e.segment.id)}
                    />
                  ))}
                </ol>
              ) : null}

              {/* Tonight slot: either booked or No lodging booked dashed card */}
              <Tonight night={d.night} questions={questions} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
