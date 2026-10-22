"use client";

import { useEffect } from "react";
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

  // Arrived from the share sheet (/share): open the composer with what was shared.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.hash.slice(1)).get("compose");
    if (!shared) return;
    window.history.replaceState(null, "", window.location.pathname);
    compose({ text: shared });
  }, [compose]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl md:pt-16">
      <TopBar active={active} onPick={(t) => go({ tab: t } as View)} />
      <main id="main" className="pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16">
        {view.tab === "today" && <Today day={view.day} go={go} serverNow={serverNow} />}
        {view.tab === "plan" && <Plan section={view.section} go={go} />}
        {view.tab === "todo" && <Todo go={go} />}
        {view.tab === "trip" && <TripSettings />}
        {view.tab === "item" && <ItemPage key={view.itemId} itemId={view.itemId} go={go} back={() => back({ tab: "plan" })} />}
      </main>
      <BottomBar active={active} onPick={(t) => go({ tab: t } as View)} />
      <ToastBar />
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
function TopBar({ active, onPick }: { active: Tab; onPick: (t: Tab) => void }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 hidden h-16 border-b border-line bg-surface/95 backdrop-blur md:block">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-between gap-3 px-4">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                aria-current={active === t.id ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-base font-semibold ${active === t.id ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"}`}
              >
                <Icon name={t.icon} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <AddButton />
      </div>
    </nav>
  );
}
