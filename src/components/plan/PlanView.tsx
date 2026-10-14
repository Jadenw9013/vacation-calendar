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
import { ClaimButton } from "@/components/trip/ItemActions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SheetAction } from "@/components/ui/Sheet";
import { StatusMark } from "@/components/ui/StatusMark";
import { ActionsMenu, PlanItemActions, SegmentActions } from "./ItemMenu";
import { UpdatesButton } from "@/components/shell/Updates";
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
  markers,
  onItemSeen,
  unread,
  onUpdates,
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
  markers: Map<string, number>;
  onItemSeen: (id: string) => void;
  unread: number;
  onUpdates: () => void;
}) {
  const { available } = useTripChat();
  const { submit, busy } = useEditor();
  const [quick, setQuick] = useState(false);
  const [manual, setManual] = useState<ManualPrefill | null>(null);
  const [editingParty, setEditingParty] = useState(false);
  const [partyInput, setPartyInput] = useState(trip.partySize ? String(trip.partySize) : "");
  const [toBookOpen, setToBookOpen] = useState(true);
  const gaps = computeGaps(trip);
  const toBook = stillToBook(trip);
  const allDays = [...tripDays(trip), trip.lastDay];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-4 md:px-6 md:pt-6">
      <PlanHeader
        trip={trip}
        onSettings={onSettings}
        corner={<UpdatesButton count={unread} onClick={onUpdates} onPhoto />}
        onEditParty={() => setEditingParty(true)}
      />

      {!online && (
        <p className="flex items-start gap-2 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-base text-slate-200" role="status">
          <Icon name="offline" className="size-5 mt-0.5 shrink-0 text-amber-400" />
          You&apos;re offline, so this is the copy saved on this phone. Editing and the planner need a connection; they&apos;ll be back when you are.
        </p>
      )}

      <section aria-labelledby="needs-action">
        <SectionHeading id="needs-action" count={gaps.length} icon="warning">
          Needs action
        </SectionHeading>
        {gaps.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-[#10161d] p-4 text-base">
            <span className="font-semibold text-emerald-400">✓ Every night and transfer is booked.</span>
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {gaps.map((g) => (
              <GapCard key={g.id} gap={g} trip={trip} online={online} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="still-to-book">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setToBookOpen(!toBookOpen)}
            aria-expanded={toBookOpen}
            aria-controls="still-to-book-list"
            className="group flex items-center gap-2.5 rounded-xl p-1 -m-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
          >
            <Icon name="bookmark" className="size-5 text-slate-300 group-hover:text-amber-400 transition-colors" />
            <h2 id="still-to-book" className="text-lg md:text-xl font-bold text-white group-hover:text-slate-200 transition-colors">
              Still to book
            </h2>
            {toBook.length > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                {toBook.length}
              </span>
            )}
            <Icon
              name="chevronDown"
              className={`size-4 text-slate-400 group-hover:text-white transition-transform duration-200 ${
                toBookOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setQuick(true)}
            aria-label="Add booking"
            className="flex items-center gap-1.5 rounded-xl bg-[#f1f3f5] hover:bg-white text-[#090d12] px-4 py-2 text-sm font-bold transition-all shadow-sm active:scale-95"
          >
            <Icon name="plus" className="size-4" />
            <span>Add booking</span>
          </button>
        </div>
        {toBookOpen && (
          <ul
            id="still-to-book-list"
            className="rounded-2xl border border-slate-800/80 bg-[#10161d] divide-y divide-slate-800/60 overflow-hidden shadow-xl shadow-black/30"
          >
          {toBook.map(({ segment: s, blockedBy }) => (
            <li key={s.id} className="flex items-start gap-3.5 p-3.5 sm:p-4 hover:bg-slate-800/20 transition-colors">
              <div className="size-11 sm:size-12 rounded-xl bg-slate-800/70 border border-slate-700/40 text-slate-300 flex items-center justify-center shrink-0">
                <Icon
                  name={
                    s.kind === "transport"
                      ? "bus"
                      : s.kind === "flight"
                      ? "plane"
                      : s.kind === "lodging"
                      ? "bed"
                      : "mountain"
                  }
                  className="size-5 sm:size-6 text-slate-300"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-white tracking-tight">{s.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  {s.status === "undecided" && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                      ? Undecided
                    </span>
                  )}
                  {s.status === "needs-booking" && (
                    <span className="rounded-md bg-[#f97316] px-2 py-0.5 text-xs font-semibold text-white">
                      ! Not booked
                    </span>
                  )}
                  {s.status === "booked" && (
                    <span className="rounded-md bg-emerald-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                      ✓ Booked
                    </span>
                  )}
                  <span className="text-slate-400 flex items-center gap-1">
                    {s.start && <Icon name="today" className="size-3.5 text-slate-500" />}
                    <span>{s.start ? formatDay(parseMoment(s.start).date) : "Date not picked"}</span>
                  </span>
                </div>
                {blockedBy.length > 0 && (
                  <p className="mt-1.5 text-xs sm:text-sm text-slate-400">
                    Waiting on: {blockedBy.map((q) => q.question).join(" · ")}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                <SegmentActions segment={s} online={online} days={allDays} />
              </div>
            </li>
          ))}
        </ul>
      )}
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
            <PlanDay
              key={d.date}
              day={d}
              trip={trip}
              ghosts={ghosts}
              highlight={highlight}
              online={online}
              allDays={allDays}
              markers={markers}
              onItemSeen={onItemSeen}
            />
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

      {editingParty && (
        <Sheet open onClose={() => setEditingParty(false)} title="Party size">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setEditingParty(false);
              const n = parseInt(partyInput, 10);
              await submit([{ op: "update_trip", changes: { partySize: isNaN(n) || n <= 0 ? null : n } }]);
            }}
            className="flex flex-col gap-4 p-2"
          >
            <label className="text-base text-slate-300">
              How many people in the group?
              <input
                type="number"
                min="1"
                max="30"
                value={partyInput}
                onChange={(e) => setPartyInput(e.target.value)}
                placeholder="e.g. 6"
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-white"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingParty(false)}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-200"
              >
                Save
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {/* Floating Ask Planner button */}
      <button
        type="button"
        onClick={() => onAsk("")}
        aria-label="Ask planner"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#183935] hover:bg-[#1f4843] border border-teal-500/40 text-teal-100 px-5 py-3 text-sm font-semibold shadow-2xl shadow-black/80 hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        <Icon name="sparkles" className="size-4 text-teal-300" />
        <span>Ask planner</span>
      </button>
    </div>
  );
}

function SectionHeading({
  id,
  count,
  children,
  icon,
  inline,
}: {
  id: string;
  count?: number;
  children: React.ReactNode;
  icon?: IconName;
  inline?: boolean;
}) {
  return (
    <h2 id={id} className={`flex items-center gap-2.5 text-lg md:text-xl font-bold text-white whitespace-nowrap ${inline ? "" : "mb-3.5"}`}>
      {icon && (
        <Icon
          name={icon}
          className={`size-5 ${icon === "warning" ? "text-amber-500" : "text-slate-300"}`}
        />
      )}
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
          {count}
        </span>
      )}
    </h2>
  );
}

function PlanHeader({
  trip,
  onSettings,
  corner,
  onEditParty,
}: {
  trip: Trip;
  onSettings: () => void;
  corner: React.ReactNode;
  onEditParty: () => void;
}) {
  return (
    <header className="relative h-64 sm:h-72 md:h-80 overflow-hidden rounded-3xl bg-[#090d12] shadow-2xl border border-slate-800/60">
      <Image
        src="/guatemala-hero-sunset.jpg"
        alt="Lake Atitlán with volcanoes at twilight"
        fill
        priority
        sizes="(max-width: 1200px) 100vw, 1000px"
        className="object-cover object-center"
      />
      {/* Dark gradient fade matching the obsidian palette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090d12] via-[#090d12]/50 to-transparent" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#090d12]/80 via-[#090d12]/20 to-transparent" aria-hidden="true" />

      {/* Top right script handwriting flourish */}
      <div className="absolute top-6 right-6 md:right-10 select-none pointer-events-none hidden sm:block">
        <p className="font-handwriting text-2xl md:text-3xl text-amber-100/75 -rotate-3 leading-snug tracking-wide text-right drop-shadow-md">
          Good people<br />
          <span className="mr-2">Bigger horizons</span>
        </p>
      </div>

      {/* Bottom text */}
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-white">
        <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-amber-300/80 mb-1.5">TRIP PLAN</p>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-medium text-white tracking-tight mb-2 drop-shadow-sm">
          {trip.name || "Guatemala"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm md:text-base text-slate-300">
          <span className="font-medium">{monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}</span>
          <span className="text-slate-500">·</span>
          <button
            type="button"
            onClick={onEditParty}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer group"
          >
            <span>Party of {trip.partySize ?? "?"}</span>
            <Icon name="pencil" className="size-3.5 text-slate-400 group-hover:text-amber-400 transition-colors" />
          </button>
        </div>
      </div>

      <div className="absolute top-3 right-3 flex gap-2 md:hidden">
        {corner}
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          className="flex size-10 items-center justify-center rounded-xl bg-slate-900/80 text-white border border-slate-700/50"
        >
          <Icon name="settings" className="size-5" />
        </button>
      </div>
    </header>
  );
}

function GapCard({ gap: g, trip, online }: { gap: Gap; trip: Trip; online: boolean }) {
  const { prefill, available } = useTripChat();
  const [adding, setAdding] = useState(false);
  const title = (id: string) => trip.segments.find((s) => s.id === id)?.title ?? id;

  const bgImage =
    g.kind === "night"
      ? "/hotel-room-night.jpg"
      : g.kind === "return"
      ? "/flight-sunset-wing.jpg"
      : "/volcano-sidebar-night.jpg";

  const iconName: IconName =
    g.kind === "night" ? "bed" : g.kind === "return" ? "plane" : "bus";

  return (
    <li className="group relative overflow-hidden rounded-2xl border border-amber-600/50 bg-[#151210] p-4 sm:p-5 shadow-[0_0_24px_rgba(217,119,6,0.12)] hover:border-amber-500/80 transition-all">
      {/* Right side background image with gradient fade */}
      <div className="absolute right-0 top-0 bottom-0 w-3/5 sm:w-1/2 overflow-hidden pointer-events-none rounded-r-2xl">
        <Image
          src={bgImage}
          alt=""
          fill
          className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#151210] via-[#151210]/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#151210]/90 via-transparent to-[#151210]/30" />
      </div>

      <div className="relative z-10 flex items-start gap-3.5 sm:gap-4.5">
        {/* Large icon square */}
        <div className="size-12 sm:size-14 rounded-2xl bg-[#2a1d15] border border-amber-800/40 text-amber-200 flex items-center justify-center shrink-0 shadow-inner">
          <Icon name={iconName} className="size-6 sm:size-7 text-amber-200" />
        </div>

        {/* Content column */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#fca564] px-2.5 py-0.5 text-xs font-bold text-[#1f0e04] inline-flex items-center gap-1">
              ! {GAP_LABEL[g.kind]}
            </span>
            <span className="text-base sm:text-lg font-bold text-white tracking-tight">{g.title}</span>
          </div>

          <p className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-300 mt-1.5">
            <Icon name="calendar" className="size-3.5 sm:size-4 text-slate-400" />
            <span>{g.window}</span>
          </p>

          {g.detail && <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">{g.detail}</p>}
          {g.related.length > 0 && (
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
              To book: {g.related.map(title).join(" · ")}
            </p>
          )}
        </div>

        {/* Action menu */}
        <div className="relative z-10 shrink-0">
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
        </div>
      </div>

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
  markers,
  onItemSeen,
}: {
  markers: Map<string, number>;
  onItemSeen: (id: string) => void;
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
            const claim = !ghost && r.type === "event" ? <ClaimButton segment={segments.get(r.event.segment.id)!} online={online} /> : undefined;
            return (
              <AgendaItem
                key={row.key}
                row={row}
                actions={actions}
                extra={claim}
                ghost={ghost}
                flash={highlight.has(row.id)}
                updated={markers.has(row.id)}
                onOpen={() => onItemSeen(row.id)}
              />
            );
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
