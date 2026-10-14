import { connection } from "next/server";
import { TripShell } from "@/components/TripShell";
import { chatAvailability } from "@/lib/llm/provider";
import { getRepository, isMemoryStore } from "@/lib/repo";

/** The stored trip, its recent history, and when it was read (shown as "updated 2:14 PM" offline). */
async function readTrip() {
  const repo = getRepository();
  const [{ trip, version }, history] = await Promise.all([repo.get(), repo.history(50)]);
  return { trip, version, history, readAt: Date.now() };
}

export default async function Home() {
  await connection(); // always render with the latest stored trip
  const { trip, version, history, readAt } = await readTrip();

  const devNotes = [
    isMemoryStore() && "Local store: edits live in memory and reset when the server restarts.",
  ].filter((n): n is string => !!n);

  // Names people have already used, offered as one-tap choices in the picker.
  const knownNames = [...new Set([...history.map((e) => e.author), ...trip.segments.flatMap((s) => (s.owner ? [s.owner] : []))])]
    .filter((n) => n !== "assistant")
    .slice(0, 8);

  const chat = chatAvailability();

  return (
    <TripShell
      trip={trip}
      version={version}
      serverNow={readAt}
      devNotes={devNotes}
      chatAvailable={chat.available}
      chatVision={chat.vision}
      debugTiming={process.env.DEBUG_TIMING === "1"}
      knownNames={knownNames}
      updates={history}
    />
  );
}
