"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { formatRange } from "@/domain/time";
import type { PlannerSnapshot } from "@/domain/planner";
import type { Account } from "@/server/auth";
import { Icon } from "@/ui/Icon";
import { AccountPanel } from "../account/AccountPanel";
import { NewTripPlanner } from "./NewTripPlanner";

interface Summary { id: string; name: string; startDate: string; endDate: string; cover?: string }

export function Home({ trips, original, create = false, initialName = "", account = null, initialSnapshot = null }: {
  trips: Summary[]; original: { id: string; name: string; claimed: boolean } | null;
  create?: boolean; initialName?: string; account?: Account | null; initialSnapshot?: PlannerSnapshot | null;
}) {
  const composer = useRef<HTMLDivElement>(null);
  return <div className="home-workspace">
    <header className="workspace-header">
      <Link href="/?all=1" className="wordmark" aria-label="Trip home"><span className="brand-mark"><Icon name="plane" className="size-5" /></span>Trip<span className="wordmark-note">A little further.</span></Link>
      <nav aria-label="Workspace" className="flex items-center gap-2 sm:gap-6">
        <a href="#your-trips" className="workspace-nav hidden sm:flex">Your trips</a>
        <button type="button" className="workspace-nav" onClick={() => { composer.current?.scrollIntoView({ behavior: "smooth", block: "start" }); composer.current?.querySelector("textarea")?.focus(); }}>New trip</button>
        <AccountPanel initialAccount={account} />
      </nav>
    </header>
    <main className="workspace-main">
      <div ref={composer} className="scroll-mt-8">
        <div className="workspace-intro"><p className="welcome-line">{account ? `Your travel space, ${initialName || account.name}.` : "Less logistics. More looking forward."}</p><h1>{create ? "Let's make a trip happen." : "Good trips start with a conversation."}</h1><p>Tell us what you have in mind. We’ll work out the details together.</p></div>
        <NewTripPlanner account={account} initialName={initialName} initialSnapshot={initialSnapshot} />
      </div>
      <section id="your-trips" aria-labelledby="your-trips-title" className="your-trips-section">
        <div className="flex items-end justify-between gap-3"><div><h2 id="your-trips-title">Your trips</h2><p className="text-muted">{account ? "Your plans, together in one place. Pick up where you left off." : "Trips you’ve joined on this browser."}</p></div><span className="trip-count">{trips.length} {trips.length === 1 ? "trip" : "trips"}</span></div>
        {trips.length ? <ul className="trip-library">{trips.map((trip, index) => <li key={trip.id}><Link href={`/t/${trip.id}/plan`} className="library-trip"><div className="library-trip-image"><Image src={trip.cover || (index % 2 ? "/lake-atitlan-hero.jpg" : "/flight-sunset-wing.jpg")} alt="" fill sizes="(max-width: 640px) 100vw, 350px" unoptimized={!!trip.cover?.startsWith("http")} className="object-cover" /><span className="library-open"><Icon name="chevronRight" /></span></div><div className="library-trip-copy"><h3>{trip.name}</h3><p><Icon name="today" className="size-4" />{formatRange(trip.startDate, trip.endDate)}, {trip.startDate.slice(0, 4)}</p></div></Link></li>)}</ul> : <div className="library-empty"><Icon name="suitcase" className="size-6" /><p>Your next trip belongs here.<span>Start a conversation above and save the plan when it feels right.</span></p></div>}
        {original && <Link href={`/t/${original.id}/join`} className="existing-invite"><Icon name="users" className="size-4" /><span>Joining the {original.name} trip?</span><span className="font-semibold">Open invitation</span><Icon name="chevronRight" className="size-4" /></Link>}
      </section>
      <footer className="workspace-footer"><span>Made for the journey.</span><span>Plan together. Keep everything close.</span></footer>
    </main>
  </div>;
}
