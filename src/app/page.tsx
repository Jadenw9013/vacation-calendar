import { connection } from "next/server";
import { Countdown } from "@/components/Countdown";
import { GapList } from "@/components/GapList";
import { NightStrip } from "@/components/NightStrip";
import { StillToBook } from "@/components/StillToBook";
import { Timeline } from "@/components/Timeline";
import { EditBar } from "@/components/edit/EditBar";
import { EditorProvider } from "@/components/edit/EditorProvider";
import { authMode } from "@/lib/auth";
import { computeGaps, nightCoverage, stillToBook, timeline, unanswered } from "@/lib/derive";
import { getRepository, isMemoryStore } from "@/lib/repo";
import { monthDay } from "@/lib/time";

export default async function Home() {
  await connection(); // always render with the latest stored trip
  const { trip, version } = await getRepository().get();

  const devNotes = [
    isMemoryStore() && "Local store: edits live in memory and reset when the server restarts.",
    authMode() === "open-dev" && "No TRIP_PASSPHRASE set, so the site is open. Fine locally; production refuses to run like this.",
  ].filter((n): n is string => !!n);

  const nights = nightCoverage(trip);
  const gaps = computeGaps(trip);
  const toBook = stillToBook(trip);
  const unbookedNights = nights.filter((n) => !n.booked).length;

  return (
    <EditorProvider version={version} tripOffset={trip.utcOffset}>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-24">
        <header className="mb-6">
          <h1 className="wide text-5xl leading-none">{trip.name}</h1>
          <p className="mt-2 font-mono text-lg">
            {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}, {trip.firstDay.slice(0, 4)}
          </p>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Countdown firstDay={trip.firstDay} lastDay={trip.lastDay} />
            <span className={unbookedNights ? "hazard-label px-1 font-bold" : "font-semibold text-lake"}>
              {unbookedNights === 0
                ? "Every night booked"
                : `${unbookedNights} of ${nights.length} nights with no bed`}
            </span>
            <span className="text-pumice">
              Party size: {trip.partySize ?? "not confirmed"}
            </span>
          </p>
        </header>
  
        <EditBar devNotes={devNotes} />
  
        <NightStrip nights={nights} />
  
        <section aria-labelledby="gaps" className="mt-10">
          <h2 id="gaps" className="wide mb-4 text-3xl">
            Gaps <span className="font-mono text-xl font-normal text-pumice">{gaps.length}</span>
          </h2>
          <GapList gaps={gaps} segments={trip.segments} />
        </section>
  
        <section aria-labelledby="timeline" className="mt-14">
          <h2 id="timeline" className="wide mb-4 text-3xl">
            Day by day
          </h2>
          <Timeline days={timeline(trip)} tripOffset={trip.utcOffset} questions={unanswered(trip)} />
        </section>
  
        <section aria-labelledby="to-book" className="mt-14">
          <h2 id="to-book" className="wide mb-4 text-3xl">
            Still to book <span className="font-mono text-xl font-normal text-pumice">{toBook.length}</span>
          </h2>
          <StillToBook rows={toBook} trip={trip} />
        </section>
      </main>
    </EditorProvider>
  );
}
