"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { Trip } from "@/data/types";
import { previewTrip } from "@/lib/chat/proposal";
import { computeGaps, nightCoverage, stillToBook, timeline, unanswered } from "@/lib/derive";
import { monthDay } from "@/lib/time";
import { dayInfo } from "@/lib/places";
import { ChatPanel } from "./chat/ChatPanel";
import { ChatProvider, useTripChat } from "./chat/ChatProvider";
import { Countdown } from "./Countdown";
import { EditBar } from "./edit/EditBar";
import { EditorProvider, useEditor } from "./edit/EditorProvider";
import { WhoPicker } from "./edit/WhoPicker";
import { ElevationProfile } from "./ElevationProfile";
import { GapSummary } from "./GapBanner";
import { NightStrip } from "./NightStrip";
import { StillToBook } from "./StillToBook";
import { Timeline, type Ghost } from "./Timeline";

interface Props {
  trip: Trip;
  version: number;
  devNotes: string[];
  chatAvailable: boolean;
  /** The active model reads images; hides screenshot upload when false. */
  chatVision: boolean;
  knownNames: string[];
}

export function TripShell(props: Props) {
  return (
    <EditorProvider version={props.version} tripOffset={props.trip.utcOffset}>
      <ChatProvider available={props.chatAvailable} vision={props.chatVision}>
        <TripPage {...props} />
      </ChatProvider>
    </EditorProvider>
  );
}

function usePreview(trip: Trip, version: number) {
  const { pending } = useTripChat();
  return useMemo(() => {
    const preview = pending ? previewTrip({ trip, version }, pending.proposal.ops) : null;
    if (!preview) return { days: timeline(trip), ghosts: {} as Record<string, Ghost>, previewing: false };

    // Segments and plan items share one ghost map; plan ids all start with "plan-".
    const ghosts: Record<string, Ghost> = {};
    function diff<T extends { id: string }>(before: T[], after: T[]): T[] {
      const current = new Map(before.map((x) => [x.id, x]));
      const next = new Set(after.map((x) => x.id));
      for (const x of after) {
        const old = current.get(x.id);
        if (!old) ghosts[x.id] = "added";
        else if (JSON.stringify(old) !== JSON.stringify(x)) ghosts[x.id] = "changed";
      }
      const removed = before.filter((x) => !next.has(x.id));
      for (const x of removed) ghosts[x.id] = "removed";
      return removed;
    }
    const removedSegments = diff(trip.segments, preview.segments);
    const removedPlan = diff(trip.plan ?? [], preview.plan ?? []);

    const nights = nightCoverage(preview);
    const days = timeline({
      ...preview,
      segments: [...preview.segments, ...removedSegments],
      plan: [...(preview.plan ?? []), ...removedPlan],
    }).map((d, i) => ({ ...d, night: nights[i] ?? null }));
    return { days, ghosts, previewing: true };
  }, [pending, trip, version]);
}

function TripPage({ trip, version, devNotes, knownNames }: Props) {
  const { open, setOpen, highlight } = useTripChat();
  const { openPicker } = useEditor();
  const { days, ghosts, previewing } = usePreview(trip, version);
  const [navTab, setNavTab] = useState<"trip" | "to-book">("trip");

  const nights = nightCoverage(trip);
  const gaps = computeGaps(trip);
  const info = dayInfo(trip);
  const toBook = stillToBook(trip);
  const unbookedNights = nights.filter((n) => !n.booked).length;

  return (
    <div className="min-h-screen flex flex-col bg-stone-light text-volcano font-sans selection:bg-lake/20">
      {/* Mobile Top Header (360–390px) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-night px-4 py-3.5 text-white shadow-md">
        <div>
          <h1 className="font-serif text-xl font-bold tracking-tight">Guatemala</h1>
          <p className="text-xs text-gray-400 font-sans">
            {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}, {trip.firstDay.slice(0, 4)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(!open)}
            aria-label="Trip Assistant"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/20 transition-colors"
          >
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI</span>
          </button>
          <svg className="size-6 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19L9 7L13 14L16 9L21 19H3Z" />
          </svg>
        </div>
      </header>

      {/* Main Body: Desktop 3-column layout */}
      <div className="flex flex-1 w-full max-w-[1536px] mx-auto items-stretch">
        {/* Desktop Left Sidebar (Night Sky #0B1E2D) */}
        <aside
          aria-label="Sidebar navigation"
          className="hidden md:flex w-60 lg:w-64 shrink-0 flex-col justify-between bg-night p-5 text-white sticky top-0 h-screen overflow-y-auto"
        >
          <div className="flex flex-col gap-6">
            {/* Mountain Logo + Brand */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-white">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 19L9 7L13 14L16 9L21 19H3Z" />
                </svg>
              </div>
              <div>
                <h1 className="font-serif text-2xl font-bold tracking-tight text-white leading-tight">
                  Guatemala
                </h1>
                <p className="text-xs text-gray-400 font-sans">
                  {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}, {trip.firstDay.slice(0, 4)}
                </p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="flex flex-col gap-1.5 text-sm" aria-label="Main menu">
              <button
                type="button"
                onClick={() => setNavTab("trip")}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-medium transition-colors text-left ${
                  navTab === "trip"
                    ? "bg-lake/20 border border-lake/40 text-white font-semibold"
                    : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <svg className={`size-4.5 ${navTab === "trip" ? "text-lake" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.553-1.894L9 2m0 18l6-3m-6 3V2m6 15l5.447 2.724A2 2 0 0021 17.818V8.055a2 2 0 00-1.553-1.894L15 4m0 13V4m0 0L9 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Trip</span>
              </button>

              <button
                type="button"
                onClick={() => setNavTab("to-book")}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 font-medium transition-colors text-left ${
                  navTab === "to-book"
                    ? "bg-lake/20 border border-lake/40 text-white font-semibold"
                    : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className={`size-4.5 ${navTab === "to-book" ? "text-lake" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Still to book</span>
                </div>
                {toBook.length > 0 && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-maya text-[11px] font-bold text-white">
                    {toBook.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 font-medium transition-colors text-left ${
                  open
                    ? "bg-lake/20 border border-lake/40 text-white font-semibold"
                    : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className={`size-4.5 ${open ? "text-lake" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Chat</span>
                </div>
                <span className="size-2 rounded-full bg-emerald-400" />
              </button>

              <button
                type="button"
                onClick={openPicker}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left"
              >
                <svg className="size-4.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Settings</span>
              </button>
            </nav>
          </div>

          {/* Bottom Volcano Graphic from Design Mockup */}
          <div className="relative mt-8 h-48 w-full overflow-hidden rounded-2xl border border-white/10 shadow-lg">
            <Image
              src="/volcano-sidebar-night.jpg"
              alt="Volcan de Fuego erupting at twilight in Guatemala"
              fill
              className="object-cover"
              sizes="240px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-night/95 via-night/30 to-transparent" />
            <div className="absolute inset-x-3 bottom-3 text-center">
              <p className="font-serif italic text-sm text-stone-100 drop-shadow-md">
                Same Friends.
              </p>
              <p className="font-serif italic text-sm text-stone-100 drop-shadow-md">
                Higher Places.
              </p>
            </div>
          </div>
        </aside>

        {/* Center Main Content Area */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 max-w-4xl mx-auto w-full">
          {/* Panoramic Hero Banner with Lake Atitlán */}
          <div className="relative h-44 sm:h-52 w-full overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm mb-6 bg-gray-100">
            <Image
              src="/lake-atitlan-hero.jpg"
              alt="Lake Atitlan panoramic view with three volcanic peaks in Guatemala"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 800px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/30" />
            <div className="absolute top-4 right-4 sm:top-5 sm:right-6 max-w-xs text-right">
              <p className="font-serif italic text-base sm:text-lg text-white font-medium drop-shadow-md leading-snug">
                Seven nights. Three volcanoes. A lot to look forward to.
              </p>
            </div>
          </div>

          {/* Edit Toolbar & notices */}
          <EditBar devNotes={devNotes} />

          {/* View Tab Content: Trip vs Still to book */}
          {navTab === "trip" ? (
            <>
              {/* Night Strip & trip countdown summary */}
              <div className="mb-8">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2 px-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <Countdown firstDay={trip.firstDay} lastDay={trip.lastDay} />
                    <span className="text-xs text-gray-500">
                      {unbookedNights === 0 ? "All nights booked" : `${unbookedNights} of ${nights.length} nights without a bed`}
                      {" · "}Party of {trip.partySize ?? "?"}
                    </span>
                  </div>
                  <GapSummary gaps={gaps} segments={trip.segments} />
                </div>
                <NightStrip nights={nights} />
              </div>

              {previewing && (
                <div className="mb-6 rounded-xl border-2 border-dashed border-lake bg-lake/5 p-3 text-xs text-lake font-medium">
                  Previewing a proposed trip change: dashed items are proposed, struck-through items would be removed. Nothing has been saved yet.
                </div>
              )}

              {/* Day by Day Timeline + Elevation Profile */}
              <section aria-labelledby="timeline-heading" className="mt-8">
                <div className="flex items-start gap-4">
                  {/* Elevation axis spline on Desktop */}
                  <div className="hidden lg:block shrink-0 sticky top-6">
                    <ElevationProfile days={info} />
                  </div>

                  {/* Day by Day Cards */}
                  <div className="flex-1 min-w-0">
                    <Timeline
                      days={days}
                      tripOffset={trip.utcOffset}
                      questions={unanswered(trip)}
                      ghosts={ghosts}
                      highlight={highlight}
                      info={info}
                    />
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section aria-labelledby="to-book-heading" className="mt-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="to-book-heading" className="font-serif text-2xl font-bold text-volcano">
                  Still to book
                </h2>
                <span className="font-mono text-sm text-gray-500">{toBook.length} pending</span>
              </div>
              <StillToBook rows={toBook} trip={trip} />
            </section>
          )}
        </main>

        {/* Right Column: Desktop Trip Assistant (when open) */}
        {open && (
          <aside className="hidden xl:block w-84 xl:w-96 shrink-0 sticky top-6 h-[calc(100vh-3rem)] py-6 pr-6">
            <ChatPanel trip={trip} />
          </aside>
        )}
      </div>

      {/* Floating / slide-over chat for screens where right column is hidden or toggled */}
      <div className="xl:hidden">
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-night/50 backdrop-blur-xs p-0 sm:p-6">
            <div className="w-full sm:max-w-lg h-[85vh] sm:h-[680px]">
              <ChatPanel trip={trip} />
            </div>
          </div>
        )}
      </div>

      {/* Full-width dark footer bar from design spec */}
      <footer className="w-full bg-night py-4 px-6 mt-16 text-white text-xs font-mono tracking-widest uppercase flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-night-border">
        <div className="flex items-center gap-2">
          <span>GUATEMALA</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-300 uppercase">
            {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}, {trip.firstDay.slice(0, 4)}
          </span>
        </div>
        <div className="flex items-center gap-2.5 text-gray-300">
          <span>SAME FRIENDS. HIGHER PLACES.</span>
          <svg className="size-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 19L9 7L13 14L16 9L21 19H3Z" />
          </svg>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Navigation Bar (360–390px) */}
      <nav aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-border py-2 px-6 flex items-center justify-between shadow-lg">
        <button
          onClick={() => setNavTab("trip")}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            navTab === "trip" ? "text-lake font-bold" : "text-gray-500"
          }`}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.553-1.894L9 2m0 18l6-3m-6 3V2m6 15l5.447 2.724A2 2 0 0021 17.818V8.055a2 2 0 00-1.553-1.894L15 4m0 13V4m0 0L9 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Trip</span>
        </button>

        <button
          onClick={() => setNavTab("to-book")}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors relative ${
            navTab === "to-book" ? "text-lake font-bold" : "text-gray-500"
          }`}
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Still to book</span>
          {toBook.length > 0 && (
            <span className="absolute -top-1 -right-2 flex size-4 items-center justify-center rounded-full bg-maya text-[9px] font-bold text-white">
              {toBook.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setOpen(!open)}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${
            open ? "text-lake font-bold" : "text-gray-500"
          }`}
        >
          <div className="relative">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-emerald-500" />
          </div>
          <span>Chat</span>
        </button>

        <button
          onClick={openPicker}
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 transition-colors"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
          <span>More</span>
        </button>
      </nav>

      {/* Dialog for who is editing */}
      <WhoPicker knownNames={knownNames} />
    </div>
  );
}
