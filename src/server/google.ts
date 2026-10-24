import "server-only";
import { OAuth2Client } from "google-auth-library";

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.SESSION_SECRET);
}

export function googleClient(): OAuth2Client {
  if (!googleConfigured()) throw new Error("Google sign-in is not configured.");
  const redirect = new URL(process.env.GOOGLE_REDIRECT_URI!);
  if (redirect.protocol !== "https:" && !(redirect.protocol === "http:" && redirect.hostname === "localhost")) throw new Error("Google redirect must use HTTPS (or localhost).");
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirect.href);
}

export function safeReturnTo(value: string | null): string {
  if (!value || !/^\/(?!\/)/.test(value) || value.includes("\\")) return "/?all=1";
  // URL parsing strips tabs and newlines; reject controls before testing the origin.
  const base = "https://travel.invalid";
  try {
    const target = new URL(value, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : "/?all=1";
  } catch { return "/?all=1"; }
}

export interface GoogleHandshake { state: string; nonce: string; verifier: string; returnTo: string }
export const GOOGLE_HANDSHAKE_COOKIE = "travel_google_handshake";
