import type { OpenQuestion, Segment } from "@/data/types";
import type { NightStatus, TimelineDay, TimelineEvent } from "@/lib/derive";
import { formatMoment, formatTime, monthDay, parseMoment, weekday, type Moment } from "@/lib/time";
import { TodoItem } from "./edit/Controls";
import { SegmentDialog } from "./edit/SegmentDialog";
import { OwnerTag, StatusTag, cardClass } from "./Status";

/** "UTC−8" when a time isn't in the destination's zone (e.g. the Seattle departure). */
function zoneNote(m: Moment, tripOffset: string): string | null {
  if (!m.offset || m.offset === tripOffset) return null;
  const [h, min] = m.offset.slice(1).split(":");
  return `UTC${m.offset[0] === "-" ? "−" : "+"}${Number(h)}${min === "00" ? "" : `:${min}`}`;
}

function eventVerb(e: TimelineEvent): string | null {
  const { kind } = e.segment;
  if (e.kind === "end") return kind === "lodging" ? "Check out" : kind === "flight" ? "Lands" : "Ends";
  return kind === "lodging" ? "Check in" : null;
}

/** What follows the start time: "until 11:52 PM" or "until Thu Nov 26, 10:00 AM". */
function untilText(e: TimelineEvent): string | null {
  if (e.kind === "end") return null;
  if (!e.segment.end) return "end time unknown";
  const end = parseMoment(e.segment.end);
  if (end.date === e.at.date) return end.time ? `until ${formatTime(end)}` : null;
  return `until ${formatMoment(end)}`;
}

function EventRow({ e, tripOffset }: { e: TimelineEvent; tripOffset: string }) {
  const s = e.segment;
  const verb = eventVerb(e);
  const zone = zoneNote(e.at, tripOffset);
  const until = untilText(e);
  const isEnd = e.kind === "end";
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3">
      <div className="pt-3 text-right font-mono text-sm leading-tight">
        <span className={e.at.time ? "font-semibold" : "text-pumice"}>{e.at.time ? formatTime(e.at) : "TBD"}</span>
        {zone && <span className="block text-[11px] text-pumice">{zone}</span>}
      </div>
      <article className={`${isEnd ? "border-l-4 border-scree py-2 pl-3" : `${cardClass(s.status)} p-3`}`}>
        <h4 className={isEnd ? "text-sm" : "font-bold"}>
          {verb && <span className="text-pumice">{verb}: </span>}
          {s.title}
        </h4>
        {!isEnd && (
          <>
            {until && <p className="font-mono text-xs text-pumice">{until}</p>}
            <p className="mt-1 text-sm text-pumice">{s.location}</p>
            {s.peakElevationM && (
              <p className="mt-1 font-mono text-sm font-semibold text-ember">
                ▲ {s.peakElevationM.toLocaleString("en-US")} m · {Math.floor(s.peakElevationM * 3.28084).toLocaleString("en-US")} ft
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusTag status={s.status} />
              <OwnerTag segment={s} />
              <span className="ml-auto">
                <SegmentDialog mode="edit" segment={s} />
              </span>
            </div>
            {s.notes && <p className="mt-2 text-sm">{s.notes}</p>}
            {s.todos && s.todos.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {s.todos.map((t) => (
                  <TodoItem key={t} target={s.id} text={t} />
                ))}
              </ul>
            )}
          </>
        )}
        {isEnd && s.end && !parseMoment(s.end).time && (
          <p className="text-xs text-pumice">Time not confirmed</p>
        )}
      </article>
    </li>
  );
}

function Tonight({ night, questions }: { night: NightStatus; questions: OpenQuestion[] }) {
  if (night.booked) {
    return (
      <div className="flex items-stretch bg-lake text-on-lake">
        <span className="px-3 py-3 text-xs font-bold uppercase">Tonight</span>
        <p className="flex-1 border-l border-current/30 p-3 text-sm font-semibold">{night.booked.title}</p>
      </div>
    );
  }
  const planned: Segment[] = night.planned;
  const waiting = questions.filter((q) => planned.some((p) => q.blocks.includes(p.id)));
  return (
    <div className="hazard p-2">
      <div className="hazard-label p-3">
        <p className="wide text-lg">Tonight: no bed booked</p>
        {planned.map((p) => (
          <p key={p.id} className="mt-1 text-sm">
            {p.location}. <span className="font-semibold">{p.owner ? `${p.owner} is on it.` : "Nobody on it."}</span>
          </p>
        ))}
        {waiting.length > 0 && (
          <p className="mt-1 text-sm">Waiting on: {waiting.map((q) => q.question).join(" / ")}</p>
        )}
      </div>
    </div>
  );
}

export function Timeline({
  days,
  tripOffset,
  questions,
}: {
  days: TimelineDay[];
  tripOffset: string;
  questions: OpenQuestion[];
}) {
  return (
    <div className="flex flex-col gap-10">
      {days.map((d) => (
        <section key={d.date} id={`day-${d.date}`} aria-labelledby={`h-${d.date}`}>
          <h3
            id={`h-${d.date}`}
            className="sticky top-0 z-10 -mx-4 mb-3 flex items-baseline gap-3 border-b border-scree bg-ash/95 px-4 py-2 backdrop-blur"
          >
            <span className="wide text-2xl">{weekday(d.date, true)}</span>
            <span className="font-mono text-base text-pumice">{monthDay(d.date)}</span>
          </h3>
          {d.events.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {d.events.map((e) => (
                <EventRow key={`${e.segment.id}-${e.kind}`} e={e} tripOffset={tripOffset} />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-pumice">Nothing scheduled.</p>
          )}
          <div className="mt-4">
            <Tonight night={d.night} questions={questions} />
          </div>
        </section>
      ))}
    </div>
  );
}
