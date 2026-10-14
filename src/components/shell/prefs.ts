"use client";

import { useSyncExternalStore } from "react";

/*
 * Per-device display settings, kept as attributes on <html> so CSS does the
 * work: data-sunlight for Sunlight mode, data-text="large" for Large text.
 * PREFS_BOOT sets them before the first paint so there's no flash.
 */

const SUN = "trip-sunlight";
const TEXT = "trip-text";
const EVENT = "trip-prefs-change";

export const PREFS_BOOT = `try{var d=document.documentElement;if(localStorage.getItem("${SUN}")==="1")d.setAttribute("data-sunlight","");if(localStorage.getItem("${TEXT}")==="large")d.setAttribute("data-text","large")}catch(e){}`;

export type TextSize = "normal" | "large";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not kept, but still applies until reload.
  }
}

export function useSunlight(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => document.documentElement.hasAttribute("data-sunlight"), () => false);
  return [
    on,
    (next: boolean) => {
      document.documentElement.toggleAttribute("data-sunlight", next);
      store(SUN, next ? "1" : null);
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}

export function useTextSize(): [TextSize, (size: TextSize) => void] {
  const size = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.getAttribute("data-text") === "large" ? "large" : "normal"),
    () => "normal" as const,
  );
  return [
    size,
    (next: TextSize) => {
      if (next === "large") document.documentElement.setAttribute("data-text", "large");
      else document.documentElement.removeAttribute("data-text");
      store(TEXT, next === "large" ? "large" : null);
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}
