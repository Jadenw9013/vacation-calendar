import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { previewTrip } from "@/server/preview";
import { dayRange, formatDay, formatTime } from "@/domain/time";
import type { Item } from "@/domain/types";
import { Icon, KIND_ICON } from "@/ui/Icon";
import { PrintTrip } from "@/features/trip/PrintTrip";

export const metadata: Metadata = { title: "Trip itinerary", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function PreviewPage({ params }: { params: Promise<{ tripId: string; token: string }> }) {
  await connection();
  const { tripId, token } = await params;
  const state = await previewTrip(tripId, token);
  if (!state) notFound();
  const { trip } = state;
  const days = [...new Set([...dayRange(trip.startDate, trip.endDate), ...trip.items.flatMap((item) => item.start ? [item.start.date] : [])])].sort();
  const ideas = trip.items.filter((item) => !item.start);
  return <div className="trip-presentation">
    <header className="presentation-toolbar"><span className="wordmark"><span className="brand-mark"><Icon name="plane" /></span>Trip</span><div className="flex flex-wrap items-center justify-end gap-3"><span className="text-sm text-muted">View-only itinerary</span><PrintTrip /></div></header>
    <main id="main" className="presentation-main">
      <div className="presentation-hero"><div><p className="presentation-destination"><Icon name="pin" />{trip.destination}</p><h1>{trip.name}</h1><p className="presentation-dates">{formatDay(trip.startDate)}, {trip.startDate.slice(0, 4)} — {formatDay(trip.endDate)}, {trip.endDate.slice(0, 4)}</p><p className="mt-4 text-sm text-muted">The group’s current plan. Times are local to {trip.tz} unless shown otherwise.</p></div><div className="presentation-cover" style={{ backgroundImage: `url(${JSON.stringify(trip.cover || "/flight-sunset-wing.jpg")})` }} /></div>
      <nav aria-label="Itinerary days" className="presentation-days">{days.map((day) => <a key={day} href={`#day-${day}`}>{formatDay(day)}</a>)}{ideas.length > 0 && <a href="#ideas">Ideas</a>}</nav>
      {days.map((day) => {
        const items = trip.items.filter((item) => item.start?.date === day).sort((a, b) => (a.start?.time || "").localeCompare(b.start?.time || ""));
        const stays = trip.items.filter((item) => item.kind === "stay" && item.start && item.start.date < day && item.end && item.end.date > day);
        return <section id={`day-${day}`} key={day} className="presentation-day"><header><p>{day.slice(0, 4)}</p><h2>{formatDay(day)}</h2></header><div className="presentation-events">{stays.map((stay) => <p key={stay.id} className="presentation-stay"><Icon name="bed" className="size-4" />Staying at {stay.title}</p>)}{items.length ? items.map((item) => <PreviewItem key={item.id} item={item} tz={trip.tz} />) : <p className="py-5 text-muted">Room to explore. No activities planned yet.</p>}</div></section>;
      })}
      {ideas.length > 0 && <section id="ideas" className="presentation-day"><header><h2>Ideas</h2></header><div className="presentation-events">{ideas.map((item) => <PreviewItem key={item.id} item={item} tz={trip.tz} />)}</div></section>}
      <footer className="presentation-footer">Shared for viewing. Plans may change as the group makes updates.</footer>
    </main>
  </div>;
}

function PreviewItem({ item, tz }: { item: Item; tz: string }) {
  return <article className="presentation-event"><div className="presentation-time">{item.start?.time ? formatTime(item.start.time) : "Any time"}{item.start?.tz && item.start.tz !== tz && <small>{item.start.tz}</small>}</div><div className="min-w-0 flex-1"><div className="flex items-start gap-3"><Icon name={KIND_ICON[item.kind]} className="mt-1 size-5 text-accent" /><h3>{item.title}</h3></div>{item.place && <p className="mt-2 text-muted">{[item.place.name, item.place.address].filter(Boolean).join(", ")}</p>}{item.end && <p className="mt-2 text-sm text-muted">{item.kind === "stay" ? "Check-out" : "Until"}: {formatDay(item.end.date)}{item.end.time ? ` at ${formatTime(item.end.time)}` : ""}{item.end.tz ? ` (${item.end.tz})` : ""}</p>}{item.booking && <p className="mt-2 text-sm font-semibold text-accent">{item.booking.state === "booked" ? "Booked" : "Still to book"}</p>}{item.maybe && <p className="mt-2 text-sm text-muted">Tentative</p>}</div></article>;
}
