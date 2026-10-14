"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEditor } from "./EditorProvider";

const FIRST_NAME = /^\p{L}[\p{L}'-]{0,29}$/u;

/**
 * First-visit "who's this?" picker. Sets the name used as the author of
 * changes and as "I" in the chat. Bookkeeping, not authentication.
 */
export function WhoPicker({ knownNames }: { knownNames: string[] }) {
  const { pickerOpen, setAuthor, closePicker } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pickerOpen && !d.open) d.showModal();
    if (!pickerOpen && d.open) d.close();
  }, [pickerOpen]);

  function choose(n: string) {
    const clean = n.trim();
    if (!FIRST_NAME.test(clean)) return setError(true);
    setError(false);
    setAuthor(clean);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="who-title"
      // Escape closes it; the next edit asks again, so nothing goes unattributed.
      onCancel={(e) => {
        e.preventDefault();
        closePicker();
      }}
      className="m-auto w-[min(24rem,calc(100vw-1rem))] rounded-3xl border border-line p-0 shadow-2xl"
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          choose(name);
        }}
        className="flex flex-col gap-4 p-5"
      >
        <h2 id="who-title" className="text-2xl font-bold">
          Who&apos;s this?
        </h2>
        <p className="text-base text-muted">
          Your first name goes on the changes you make, and the planner uses it when you say &ldquo;I&rdquo;. It&apos;s
          remembered on this device.
        </p>
        {knownNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {knownNames.map((n) => (
              <button key={n} type="button" onClick={() => choose(n)} className="min-h-11 rounded-xl border-2 border-ink px-4 text-base font-semibold">
                {n}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col text-sm font-semibold">
          {knownNames.length ? "Or type it" : "First name"}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoComplete="given-name"
            className="mt-1 min-h-11 rounded-xl border-2 border-ink bg-surface px-3 py-2 text-lg font-normal"
          />
        </label>
        {error && <p className="rounded-xl border-2 border-action bg-action-soft p-3 text-base font-bold">One word, letters only. First name.</p>}
        <div className="flex gap-3">
          <button type="submit" className="min-h-11 flex-1 rounded-xl bg-ink px-4 text-base font-bold text-canvas">
            That&apos;s me
          </button>
          <button type="button" onClick={closePicker} className="min-h-11 rounded-xl border border-line px-4 text-base font-semibold">
            Not now
          </button>
        </div>
      </form>
    </dialog>
  );
}
