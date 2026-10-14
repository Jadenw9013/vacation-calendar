"use client";

import { useEditor } from "@/components/edit/EditorProvider";
import { Icon } from "@/components/ui/Icon";

/** "Saved. …  Undo" after an edit, above the bottom bar. */
export function Toast() {
  const { notice, dismiss, undo, busy } = useEditor();
  if (!notice) return null;
  const ok = notice.kind === "ok";
  return (
    <div
      role="status"
      className={`fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border-2 p-2 pl-4 text-base shadow-xl md:bottom-6 ${
        ok ? "border-ink bg-ink text-canvas" : "border-action bg-action-soft text-ink"
      }`}
    >
      <p className="min-w-0 flex-1 py-2">{notice.text}</p>
      {notice.canUndo && (
        <button onClick={undo} disabled={busy} className="min-h-11 shrink-0 rounded-xl px-3 font-bold underline underline-offset-2">
          Undo
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon name="close" />
      </button>
    </div>
  );
}
