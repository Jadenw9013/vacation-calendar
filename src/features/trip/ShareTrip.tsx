"use client";

import { useEffect, useState } from "react";
import { useTrip } from "@/client/store";
import { formatDay, formatTime } from "@/domain/time";
import { Icon } from "@/ui/Icon";
import { Sheet } from "@/ui/Sheet";
import { btn, field, label } from "@/ui/kit";

/** Share the live workspace or a readable copy for the group chat. */
export function ShareTrip({ onClose }: { onClose: () => void }) {
  const { trip, tripId } = useTrip();
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState("");
  const [viewPath, setViewPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/t/${tripId}/preview`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't load the viewing link.");
      setViewPath(data.path);
    }).catch((reason) => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Couldn't load the viewing link."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [tripId]);
  const invite = `${window.location.origin}/t/${tripId}/join`;
  const items = [...trip.items].sort((a, b) => (a.start ? `${a.start.date} ${a.start.time || ""}` : "z").localeCompare(b.start ? `${b.start.date} ${b.start.time || ""}` : "z"));
  const lines = [trip.name, `${trip.destination} · ${trip.startDate} to ${trip.endDate}`, `Times are local (${trip.tz}).`];
  let day = "";
  for (const item of items) {
    const next = item.start?.date || "Ideas";
    if (next !== day) { lines.push("", next === "Ideas" ? next : `${formatDay(next)}, ${next.slice(0, 4)}`); day = next; }
    lines.push(`• ${item.start?.time ? `${formatTime(item.start.time)}${item.start.tz && item.start.tz !== trip.tz ? ` (${item.start.tz})` : ""} — ` : ""}${item.title}${item.place?.name ? ` · ${item.place.name}` : ""}${item.booking ? ` (${item.booking.state === "booked" ? "booked" : "to book"})` : ""}`);
    if (item.end) lines.push(`  Until ${item.end.date}${item.end.time ? ` ${formatTime(item.end.time)}` : ""}${item.end.tz ? ` (${item.end.tz})` : ""}`);
  }
  if (!items.length) lines.push("", "We’re still putting the itinerary together.");
  lines.push("", `Plan with us on Voyroo: ${invite}`, "Ask me for the trip passcode.");
  const itinerary = lines.join("\n");
  const invitation = `Join our ${trip.name} trip on Voyroo:\n${invite}\nAsk me for the trip passcode.`;

  async function copy(text: string, message: string) {
    setStatus(""); setManual("");
    try { await navigator.clipboard.writeText(text); setStatus(message); }
    catch { setManual(text); setStatus("Select and copy the text below."); }
  }
  async function share() {
    setStatus(""); setManual("");
    if (!navigator.share) { await copy(invitation, "Invite copied. Paste it into your group chat."); return; }
    try { await navigator.share({ title: trip.name, text: invitation }); setStatus("Invite shared."); }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) await copy(invitation, "Invite copied. Paste it into your group chat."); }
  }
  async function updatePreview(method: "POST" | "DELETE") {
    setBusy(true); setError(""); setStatus(""); setManual("");
    try {
      const response = await fetch(`/api/t/${tripId}/preview`, { method });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't update the viewing link.");
      setViewPath(data.path);
      if (method === "POST") await copy(`${window.location.origin}${data.path}`, "Viewing link copied. Anyone with it can open the itinerary.");
      else setStatus("Viewing link disabled. The old link no longer opens the trip.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't update the viewing link."); }
    finally { setBusy(false); }
  }

  return <Sheet open onClose={onClose} title="Share trip">
    <p className="mb-4 text-muted">Bring your travel group into {trip.name}, or send them a copy of the plan.</p>
    <section className="mb-4 rounded-2xl border border-line bg-accent-soft p-4">
      <h3 className="font-bold">Just let them view</h3><p className="my-2 text-sm text-muted">A presentation of your itinerary. Anyone with this link can open it immediately, with no sign-up or passcode. They can’t edit. Private notes and reservation confirmations stay out of this view.</p>
      {viewPath && <label className={label}>Viewing link<input readOnly value={`${window.location.origin}${viewPath}`} onFocus={(event) => event.currentTarget.select()} className={`${field} mt-1`} /></label>}
      <div className="mt-3 flex flex-wrap gap-2">{viewPath ? <><button type="button" disabled={busy} className={btn.primary} onClick={() => void copy(`${window.location.origin}${viewPath}`, "Viewing link copied. Ready to share.")}><Icon name="copy" />Copy viewing link</button><a href={viewPath} target="_blank" rel="noreferrer" className={btn.secondary}>Open preview<Icon name="external" /></a><button type="button" disabled={busy} className={btn.quiet} onClick={() => void updatePreview("DELETE")}>{busy ? "Turning off…" : "Turn off viewing link"}</button></> : <button type="button" disabled={loading || busy} className={btn.primary} onClick={() => void updatePreview("POST")}><Icon name="share" />{loading ? "Loading…" : busy ? "Creating link…" : "Create viewing link"}</button>}</div>
      {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    </section>
    <section className="rounded-2xl border border-line p-4">
      <h3 className="font-bold">Plan together</h3>
      <p className="my-2 text-sm text-muted">Everyone joins the same trip and sees the latest changes. Send your trip passcode separately. Once they join with Google, the trip stays in their account.</p>
      <label className={label}>Trip invite link<input className={`${field} mt-1`} readOnly value={invite} onFocus={(event) => event.currentTarget.select()} /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={btn.primary} onClick={() => void share()}><Icon name="share" />Share invite</button><button type="button" className={btn.secondary} onClick={() => void copy(invitation, "Invite copied. Paste it into your group chat.")}><Icon name="copy" />Copy invite</button></div>
    </section>
    <section className="mt-4 rounded-2xl border border-line p-4">
      <h3 className="font-bold">Send the itinerary</h3><p className="my-2 text-sm text-muted">Copy the current plan with dates, times, places and booking status into a message or email.</p>
      <button type="button" className={btn.secondary} onClick={() => void copy(itinerary, "Itinerary copied. Ready to send to your travel group.")}><Icon name="plan" />Copy itinerary</button>
    </section>
    {status && <p role="status" className="mt-4 text-sm font-semibold text-accent">{status}</p>}
    {manual && <textarea aria-label="Text to copy" className={`${field} mt-3 min-h-40`} readOnly value={manual} onFocus={(event) => event.currentTarget.select()} />}
  </Sheet>;
}
