"use client";

import { useSyncExternalStore } from "react";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const noop = () => () => {};

/**
 * Days until departure, computed in the browser so a static build never goes
 * stale. Renders nothing on the server.
 */
export function Countdown({ firstDay, lastDay }: { firstDay: string; lastDay: string }) {
  const today = useSyncExternalStore(noop, todayLocal, () => null);
  if (!today) return null;
  const days = Math.round((Date.parse(`${firstDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  let text: string;
  if (days > 1) text = `${days} days to departure`;
  else if (days === 1) text = "Departs tomorrow";
  else if (days === 0) text = "Departs today";
  else if (today <= lastDay) text = "Trip underway";
  else text = "Trip over";
  return <span className="font-mono">{text}</span>;
}
