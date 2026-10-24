import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CodeChallengeMethod } from "google-auth-library";
import { seal } from "@/server/auth";
import { GOOGLE_HANDSHAKE_COOKIE, googleClient, googleConfigured, safeReturnTo } from "@/server/google";

export async function GET(request: Request) {
  if (!googleConfigured()) return NextResponse.redirect(new URL("/?all=1&auth=unavailable", request.url));
  const client = googleClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  (await cookies()).set(GOOGLE_HANDSHAKE_COOKIE, seal("google-handshake", { state, nonce, verifier: codeVerifier, returnTo }, 600), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  const url = client.generateAuthUrl({ scope: ["openid", "email", "profile"], state, nonce, code_challenge: codeChallenge, code_challenge_method: CodeChallengeMethod.S256 });
  return NextResponse.redirect(url);
}
