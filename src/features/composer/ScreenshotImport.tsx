"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { Item } from "@/domain/types";
import { useView } from "@/client/router";
import { useTrip } from "@/client/store";
import type { ChangeResult } from "@/server/ai/tools";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";
import { ConfirmCard } from "../assistant/Assistant";
import { shrinkScreenshot } from "../assistant/images";

/*
 * Booking screenshots in, bookings out. Up to ten at a time, read one after
 * another (each sees what the ones before it added, so the same booking in
 * two screenshots stays one item). It keeps going if the sheet is closed.
 */

export const MAX_SCREENSHOTS = 10;

type Status = "waiting" | "reading" | "done" | "failed";

export interface Job {
  id: string;
  preview: string | null;
  name: string;
  status: Status;
  results: ChangeResult[];
  text?: string;
  error?: string;
}

interface ImportValue {
  jobs: Job[];
  running: boolean;
  /** Starts reading these files; returns how many were left out over the limit. */
  start: (files: File[]) => number;
  clear: () => void;
}

const Ctx = createContext<ImportValue | null>(null);

export function useImport(): ImportValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useImport outside ImportProvider");
  return v;
}

const added = (r: ChangeResult) => r.ok && "entryId" in r;

export function ImportProvider({ children }: { children: ReactNode }) {
  const { tripId, refresh, notify } = useTrip();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const queue = useRef<{ job: Job; file: File }[]>([]);
  const busy = useRef(false);

  const patch = useCallback((id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j))), []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    let done = 0;
    let total = 0;
    let recorded = 0;
    let failed = 0;
    try {
      while (queue.current.length) {
        const { job, file } = queue.current.shift()!;
        total = done + queue.current.length + 1;
        patch(job.id, { status: "reading" });
        const image = await shrinkScreenshot(file);
        if (!image) {
          patch(job.id, { status: "failed", error: "Couldn't open this picture. Try a PNG or JPEG screenshot." });
          failed++;
          done++;
          continue;
        }
        try {
          const res = await fetch(`/api/t/${tripId}/import`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ image, index: done + 1, total }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            patch(job.id, { status: "failed", error: body.error ?? "That screenshot couldn't be read." });
            failed++;
          } else {
            const results: ChangeResult[] = body.results ?? [];
            if (results.some(added)) recorded++;
            patch(job.id, { status: "done", results, text: body.text });
            // The server changed the trip: catch the screens up before the next one.
            await refresh();
          }
        } catch {
          patch(job.id, { status: "failed", error: "No connection. Try this one again when you have signal." });
          failed++;
        }
        done++;
      }
    } finally {
      busy.current = false;
      setRunning(false);
      if (done) notify(`Read ${done} screenshot${done === 1 ? "" : "s"}: ${recorded} recorded${failed ? `, ${failed} couldn't be read` : ""}.`);
    }
  }, [tripId, refresh, notify, patch]);

  const start = useCallback(
    (files: File[]) => {
      const pictures = files.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif|gif)$/i.test(f.name));
      const room = Math.max(0, MAX_SCREENSHOTS - queue.current.length - (busy.current ? 1 : 0));
      const take = pictures.slice(0, room);
      const fresh = take.map((file) => ({
        job: { id: Math.random().toString(36).slice(2), preview: URL.createObjectURL(file), name: file.name, status: "waiting" as Status, results: [] },
        file,
      }));
      queue.current.push(...fresh);
      setJobs((js) => [...js, ...fresh.map((f) => f.job)]);
      void run();
      return pictures.length - take.length;
    },
    [run],
  );

  const clear = useCallback(() => {
    setJobs((js) => {
      js.forEach((j) => j.preview && URL.revokeObjectURL(j.preview));
      return js.filter((j) => j.status === "waiting" || j.status === "reading");
    });
  }, []);

  return <Ctx.Provider value={{ jobs, running, start, clear }}>{children}</Ctx.Provider>;
}

/** The button that opens the photo picker: up to ten screenshots at once. */
export function ScreenshotButton({ className = "" }: { className?: string }) {
  const { start, running } = useImport();
  const { online, notify } = useTrip();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const left = start(Array.from(e.target.files ?? []));
          if (left > 0) notify(`Reading the first ${MAX_SCREENSHOTS}. Add the other ${left} after.`);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()} disabled={!online} className={`${btn.secondary} ${className}`}>
        <Icon name="image" />
        {online ? (running ? "Add more screenshots" : "Add bookings from screenshots") : "Screenshots need a connection"}
      </button>
    </>
  );
}

/** Each screenshot and what came of it, with Undo, a link to the item, and a confirm card when a booked item would change. */
export function ImportProgress() {
  const { jobs, running, clear } = useImport();
  const { trip, tripId, undo } = useTrip();
  const { go } = useView(tripId);
  if (!jobs.length) return null;
  const reading = jobs.filter((j) => j.status === "done" || j.status === "failed").length;
  return (
    <section aria-label="Screenshots" className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-bold" role="status">
          {running ? `Reading screenshot ${Math.min(reading + 1, jobs.length)} of ${jobs.length}…` : `Read ${jobs.length} screenshot${jobs.length === 1 ? "" : "s"}`}
        </p>
        {!running && (
          <button type="button" onClick={clear} className={`${btn.quiet} min-h-10 text-sm`}>
            Clear
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-3">
        {jobs.map((j, n) => {
          const items = j.results.flatMap((r) => (r.ok && "itemIds" in r ? r.itemIds : [])).map((id) => trip.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
          const pending = j.results.flatMap((r) => (!r.ok && "needsConfirmation" in r ? [r] : r.ok && "pending" in r && r.pending ? [r.pending] : []));
          const errors = j.results.flatMap((r) => ("error" in r ? [r.error] : []));
          return (
            <li key={j.id} className="flex gap-3">
              <span className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- the person's own screenshot, in memory */}
                {j.preview && <img src={j.preview} alt={`Screenshot ${n + 1}`} className="size-full object-cover" />}
                {(j.status === "waiting" || j.status === "reading") && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Icon name={j.status === "reading" ? "sparkles" : "clock"} className={`size-5 ${j.status === "reading" ? "animate-pulse" : ""}`} />
                  </span>
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-base">
                {j.status === "waiting" && <p className="text-muted">Waiting</p>}
                {j.status === "reading" && <p className="text-muted">Reading…</p>}
                {j.status === "failed" && <p className="font-semibold text-danger">{j.error}</p>}
                {j.status === "done" && (
                  <>
                    {j.results.filter(added).map((r) =>
                      r.ok && "summary" in r ? (
                        <p key={r.entryId} className="flex items-start gap-1.5">
                          <Icon name="check" className="mt-1 size-4 shrink-0 text-ok" />
                          <span>{r.summary.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(". ")}</span>
                        </p>
                      ) : null,
                    )}
                    {!items.length && !pending.length && !errors.length && <p className="text-muted">{j.text || "No booking found in this one."}</p>}
                    {errors.map((e) => (
                      <p key={e} className="font-semibold text-danger">
                        {e}
                      </p>
                    ))}
                    {(items.length > 0 || j.results.some(added)) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {items.map((i) => (
                          <button key={i.id} type="button" onClick={() => go({ tab: "item", itemId: i.id })} className="text-sm font-semibold text-accent underline underline-offset-2">
                            Open {i.title}
                          </button>
                        ))}
                        {j.results.filter(added).map((r) =>
                          r.ok && "entryId" in r ? (
                            <button key={r.entryId} type="button" onClick={() => void undo(r.entryId)} className="text-sm font-semibold text-muted underline underline-offset-2">
                              Undo
                            </button>
                          ) : null,
                        )}
                      </div>
                    )}
                    {pending.map((p, k) => (
                      <ConfirmCard key={k} pending={p} />
                    ))}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
