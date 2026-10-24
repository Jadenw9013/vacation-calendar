import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decodeSession, unseal, writeAccount } from "@/server/auth";
import { getStore } from "@/server/db";
import { GOOGLE_HANDSHAKE_COOKIE, googleClient, googleConfigured, safeReturnTo, type GoogleHandshake } from "@/server/google";

export async function GET(request: Request) {
  const jar = await cookies();
  const handshake = unseal<GoogleHandshake>("google-handshake", jar.get(GOOGLE_HANDSHAKE_COOKIE)?.value);
  jar.set(GOOGLE_HANDSHAKE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  const url = new URL(request.url);
  const origin = googleConfigured() ? new URL(process.env.GOOGLE_REDIRECT_URI!).origin : url.origin;
  const failed = () => NextResponse.redirect(new URL("/?all=1&auth=failed", origin));
  if (!googleConfigured() || !handshake || !url.searchParams.get("code") || url.searchParams.get("state") !== handshake.state || url.searchParams.has("error")) return failed();
  try {
    const client = googleClient();
    const { tokens } = await client.getToken({ code: url.searchParams.get("code")!, codeVerifier: handshake.verifier });
    if (!tokens.id_token) return failed();
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID! });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || !identity.email_verified || identity.nonce !== handshake.nonce) return failed();
    const account = { id: createHash("sha256").update(`google:${identity.sub}`).digest("hex"), name: identity.given_name || identity.name || "Traveler", email: identity.email };
    // Only guest sessions migrate. Switching Google accounts cannot copy another account's trips.
    for (const cookie of jar.getAll().filter((c) => c.name.startsWith("trip_"))) {
      const tripId = cookie.name.slice(5);
      const session = decodeSession(cookie.value, tripId);
      if (session && !session.accountId) {
        await getStore().rememberTrip(account.id, tripId, session.name);
        // Once linked, this guest cookie must not be claimed by another account.
        jar.set(cookie.name, "", { path: "/", maxAge: 0 });
      }
    }
    await writeAccount(account);
    return NextResponse.redirect(new URL(safeReturnTo(handshake.returnTo), origin));
  } catch { return failed(); }
}
