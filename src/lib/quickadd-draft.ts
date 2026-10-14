import type { Segment, SegmentKind } from "@/data/types";

/*
 * The parts of Quick Add that don't parse dates, so code that only needs to
 * turn a draft into a segment doesn't load the date parser (chrono-node).
 */

export type QuickKind = Extract<SegmentKind, "lodging" | "transport" | "activity">;
export type QuickStatus = "needs-booking" | "booked";

export interface QuickDraft {
  title: string;
  kind: QuickKind;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:00-06:00"; null when no day is known. */
  start: string | null;
  end: string | null;
  /** Where the day came from: the words typed, or the day on screen. */
  dayFrom: "text" | "selected" | null;
  /** The day falls outside Nov 24–30: the person must confirm. */
  outsideTrip: boolean;
}

export type Missing = "title" | "day";

/** The new segment for a complete draft. Location is unknown until someone adds it. */
export function draftToSegment(d: QuickDraft, status: QuickStatus, owner?: string): Segment {
  const slug = d.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const id = `${d.kind}-${slug || "item"}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    kind: d.kind,
    title: d.title,
    start: d.start,
    end: d.end,
    status,
    location: "TBD",
    ...(owner ? { owner } : {}),
  };
}

/** What a missing piece means, in a few words: "Which day?" */
export function missingPrompt(missing: Missing[]): string {
  if (missing.includes("title") && missing.includes("day")) return "What is it, and which day?";
  if (missing.includes("title")) return "What is it?";
  if (missing.includes("day")) return "Which day?";
  return "";
}
