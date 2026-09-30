import { NextResponse } from "next/server";
import { checkPassphrase, safeNext, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const passphrase = String(form.get("passphrase") ?? "").slice(0, 200);
  const next = safeNext(form.get("next"));

  if (!checkPassphrase(passphrase)) {
    // Slow down guessing. Real rate limiting arrives with the chat route.
    await new Promise((r) => setTimeout(r, 750));
    const back = new URL("/login", request.url);
    back.searchParams.set("error", "1");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }

  const res = NextResponse.redirect(new URL(next, request.url), 303);
  res.cookies.set(SESSION_COOKIE, sessionToken(process.env.TRIP_PASSPHRASE!), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
