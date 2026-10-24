import { NextResponse } from "next/server";
import { TripSchema } from "@/domain/schema";
import type { Trip } from "@/domain/types";
import { hashPasscode, joinedTrips, newTripId, writeSession } from "@/server/auth";
import { firstName, getStore, jsonError, readJson, sameSite } from "@/server/http";

/** The trips this browser has joined. */
export async function GET() {
  const ids = await joinedTrips();
  return NextResponse.json({ trips: ids.length ? await getStore().list(ids) : [] }, { headers: { "Cache-Control": "no-store" } });
}

/** Body: { name, destination, startDate, endDate, tz, homeTz?, currency, homeCurrency?, passcode, me }. Creates a trip and joins it. */
export async function POST(request: Request) {
  const denied = sameSite(request);
  if (denied) return denied;
  const parsed = await readJson(request, 4_000);
  if (!parsed.ok) return parsed.res;
  const b = parsed.body;
  const me = firstName(b.me);
  if (!me) return jsonError(400, "Your first name, one word.", { field: "me" });
  if (typeof b.passcode !== "string" || b.passcode.trim().length < 4 || b.passcode.length > 100) return jsonError(400, "Pick a passcode of 4–100 characters.", { field: "passcode" });

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(b.name) || str(b.destination);
  const trip: Trip = {
    schema: 2,
    id: newTripId(name || "trip"),
    name,
    destination: str(b.destination) || name,
    startDate: str(b.startDate),
    endDate: str(b.endDate),
    tz: str(b.tz),
    ...(str(b.homeTz) ? { homeTz: str(b.homeTz) } : {}),
    currency: (str(b.currency) || "USD").toUpperCase(),
    ...(str(b.homeCurrency) ? { homeCurrency: str(b.homeCurrency).toUpperCase() } : {}),
    people: [me],
    items: [],
    todos: [],
  };
  const check = TripSchema.safeParse(trip);
  if (!check.success) {
    const first = check.error.issues[0];
    return jsonError(400, `${first.path.join(".")}: ${first.message}`, { field: String(first.path[0] ?? "") });
  }
  if (trip.endDate < trip.startDate) return jsonError(400, "The trip ends before it starts.", { field: "endDate" });

  if (!(await getStore().create(trip, await hashPasscode(b.passcode.trim())))) return jsonError(409, "Try again.");
  await writeSession({ tripId: trip.id, name: me });
  return NextResponse.json({ ok: true, id: trip.id });
}
