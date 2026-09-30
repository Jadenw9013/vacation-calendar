"use client";

import { useEditor } from "./EditorProvider";
import { SegmentDialog } from "./SegmentDialog";

/** Who's editing, add button, sign out, and the save/undo notice. */
export function EditBar({ devNotes }: { devNotes: string[] }) {
  const { author, openPicker, notice, dismiss, undo, busy } = useEditor();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-stone-border/80 bg-white/70 px-4 py-2.5 shadow-xs">
        <p className="text-xs text-gray-700">
          {author ? (
            <>
              Editing as <span className="font-bold text-volcano">{author}</span> ·{" "}
              <button onClick={openPicker} className="text-lake font-medium underline underline-offset-2">
                Change
              </button>
            </>
          ) : (
            <button onClick={openPicker} className="text-lake font-bold underline underline-offset-2">
              Pick your name to edit
            </button>
          )}
        </p>
        <div className="ml-auto flex items-center gap-3">
          <SegmentDialog mode="add" />
          <form method="post" action="/api/logout">
            <button className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2">Sign out</button>
          </form>
        </div>
        {devNotes.map((n) => (
          <p key={n} className="w-full text-[11px] text-gray-400">
            {n}
          </p>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className={`fixed bottom-5 left-5 right-5 z-50 flex max-w-md items-start gap-3 rounded-2xl p-4 text-sm shadow-xl md:right-auto md:w-[26rem] ${
            notice.kind === "ok" ? "bg-lake text-white" : "bg-maya-light border-2 border-maya text-maya"
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
