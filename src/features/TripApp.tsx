"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TripState } from "@/domain/types";
import { useView, type View } from "@/client/router";
import { TripProvider } from "@/client/store";
import { Icon, type IconName } from "@/ui/Icon";
import { ToastBar } from "@/ui/kit";
import { ComposerProvider, useCompose } from "./composer/Composer";
import { ItemPage } from "./item/ItemPage";
import { Plan } from "./plan/Plan";
import { Today } from "./today/Today";
import { Todo } from "./todo/Todo";
import { TripSettings } from "./trip/TripSettings";
import { Brand } from "@/ui/Brand";
import { ShareTrip } from "./trip/ShareTrip";

export function TripApp({ tripId, initial, me, serverNow }: { tripId: string; initial: TripState; me: string; serverNow: number }) {
  return (
    <TripProvider tripId={tripId} initial={initial} me={me} serverNow={serverNow}>
      <ComposerProvider serverNow={serverNow}>
        <Screens tripId={tripId} serverNow={serverNow} />
      </ComposerProvider>
    </TripProvider>
  );
}

type Tab = "today" | "plan" | "todo" | "trip";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "plan", label: "Plan", icon: "plan" },
  { id: "todo", label: "To-do", icon: "todo" },
  { id: "trip", label: "Trip", icon: "suitcase" },
];

function Screens({ tripId, serverNow }: { tripId: string; serverNow: number }) {
  const { view, go, back } = useView(tripId);
  const active: Tab = view.tab === "item" ? "plan" : view.tab;
  const compose = useCompose();
  const [sharing, setSharing] = useState(false);

  // Arrived from the share sheet (/share): open the composer with what was shared.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.hash.slice(1)).get("compose");
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    compose({ text: shared });
  }, [compose]);

  return (
    <div className="trip-app-shell mx-auto min-h-dvh w-full max-w-3xl pt-20">
      <TopBar active={active} onPick={(t) => go({ tab: t } as View)} onShare={() => setSharing(true)} />
      <main id="main" className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16">
        {view.tab === "today" && <Today day={view.day} go={go} serverNow={serverNow} />}
        {view.tab === "plan" && <Plan section={view.section} go={go} />}
        {view.tab === "todo" && <Todo go={go} />}
        {view.tab === "trip" && <TripSettings />}
        {view.tab === "item" && <ItemPage key={view.itemId} itemId={view.itemId} go={go} back={() => back({ tab: "plan" })} />}
      </main>
      <BottomBar active={active} onPick={(t) => go({ tab: t } as View)} />
      <ToastBar />
      {sharing && <ShareTrip onClose={() => setSharing(false)} />}
    </div>
  );
}

function AddButton({ big }: { big?: boolean }) {
  const compose = useCompose();
  return (
    <button
      type="button"
      onClick={() => compose({})}
      aria-label="Add or ask"
      className={`flex items-center justify-center gap-2 rounded-full bg-accent font-bold text-on-accent shadow-lift ${big ? "size-14" : "min-h-11 px-5"}`}
    >
      <Icon name="plus" className={big ? "size-7" : "size-5"} />
      {!big && "Add or ask"}
    </button>
  );
}

/** Phones: four tabs and the + in thumb reach. */
function BottomBar({ active, onPick }: { active: Tab; onPick: (t: Tab) => void }) {
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);
  const tab = (t: (typeof TABS)[number]) => (
    <li key={t.id} className="flex flex-1">
      <button
        type="button"
        onClick={() => onPick(t.id)}
        aria-current={active === t.id ? "page" : undefined}
        className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active === t.id ? "text-accent" : "text-muted"}`}
      >
        {active === t.id && <span aria-hidden="true" className="absolute top-0 h-1 w-8 rounded-b-full bg-accent" />}
        <Icon name={t.icon} className="size-6" />
        {t.label}
      </button>
    </li>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-lg items-center px-2">
        {left.map(tab)}
        <li className="flex flex-1 justify-center">
          <span className="-mt-6">
            <AddButton big />
          </span>
        </li>
        {right.map(tab)}
      </ul>
    </nav>
  );
}

/** Tablets and laptops: the same tabs across the top. */
function TopBar({ active, onPick, onShare }: { active: Tab; onPick: (t: Tab) => void; onShare: () => void }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 h-16 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-2 px-4">
        <Brand />
        <ul aria-label="Trip views" className="hidden gap-1 md:flex">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                aria-current={active === t.id ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold ${active === t.id ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}
              >
                <Icon name={t.icon} />
                <span className="hidden lg:inline">{t.label}</span><span className="sr-only lg:hidden">{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1 sm:gap-3">
          <button type="button" aria-label="Share trip" onClick={onShare} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted hover:bg-sunken"><Icon name="share" className="size-4" /><span className="hidden min-[360px]:inline">Share trip</span></button>
          <Link href="/?new=1" prefetch={false} className="flex min-h-11 items-center gap-1 rounded-xl bg-accent-soft px-3 text-sm font-bold text-accent"><Icon name="plus" className="size-4" />New trip</Link>
          <div className="hidden md:block"><AddButton /></div>
        </div>
      </div>
    </nav>
  );
}
