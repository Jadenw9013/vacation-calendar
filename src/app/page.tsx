import { connection } from "next/server";
import { TripShell } from "@/components/TripShell";
import { authMode } from "@/lib/auth";
import { chatAvailability } from "@/lib/llm/provider";
import { getRepository, isMemoryStore } from "@/lib/repo";

export default async function Home() {
  await connection(); // always render with the latest stored trip
  const repo = getRepository();
  const [{ trip, version }, history] = await Promise.all([repo.get(), repo.history(50)]);

  const devNotes = [
    isMemoryStore() && "Local store: edits live in memory and reset when the server restarts.",
    authMode() === "open-dev" && "No TRIP_PASSPHRASE set, so the site is open. Fine locally; production refuses to run like this.",
  ].filter((n): n is string => !!n);

  // Names people have already used, offered as one-tap choices in the picker.
  const knownNames = [...new Set([...history.map((e) => e.author), ...trip.segments.flatMap((s) => (s.owner ? [s.owner] : []))])]
    .filter((n) => n !== "assistant")
    .slice(0, 8);

  return (
    <TripShell
      trip={trip}
      version={version}
      devNotes={devNotes}
      chatAvailable={chatAvailability().available}
      knownNames={knownNames}
    />
  );
}
