"use client";

import { useMemo } from "react";
import type { Trip } from "@/data/types";
import { previewTrip } from "@/lib/chat/proposal";
import { computeGaps, nightCoverage, stillToBook, timeline, unanswered } from "@/lib/derive";
import { monthDay } from "@/lib/time";
import { ChatPanel } from "./chat/ChatPanel";
import { ChatProvider, useTripChat } from "./chat/ChatProvider";
import { Countdown } from "./Countdown";
import { EditBar } from "./edit/EditBar";
import { EditorProvider } from "./edit/EditorProvider";
import { WhoPicker } from "./edit/WhoPicker";
import { GapList } from "./GapList";
import { NightStrip } from "./NightStrip";
import { StillToBook } from "./StillToBook";
import { Timeline, type Ghost } from "./Timeline";

interface Props {
  trip: Trip;
  version: number;
  devNotes: string[];
  chatAvailable: boolean;
  knownNames: string[];
}

export function TripShell(props: Props) {
  return (
    <EditorProvider version={props.version} tripOffset={props.trip.utcOffset}>
      <ChatProvider available={props.chatAvailable}>
        <TripPage {...props} />
      </ChatProvider>
    </EditorProvider>
  );
}

/**
 * While a proposal is pending, the timeline shows the trip as it would be,
 * plus the items it would remove (struck through). Everything else (night
 * strip, gaps, counts) keeps showing the real trip.
 */
function usePreview(trip: Trip, version: number) {
  const { pending } = useTripChat();
  return useMemo(() => {
    const preview = pending ? previewTrip({ trip, version }, pending.proposal.ops) : null;
    if (!preview) return { days: timeline(trip), ghosts: {} as Record<string, Ghost>, previewing: false };

    const current = new Map(trip.segments.map((s) => [s.id, s]));
    const next = new Set(preview.segments.map((s) => s.id));
    const ghosts: Record<string, Ghost> = {};
    for (const s of preview.segments) {
      const before = current.get(s.id);
      if (!before) ghosts[s.id] = "added";
      else if (JSON.stringify(before) !== JSON.stringify(s)) ghosts[s.id] = "changed";
    }
    const removed = trip.segments.filter((s) => !next.has(s.id));
    for (const s of removed) ghosts[s.id] = "removed";

    const nights = nightCoverage(preview);
    const days = timeline({ ...preview, segments: [...preview.segments, ...removed] }).map((d, i) => ({ ...d, night: nights[i] }));
    return { days, ghosts, previewing: true };
  }, [pending, trip, version]);
}

function TripPage({ trip, version, devNotes, knownNames }: Props) {
  const { open, highlight } = useTripChat();
  const { days, ghosts, previewing } = usePreview(trip, version);

  const nights = nightCoverage(trip);
  const gaps = computeGaps(trip);
  const toBook = stillToBook(trip);
  const unbookedNights = nights.filter((n) => !n.booked).length;

  return (
    <div className={open ? "md:pr-[26rem]" : ""}>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-28">
        <header className="mb-6">
          <h1 className="wide text-5xl leading-none">{trip.name}</h1>
          <p className="mt-2 font-mono text-lg">
            {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}, {trip.firstDay.slice(0, 4)}
          </p>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <Countdown firstDay={trip.firstDay} lastDay={trip.lastDay} />
            <span className={unbookedNights ? "hazard-label px-1 font-bold" : "font-semibold text-lake"}>
              {unbookedNights === 0 ? "Every night booked" : `${unbookedNights} of ${nights.length} nights with no bed`}
            </span>
            <span className="text-pumice">Party size: {trip.partySize ?? "not confirmed"}</span>
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
          {previewing && (
            <p className="mb-4 border-2 border-dashed border-lake p-2 text-sm">
              Previewing a proposal from the planner: dashed items are proposed, struck-through items would be removed. Nothing
              has changed yet.
            </p>
          )}
          <Timeline
            days={days}
            tripOffset={trip.utcOffset}
            questions={unanswered(trip)}
            ghosts={ghosts}
            highlight={highlight}
          />
        </section>

        <section aria-labelledby="to-book" className="mt-14">
          <h2 id="to-book" className="wide mb-4 text-3xl">
            Still to book <span className="font-mono text-xl font-normal text-pumice">{toBook.length}</span>
          </h2>
          <StillToBook rows={toBook} trip={trip} />
        </section>
      </main>
      <ChatPanel trip={trip} />
      <WhoPicker knownNames={knownNames} />
    </div>
  );
}
