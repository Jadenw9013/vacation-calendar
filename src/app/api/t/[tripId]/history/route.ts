import { NextResponse } from "next/server";
import { getStore, requireSession } from "@/server/http";

/** The change log, newest first. ?limit=50 */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const limit = Math.max(1, Math.min(200, Number(new URL(request.url).searchParams.get("limit")) || 50));
  return NextResponse.json({ entries: await getStore().history(tripId, limit) }, { headers: { "Cache-Control": "no-store" } });
}
