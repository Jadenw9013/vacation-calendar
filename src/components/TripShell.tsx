"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Trip } from "@/data/types";
import { previewTrip } from "@/lib/chat/proposal";
import { nightCoverage, stillToBook, timeline } from "@/lib/derive";
import { defaultMode, initialDay, type Mode } from "@/lib/now";
import { parseSnapshot, readSnapshotRaw, saveSnapshot, subscribeSnapshot } from "@/lib/snapshot";
import { monthDay } from "@/lib/time";
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
import type { Ghost } from "./trip/AgendaItem";
import { TripToday } from "./trip/TripToday";
import { Icon } from "./ui/Icon";

interface Props {
  trip: Trip;
  version: number;
  /** Server time when this copy of the trip was read. */
  serverNow: number;
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

function App({ trip: serverTrip, version, serverNow, devNotes, knownNames }: Props) {
  const now = useClock(serverNow);
  const online = useOnline();
  const { trip, savedAt, stored } = useTripCopy(serverTrip, version, serverNow, online);
  const { open: chatOpen, setOpen: setChatOpen, highlight, available, send, prefill } = useTripChat();
  const { author } = useEditor();

  /** Hand a line to the planner: sent straight away when we know who's asking. */
  function askPlanner(text: string) {
    if (author) {
      setChatOpen(true);
      send(text);
    } else prefill(text);
  }
  const { days, ghosts, previewing } = usePreview(trip, version);

  // Unset until someone taps: then the date decides (Trip mode during the trip).
  const [chosenMode, setChosenMode] = useState<Mode | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [manual, setManual] = useState<ManualPrefill | null>(null);
  const mode = chosenMode ?? defaultMode(trip, now);
  const day = chosenDay ?? initialDay(trip, now);

  // The planner hears which day is on screen in Trip mode.
  const { setDay: setChatDay } = useTripChat();
  useEffect(() => setChatDay(mode === "trip" ? day : null), [mode, day, setChatDay]);
  const toBook = stillToBook(trip).length;

  const closeChat = useCallback(() => setChatOpen(false), [setChatOpen]);

  function select(tab: Tab) {
    if (tab === "ask") return setChatOpen(!chatOpen);
    setChatOpen(false);
    setChosenMode(tab === "today" ? "trip" : "plan");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:p-3">
        Skip to content
      </a>

      {/* Tablet and up: one bar across the top. Phones use the bottom bar. */}
      <header className="sticky top-0 z-40 hidden h-16 border-b border-line bg-surface md:block">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-4 px-6">
          <p className="mr-auto text-lg font-bold">
            Guatemala <span className="tnum font-normal text-muted">· {monthDay(trip.firstDay)} – {monthDay(trip.lastDay)}</span>
          </p>
          <TopNav active={tabForMode(mode, chatOpen)} onSelect={select} toBook={toBook} askAvailable={available} />
          <button type="button" onClick={() => setSettings(true)} aria-label="Settings" className="flex size-11 items-center justify-center rounded-xl hover:bg-sunken">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main id="main" className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-12">
        {mode === "trip" ? (
          <TripToday trip={trip} now={now} day={day} onDay={setChosenDay} snapshot={{ online, savedAt, stored }} />
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
          />
        )}
      </main>

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

      <BottomNav active={tabForMode(mode, chatOpen)} onSelect={select} toBook={toBook} askAvailable={available} />
      {manual && (
        <SegmentDialog mode="add" initialTitle={manual.title} initialKind={manual.kind} initialDate={manual.date} open onClose={() => setManual(null)} />
      )}
      <SettingsSheet open={settings} onClose={() => setSettings(false)} notes={devNotes} />
      <WhoPicker knownNames={knownNames} />
      <Toast />
    </div>
  );
}
