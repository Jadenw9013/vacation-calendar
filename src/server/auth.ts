import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redisEnv } from "./db";

/*
 * A trip is private: its link plus a passcode the group shares. Joining sets
 * a signed, httpOnly cookie for that trip only, holding the person's first
 * name. No accounts, no emails.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPasscode(pass: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pass.normalize("NFKC"), salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function checkPasscode(pass: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const got = await scrypt(pass.normalize("NFKC"), Buffer.from(salt, "base64url"), 32);
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** On globalThis: in dev, route handlers and pages are separate bundles and must agree on the secret. */
const g = globalThis as unknown as { tripDevSecret?: string };

/** SESSION_SECRET, or one derived from the Redis token the server already holds, or a per-process one in dev. */
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const env = redisEnv();
  if (env) return createHash("sha256").update(`session:${env.token}`).digest("base64url");
  g.tripDevSecret ??= randomBytes(32).toString("base64url");
  return g.tripDevSecret;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export const cookieName = (tripId: string) => `trip_${tripId}`;

export interface Session {
  tripId: string;
  name: string;
}

export function encodeSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify({ t: s.tripId, n: s.name, i: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined, tripId: string): Session | null {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { t, n } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return t === tripId && typeof n === "string" ? { tripId: t, name: n } : null;
  } catch {
    return null;
  }
}

const MAX_AGE = 60 * 60 * 24 * 180;

export async function readSession(tripId: string): Promise<Session | null> {
  const jar = await cookies();
  return decodeSession(jar.get(cookieName(tripId))?.value, tripId);
}

export async function writeSession(s: Session): Promise<void> {
  const jar = await cookies();
  jar.set(cookieName(s.tripId), encodeSession(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Trip ids this browser has joined, from its cookies. */
export async function joinedTrips(): Promise<string[]> {
  const jar = await cookies();
  return jar
    .getAll()
    .filter((c) => c.name.startsWith("trip_"))
    .map((c) => c.name.slice(5))
    .filter((id) => decodeSession(jar.get(cookieName(id))?.value, id) !== null);
}

/** A new trip's id: readable start, unguessable end ("peru-k3f9x2q7"). */
export function newTripId(name: string): string {
  const slug =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 20) || "trip";
  const tail = Array.from(randomBytes(8), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
  return `${slug}-${tail}`;
}
