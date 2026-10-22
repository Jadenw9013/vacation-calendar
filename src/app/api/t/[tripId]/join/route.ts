import { NextResponse } from "next/server";
import { checkPasscode, hashPasscode, writeSession } from "@/server/auth";
import { firstName, getStore, jsonError, readJson, sameSite, TRIP_ID } from "@/server/http";
import { SEED_TRIP_ID } from "@/server/seed";

const MAX_TRIES = 10;
const WINDOW_SECONDS = 15 * 60;

/**
 * Body: { passcode, name }. Checks the trip's passcode and sets the session
 * cookie. A trip with no passcode yet (the original trip, before anyone has
 * joined) takes the first one given; from then on it's private.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const denied = sameSite(request);
  if (denied) return denied;
  const { tripId } = await params;
  if (!TRIP_ID.test(tripId)) return jsonError(404, "No such trip.");
  const parsed = await readJson(request, 2_000);
  if (!parsed.ok) return parsed.res;
  const { passcode, name } = parsed.body;

  const who = firstName(name);
  if (!who) return jsonError(400, "Your first name, one word.", { field: "name" });
  if (typeof passcode !== "string" || passcode.trim().length < 4 || passcode.length > 100) {
    return jsonError(400, "The passcode is at least 4 characters.", { field: "passcode" });
  }

  const store = getStore();
  if (!(await store.get(tripId))) return jsonError(404, "No such trip.");

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if ((await store.hit(`join:${tripId}:${ip}`, WINDOW_SECONDS)) > MAX_TRIES) {
    return jsonError(429, "Too many tries. Wait 15 minutes and try again.");
  }

  // The original trip can have its passcode set at deploy time, so nobody has to claim it first.
  if (tripId === SEED_TRIP_ID && process.env.TRIP_PASSCODE && !(await store.getPass(tripId))) {
    await store.claimPass(tripId, await hashPasscode(process.env.TRIP_PASSCODE.trim()));
  }
  const stored = await store.getPass(tripId);
  let created = false;
  if (!stored) {
    created = await store.claimPass(tripId, await hashPasscode(passcode.trim()));
    if (!created) return jsonError(409, "Someone just set the passcode. Ask the group for it.");
  } else if (!(await checkPasscode(passcode.trim(), stored))) {
    return jsonError(403, "That passcode doesn't match.", { field: "passcode" });
  }

  await writeSession({ tripId, name: who });
  // Joining puts you in the group's list, so you can be picked as who's on something.
  const state = await store.get(tripId);
  if (state && !state.trip.people.includes(who)) await store.apply(tripId, [{ op: "trip.update", set: { people: [...state.trip.people, who] } }], { author: who });
  return NextResponse.json({ ok: true, name: who, passcodeSet: created });
}

/** The trip's name and whether it has a passcode yet: the join screen words itself differently for the first person. */
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!TRIP_ID.test(tripId)) return jsonError(404, "No such trip.");
  const store = getStore();
  const state = await store.get(tripId);
  if (!state) return jsonError(404, "No such trip.");
  return NextResponse.json({ name: state.trip.name, hasPasscode: (await store.getPass(tripId)) !== null });
}
