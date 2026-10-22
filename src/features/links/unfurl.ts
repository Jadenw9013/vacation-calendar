"use client";

import type { LinkKind } from "@/domain/types";

export interface Preview {
  url: string;
  kind: LinkKind;
  site: string;
  title?: string;
  image?: string;
  description?: string;
  placeName?: string;
}

/** A link's title and picture from the server; null offline or when the site won't say. */
export async function unfurl(tripId: string, url: string): Promise<Preview | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  try {
    const res = await fetch(`/api/t/${tripId}/unfurl`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    return res.ok ? ((await res.json()) as Preview) : null;
  } catch {
    return null;
  }
}
