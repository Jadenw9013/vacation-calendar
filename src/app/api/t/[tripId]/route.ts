import { NextResponse } from "next/server";
import { getStore, jsonError, requireSession } from "@/server/http";

/** The trip, its version, and who you are on it. */
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const state = await getStore().get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  return NextResponse.json({ ...state, me: auth.session.name }, { headers: { "Cache-Control": "no-store" } });
}
