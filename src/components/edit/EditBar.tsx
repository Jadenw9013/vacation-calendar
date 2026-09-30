"use client";

import { useEditor } from "./EditorProvider";
import { SegmentDialog } from "./SegmentDialog";

/** Name field, add button, sign out, and the save/undo notice. */
export function EditBar({ devNotes }: { devNotes: string[] }) {
  const { author, setAuthor, notice, dismiss, undo, busy } = useEditor();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3 border-y border-scree py-3">
        <label className="flex flex-col text-xs font-semibold">
          Your first name
          <input
            defaultValue={author}
            key={author}
            onBlur={(e) => setAuthor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAuthor(e.currentTarget.value)}
            placeholder="e.g. Sam"
            maxLength={30}
            autoComplete="given-name"
            className="mt-1 w-32 border border-basalt bg-card px-2 py-1.5 text-base font-normal"
          />
        </label>
        <SegmentDialog mode="add" />
        <form method="post" action="/api/logout" className="ml-auto">
          <button className="text-sm text-pumice underline underline-offset-2">Sign out</button>
        </form>
        {devNotes.map((n) => (
          <p key={n} className="w-full text-xs text-pumice">
            {n}
          </p>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className={`fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-start gap-3 p-3 text-sm shadow-lg ${
            notice.kind === "ok" ? "bg-lake text-on-lake" : "hazard-label border-2 border-basalt"
          }`}
        >
          <p className="flex-1">{notice.text}</p>
          {notice.canUndo && (
            <button onClick={undo} disabled={busy} className="font-bold underline underline-offset-2">
              Undo
            </button>
          )}
          <button onClick={dismiss} aria-label="Dismiss" className="font-bold">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
