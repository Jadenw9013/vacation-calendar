"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";

/*
 * Navigation inside a trip uses history.pushState, which Next keeps in step
 * with usePathname. No server round trip, so every screen opens with no
 * signal, and the back button and shared links still work.
 *
 *   /t/{id}                 Today
 *   /t/{id}/day/{date}      Today, on that day
 *   /t/{id}/plan            Plan
 *   /t/{id}/todo            To-do
 *   /t/{id}/trip            Trip settings and people
 *   /t/{id}/item/{itemId}   An item's page
 */

export type View =
  | { tab: "today"; day?: string }
  | { tab: "plan" }
  | { tab: "todo" }
  | { tab: "trip" }
  | { tab: "item"; itemId: string };

export function parseView(pathname: string): View {
  const parts = pathname.split("/").filter(Boolean).slice(2);
  const [a, b] = parts;
  if (a === "day" && b && /^\d{4}-\d{2}-\d{2}$/.test(b)) return { tab: "today", day: b };
  if (a === "plan") return { tab: "plan" };
  if (a === "todo") return { tab: "todo" };
  if (a === "trip") return { tab: "trip" };
  if (a === "item" && b) return { tab: "item", itemId: decodeURIComponent(b) };
  return { tab: "today" };
}

export function viewPath(tripId: string, v: View): string {
  const base = `/t/${tripId}`;
  switch (v.tab) {
    case "today":
      return v.day ? `${base}/day/${v.day}` : base;
    case "item":
      return `${base}/item/${encodeURIComponent(v.itemId)}`;
    default:
      return `${base}/${v.tab}`;
  }
}

/** How many screens deep this tab has gone inside the app, so Back never leaves it. */
let depth = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => (depth = Math.max(0, depth - 1)));

export function useView(tripId: string) {
  const pathname = usePathname();
  const view = parseView(pathname);
  const go = useCallback(
    (v: View, opts: { replace?: boolean } = {}) => {
      const path = viewPath(tripId, v);
      if (path === window.location.pathname) return;
      if (opts.replace) window.history.replaceState(null, "", path);
      else {
        window.history.pushState(null, "", path);
        depth++;
      }
      window.scrollTo({ top: 0 });
    },
    [tripId],
  );
  const back = useCallback(
    (fallback: View = { tab: "today" }) => {
      // Opened straight from a shared link: nothing to go back to inside the app.
      if (depth > 0) window.history.back();
      else go(fallback, { replace: true });
    },
    [go],
  );
  return { view, go, back };
}
