import { NextResponse } from "next/server";
import { readAccount } from "@/server/auth";
import { googleConfigured } from "@/server/google";

export async function GET() {
  return NextResponse.json({ account: await readAccount(), googleEnabled: googleConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
