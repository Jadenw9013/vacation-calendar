"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Trip } from "@/data/types";
import { previewTrip } from "@/lib/chat/proposal";
import { nightCoverage, stillToBook, timeline } from "@/lib/derive";
import type { ChangeEntry } from "@/lib/engine";
import { defaultMode, initialDay, type Mode } from "@/lib/now";
import { parseSnapshot, readSnapshotRaw, saveSnapshot, subscribeSnapshot } from "@/lib/snapshot";
import { monthDay } from "@/lib/time";
import { opsTouched } from "@/lib/updates";
import { ChatPanel } from "./chat/ChatPanel";
import { ChatSheet } from "./chat/ChatSheet";
import { ChatProvider, useTripChat } from "./chat/ChatProvider";
import { EditorProvider, useEditor } from "./edit/EditorProvider";
import { SegmentDialog } from "./edit/SegmentDialog";
import { WhoPicker } from "./edit/WhoPicker";
import type { ManualPrefill } from "./quickadd/QuickAdd";
import { PlanView } from "./plan/PlanView";
import { useClock, useOnline } from "./shell/hooks";
import { BottomNav, tabForMode, TopNav, type Tab } from "./shell/Nav";
import { SettingsSheet } from "./shell/Settings";
import { Toast } from "./shell/Toast";
import { UpdatesSheet } from "./shell/Updates";
import { useMarkSeen, useUpdates } from "./shell/useUpdates";
import { useRouter } from "next/navigation";
import type { Ghost } from "./trip/AgendaItem";
import { TripToday } from "./trip/TripToday";
import { Icon } from "./ui/Icon";
import { Sheet } from "./ui/Sheet";

interface Props {
  trip: Trip;
  version: number;
  /** Server time when this copy of the trip was read. */
  serverNow: number;
  devNotes: string[];
  chatAvailable: boolean;
  /** The active model reads images; hides screenshot upload when false. */
  chatVision: boolean;
  /** DEBUG_TIMING=1: show how long the planner took under each reply. */
  debugTiming?: boolean;
  knownNames: string[];
  /** The change log, newest first. */
  updates: ChangeEntry[];
}

export function TripShell(props: Props) {
  return (
    <EditorProvider version={props.version} tripOffset={props.trip.utcOffset}>
      <ChatProvider available={props.chatAvailable} vision={props.chatVision} debugTiming={props.debugTiming}>
        <App {...props} />
      </ChatProvider>
    </EditorProvider>
  );
}

/**
 * The trip on screen: the server's copy, saved on this device as it arrives.
 * Offline, a newer saved copy wins over an older cached page.
 */
function useTripCopy(trip: Trip, version: number, serverNow: number, online: boolean) {
  const raw = useSyncExternalStore(subscribeSnapshot, readSnapshotRaw, () => null);
  const saved = useMemo(() => parseSnapshot(raw), [raw]);

  useEffect(() => {
    saveSnapshot({ trip, version, savedAt: serverNow });
  }, [trip, version, serverNow]);

  if (!online && saved && saved.savedAt > serverNow) return { trip: saved.trip, savedAt: saved.savedAt, stored: true };
  return { trip, savedAt: serverNow, stored: saved !== null };
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

function App({ trip: serverTrip, version, serverNow, devNotes, knownNames, updates }: Props) {
  const now = useClock(serverNow);
  const online = useOnline();
  const { trip: savedTrip, savedAt, stored } = useTripCopy(serverTrip, version, serverNow, online);
  const { open: chatOpen, setOpen: setChatOpen, highlight, available, send, prefill } = useTripChat();
  const { author, pending } = useEditor();
  // A change being saved shows at once, marked "Saving…"; a failed save takes it back off.
  const trip = useMemo(() => (pending ? (previewTrip({ trip: savedTrip, version }, pending) ?? savedTrip) : savedTrip), [pending, savedTrip, version]);
  const saving = useMemo(() => new Set(pending ? opsTouched(pending) : []), [pending]);
  const { unread, markers, seenMs } = useUpdates(updates, author);
  const markSeen = useMarkSeen();
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const router = useRouter();

  // Coming back to the app with signal: fetch the latest trip and changes.
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible" && navigator.onLine) router.refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [router]);

  /** Hand a line to the planner: sent straight away when we know who's asking. */
  function askPlanner(text: string) {
    if (author) {
      setChatOpen(true);
      send(text);
    } else prefill(text);
  }
  const { days, ghosts: proposalGhosts, previewing } = usePreview(trip, version);
  const ghosts = useMemo(() => {
    const g: Record<string, Ghost> = { ...proposalGhosts };
    for (const id of saving) g[id] = "saving";
    return g;
  }, [proposalGhosts, saving]);

  // Unset until someone taps: then the date decides (Trip mode during the trip).
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [mapSheet, setMapSheet] = useState(false);
  const [docsSheet, setDocsSheet] = useState(false);
  const [budgetSheet, setBudgetSheet] = useState(false);
  const [manual, setManual] = useState<ManualPrefill | null>(null);
  const mode = chosenMode ?? defaultMode(trip, now);
  const day = chosenDay ?? initialDay(trip, now);
  const toBookCount = useMemo(() => stillToBook(trip).length, [trip]);
  const { openPicker } = useEditor();

  // The planner hears which day is on screen in Trip mode.
  const { setDay: setChatDay } = useTripChat();
  useEffect(() => setChatDay(mode === "trip" ? day : null), [mode, day, setChatDay]);

  const closeChat = useCallback(() => setChatOpen(false), [setChatOpen]);

  function select(tab: Tab) {
    if (tab === "ask") return setChatOpen(!chatOpen);
    setChatOpen(false);
    setChosenMode(tab === "today" ? "trip" : "plan");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToSection(id: string) {
    setChosenMode("plan");
    setChatOpen(false);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <div className="min-h-dvh bg-[#090d12] text-slate-100 flex flex-col selection:bg-amber-500/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:p-3">
        Skip to content
      </a>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-800/80 bg-[#090d12]/95 backdrop-blur-md">
        <div className="flex h-full w-full items-center justify-between px-4 lg:px-6">
          {/* Left: Volcano Logo + Brand + Date Dropdown */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center text-[#d4a373]">
                <Icon name="volcano" className="size-6 text-[#d4a373]" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Guatemala</span>
            </div>

            <button
              type="button"
              onClick={() => scrollToSection("day-by-day")}
              className="hidden sm:flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors ml-2 py-1 px-2 rounded-lg hover:bg-slate-800/40"
            >
              <span>{monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}</span>
              <Icon name="chevronDown" className="size-4 opacity-70" />
            </button>
          </div>

          {/* Right: Today, Trip [count], Ask, Settings, Avatars */}
          <div className="flex items-center gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => select("today")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                mode === "trip" && !chatOpen
                  ? "bg-slate-800 text-white border border-slate-700/60 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <Icon name="today" className="size-4" />
              <span>Today</span>
            </button>

            <button
              type="button"
              onClick={() => select("trip")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                mode === "plan" && !chatOpen
                  ? "bg-slate-800/90 text-white border border-slate-700/60 shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <Icon name="trip" className="size-4" />
              <span>Trip</span>
              <span className="flex items-center justify-center rounded-full bg-amber-600 text-white text-[11px] font-bold px-1.5 min-w-5 h-5 ml-1">
                {toBookCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setChatOpen(!chatOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                chatOpen
                  ? "bg-emerald-900/60 text-emerald-200 border border-emerald-700/50"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <Icon name="ask" className="size-4" />
              <span>Ask</span>
            </button>

            <button
              type="button"
              onClick={() => setSettings(true)}
              aria-label="Settings"
              className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/40 transition-colors"
            >
              <Icon name="settings" className="size-4.5" />
            </button>

            {/* Avatar cluster */}
            <div className="flex items-center pl-1 sm:pl-2">
              <button
                type="button"
                onClick={openPicker}
                aria-label="Pick editor name"
                className="flex -space-x-2 overflow-hidden hover:opacity-90 transition-opacity"
              >
                <div className="flex size-7.5 sm:size-8 items-center justify-center rounded-full bg-[#4a6b82] text-xs font-bold text-white ring-2 ring-[#090d12]">
                  JW
                </div>
                <div className="flex size-7.5 sm:size-8 items-center justify-center rounded-full bg-[#d97706] text-xs font-bold text-white ring-2 ring-[#090d12]">
                  CS
                </div>
                <div className="flex size-7.5 sm:size-8 items-center justify-center rounded-full bg-[#7e22ce] text-xs font-bold text-white ring-2 ring-[#090d12]">
                  MK
                </div>
                <div className="flex size-7.5 sm:size-8 items-center justify-center rounded-full bg-[#1e293b] text-[11px] font-semibold text-slate-300 ring-2 ring-[#090d12]">
                  +2
                </div>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container: Sidebar + Content */}
      <div className="flex flex-1 min-h-[calc(100vh-4rem)]">
        {/* Left Sidebar on large screens */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col justify-between border-r border-slate-800/80 bg-[#090d12] p-4 lg:flex overflow-y-auto">
          <nav className="flex flex-col gap-1.5" aria-label="Sidebar navigation">
            {/* Trip Plan */}
            <button
              type="button"
              onClick={() => select("trip")}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all text-left relative ${
                mode === "plan" && !chatOpen
                  ? "bg-[#1d1712] border border-amber-600/50 text-[#fca564] shadow-sm font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30 font-medium"
              }`}
            >
              {mode === "plan" && !chatOpen && (
                <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-5 bg-amber-500 rounded-full" />
              )}
              <Icon name="trip" className={`size-4.5 ${mode === "plan" && !chatOpen ? "text-amber-500" : "text-slate-400"}`} />
              <span className="ml-1">Trip plan</span>
            </button>

            {/* Itinerary */}
            <button
              type="button"
              onClick={() => scrollToSection("day-by-day")}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/30 transition-colors text-left"
            >
              <Icon name="itinerary" className="size-4.5 text-slate-400" />
              <span>Itinerary</span>
            </button>

            {/* Map */}
            <button
              type="button"
              onClick={() => setMapSheet(true)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/30 transition-colors text-left"
            >
              <Icon name="map" className="size-4.5 text-slate-400" />
              <span>Map</span>
            </button>

            {/* People */}
            <button
              type="button"
              onClick={openPicker}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/30 transition-colors text-left"
            >
              <Icon name="users" className="size-4.5 text-slate-400" />
              <span>People</span>
            </button>

            {/* Docs & links */}
            <button
              type="button"
              onClick={() => setDocsSheet(true)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/30 transition-colors text-left"
            >
              <Icon name="link" className="size-4.5 text-slate-400" />
              <span>Docs & links</span>
            </button>

            {/* Budget */}
            <button
              type="button"
              onClick={() => setBudgetSheet(true)}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/30 transition-colors text-left"
            >
              <Icon name="creditCard" className="size-4.5 text-slate-400" />
              <span>Budget</span>
            </button>
          </nav>

          {/* Bottom botanical art + quote */}
          <div className="relative mt-auto pt-8 border-t border-slate-800/60 overflow-hidden">
            <div className="pointer-events-none absolute -bottom-4 -left-4 opacity-20 text-[#d4a373]">
              <svg width="150" height="150" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M10 90 Q 30 60 50 30 Q 70 10 90 5" />
                <path d="M35 55 Q 20 40 25 25 Q 40 35 45 45" />
                <path d="M50 40 Q 60 20 75 15 Q 75 30 60 38" />
                <path d="M25 70 Q 10 60 15 45 Q 30 55 35 62" />
                <path d="M65 25 Q 75 10 88 8 Q 85 22 75 24" />
                <path d="M45 45 Q 30 30 38 18 Q 50 25 52 38" />
              </svg>
            </div>
            <div className="relative z-10 space-y-3">
              <p className="font-serif italic text-xs text-amber-200/70 leading-relaxed max-w-[170px]">
                “Good company leads to amazing places.”
              </p>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                <span>Guatemala</span>
                <span className="text-[#d4a373] text-[9px]">△</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Content area */}
        <main id="main" className="min-w-0 flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12 bg-[#090d12]">
          {mode === "trip" ? (
            <TripToday
              trip={trip}
              now={now}
              day={day}
              onDay={setChosenDay}
              snapshot={{ online, savedAt, stored }}
              markers={markers}
              onItemSeen={(id) => markSeen.item(id, markers.get(id) ?? 0)}
              unread={unread.length}
              onUpdates={() => setUpdatesOpen(true)}
              saving={saving}
            />
          ) : (
            <PlanView
              trip={trip}
              days={days}
              ghosts={ghosts}
              previewing={previewing}
              highlight={highlight}
              online={online}
              onSettings={() => setSettings(true)}
              nowMs={now}
              onAsk={askPlanner}
              markers={markers}
              onItemSeen={(id) => markSeen.item(id, markers.get(id) ?? 0)}
              unread={unread.length}
              onUpdates={() => setUpdatesOpen(true)}
            />
          )}
        </main>
      </div>

      <ChatSheet open={chatOpen} onClose={closeChat}>
        <ChatPanel
          trip={trip}
          online={online}
          nowMs={now}
          onManual={(p) => {
            setChatOpen(false);
            setManual(p);
          }}
        />
      </ChatSheet>

      <BottomNav active={tabForMode(mode, chatOpen)} onSelect={select} unread={unread.length} askAvailable={available} />

      {manual && (
        <SegmentDialog mode="add" initialTitle={manual.title} initialKind={manual.kind} initialDate={manual.date} open onClose={() => setManual(null)} />
      )}

      <UpdatesSheet
        open={updatesOpen}
        onClose={() => setUpdatesOpen(false)}
        entries={updates}
        trip={trip}
        nowMs={now}
        seenMs={seenMs}
        online={online}
      />

      <SettingsSheet open={settings} onClose={() => setSettings(false)} notes={devNotes} />
      <WhoPicker knownNames={knownNames} />

      {/* Map modal sheet */}
      {mapSheet && (
        <Sheet open onClose={() => setMapSheet(false)} title="Trip Map & Locations">
          <div className="flex flex-col gap-4 p-2 text-slate-200">
            <p className="text-sm text-slate-400">
              Key stops and destinations on our Guatemala itinerary:
            </p>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60">
                <p className="font-semibold text-white flex items-center gap-2">
                  <Icon name="mountain" className="size-4 text-amber-400" />
                  Acatenango Volcano
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Elevation 3,976 m. Overnight hike departing from Antigua on Nov 29. Views of erupting Fuego.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60">
                <p className="font-semibold text-white flex items-center gap-2">
                  <Icon name="bed" className="size-4 text-emerald-400" />
                  Lake Atitlán · San Marcos La Laguna
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  AMATE Atitlán (Airbnb). Cliff jumping at Cerro Tzankujil, boat transport from Panajachel.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60">
                <p className="font-semibold text-white flex items-center gap-2">
                  <Icon name="plane" className="size-4 text-blue-400" />
                  Guatemala City (GUA) Airport
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Alaska SEA → GUA landing Nov 24 at 11:52 PM. Shuttle transfer to lodging.
                </p>
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {/* Docs & links modal sheet */}
      {docsSheet && (
        <Sheet open onClose={() => setDocsSheet(false)} title="Docs & Links">
          <div className="flex flex-col gap-4 p-2 text-slate-200">
            <p className="text-sm text-slate-400">
              Essential travel documents, reference notes, and gear lists:
            </p>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60">
                <p className="font-semibold text-white">Acatenango Hike Gear & Operator</p>
                <p className="text-sm text-slate-400 mt-1">
                  Operator: Wicho & Charlie&apos;s (info@wichoandcharlies.com). Bring warm summit layers, broken-in hiking boots, headlamp, and Q100 cash per person for park fees.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60">
                <p className="font-semibold text-white">Entry & Currency</p>
                <p className="text-sm text-slate-400 mt-1">
                  US passports: No visa needed for tourist stay under 90 days. Currency is Guatemalan Quetzal (GTQ), roughly 7.7 GTQ per 1 USD. ATMs available in Antigua and Panajachel.
                </p>
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {/* Budget modal sheet */}
      {budgetSheet && (
        <Sheet open onClose={() => setBudgetSheet(false)} title="Trip Budget">
          <div className="flex flex-col gap-4 p-2 text-slate-200">
            <p className="text-sm text-slate-400">
              Tracked expenses and shared group costs:
            </p>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Volcano Park Entrance Fees</p>
                  <p className="text-xs text-slate-400">Paid in cash on trail</p>
                </div>
                <span className="font-mono font-bold text-amber-400">~Q100 / person</span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Lake Boat Transfers</p>
                  <p className="text-xs text-slate-400">Public lancha between towns</p>
                </div>
                <span className="font-mono font-bold text-amber-400">Q25–50 / trip</span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-white">Shuttle & Van Transfers</p>
                  <p className="text-xs text-slate-400">GUA → Antigua / Lake</p>
                </div>
                <span className="font-mono font-bold text-amber-400">Pending party size</span>
              </div>
            </div>
          </div>
        </Sheet>
      )}

      {/* While the planner is open the page behind it is inert, so the toast moves into the sheet. */}
      {!chatOpen && <Toast />}
    </div>
  );
}
