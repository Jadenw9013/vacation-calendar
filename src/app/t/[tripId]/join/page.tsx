import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { JoinForm } from "@/features/join/JoinForm";
import { getStore } from "@/server/db";
import { firstName, TRIP_ID } from "@/server/http";
import { SEED_TRIP_ID } from "@/server/seed";
import { readAccount, readSession } from "@/server/auth";

export const metadata = { title: "Join the trip" };

export default async function JoinPage({ params }: { params: Promise<{ tripId: string }> }) {
  await connection();
  const { tripId } = await params;
  if (!TRIP_ID.test(tripId)) notFound();
  if (await readSession(tripId)) redirect(`/t/${tripId}`);
  const store = getStore();
  const state = await store.get(tripId);
  if (!state) notFound();
  const hasPasscode = (await store.getPass(tripId)) !== null || (tripId === SEED_TRIP_ID && !!process.env.TRIP_PASSCODE);
  const account = await readAccount();
  return <JoinForm tripId={tripId} tripName={state.trip.name} hasPasscode={hasPasscode} people={state.trip.people} initialName={firstName(account?.name.split(/\s+/)[0]) ?? ""} />;
}
