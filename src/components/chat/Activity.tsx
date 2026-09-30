"use client";

import { useEffect, useState } from "react";
import type { ChangeEntry } from "@/lib/engine";
import { useEditor } from "@/components/edit/EditorProvider";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Who changed what, newest first, with undo on the latest change. */
export function Activity() {
  const { changeCount, undo, busy } = useEditor();
  const [entries, setEntries] = useState<ChangeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/history?limit=30")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { entries: ChangeEntry[] }) => live && (setEntries(d.entries), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [changeCount]);

  if (failed) return <p className="p-4 text-sm">Couldn&apos;t load the activity list.</p>;
  if (!entries) return <p className="p-4 text-sm text-pumice">Loading…</p>;
  if (!entries.length) return <p className="p-4 text-sm text-pumice">No changes yet. Everything is as first entered.</p>;

  return (
    <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {entries.map((e, i) => (
        <li key={e.id} className="border-l-4 border-scree pl-3 text-sm">
          <p className="text-xs text-pumice">
            <span className="font-semibold text-basalt">{e.author}</span> · {when(e.at)}
            {e.undoOf && " · undo"}
          </p>
          <ul className="mt-0.5">
            {e.summary.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ul>
          {i === 0 && (
            <button onClick={undo} disabled={busy} className="mt-1 text-xs font-semibold underline underline-offset-2">
              Undo this
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
