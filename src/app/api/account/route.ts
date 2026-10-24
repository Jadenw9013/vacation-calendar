import { NextResponse } from "next/server";
import { refreshAccountSession } from "@/server/auth";
import { googleConfigured } from "@/server/google";

export async function GET() {
  return NextResponse.json({ account: await refreshAccountSession(), googleEnabled: googleConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
