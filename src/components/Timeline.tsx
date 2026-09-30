"use client";

import { useState } from "react";
import type { OpenQuestion, Segment } from "@/data/types";
import type { NightStatus, TimelineDay, TimelineEvent } from "@/lib/derive";
import type { DayInfo } from "@/lib/places";
import { formatMoment, formatTime, monthDay, parseMoment, weekday, type Moment } from "@/lib/time";
import { useTripChat } from "./chat/ChatProvider";
import { TodoItem } from "./edit/Controls";
import { useEditor } from "./edit/EditorProvider";
import { SegmentDialog } from "./edit/SegmentDialog";
import { PlanDialog } from "./plan/PlanDialog";
import { PlanRow } from "./plan/PlanRow";
import { OwnerTag, StatusDropdown, cardClass } from "./Status";

export type Ghost = "added" | "changed" | "removed";

const GHOST_LABEL: Record<Ghost, string> = {
  added: "Proposed",
  changed: "Proposed change",
  removed: "Would be removed",
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

const END_VERB: Record<Segment["kind"], string> = {
  lodging: "Checkout:",
  flight: "Lands:",
  activity: "Back from",
  transport: "Arrives:",
};

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
  dayDate,
  tripOffset,
  ghost,
  flash,
  isDragging,
  onDragStart,
  onDragEnd,
  onDelete,
}: {
  e: TimelineEvent;
  dayDate: string;
  tripOffset: string;
  ghost?: Ghost;
  flash: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDelete: (s: Segment) => void;
}) {
  const s = e.segment;
  const zone = zoneNote(e.at, tripOffset);
  const until = untilText(e);
  const isEnd = e.kind === "end";
  const { busy } = useEditor();

  if (isEnd) {
    return (
      <li className="flex items-center gap-3 py-1 pl-14 text-xs text-gray-500">
        <span className="font-mono">{e.at.time ? formatTime(e.at) : "TBD"}</span>
        <span>{END_VERB[s.kind]} {s.title}</span>
      </li>
    );
  }

  const chrome = ghost
    ? ghost === "removed"
      ? "border-2 border-dashed border-gray-300 p-3.5 line-through opacity-60 rounded-2xl"
      : "border-2 border-dashed border-lake bg-white p-3.5 rounded-2xl"
    : `${cardClass(s.status)} p-4`;

  return (
    <li
      draggable={!ghost}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-2 transition-all group ${flash ? "flash" : ""} ${
        isDragging ? "opacity-40 scale-98" : ""
      }`}
    >
      <article className={`${chrome} flex flex-col gap-2 relative`}>
        {ghost && <p className="text-[11px] font-bold tracking-wide text-lake no-underline">{GHOST_LABEL[ghost]}</p>}
        {/* Wraps on narrow screens: the controls drop under the title instead of squeezing it to "Alas…". */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1 basis-56">
            {/* Drag Handle */}
            {!ghost && (
              <div
                className="hidden sm:block mt-3 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 transition-colors p-0.5 -ml-1 shrink-0"
                title="Drag to move this event to another day"
              >
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="6" r="1.5" />
                  <circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" />
                  <circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" />
                  <circle cx="15" cy="18" r="1.5" />
                </svg>
              </div>
            )}

            <SegmentIcon kind={s.kind} isGap={s.status === "needs-booking"} />

            <div className="min-w-0">
              <h4 className="font-semibold text-volcano text-sm sm:text-base leading-snug">
                {s.title}
              </h4>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-gray-500">
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

          {/* Status Dropdown and Edit/Delete controls */}
          <div className="ml-auto shrink-0 flex items-center gap-2">
            <StatusDropdown segment={s} />

            {!ghost && (
              <div className="flex items-center gap-1">
                <SegmentDialog mode="edit" segment={s} />

                {/* Direct quick delete button on card */}
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  disabled={busy}
                  title="Delete event"
                  aria-label={`Delete ${s.title}`}
                  className="flex size-7 items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {s.peakElevationM && (
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-maya sm:pl-15">
            <span>▲ {s.peakElevationM.toLocaleString("en-US")} m</span>
            <span className="text-gray-400">· {Math.floor(s.peakElevationM * 3.28084).toLocaleString("en-US")} ft summit</span>
          </div>
        )}

        {(s.notes || (s.todos && s.todos.length > 0)) && (
          <div className="sm:pl-15 pt-1 border-t border-stone-border/60 flex flex-col gap-1.5 text-xs text-gray-600">
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

        <div className="flex items-center justify-between sm:pl-15 text-xs text-gray-400">
          <OwnerTag segment={s} />
          <span className="ml-auto">
            <AskButton about={`“${s.title}”`} />
          </span>
        </div>
      </article>
    </li>
  );
}

function Tonight({ night, date }: { night: NightStatus | null; date: string }) {
  // Last day: flying home, nothing to cover.
  if (!night) return null;

  // Booked nights: the stay's card is on its check-in day, and every day's
  // summary line already says where you sleep ("night 2 of 2"). Nothing to add.
  if (night.booked) return null;

  const planned = night.planned;
  const location = planned[0]?.location || "Guatemala City";

  return (
    <div className="group rounded-2xl border-2 border-dashed border-maya bg-maya-light/60 p-3.5 shadow-xs hover:bg-maya-light/90 transition-all flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <SegmentIcon kind="lodging" isGap={true} />
        <div className="min-w-0">
          <h4 className="font-semibold text-volcano text-sm sm:text-base leading-snug">
            No lodging booked
          </h4>
          <p className="text-xs text-maya font-medium">
            {location} · Night needs coverage
          </p>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2.5">
        {/* Quick action to add lodging for this night */}
        <SegmentDialog
          mode="add"
          initialDate={date}
          initialKind="lodging"
          initialLocation={location}
          triggerLabel="+ Book lodging"
          triggerClassName="rounded-lg bg-maya px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-maya/90 transition-colors"
        />
      </div>
    </div>
  );
}

/** Under each day: add a plan step by hand, or have the planner draft the day. */
function DayPlanActions({ date, hasPlan }: { date: string; hasPlan: boolean }) {
  const { available, send, setOpen } = useTripChat();
  const { author, openPicker } = useEditor();
  const day = `${weekday(date, true)} ${monthDay(date)}`;
  function draft() {
    if (!author) return openPicker();
    setOpen(true);
    send(
      `${hasPlan ? "Tighten up" : "Draft"} a timed plan for ${day}: when to get up, leave, travel, arrive, eat and rest, around what's already booked. Keep it realistic for the group and mark any times you suggest as tentative.`,
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-xs">
      <PlanDialog
        mode="add"
        date={date}
        trigger="+ Add to plan"
        triggerClassName="font-semibold text-lake underline-offset-2 hover:underline"
      />
      {available && (
        <button type="button" onClick={draft} className="font-medium text-gray-500 underline-offset-2 hover:text-lake hover:underline">
          {hasPlan ? "Refine with the planner" : "Draft with the planner"}
        </button>
      )}
    </div>
  );
}

/** One line under the day title: where you are and where you sleep. */
function DaySummary({ info }: { info: DayInfo }) {
  const s = info.sleep;
  const where = info.place ? `${info.place} · ` : "";
  if (s.kind === "home") return <p className="text-xs text-gray-500">{where}Flying home</p>;
  if (s.kind === "open") {
    return (
      <p className="text-xs font-medium text-maya">
        {where}No bed booked yet{s.location ? ` (${s.location})` : ""}
      </p>
    );
  }
  return (
    <p className="text-xs text-gray-500">
      {where}
      {s.segment.includesLodging ? "Camping: " : "Sleep: "}
      {s.segment.title}
      {s.of > 1 && <span className="text-gray-400"> · night {s.night} of {s.of}</span>}
    </p>
  );
}

export function Timeline({
  days,
  tripOffset,
  questions,
  ghosts = {},
  highlight,
  info = [],
}: {
  info?: DayInfo[];
  days: TimelineDay[];
  tripOffset: string;
  questions: OpenQuestion[];
  ghosts?: Record<string, Ghost>;
  highlight?: Set<string>;
}) {
  const { submit } = useEditor();
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  async function handleDelete(s: Segment) {
    const isBooked = s.status === "booked";
    const confirmMsg = isBooked
      ? `“${s.title}” is marked as BOOKED.\n\nAre you sure you want to delete it from the trip?`
      : `Delete “${s.title}”?`;
    if (!window.confirm(confirmMsg)) return;
    await submit([{ op: "remove_segment", id: s.id, confirmBooked: true }]);
  }

  async function handleDropOnDay(targetDate: string, dataStr: string) {
    try {
      const data = JSON.parse(dataStr);
      if (!data?.segmentId || data.fromDate === targetDate) return;

      const allEvents = days.flatMap((d) => d.events);
      const ev = allEvents.find((e) => e.segment.id === data.segmentId);
      if (!ev) return;
      const s = ev.segment;

      // Retain time & timezone offset if present
      let newStart: string | null = targetDate;
      if (s.start && s.start.length > 10) {
        const timePart = s.start.slice(10);
        newStart = `${targetDate}${timePart}`;
      }

      let newEnd: string | null = null;
      if (s.end && s.start) {
        const startDate = new Date(s.start.slice(0, 10));
        const endDate = new Date(s.end.slice(0, 10));
        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        const targetDateObj = new Date(targetDate);
        targetDateObj.setDate(targetDateObj.getDate() + diffDays);
        const newEndDateStr = targetDateObj.toISOString().slice(0, 10);
        if (s.end.length > 10) {
          newEnd = `${newEndDateStr}${s.end.slice(10)}`;
        } else {
          newEnd = newEndDateStr;
        }
      }

      await submit([
        {
          op: "update_segment",
          id: s.id,
          changes: {
            start: newStart,
            ...(newEnd !== null ? { end: newEnd } : {}),
          },
          confirmBooked: true,
        },
      ]);
    } catch (err) {
      console.error("Failed to move segment:", err);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {days.map((d) => {
        const di = info.find((x) => x.date === d.date);
        const isTarget = dragOverDate === d.date;

        return (
          <section
            key={d.date}
            id={`day-${d.date}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverDate !== d.date) setDragOverDate(d.date);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              if (dragOverDate === d.date) setDragOverDate(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDate(null);
              setDraggingSegmentId(null);
              const dataStr = e.dataTransfer.getData("text/plain");
              handleDropOnDay(d.date, dataStr);
            }}
            className={`relative pl-6 rounded-3xl transition-all duration-200 ${
              isTarget ? "bg-lake/5 ring-2 ring-dashed ring-lake p-3 -ml-3" : ""
            }`}
          >
            {/* Timeline vertical rail line */}
            <div className="absolute left-2.5 top-3 bottom-0 w-0.5 bg-gray-200" aria-hidden="true" />

            {/* Day Header with node dot, elevation, and + Add event button */}
            <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <div className="flex items-center gap-2.5">
                  <span className="absolute -left-6 top-2 size-3 rounded-full bg-lake ring-4 ring-stone-light" aria-hidden="true" />
                  <h3 className="font-serif font-bold text-lg sm:text-xl text-volcano">
                    {weekday(d.date, true)}, {monthDay(d.date)}
                  </h3>
                </div>
                {di && <DaySummary info={di} />}
              </div>

              <div className="flex items-center gap-2.5">
                {/* Elevation Badge */}
                {di?.elevationM && (
                  <div
                    className={`flex items-center gap-1 font-mono text-xs font-medium ${di.peak ? "text-maya" : "text-gray-500"}`}
                    title={di.peak ? "Summit" : `Approximate elevation, ${di.place}`}
                  >
                    <svg className="size-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
                    </svg>
                    <span>
                      {di.peak ? "" : "~"}
                      {di.elevationM.toLocaleString("en-US")} m
                    </span>
                  </div>
                )}

                {/* Easy + Add event to this day button */}
                <SegmentDialog
                  mode="add"
                  initialDate={d.date}
                  triggerLabel="+ Add event"
                  triggerClassName="inline-flex items-center gap-1 rounded-lg border border-stone-border bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-lake hover:text-lake hover:bg-stone-light/50 transition-colors shadow-xs"
                />
              </div>
            </div>

            {/* Drop Indicator Zone when dragging over */}
            {isTarget && (
              <div className="mb-3 rounded-2xl border-2 border-dashed border-lake bg-lake/10 p-3 text-center text-xs font-semibold text-lake animate-pulse">
                Drop to move event to {weekday(d.date, true)}, {monthDay(d.date)}
              </div>
            )}

            {/* Day Events list */}
            <div className="flex flex-col gap-3">
              {d.rows.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {d.rows.map((row) =>
                    row.type === "plan" ? (
                      <PlanRow
                        key={row.item.id}
                        item={row.item}
                        at={row.at}
                        ghost={ghosts[row.item.id]}
                        flash={!!highlight?.has(row.item.id)}
                      />
                    ) : (
                    <EventRow
                      key={`${row.event.segment.id}-${row.event.kind}`}
                      e={row.event}
                      dayDate={d.date}
                      tripOffset={tripOffset}
                      ghost={ghosts[row.event.segment.id]}
                      flash={!!highlight?.has(row.event.segment.id)}
                      isDragging={draggingSegmentId === row.event.segment.id}
                      onDragStart={(evt) => {
                        evt.dataTransfer.setData(
                          "text/plain",
                          JSON.stringify({ segmentId: row.event.segment.id, fromDate: d.date })
                        );
                        setDraggingSegmentId(row.event.segment.id);
                      }}
                      onDragEnd={() => {
                        setDraggingSegmentId(null);
                        setDragOverDate(null);
                      }}
                      onDelete={handleDelete}
                    />
                    ),
                  )}
                </ol>
              ) : null}

              {/* Tonight slot: either booked or No lodging booked dashed card */}
              <Tonight night={d.night} date={d.date} />

              <DayPlanActions date={d.date} hasPlan={d.plan.length > 0} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
