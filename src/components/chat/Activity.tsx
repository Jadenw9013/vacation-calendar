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

  if (failed) return <p className="p-4 text-base">Couldn&apos;t load the activity list. It needs a connection.</p>;
  if (!entries) return <p className="p-4 text-base text-muted">Loading…</p>;
  if (!entries.length) return <p className="p-4 text-base text-muted">No changes yet. Everything is as first entered.</p>;

  return (
    <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {entries.map((e, i) => (
        <li key={e.id} className="border-l-4 border-line pl-3 text-base">
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{e.author}</span> · {when(e.at)}
            {e.undoOf && " · undo"}
          </p>
          <ul className="mt-0.5">
            {e.summary.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ul>
          {i === 0 && (
            <button onClick={undo} disabled={busy} className="mt-2 min-h-11 rounded-xl border border-line px-4 font-semibold hover:bg-sunken">
              Undo this
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
