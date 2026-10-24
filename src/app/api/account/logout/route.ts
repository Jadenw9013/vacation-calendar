import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCOUNT_COOKIE } from "@/server/auth";
import { sameSite } from "@/server/http";

export async function POST(request: Request) {
  const denied = sameSite(request);
  if (denied) return denied;
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (cookie.name === ACCOUNT_COOKIE || cookie.name.startsWith("trip_")) jar.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
  return NextResponse.json({ ok: true });
}
