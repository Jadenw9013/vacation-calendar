import type { Trip } from "@/data/types";

/**
 * The last trip this phone saw, so Trip mode still works with no signal.
 * Browser storage only; cleared on sign out.
 */
export interface Snapshot {
  trip: Trip;
  version: number;
  /** When the server produced this copy, epoch ms. */
  savedAt: number;
}

const KEY = "trip-snapshot";
const EVENT = "trip-snapshot-change";

export function readSnapshotRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Snapshot;
    return s && typeof s.version === "number" && s.trip && Array.isArray(s.trip.segments) ? s : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(s: Snapshot): boolean {
  try {
    const current = parseSnapshot(readSnapshotRaw());
    // Never replace a newer copy with an older page (a cached page opened offline, say).
    if (current && current.savedAt > s.savedAt) return true;
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeSnapshot(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Removes the saved trip and every offline cache. Used on sign out. */
export async function clearOfflineData(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}
