"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { prepareChange, type ChangeEntry } from "@/domain/change";
import { newId } from "@/domain/ids";
import { itemsTouched, type Op } from "@/domain/ops";
import type { Trip, TripState } from "@/domain/types";
import { useOnline } from "./hooks";

/*
 * The trip on this phone. Every edit:
 *   1. is checked here with the same rules the server uses (instant, offline too),
 *   2. shows at once, and waits in an outbox kept in localStorage,
 *   3. is sent when there's a connection; the server applies it to the latest
 *      trip, so edits made offline or at the same time as someone else land.
 * The last trip seen is kept too, so everything opens with no signal.
 */

interface Pending {
  key: string;
  ops: Op[];
  confirmed?: boolean;
}

export type ApplyOutcome =
  | { ok: true; entry?: ChangeEntry; queued?: boolean }
  | { ok: false; needsConfirmation?: boolean; error: string };

export interface Toast {
  id: number;
  message: string;
  /** Change to undo from the toast. */
  entryId?: string;
}

interface StoreValue {
  tripId: string;
  me: string;
  trip: Trip;
  version: number;
  online: boolean;
  /** Edits made on this phone that haven't reached the server yet. */
  queued: number;
  /** When the copy on screen last came from the server, epoch ms. */
  syncedAt: number;
  apply(ops: Op[], opts?: { confirmed?: boolean; message?: string }): Promise<ApplyOutcome>;
  undo(entryId: string): Promise<void>;
  refresh(): Promise<void>;
  setMe(name: string): Promise<string | null>;
  toast: Toast | null;
  notify(message: string, entryId?: string): void;
  dismissToast(): void;
  /** Items changed by the last edit, for a brief highlight. */
  justChanged: Set<string>;
}

const Ctx = createContext<StoreValue | null>(null);

export function useTrip(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrip outside TripProvider");
  return v;
}

const snapKey = (id: string) => `trip:${id}:snapshot`;
const outboxKey = (id: string) => `trip:${id}:outbox`;

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, just not offline.
  }
}

function lastSummary(entry: ChangeEntry): string {
  const s = entry.summary.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TripProvider({ tripId, initial, me: initialMe, serverNow, children }: { tripId: string; initial: TripState; me: string; serverNow: number; children: ReactNode }) {
  const online = useOnline();
  const [server, setServer] = useState<TripState>(initial);
  const [syncedAt, setSyncedAt] = useState(serverNow);
  const [outbox, setOutbox] = useState<Pending[]>([]);
  const [me, setMeState] = useState(initialMe);
  const [toast, setToast] = useState<Toast | null>(null);
  const [justChanged, setJustChanged] = useState<Set<string>>(new Set());
  const sending = useRef(false);
  const outboxRef = useRef(outbox);
  useEffect(() => {
    outboxRef.current = outbox;
  }, [outbox]);

  /** A newer server copy wins; an older one (from a cached page) never replaces what we have. */
  const accept = useCallback(
    (s: TripState, at = Date.now()) => {
      setServer((cur) => (s.version >= cur.version ? s : cur));
      setSyncedAt(at);
      save(snapKey(tripId), { ...s, savedAt: at });
    },
    [tripId],
  );

  // Restore what this phone had: a newer snapshot than the page, and any unsent edits.
  useEffect(() => {
    const snap = load<TripState & { savedAt: number }>(snapKey(tripId));
    if (snap && snap.version > initial.version && snap.trip?.schema === 2) {
      // Browser storage only exists after hydration, so this can't be initial state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServer({ trip: snap.trip, version: snap.version });
      setSyncedAt(snap.savedAt);
    } else save(snapKey(tripId), { ...initial, savedAt: serverNow });
    const pending = load<Pending[]>(outboxKey(tripId));
    if (pending?.length) setOutbox(pending);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => save(outboxKey(tripId), outbox.length ? outbox : null), [outbox, tripId]);

  const notify = useCallback((message: string, entryId?: string) => setToast({ id: Date.now(), message, ...(entryId ? { entryId } : {}) }), []);

  const flash = useCallback((ops: Op[]) => {
    setJustChanged(new Set(ops.flatMap(itemsTouched)));
    setTimeout(() => setJustChanged(new Set()), 1800);
  }, []);

  /** Sends one pending edit. Returns what happened; leaves it queued if the network failed. */
  const send = useCallback(
    async (p: Pending): Promise<ApplyOutcome | "network"> => {
      let res: Response;
      try {
        res = await fetch(`/api/t/${tripId}/ops`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ops: p.ops, key: p.key, ...(p.confirmed ? { confirmed: true } : {}) }),
        });
      } catch {
        return "network";
      }
      if (res.status === 401) {
        window.location.replace(`/t/${tripId}/join`);
        return "network";
      }
      if (res.status >= 500) return "network";
      const body = await res.json().catch(() => ({}));
      setOutbox((q) => q.filter((x) => x.key !== p.key));
      if (body.trip) accept({ trip: body.trip, version: body.version });
      if (res.ok) return { ok: true, entry: body.entry };
      return { ok: false, needsConfirmation: !!body.needsConfirmation, error: body.error ?? "That didn't save." };
    },
    [tripId, accept],
  );

  /** Sends whatever is queued, oldest first. */
  const flush = useCallback(async () => {
    if (sending.current || !navigator.onLine) return;
    sending.current = true;
    try {
      for (const p of outboxRef.current) {
        const r = await send(p);
        if (r === "network") break;
        if (!r.ok) notify(`An edit made offline didn't apply: ${r.error}`);
      }
    } finally {
      sending.current = false;
    }
  }, [send, notify]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/t/${tripId}`, { cache: "no-store" });
      if (res.status === 401) return void window.location.replace(`/t/${tripId}/join`);
      if (!res.ok) return;
      const body = await res.json();
      accept({ trip: body.trip, version: body.version });
    } catch {
      // Offline: keep the copy we have.
    }
  }, [tripId, accept]);

  // Back online, back in view, and every minute while open: send what's queued, fetch what's new.
  useEffect(() => {
    if (!online) return;
    void flush().then(refresh);
    const onShow = () => document.visibilityState === "visible" && void flush().then(refresh);
    document.addEventListener("visibilitychange", onShow);
    const id = setInterval(() => document.visibilityState === "visible" && void flush().then(refresh), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      clearInterval(id);
    };
  }, [online, flush, refresh]);

  // What's on screen: the server's trip with this phone's unsent edits on top.
  const trip = useMemo(() => {
    let state = server;
    for (const p of outbox) {
      const r = prepareChange(state, p.ops, { author: me, confirmed: p.confirmed });
      if (r.ok) state = { trip: r.trip, version: r.entry.version };
    }
    return state.trip;
  }, [server, outbox, me]);

  const apply = useCallback(
    async (ops: Op[], opts: { confirmed?: boolean; message?: string } = {}): Promise<ApplyOutcome> => {
      // Same checks as the server, here and now: bad edits never queue.
      const local = prepareChange({ trip, version: server.version }, ops, { author: me, confirmed: opts.confirmed });
      if (!local.ok) {
        const needs = local.issues.find((i) => i.code === "needs_confirmation");
        return { ok: false, needsConfirmation: !!needs, error: (needs ?? local.issues[0]).message };
      }
      const p: Pending = { key: newId("k"), ops, ...(opts.confirmed ? { confirmed: true } : {}) };
      setOutbox((q) => [...q, p]);
      flash(ops);
      const said = opts.message ?? lastSummary(local.entry);
      if (!navigator.onLine) {
        notify(`${said}. Saved on this phone; it'll sync when you're online.`);
        return { ok: true, queued: true };
      }
      // Done as far as the person is concerned: it's checked and on screen. The server
      // confirms in the background, and that's when Undo appears.
      void send(p).then((r) => {
        if (r === "network") notify(`${said}. Saved on this phone; it'll sync when the connection is back.`);
        else if (r.ok && r.entry) notify(opts.message ?? lastSummary(r.entry), r.entry.id);
        else if (!r.ok) notify(`That didn't save: ${r.error}`);
      });
      return { ok: true };
    },
    [trip, server.version, me, send, flash, notify],
  );

  const undo = useCallback(
    async (entryId: string) => {
      try {
        const res = await fetch(`/api/t/${tripId}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entryId }) });
        const body = await res.json();
        if (body.trip) accept({ trip: body.trip, version: body.version });
        notify(res.ok ? "Undone" : (body.error ?? "Couldn't undo that."));
      } catch {
        notify("Undo needs a connection.");
      }
    },
    [tripId, accept, notify],
  );

  const setMe = useCallback(
    async (name: string) => {
      try {
        const res = await fetch(`/api/t/${tripId}/me`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
        const body = await res.json();
        if (!res.ok) return body.error ?? "That didn't work.";
        setMeState(body.name);
        return null;
      } catch {
        return "Changing your name needs a connection.";
      }
    },
    [tripId],
  );

  const value: StoreValue = {
    tripId,
    me,
    trip,
    version: server.version,
    online,
    queued: outbox.length,
    syncedAt,
    apply,
    undo,
    refresh,
    setMe,
    toast,
    notify,
    dismissToast: () => setToast(null),
    justChanged,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
