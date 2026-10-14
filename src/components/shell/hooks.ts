"use client";

import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// The clock, to the minute. One ticker for the page.

let minute = 0;
const readMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

function subscribeClock(cb: () => void) {
  const update = () => {
    const m = readMinute();
    if (m !== minute) {
      minute = m;
      cb();
    }
  };
  update();
  const id = setInterval(update, 15_000);
  document.addEventListener("visibilitychange", update);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", update);
  };
}

/**
 * Now, in epoch ms rounded to the minute. The server's time is used while
 * hydrating so the first render matches, then the phone's clock takes over.
 */
export function useClock(serverNow: number): number {
  return useSyncExternalStore(
    subscribeClock,
    () => minute || (minute = readMinute()),
    () => serverNow,
  );
}

// ---------------------------------------------------------------------------
// Connection

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** False when the browser knows it's offline. Assumed online while rendering on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const noop = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
