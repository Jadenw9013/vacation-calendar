"use client";

import { useEditor } from "./EditorProvider";
import { SegmentDialog } from "./SegmentDialog";

/** Who's editing, add button, sign out, and the save/undo notice. */
export function EditBar({ devNotes }: { devNotes: string[] }) {
  const { author, openPicker, notice, dismiss, undo, busy } = useEditor();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 border-y border-scree py-3">
        <p className="text-sm">
          {author ? (
            <>
              You&apos;re <span className="font-bold">{author}</span>.{" "}
              <button onClick={openPicker} className="text-pumice underline underline-offset-2">
                Not you?
              </button>
            </>
          ) : (
            <button onClick={openPicker} className="font-semibold underline underline-offset-2">
              Pick your name
            </button>
          )}
        </p>
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
          className={`fixed bottom-3 left-3 right-3 z-30 flex max-w-xl items-start gap-3 p-3 text-sm shadow-lg md:right-auto md:w-[28rem] ${
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
