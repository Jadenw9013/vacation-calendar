import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./auth";
import { FirstName } from "./ops";

export const MAX_BODY_BYTES = 64_000;

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Defense in depth behind proxy.ts: every route re-checks the session, and
 * writes must come from this site (the cookie is SameSite=Lax, this covers
 * anything that slips past that).
 */
export async function guard(request: Request): Promise<NextResponse | null> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSession(session)) return jsonError(401, "unauthorized");
  if (request.method !== "GET") {
    if (request.headers.get("sec-fetch-site") === "cross-site") return jsonError(403, "cross-site request");
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) return jsonError(403, "cross-origin request");
  }
  return null;
}

export async function readJson(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, res: jsonError(413, "body too large") };
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return { ok: true, body };
  } catch {
    return { ok: false, res: jsonError(400, "body must be a JSON object") };
  }
}

export function parseAuthor(v: unknown): string | null {
  const r = FirstName.safeParse(v);
  return r.success ? r.data : null;
}

export function parseVersion(v: unknown): number | null {
  return Number.isInteger(v) && (v as number) > 0 ? (v as number) : null;
}
