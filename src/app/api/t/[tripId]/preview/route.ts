import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getStore, jsonError, requireSession } from "@/server/http";

type Context = { params: Promise<{ tripId: string }> };
const path = (id: string, token: string | null) => token ? `/p/${id}/${token}` : null;
const reply = (preview: string | null) => NextResponse.json({ path: preview }, { headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: Context) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  return reply(path(tripId, await getStore().getPreview(tripId)));
}

export async function POST(request: Request, { params }: Context) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const store = getStore();
  if (!await store.get(tripId)) return jsonError(404, "No such trip.");
  await store.claimPreview(tripId, randomBytes(32).toString("hex"));
  const token = await store.getPreview(tripId);
  if (!token) return jsonError(409, "The viewing link changed. Try again.");
  return reply(path(tripId, token));
}

export async function DELETE(request: Request, { params }: Context) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  await getStore().disablePreview(tripId);
  return reply(null);
}
