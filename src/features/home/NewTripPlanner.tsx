"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PlannerSnapshotSchema, plannerProblems, type PlannerSnapshot } from "@/domain/planner";
import { stripCards } from "@/domain/change";
import { daysBetween, formatDay, formatRange } from "@/domain/time";
import type { Account } from "@/server/auth";
import { Icon, KIND_ICON } from "@/ui/Icon";

function emptySnapshot(): PlannerSnapshot { return { id: crypto.randomUUID(), messages: [], draft: null, suggestions: [] }; }

export function NewTripPlanner({ account, initialName, initialSnapshot }: { account: Account | null; initialName: string; initialSnapshot: PlannerSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(initialSnapshot);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; passcode: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);
  const [cloudSaved, setCloudSaved] = useState(!!initialSnapshot);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const storageKey = `trip:planner:${account?.id || "guest"}`;

  useEffect(() => {
    let cached = initialSnapshot;
    if (!cached) try { const raw = localStorage.getItem(storageKey) || (account ? localStorage.getItem("trip:planner:guest") : null); if (raw) cached = PlannerSnapshotSchema.parse(JSON.parse(raw)); } catch { /* Continue with a new draft. */ }
    // Hydrate browser-only drafts once; cloud drafts are scoped to the signed-in account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshot(cached || emptySnapshot());
    setRestored(true);
  }, [account, initialSnapshot, storageKey]);
  useEffect(() => { if (snapshot && restored && !created) try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); } catch { /* Continue in memory. */ } }, [snapshot, restored, storageKey, created]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [snapshot?.messages.length, busy]);
  useEffect(() => () => controller.current?.abort(), []);

  async function send(value: string) {
    const content = stripCards(value.trim());
    if (!content || inFlight.current || !snapshot || created) return;
    inFlight.current = true;
    const last = snapshot.messages.at(-1);
    const pending: PlannerSnapshot = last?.role === "user" && last.content === content ? snapshot : { ...snapshot, suggestions: [], messages: [...snapshot.messages, { role: "user", content }] };
    setSnapshot(pending); setText(""); setError(null); setBusy(true); setCloudSaved(false);
    const abort = new AbortController(); controller.current = abort;
    try {
      const response = await fetch("/api/planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot: pending, homeTz: Intl.DateTimeFormat().resolvedOptions().timeZone }), signal: abort.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your message could not be sent. Try again.");
      setSnapshot(PlannerSnapshotSchema.parse(body.snapshot)); setCloudSaved(body.savedToAccount);
      if (account) localStorage.removeItem("trip:planner:guest");
    } catch (failure) { setError(abort.signal.aborted ? "Paused. Your conversation is still here." : failure instanceof TypeError ? "You’re offline. Your draft is kept on this device; reconnect to continue." : failure instanceof SyntaxError ? "The planner could not reply. Your message is still here; try again." : failure instanceof Error ? failure.message : "The planner could not reply. Try again."); }
    finally { setBusy(false); inFlight.current = false; controller.current = null; input.current?.focus(); }
  }

  async function startOver() {
    if (inFlight.current) return;
    setError(null);
    try { const response = await fetch("/api/planner", { method: "DELETE" }); if (!response.ok) throw new Error(); setSnapshot(emptySnapshot()); setCreated(null); setCloudSaved(false); setText(""); input.current?.focus(); }
    catch { setError("Connect to the internet before starting a fresh plan."); }
  }

  async function save() {
    if (!snapshot?.draft || saving || busy) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/planner/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot, homeTz: Intl.DateTimeFormat().resolvedOptions().timeZone, homeCurrency: snapshot.draft.homeCurrency || "USD" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your trip could not be saved. Try again.");
      setCreated(body); localStorage.removeItem(storageKey);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Connect to the internet to save your trip."); }
    finally { setSaving(false); }
  }

  const draft = snapshot?.draft;
  const messages = snapshot?.messages || [];
  const problems = plannerProblems(draft || null, initialName);
  const canSave = !!draft && !problems.length;
  const suggestions = snapshot?.suggestions.length ? snapshot.suggestions : messages.length ? [] : ["Help me choose a destination", "A long weekend with friends", "I have an itinerary to paste"];
  const days = draft?.startDate && draft.endDate && !problems.some((problem) => /dates|length/.test(problem)) ? daysBetween(draft.startDate, draft.endDate) + 1 : null;

  return <div className="planner-layout">
    <section aria-label="Plan a new trip" className="planner-conversation">
      <div className="planner-heading"><span className="planner-avatar"><Icon name="sparkles" className="size-5" /></span><div><h2>Your travel planner</h2><p>{busy ? "Working on your trip" : "A place to turn ‘what if’ into a plan"}</p></div>{messages.length > 0 && <button type="button" disabled={busy || saving} onClick={() => void startOver()} className="planner-reset">Start fresh</button>}</div>
      <div ref={transcript} role="log" aria-label="Planning conversation" aria-live="polite" className={`planner-messages ${messages.length ? "has-messages" : ""}`}>
        {!messages.length && <div className="planner-opening"><span className="opening-wave" aria-hidden="true">✳</span><h3>Where are we dreaming of?</h3><p>A place you’ve been thinking about. A few days off. A whole itinerary you’ve already written. Start anywhere.</p></div>}
        {messages.map((message, index) => <div key={index} className={`planning-message ${message.role}`}><span className="message-speaker">{message.role === "assistant" ? "Trip planner" : initialName || "You"}</span><p>{message.content}</p></div>)}
        {busy && <div className="planner-thinking" role="status"><span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>Thinking through your trip…<button type="button" onClick={() => controller.current?.abort()}>Pause</button></div>}
      </div>
      {!created && <div className="planner-input-area">
        {draft && <a href="#trip-preview" className="planner-mobile-preview-link"><Icon name="plan" className="size-4" />View your trip draft<Icon name="chevronDown" className="size-3.5" /></a>}
        {suggestions.length > 0 && !busy && <div className="planner-suggestions">{suggestions.map((suggestion) => <button key={suggestion} type="button" disabled={!restored} onClick={() => { if (suggestion === "I have an itinerary to paste") { setText("Here’s my existing itinerary:\n"); input.current?.focus(); } else void send(suggestion); }}>{suggestion}</button>)}</div>}
        <form className="planner-composer" onSubmit={(event) => { event.preventDefault(); void send(text); }}>
          <label htmlFor="trip-planning-message" className="sr-only">Tell the planner about your trip</label>
          <textarea id="trip-planning-message" ref={input} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(text); } }} maxLength={6000} rows={3} placeholder="A week in Japan next spring. Great food, quieter places, and no rushing…" disabled={busy || saving || !restored} />
          <div className="composer-bottom"><span><Icon name="link" className="size-4" />You can paste your plans here, too.</span><button type="submit" aria-label="Send message" disabled={!text.trim() || busy || saving || !restored}><Icon name="send" className="size-4" /><span>{messages.length ? "Send" : "Let’s plan"}</span></button></div>
        </form>
        <div className="planner-save-status">{account ? <><Icon name={cloudSaved ? "check" : "clock"} className="size-3.5" />{cloudSaved ? "Conversation saved to your account" : "Your conversation saves to your account after each reply"}</> : <><Icon name="suitcase" className="size-3.5" />Your draft stays on this device. <a href="/api/auth/google?returnTo=%2F%3Fnew%3D1">Sign in to take it with you</a></>}</div>
      </div>}
      {error && <div role="alert" className="planner-error"><p>{error}</p>{messages.at(-1)?.role === "user" && <button type="button" disabled={busy} onClick={() => void send(messages.at(-1)!.content)}>Try again</button>}</div>}
    </section>
    <aside id="trip-preview" aria-label="Your trip draft" className={`planner-preview ${draft ? "has-draft" : ""}`}>
      {!draft ? <>
        <div className="preview-photo"><Image src="/flight-sunset-wing.jpg" alt="An airplane wing above the clouds at sunset" fill priority sizes="(max-width: 850px) 100vw, 420px" className="object-cover" /><span className="preview-photo-caption"><Icon name="plane" className="size-4" />Something to look forward to.</span></div>
        <div className="preview-empty"><span className="draft-label"><Icon name="plan" className="size-4" />Your trip, taking shape</span><h2>The details will<br />find their place.</h2><p>As we talk, your destination, dates and day-by-day plan will appear here.</p><div className="preview-placeholders"><span><Icon name="pin" />Somewhere worth going</span><span><Icon name="today" />Dates that work for you</span><span><Icon name="activity" />Days that feel like you</span></div></div>
      </> : <div className="draft-content">
        <div className="draft-status"><span className="status-dot" />{created ? "Saved and ready to go" : "Your trip draft"}<Icon name={created ? "check" : "pencil"} className="size-4" /></div>
        <h2>{draft.name || draft.destination || "Your next adventure"}</h2>
        <p className="draft-destination"><Icon name="pin" className="size-4" />{draft.destination || "Still exploring destinations"}</p>
        <div className="draft-facts"><span><Icon name="today" />{draft.startDate && draft.endDate ? formatRange(draft.startDate, draft.endDate) + `, ${draft.startDate.slice(0, 4)}` : "Dates still open"}</span><span><Icon name="users" />{draft.people.length ? `${new Set([initialName || draft.travelerName, ...draft.people].filter(Boolean)).size} travelers` : "Your people, your pace"}</span>{days && <span><Icon name="sun" />{days} days to make your own</span>}</div>
        {draft.notes && <p className="draft-notes">{draft.notes}</p>}
        {draft.items.length > 0 && <div className="draft-itinerary"><h3>A first look at your days</h3><ol>{draft.items.map((item, index) => <li key={index}><span className="draft-item-icon"><Icon name={KIND_ICON[item.kind]} className="size-4" /></span><div><span className="draft-item-date">{item.start ? formatDay(item.start.date) + (item.start.time ? ` at ${item.start.time}` : "") : "An idea for later"}</span><p>{item.title}</p>{item.placeName && <span className="text-sm text-muted">{item.placeName}</span>}</div></li>)}</ol><p className="itinerary-caveat">Suggestions to make your own. Check details before booking.</p></div>}
        {created ? <div className="created-trip" role="status"><h3>{account ? "Saved to your trips." : "Your trip is ready."}</h3><p>{account ? "You can find it on any device when you sign in." : "This browser will remember your trip."}</p>{created.passcode && <div className="invite-code"><span>Group invite passcode</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(created.passcode!); setCopied(true); } catch { setError("Select and copy the passcode below."); } }}>{created.passcode}<Icon name={copied ? "check" : "copy"} className="size-4" /></button><p>Share this with your trip link when inviting friends.</p></div>}<Link href={`/t/${created.id}/plan`} className="save-trip-button">Open your trip<Icon name="chevronRight" className="size-4" /></Link></div> : <div className="draft-save"><button type="button" className="save-trip-button" disabled={!canSave || busy || saving} onClick={() => void save()}>{saving ? "Saving your trip…" : "Save trip"}<Icon name="check" className="size-4" /></button><p>{canSave ? "Nothing is booked. Keep chatting to change any detail." : problems[0]}</p></div>}
      </div>}
    </aside>
  </div>;
}
