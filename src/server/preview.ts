import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getStore } from "./db";
import { TRIP_ID } from "./http";

/** A viewing token authorizes only this read; it never creates a trip session. */
export async function previewTrip(tripId: string, token: string) {
  if (!TRIP_ID.test(tripId) || !/^[a-f0-9]{64}$/.test(token)) return null;
  const store = getStore();
  const expected = await store.getPreview(tripId);
  if (!expected || expected.length !== token.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return null;
  return store.get(tripId);
}
