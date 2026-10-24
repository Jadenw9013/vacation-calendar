import { connection } from "next/server";
import { Home } from "@/features/home/Home";
import { joinedTrips, readAccount } from "@/server/auth";
import { firstName } from "@/server/http";
import { getStore } from "@/server/db";
import { SEED_TRIP_ID } from "@/server/seed";
import { PlannerSnapshotSchema } from "@/domain/planner";

/** A personal planning workspace, including the account's active conversation. */
export default async function Page({ searchParams }: { searchParams: Promise<{ all?: string; new?: string }> }) {
  await connection();
  const { new: create } = await searchParams;
  const store = getStore();
  const ids = await joinedTrips();
  const trips = ids.length ? await store.list(ids) : [];

  // The original trip, so the old link to this site still leads to it. The passcode still guards it.
  const seed = await store.get(SEED_TRIP_ID);
  const claimed = !!process.env.TRIP_PASSCODE || (await store.getPass(SEED_TRIP_ID)) !== null;
  const original = seed && !ids.includes(SEED_TRIP_ID) ? { id: SEED_TRIP_ID, name: seed.trip.name, claimed } : null;

  const account = await readAccount();
  const raw = account ? await store.getPlanner(account.id) : null;
  let snapshot = null;
  try { snapshot = raw ? PlannerSnapshotSchema.parse(JSON.parse(raw)) : null; } catch { /* A new draft is available. */ }
  return <Home trips={trips} original={original} create={!!create} account={account} initialSnapshot={snapshot} initialName={firstName(account?.name.split(/\s+/)[0]) ?? ""} />;
}
