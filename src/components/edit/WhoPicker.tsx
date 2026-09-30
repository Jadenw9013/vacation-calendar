"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useEditor } from "./EditorProvider";

const FIRST_NAME = /^\p{L}[\p{L}'-]{0,29}$/u;

/**
 * First-visit "who's this?" picker. Sets the name used as the author of
 * changes and as "I" in the chat. Bookkeeping, not authentication.
 */
export function WhoPicker({ knownNames }: { knownNames: string[] }) {
  const { pickerOpen, setAuthor, author } = useEditor();
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
      // Escape without a name would leave edits unattributed; keep it open until someone picks.
      onCancel={(e) => {
        if (!author) e.preventDefault();
      }}
      className="m-auto w-[min(24rem,calc(100vw-1.5rem))] bg-ash p-0 text-basalt backdrop:bg-basalt/60"
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          choose(name);
        }}
        className="flex flex-col gap-3 p-4"
      >
        <h2 id="who-title" className="wide text-2xl">
          Who&apos;s this?
        </h2>
        <p className="text-sm text-pumice">
          Your first name goes on the changes you make, and the planner uses it when you say &ldquo;I&rdquo;. It&apos;s
          remembered on this device.
        </p>
        {knownNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {knownNames.map((n) => (
              <button key={n} type="button" onClick={() => choose(n)} className="border-2 border-basalt px-3 py-1.5 font-semibold">
                {n}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col text-xs font-semibold">
          {knownNames.length ? "Or type it" : "First name"}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            autoComplete="given-name"
            className="mt-1 border-2 border-basalt bg-card px-3 py-2 text-lg font-normal"
          />
        </label>
        {error && <p className="hazard-label px-2 py-1 text-sm font-bold">One word, letters only. First name.</p>}
        <button type="submit" className="bg-basalt px-4 py-2.5 font-bold text-ash">
          That&apos;s me
        </button>
      </form>
    </dialog>
  );
}
