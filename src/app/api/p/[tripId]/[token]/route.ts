import { NextResponse } from "next/server";
import { previewTrip } from "@/server/preview";

export async function GET(request: Request, { params }: { params: Promise<{ tripId: string; token: string }> }) {
  const { tripId, token } = await params;
  const state = await previewTrip(tripId, token);
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  if (!state) return NextResponse.json({ error: "This viewing link is unavailable." }, { status: 404, headers });
  const etag = `"${state.version}"`;
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: { ...headers, ETag: etag } });
  return NextResponse.json({ version: state.version }, { headers: { ...headers, ETag: etag } });
}
