"use client";

import { useState } from "react";
import Image from "next/image";
import type { PlanItem, Segment, Trip } from "@/data/types";
import { computeGaps, questionBlocks, stillToBook, unanswered, type Gap, type TimelineDay } from "@/lib/derive";
import { toAgendaRow, tripDays } from "@/lib/now";
import { dayInfo } from "@/lib/places";
import { formatDay, monthDay, parseMoment, weekday } from "@/lib/time";
import { useTripChat } from "@/components/chat/ChatProvider";
import { AddTodo, QuestionControls, TodoItem } from "@/components/edit/Controls";
import { useEditor } from "@/components/edit/EditorProvider";
import { SegmentDialog } from "@/components/edit/SegmentDialog";
import { QuickAdd, type ManualPrefill } from "@/components/quickadd/QuickAdd";
import { Sheet } from "@/components/ui/Sheet";
import { AgendaItem, type Ghost } from "@/components/trip/AgendaItem";
import { Icon } from "@/components/ui/Icon";
import { SheetAction } from "@/components/ui/Sheet";
import { StatusMark } from "@/components/ui/StatusMark";
import { ActionsMenu, PlanItemActions, SegmentActions } from "./ItemMenu";
import { PlanDialog } from "./PlanDialog";

const GAP_LABEL: Record<Gap["kind"], string> = {
  night: "No bed",
  transport: "No transport",
  return: "No way home",
};

/**
 * Plan mode: what still needs doing first, then the day by day. Every item
 * has one menu; nothing destructive sits next to anything else.
 */
export function PlanView({
  trip,
  days,
  ghosts,
  previewing,
  highlight,
  online,
  onSettings,
  nowMs,
  onAsk,
}: {
  trip: Trip;
  /** Day by day, including any pending proposal as ghosts. */
  days: TimelineDay[];
  ghosts: Record<string, Ghost>;
  previewing: boolean;
  highlight: Set<string>;
  online: boolean;
  onSettings: () => void;
  nowMs: number;
  /** Hand text to the planner (opens the chat and sends it). */
  onAsk: (text: string) => void;
}) {
  const { available } = useTripChat();
  const [quick, setQuick] = useState(false);
  const [manual, setManual] = useState<ManualPrefill | null>(null);
  const gaps = computeGaps(trip);
  const toBook = stillToBook(trip);
  const allDays = [...tripDays(trip), trip.lastDay];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-6">
      <PlanHeader trip={trip} onSettings={onSettings} />

      {!online && (
        <p className="flex items-start gap-2 rounded-2xl border-2 border-line bg-surface p-4 text-base" role="status">
          <Icon name="offline" className="mt-0.5 shrink-0" />
          You&apos;re offline, so this is the copy saved on this phone. Editing and the planner need a connection; they&apos;ll be back when you are.
        </p>
      )}

      <section aria-labelledby="needs-action">
        <SectionHeading id="needs-action" count={gaps.length}>
          Needs action
        </SectionHeading>
        {gaps.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-base">
            <span className="font-semibold text-booked">✓ Every night and transfer is booked.</span>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {gaps.map((g) => (
              <GapCard key={g.id} gap={g} trip={trip} online={online} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="still-to-book">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="still-to-book" count={toBook.length} inline>
            Still to book
          </SectionHeading>
          <button type="button" onClick={() => setQuick(true)} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-base font-bold whitespace-nowrap text-canvas">
            <Icon name="plus" /> Add
          </button>
        </div>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
          {toBook.map(({ segment: s, blockedBy }) => (
            <li key={s.id} className="flex items-start gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold">{s.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted">
                  <StatusMark status={s.status} />
                  <span className="tnum">{s.start ? formatDay(parseMoment(s.start).date) : "Date not picked"}</span>
                </p>
                {blockedBy.length > 0 && <p className="mt-1 text-base text-muted">Waiting on: {blockedBy.map((q) => q.question).join(" · ")}</p>}
              </div>
              <SegmentActions segment={s} online={online} days={allDays} />
            </li>
          ))}
        </ul>
      </section>

      {previewing && (
        <p className="rounded-2xl border-2 border-dashed border-now bg-now-soft p-4 text-base">
          Previewing a proposed change below: dashed items are proposed. Nothing is saved until you apply it in the chat.
        </p>
      )}

      <section aria-labelledby="day-by-day">
        <SectionHeading id="day-by-day">Day by day</SectionHeading>
        <div className="flex flex-col gap-6">
          {days.map((d) => (
            <PlanDay key={d.date} day={d} trip={trip} ghosts={ghosts} highlight={highlight} online={online} allDays={allDays} />
          ))}
        </div>
      </section>

      <Questions trip={trip} />

      <Sheet open={quick} onClose={() => setQuick(false)} title="Add to the trip">
        <QuickAdd
          trip={trip}
          nowMs={nowMs}
          online={online}
          chatAvailable={available}
          onAsk={(text) => {
            setQuick(false);
            onAsk(text);
          }}
          onManual={(p) => {
            // One sheet at a time: close this one, then open the form.
            setQuick(false);
            setManual(p);
          }}
          onAdded={() => setQuick(false)}
        />
      </Sheet>
      {manual && (
        <SegmentDialog
          mode="add"
          initialTitle={manual.title}
          initialKind={manual.kind}
          initialDate={manual.date}
          open
          onClose={() => setManual(null)}
        />
      )}

      <section aria-labelledby="before-we-go">
        <SectionHeading id="before-we-go">Before we go</SectionHeading>
        <ul className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          {trip.todos.map((t) => (
            <TodoItem key={t} target="trip" text={t} />
          ))}
          {trip.todos.length === 0 && <li className="text-base text-muted">Nothing on the list.</li>}
        </ul>
        {online && <AddTodo target="trip" />}
      </section>
    </div>
  );
}

function SectionHeading({ id, count, children, inline }: { id: string; count?: number; children: React.ReactNode; inline?: boolean }) {
  return (
    <h2 id={id} className={`flex items-center gap-2 text-xl font-bold whitespace-nowrap ${inline ? "" : "mb-3"}`}>
      {children}
      {count !== undefined && count > 0 && (
        <span className="tnum rounded-full bg-sunken px-2.5 text-base font-semibold text-ink">{count}</span>
      )}
    </h2>
  );
}

function PlanHeader({ trip, onSettings }: { trip: Trip; onSettings: () => void }) {
  return (
    <header className="relative h-36 overflow-hidden rounded-3xl bg-sunken md:h-52">
      <Image
        src="/lake-atitlan-hero.jpg"
        alt="Lake Atitlán with its three volcanoes"
        fill
        priority
        sizes="(max-width: 768px) 100vw, 768px"
        className="object-cover"
      />
      {/* Dark at the bottom so the white title stays readable over any part of the photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-[#fff] md:p-6">
        <h1 className="text-2xl leading-tight font-bold md:text-3xl">Trip plan</h1>
        <p className="tnum text-base">
          {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)} · Party of {trip.partySize ?? "?"}
        </p>
      </div>
      <button
        type="button"
        onClick={onSettings}
        aria-label="Settings"
        className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-xl bg-surface text-ink md:hidden"
      >
        <Icon name="settings" />
      </button>
    </header>
  );
}

function GapCard({ gap: g, trip, online }: { gap: Gap; trip: Trip; online: boolean }) {
  const { prefill, available } = useTripChat();
  const [adding, setAdding] = useState(false);
  const title = (id: string) => trip.segments.find((s) => s.id === id)?.title ?? id;
  return (
    <li className="flex items-start gap-2 rounded-2xl border-2 border-action bg-action-soft p-3 pl-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-action px-2 py-0.5 text-sm font-bold text-on-fill">! {GAP_LABEL[g.kind]}</span>
          <span className="text-base font-semibold">{g.title}</span>
        </p>
        <p className="tnum mt-1 text-base font-semibold">{g.window}</p>
        {g.detail && <p className="text-base text-muted">{g.detail}</p>}
        {g.related.length > 0 && <p className="text-base text-muted">To book: {g.related.map(title).join(" · ")}</p>}
      </div>
      <ActionsMenu label={`${GAP_LABEL[g.kind]}: ${g.window}`}>
        {(close) => (
          <>
            {!online && <p className="rounded-xl bg-sunken p-3 text-base">Editing and the planner need a connection.</p>}
            {g.kind === "night" && (
              <SheetAction disabled={!online} onClick={() => (close(), setAdding(true))}>
                Add lodging for this night…
              </SheetAction>
            )}
            {available && (
              <SheetAction disabled={!online} onClick={() => (close(), prefill(`About the gap “${g.title}: ${g.window}”: `))}>
                Ask the planner about this
              </SheetAction>
            )}
          </>
        )}
      </ActionsMenu>
      {adding && g.date && (
        <SegmentDialog mode="add" initialDate={g.date} initialKind="lodging" open onClose={() => setAdding(false)} />
      )}
    </li>
  );
}

function PlanDay({
  day,
  trip,
  ghosts,
  highlight,
  online,
  allDays,
}: {
  day: TimelineDay;
  trip: Trip;
  ghosts: Record<string, Ghost>;
  highlight: Set<string>;
  online: boolean;
  allDays: string[];
}) {
  const { available, send, setOpen } = useTripChat();
  const { author, openPicker } = useEditor();
  const [adding, setAdding] = useState<"booking" | "plan" | null>(null);
  const info = dayInfo(trip).find((x) => x.date === day.date);
  const label = `${weekday(day.date, true)}, ${monthDay(day.date)}`;

  const segments = new Map<string, Segment>(trip.segments.map((s) => [s.id, s]));
  const items = new Map<string, PlanItem>((trip.plan ?? []).map((p) => [p.id, p]));
  for (const r of day.rows) {
    if (r.type === "event" && !segments.has(r.event.segment.id)) segments.set(r.event.segment.id, r.event.segment);
    if (r.type === "plan" && !items.has(r.item.id)) items.set(r.item.id, r.item);
  }

  function draft() {
    if (!author) return openPicker();
    setOpen(true);
    send(
      `${day.plan.length ? "Tighten up" : "Draft"} a timed plan for ${weekday(day.date, true)} ${monthDay(day.date)}: when to get up, leave, travel, arrive, eat and rest, around what's already booked. Keep it realistic for the group and mark any times you suggest as tentative.`,
    );
  }

  return (
    <article id={`day-${day.date}`} aria-labelledby={`day-${day.date}-title`} className="rounded-2xl border border-line bg-surface">
      <header className="flex items-start gap-2 border-b border-line p-3 pl-4">
        <div className="min-w-0 flex-1">
          <h3 id={`day-${day.date}-title`} className="font-display text-xl leading-tight font-semibold">
            {label}
          </h3>
          {info && <DaySleep info={info} />}
        </div>
        <ActionsMenu label={label}>
          {(close) => (
            <>
              {!online && <p className="rounded-xl bg-sunken p-3 text-base">Editing and the planner need a connection.</p>}
              <SheetAction disabled={!online} onClick={() => (close(), setAdding("booking"))}>
                Add a booking on this day…
              </SheetAction>
              <SheetAction disabled={!online} onClick={() => (close(), setAdding("plan"))}>
                Add a step to the plan…
              </SheetAction>
              {available && (
                <SheetAction disabled={!online} onClick={() => (close(), draft())}>
                  {day.plan.length ? "Refine the plan with the planner" : "Draft a plan with the planner"}
                </SheetAction>
              )}
            </>
          )}
        </ActionsMenu>
      </header>

      {day.rows.length > 0 ? (
        <ol className="divide-y divide-line px-3">
          {day.rows.map((r) => {
            const row = toAgendaRow(r, trip.utcOffset);
            const ghost = ghosts[row.id];
            const actions = ghost
              ? undefined
              : r.type === "plan"
                ? <PlanItemActions item={items.get(r.item.id)!} online={online} />
                : <SegmentActions segment={segments.get(r.event.segment.id)!} online={online} days={allDays} />;
            return <AgendaItem key={row.key} row={row} actions={actions} ghost={ghost} flash={highlight.has(row.id)} />;
          })}
        </ol>
      ) : (
        <p className="p-4 text-base text-muted">Nothing booked or planned.</p>
      )}

      {adding === "booking" && <SegmentDialog mode="add" initialDate={day.date} open onClose={() => setAdding(null)} />}
      {adding === "plan" && <PlanDialog mode="add" date={day.date} open onClose={() => setAdding(null)} />}
    </article>
  );
}

function DaySleep({ info }: { info: ReturnType<typeof dayInfo>[number] }) {
  const s = info.sleep;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted">
      {s.kind === "home" && <span>Flying home</span>}
      {s.kind === "booked" && (
        <span>
          {s.segment.includesLodging ? "Camping: " : "Sleep: "}
          <span className="text-ink">{s.segment.title}</span>
          {s.of > 1 && ` · night ${s.night} of ${s.of}`}
        </span>
      )}
      {s.kind === "open" && (
        <>
          <StatusMark status="needs-booking" />
          <span>No bed booked{s.location ? ` (${s.location})` : ""}</span>
        </>
      )}
      {info.peak && info.elevationM && (
        <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 text-sm font-semibold text-ink">
          <Icon name="mountain" className="size-4" />
          {info.elevationM.toLocaleString("en-US")} m summit
        </span>
      )}
    </p>
  );
}

function Questions({ trip }: { trip: Trip }) {
  const open = unanswered(trip);
  const decided = trip.openQuestions.filter((q) => q.answer);
  return (
    <section aria-labelledby="questions" className="flex flex-col gap-3">
      <SectionHeading id="questions" count={open.length}>
        Open questions
      </SectionHeading>
      {open.length === 0 && <p className="text-base text-muted">Nothing waiting on a decision.</p>}
      <ol className="flex flex-col gap-3">
        {open.map((q) => (
          <li key={q.id} id={q.id} className="scroll-mt-40 rounded-2xl border border-line bg-surface p-4">
            <p className="text-base font-semibold">{q.question}</p>
            {q.notes && <p className="mt-1 text-base text-muted">{q.notes}</p>}
            {q.blocks.length > 0 && <p className="mt-1 text-base text-muted">Blocks: {questionBlocks(trip, q).map((s) => s.title).join(" · ")}</p>}
            <QuestionControls question={q} />
          </li>
        ))}
      </ol>
      {decided.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-base font-semibold">Decided ({decided.length})</summary>
          <ul className="flex flex-col gap-3 px-4 pb-4">
            {decided.map((q) => (
              <li key={q.id} id={q.id} className="border-l-4 border-booked pl-3">
                <p className="text-base text-muted">{q.question}</p>
                <p className="text-base font-semibold">{q.answer}</p>
                <QuestionControls question={q} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
