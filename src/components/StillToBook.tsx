import type { Trip } from "@/data/types";
import { questionBlocks, unanswered, type ToBook } from "@/lib/derive";
import { formatDay, parseMoment } from "@/lib/time";
import { AddTodo, QuestionControls, TodoItem } from "./edit/Controls";
import { SegmentDialog } from "./edit/SegmentDialog";
import { OwnerTag, StatusTag, cardClass } from "./Status";

function when(start: string | null): string {
  return start ? formatDay(parseMoment(start).date) : "Date not picked";
}

export function StillToBook({ rows, trip }: { rows: ToBook[]; trip: Trip }) {
  return (
    <div className="flex flex-col gap-10">
      <ul className="flex flex-col gap-3">
        {rows.map(({ segment: s, blockedBy }) => (
          <li key={s.id} className={`${cardClass(s.status)} p-3`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="font-bold">{s.title}</h3>
              <span className="font-mono text-sm">{when(s.start)}</span>
            </div>
            <p className="mt-1 text-sm text-pumice">{s.location}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusTag status={s.status} />
              <OwnerTag segment={s} />
              <span className="ml-auto">
                <SegmentDialog mode="edit" segment={s} />
              </span>
            </div>
            {blockedBy.length > 0 && (
              <div className="mt-2 text-sm">
                <span className="font-semibold">Waiting on:</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {blockedBy.map((q) => (
                    <li key={q.id}>
                      <a href={`#${q.id}`} className="underline decoration-scree underline-offset-2">
                        {q.question}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div>
        <h3 className="wide mb-3 text-xl">Open questions</h3>
        <ol className="flex flex-col gap-3">
          {unanswered(trip).map((q) => (
            <li key={q.id} id={q.id} className="scroll-mt-4 rounded-xl border-l-4 border-antigua border-y border-r border-stone-border bg-white p-4 shadow-xs">
              <p className="font-serif font-bold text-volcano text-base">{q.question}</p>
              {q.notes && <p className="mt-1 text-sm text-gray-600">{q.notes}</p>}
              {q.blocks.length > 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Blocks: {questionBlocks(trip, q).map((s) => s.title).join(" · ")}
                </p>
              )}
              <QuestionControls question={q} />
            </li>
          ))}
        </ol>
        {unanswered(trip).length === 0 && <p className="text-sm text-pumice">Nothing waiting on a decision.</p>}
      </div>

      {trip.openQuestions.some((q) => q.answer) && (
        <div>
          <h3 className="wide mb-3 text-xl">Decided</h3>
          <ul className="flex flex-col gap-3">
            {trip.openQuestions
              .filter((q) => q.answer)
              .map((q) => (
                <li key={q.id} id={q.id} className="scroll-mt-4 border-l-4 border-lake bg-card p-3">
                  <p className="text-sm text-pumice">{q.question}</p>
                  <p className="mt-1 font-bold">{q.answer}</p>
                  <QuestionControls question={q} />
                </li>
              ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="wide mb-3 text-xl">Before we go</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {trip.todos.map((t) => (
            <TodoItem key={t} target="trip" text={t} />
          ))}
        </ul>
        <AddTodo target="trip" />
      </div>
    </div>
  );
}
