import { applyResponse, getStore, jsonError, readJson, requireSession } from "@/server/http";

/** Body: { entryId }. Undoes that change on top of whatever has happened since. */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const parsed = await readJson(request, 2_000);
  if (!parsed.ok) return parsed.res;
  const { entryId } = parsed.body;
  if (typeof entryId !== "string") return jsonError(400, "entryId is required");
  const result = await getStore().undo(tripId, entryId, auth.session.name);
  if (!result.ok && result.reason === "no_entry") return jsonError(404, "That change is too old to undo here.");
  return applyResponse(result as Exclude<typeof result, { reason: "no_entry" }>);
}
