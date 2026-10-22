import { applyResponse, getStore, readJson, requireSession } from "@/server/http";

const KEY = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Body: { ops, key?, confirmed? }. Applied to the latest trip, whatever
 * version the sender saw. `key` makes a resend harmless; `confirmed` means a
 * person agreed to delete or move something booked.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.res;
  const { ops, key, confirmed } = parsed.body;
  const result = await getStore().apply(tripId, ops, {
    author: auth.session.name,
    confirmed: confirmed === true,
    ...(typeof key === "string" && KEY.test(key) ? { key } : {}),
  });
  return applyResponse(result);
}
