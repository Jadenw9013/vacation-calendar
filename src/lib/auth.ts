import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * One shared passphrase for the whole group. The session cookie holds an HMAC
 * derived from it, so changing TRIP_PASSPHRASE signs everyone out.
 * No "server-only" import here: proxy.ts uses this too.
 */

export const SESSION_COOKIE = "trip_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export type AuthMode =
  /** TRIP_PASSPHRASE is set: everything is gated. */
  | "gated"
  /** Local dev without a passphrase: open, with a notice. */
  | "open-dev"
  /** Production without a passphrase: fail closed. */
  | "misconfigured";

export function authMode(): AuthMode {
  if (process.env.TRIP_PASSPHRASE) return "gated";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open-dev";
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function sessionToken(passphrase: string): string {
  return createHmac("sha256", passphrase).update("trip-session-v1").digest("base64url");
}

export function checkPassphrase(input: string): boolean {
  const expected = process.env.TRIP_PASSPHRASE;
  if (!expected) return false;
  return timingSafeEqual(digest(input), digest(expected));
}

export function isValidSession(cookieValue: string | undefined): boolean {
  const mode = authMode();
  if (mode === "open-dev") return true;
  if (mode === "misconfigured" || !cookieValue) return false;
  return timingSafeEqual(digest(cookieValue), digest(sessionToken(process.env.TRIP_PASSPHRASE!)));
}

/** Only same-site relative paths, so ?next= can't bounce people elsewhere. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
