"use client";

import { useSyncExternalStore } from "react";

/*
 * Per-device display settings, kept as attributes on <html> so CSS does the
 * work: data-theme (light/dark, or follow the phone), data-sunlight, and
 * data-text="large". PREFS_BOOT applies them before the first paint.
 */

const THEME = "trip-theme";
const SUN = "trip-sunlight";
const TEXT = "trip-text";
const EVENT = "trip-prefs-change";

export const PREFS_BOOT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);if(localStorage.getItem("${SUN}")==="1")d.setAttribute("data-sunlight","");if(localStorage.getItem("${TEXT}")==="large")d.setAttribute("data-text","large")}catch(e){}`;

export type Theme = "system" | "light" | "dark";
export type TextSize = "normal" | "large";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function keep(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered, but applies until reload.
  }
}

const changed = () => window.dispatchEvent(new Event(EVENT));
const html = () => document.documentElement;

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, () => (html().getAttribute("data-theme") as Theme | null) ?? "system", () => "system" as Theme);
  return [
    theme,
    (t) => {
      if (t === "system") html().removeAttribute("data-theme");
      else html().setAttribute("data-theme", t);
      keep(THEME, t === "system" ? null : t);
      changed();
    },
  ];
}

export function useSunlight(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => html().hasAttribute("data-sunlight"), () => false);
  return [
    on,
    (next) => {
      html().toggleAttribute("data-sunlight", next);
      keep(SUN, next ? "1" : null);
      changed();
    },
  ];
}

export function useTextSize(): [TextSize, (s: TextSize) => void] {
  const size = useSyncExternalStore(subscribe, () => (html().getAttribute("data-text") === "large" ? "large" : "normal"), () => "normal" as TextSize);
  return [
    size,
    (next) => {
      if (next === "large") html().setAttribute("data-text", "large");
      else html().removeAttribute("data-text");
      keep(TEXT, next === "large" ? "large" : null);
      changed();
    },
  ];
}
