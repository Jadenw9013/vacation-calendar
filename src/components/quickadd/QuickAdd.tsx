"use client";

import { useId, useRef, useState } from "react";
import type { SegmentKind, Trip } from "@/data/types";
import { tripDays } from "@/lib/now";
import { draftToSegment, missingPrompt, parseQuickAdd, type QuickDraft, type QuickStatus } from "@/lib/quickadd";
import { formatDay, formatTime, parseMoment } from "@/lib/time";
import { useEditor } from "@/components/edit/EditorProvider";
import { field, primaryBtn, secondaryBtn } from "@/components/edit/SegmentDialog";
import { NameGate } from "./NameGate";

const KIND_LABEL: Record<SegmentKind, string> = {
  lodging: "Place to stay",
  transport: "Getting there",
  activity: "Activity",
  flight: "Flight",
};

export interface ManualPrefill {
  title?: string;
  kind?: SegmentKind;
  date?: string;
}

/**
 * Type a line, see exactly what will be added, tap Add. Parsed on the device:
 * no planner involved, works with no quota left. Questions and changes are
 * handed to the planner instead of guessed at.
 */
export function QuickAdd({
  trip,
  nowMs,
  selectedDay,
  online,
  chatAvailable,
  onAsk,
  onManual,
  onAdded,
  initial = "",
  autoFocus,
}: {
  trip: Trip;
  nowMs: number;
  selectedDay?: string | null;
  online: boolean;
  chatAvailable: boolean;
  /** Send the text to the planner. */
  onAsk: (text: string) => void;
  /** Open the full form, prefilled with whatever was understood. */
  onManual: (prefill: ManualPrefill) => void;
  onAdded?: () => void;
  initial?: string;
  autoFocus?: boolean;
}) {
  const { apply, version, author, busy } = useEditor();
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<QuickStatus>("needs-booking");
  const [pickedDay, setPickedDay] = useState("");
  const [outsideOk, setOutsideOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adding = useRef(false);
  const inputId = useId();

  const parsed = parseQuickAdd(text, { trip, nowMs, selectedDay });
  // A day picked here fills a missing day; it's what the person chose, not a guess.
  let draft: QuickDraft | null = parsed.type === "draft" ? parsed.draft : null;
  let missing = parsed.type === "draft" ? parsed.missing : [];
  if (draft && !draft.start && pickedDay) {
    draft = { ...draft, start: pickedDay, dayFrom: "selected" };
    missing = missing.filter((m) => m !== "day");
  }
  const canAdd = !!draft && missing.length === 0 && (!draft.outsideTrip || outsideOk) && online && !busy;

  async function add() {
    if (!draft || !canAdd || adding.current) return;
    adding.current = true; // one tap, one item: a double tap does nothing more
    setError(null);
    try {
      const segment = draftToSegment(draft, status);
      const r = await apply([{ op: "add_segment", segment }], { expectedVersion: version });
      if (r.kind === "applied") {
        setText("");
        setPickedDay("");
        setOutsideOk(false);
        onAdded?.();
      } else if (r.kind === "conflict") {
        setError("Someone changed the trip just now. It has reloaded; check the preview and tap Add again.");
      } else if (r.kind === "rejected") {
        setError(r.issues.map((i) => i.message).join(" "));
      } else if (r.kind === "error") {
        setError(`${r.message} Your text is still here; try again.`);
      }
    } finally {
      adding.current = false;
    }
  }

  const manualPrefill = (): ManualPrefill => ({
    title: draft?.title || undefined,
    kind: draft?.kind,
    date: draft?.start?.slice(0, 10) ?? (pickedDay || undefined),
  });

  return (
    <section aria-labelledby={`${inputId}-label`} className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-col gap-1"
      >
        <label id={`${inputId}-label`} htmlFor={inputId} className="text-base font-semibold">
          Quick add
        </label>
        <input
          id={inputId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setOutsideOk(false);
          }}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={200}
          placeholder="e.g. zipline thu 11am"
          className={`${field} mt-0 min-h-12`}
        />
      </form>

      <div aria-live="polite" className="flex flex-col gap-3">
        {parsed.type === "ask" && (
          <div className="flex flex-col gap-2 rounded-2xl border-2 border-line p-3">
            <p className="text-base">{parsed.message}</p>
            <AskOrForm text={text} online={online} chatAvailable={chatAvailable} onAsk={onAsk} onManual={() => onManual(manualPrefill())} />
          </div>
        )}

        {draft && (
          <article aria-label="What will be added" className="flex flex-col gap-3 rounded-2xl border-2 border-now bg-surface p-4">
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-base">
              <dt className="text-muted">What</dt>
              <dd className="font-semibold">{draft.title || <span className="text-action">Not given</span>}</dd>
              <dt className="text-muted">Kind</dt>
              <dd>{KIND_LABEL[draft.kind]}</dd>
              <dt className="text-muted">Day</dt>
              <dd>
                {draft.start ? (
                  <>
                    <span className="tnum">{formatDay(draft.start.slice(0, 10))}</span>
                    {draft.dayFrom === "selected" && <span className="text-muted"> (the day you&apos;re on)</span>}
                    {draft.end && draft.end.slice(0, 10) !== draft.start.slice(0, 10) && (
                      <span className="tnum"> to {formatDay(draft.end.slice(0, 10))}</span>
                    )}
                  </>
                ) : (
                  <select
                    aria-label="Which day?"
                    value={pickedDay}
                    onChange={(e) => setPickedDay(e.target.value)}
                    className={`${field} mt-0`}
                  >
                    <option value="">Which day?</option>
                    {tripDays(trip).map((d) => (
                      <option key={d} value={d}>
                        {formatDay(d)}
                      </option>
                    ))}
                  </select>
                )}
              </dd>
              <dt className="text-muted">Time</dt>
              <dd className="tnum">
                {draft.start && draft.start.length > 10 ? formatTime(parseMoment(draft.start)) : "time TBD"}
                {draft.end && draft.end.length > 10 && draft.end.slice(0, 10) === draft.start?.slice(0, 10) && ` – ${formatTime(parseMoment(draft.end))}`}
              </dd>
              <dt className="text-muted">Place</dt>
              <dd>TBD</dd>
            </dl>

            <fieldset className="flex flex-col gap-1">
              <legend className="text-base text-muted">Status</legend>
              <div className="flex gap-2">
                {(["needs-booking", "booked"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => setStatus(s)}
                    className={`min-h-11 flex-1 rounded-xl border-2 px-3 text-base font-semibold ${
                      status === s ? "border-ink bg-ink text-canvas" : "border-line text-ink"
                    }`}
                  >
                    {s === "booked" ? "✓ Booked" : "! Needs booking"}
                  </button>
                ))}
              </div>
            </fieldset>

            {draft.outsideTrip && draft.start && (
              <label className="flex min-h-11 items-center gap-3 rounded-xl border-2 border-action bg-action-soft p-3 text-base">
                <input type="checkbox" checked={outsideOk} onChange={(e) => setOutsideOk(e.target.checked)} className="size-6 shrink-0" />
                <span>
                  {formatDay(draft.start.slice(0, 10))} is outside the trip (Nov 24 to Nov 30). Add it anyway?
                </span>
              </label>
            )}

            {missing.includes("title") && (
              <div className="flex flex-col gap-2">
                <p className="text-base font-semibold">{missingPrompt(missing)}</p>
                <AskOrForm text={text} online={online} chatAvailable={chatAvailable} onAsk={onAsk} onManual={() => onManual(manualPrefill())} />
              </div>
            )}

            {error && <p className="rounded-xl border-2 border-action bg-action-soft p-3 text-base font-semibold">{error}</p>}

            <NameGate>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={add} disabled={!canAdd} className={`${primaryBtn} min-h-12`}>
                  {online ? "Add" : "Add needs a connection"}
                </button>
                <button type="button" onClick={() => onManual(manualPrefill())} className={`${secondaryBtn} min-h-12`}>
                  Full form…
                </button>
              </div>
              {!online && <p className="text-base text-muted">You&apos;re offline. The preview works; adding waits for a connection.</p>}
              {author && online && <p className="text-base text-muted">Undo for 10 seconds, or later from Updates.</p>}
            </NameGate>
          </article>
        )}
      </div>
    </section>
  );
}

function AskOrForm({
  text,
  online,
  chatAvailable,
  onAsk,
  onManual,
}: {
  text: string;
  online: boolean;
  chatAvailable: boolean;
  onAsk: (text: string) => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chatAvailable && (
        <button type="button" disabled={!online} onClick={() => onAsk(text)} className={`${primaryBtn} min-h-12`}>
          {online ? "Ask the planner" : "Ask needs a connection"}
        </button>
      )}
      <button type="button" onClick={onManual} className={`${secondaryBtn} min-h-12`}>
        Fill in the form…
      </button>
    </div>
  );
}
