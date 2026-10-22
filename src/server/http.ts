import "server-only";
import { NextResponse } from "next/server";
import { FirstName } from "@/domain/schema";
import { readSession, type Session } from "./auth";
import { getStore } from "./db";
import type { ApplyResult } from "./store";

export const MAX_BODY_BYTES = 64_000;

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Writes must come from this site's own pages, so another site can't act from a visitor's browser. */
export function sameSite(request: Request): NextResponse | null {
  if (request.method === "GET") return null;
  if (request.headers.get("sec-fetch-site") === "cross-site") return jsonError(403, "cross-site request");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return jsonError(403, "cross-origin request");
  return null;
}

export async function readJson(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, res: jsonError(413, "That's too much to send at once.") };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return { ok: true, body };
  } catch {
    return { ok: false, res: jsonError(400, "body must be a JSON object") };
  }
}

export function firstName(v: unknown): string | null {
  const r = FirstName.safeParse(v);
  return r.success ? r.data : null;
}

export const TRIP_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** The signed-in person for this trip, or a 401 response. */
export async function requireSession(request: Request, tripId: string): Promise<{ ok: true; session: Session } | { ok: false; res: NextResponse }> {
  const denied = sameSite(request);
  if (denied) return { ok: false, res: denied };
  if (!TRIP_ID.test(tripId)) return { ok: false, res: jsonError(404, "No such trip.") };
  const session = await readSession(tripId);
  if (!session) return { ok: false, res: jsonError(401, "Join the trip first.", { join: true }) };
  return { ok: true, session };
}

export function applyResponse(result: ApplyResult) {
  if (result.ok) return NextResponse.json({ ok: true, trip: result.state.trip, version: result.state.version, entry: result.entry, ...(result.replayed ? { replayed: true } : {}) });
  if (result.reason === "not_found") return jsonError(404, "No such trip.");
  if (result.reason === "busy") return jsonError(503, "Lots of edits at once. Try again in a moment.");
  const needs = result.issues.find((i) => i.code === "needs_confirmation");
  return NextResponse.json(
    {
      ok: false,
      error: needs ? needs.message : result.issues.map((i) => i.message).join(" "),
      issues: result.issues,
      needsConfirmation: !!needs,
      trip: result.state.trip,
      version: result.state.version,
    },
    { status: needs ? 428 : 422 },
  );
}

export { getStore };
