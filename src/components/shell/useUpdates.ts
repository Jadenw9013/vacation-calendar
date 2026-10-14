"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ChangeEntry } from "@/lib/engine";
import { changedSince, unread } from "@/lib/updates";

/*
 * What this device has seen, so other people's changes show up as new:
 * - seen: when Updates was last opened (the unread badge counts from here)
 * - since: when this device first looked (the per-item markers count from here)
 * - items: when each item was last opened (its marker clears then)
 * All three hold server times from the change log, never this phone's clock,
 * so a phone with the wrong time still counts correctly.
 */
const SEEN = "trip-updates-seen";
const SINCE = "trip-marks-since";
const ITEMS = "trip-items-seen";
const EVENT = "trip-updates-seen-change";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not stored: markers just come back next visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const snapshot = () => `${read(SEEN) ?? ""}|${read(SINCE) ?? ""}|${read(ITEMS) ?? ""}`;

export function useUpdates(entries: ChangeEntry[], me: string) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "||");
  const [seenRaw, sinceRaw, itemsRaw] = raw.split("|");
  const latest = entries[0] ? Date.parse(entries[0].at) : 0;

  // First visit on this device: nothing so far is "new".
  useEffect(() => {
    if (read(SEEN) === null) write(SEEN, String(latest));
    if (read(SINCE) === null) write(SINCE, String(latest));
  }, [latest]);

  return useMemo(() => {
    // Before the first-visit values are written (or on the server), treat everything as seen.
    const seen = seenRaw ? Number(seenRaw) : Infinity;
    const since = sinceRaw ? Number(sinceRaw) : Infinity;
    let items: Record<string, number> = {};
    try {
      items = itemsRaw ? JSON.parse(itemsRaw) : {};
    } catch {
      items = {};
    }
    const fresh = unread(entries, seen, me);
    // Item id → the server time of the change it's marked for.
    const markers = new Map<string, number>();
    for (const [id, at] of changedSince(entries, since, me)) if (at > (items[id] ?? 0)) markers.set(id, at);
    return { unread: fresh, markers, seenMs: seen, latest };
  }, [entries, me, seenRaw, sinceRaw, itemsRaw, latest]);
}

export function useMarkSeen() {
  /** Everything up to the newest change (a server time) has been seen. */
  const all = useCallback((latest: number) => write(SEEN, String(latest)), []);
  /** This item's change at `at` (a server time) has been seen. */
  const item = useCallback((id: string, at: number) => {
    let items: Record<string, number> = {};
    try {
      items = JSON.parse(read(ITEMS) ?? "{}");
    } catch {
      items = {};
    }
    write(ITEMS, JSON.stringify({ ...items, [id]: at }));
  }, []);
  return { all, item };
}
