import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Home } from "@/features/home/Home";
import { joinedTrips, readAccount } from "@/server/auth";
import { firstName } from "@/server/http";
import { getStore } from "@/server/db";
import { SEED_TRIP_ID } from "@/server/seed";

/** Your trips. With exactly one, it opens straight away. */
export default async function Page({ searchParams }: { searchParams: Promise<{ all?: string; new?: string }> }) {
  await connection();
  const { all, new: create } = await searchParams;
  const store = getStore();
  const ids = await joinedTrips();
  const trips = ids.length ? await store.list(ids) : [];
  if (trips.length === 1 && !all && !create) redirect(`/t/${trips[0].id}`);

  // The original trip, so the old link to this site still leads to it. The passcode still guards it.
  const seed = await store.get(SEED_TRIP_ID);
  const claimed = !!process.env.TRIP_PASSCODE || (await store.getPass(SEED_TRIP_ID)) !== null;
  const original = seed && !ids.includes(SEED_TRIP_ID) ? { id: SEED_TRIP_ID, name: seed.trip.name, claimed } : null;

  const account = await readAccount();
  return <Home trips={trips} original={original} create={!!create} initialName={firstName(account?.name.split(/\s+/)[0]) ?? ""} />;
}
