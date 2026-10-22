import { redirect } from "next/navigation";
import { connection } from "next/server";
import { joinedTrips } from "@/server/auth";
import { getStore } from "@/server/db";
import { ShareLanding } from "@/features/share/ShareLanding";

export const metadata = { title: "Save to a trip" };

/**
 * Where Android's share sheet sends a link. Apps put the URL in different
 * fields (TikTok and Instagram often in "text"), so all three are read.
 */
export default async function SharePage({ searchParams }: { searchParams: Promise<{ title?: string; text?: string; url?: string }> }) {
  await connection();
  const { title = "", text = "", url = "" } = await searchParams;
  const shared = [url, text, title].join(" ").trim();
  const ids = await joinedTrips();
  if (!ids.length) redirect("/");
  const trips = await getStore().list(ids);
  return <ShareLanding shared={shared} title={title} trips={trips.map((t) => ({ id: t.id, name: t.name }))} />;
}
