"use client";

import type { Mode } from "@/lib/now";
import { Icon, type IconName } from "@/components/ui/Icon";

export type Tab = "today" | "trip" | "ask";

interface NavProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
  /** Other people's changes since this device last opened Updates, shown on the Trip tab. */
  unread: number;
  askAvailable: boolean;
}

const TABS: { id: Tab; label: string; icon: IconName; hint: string }[] = [
  { id: "today", label: "Today", icon: "today", hint: "Trip mode: what's on today" },
  { id: "trip", label: "Trip", icon: "trip", hint: "Plan mode: gaps and bookings" },
  { id: "ask", label: "Ask", icon: "ask", hint: "Ask the planner" },
];

export function tabForMode(mode: Mode, chatOpen: boolean): Tab {
  if (chatOpen) return "ask";
  return mode === "trip" ? "today" : "trip";
}

/** Phones: a 56px bar at the bottom, in thumb reach. */
export function BottomNav({ active, onSelect, unread, askAvailable }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800/80 bg-[#090d12]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-md items-stretch justify-around gap-2 px-2">
        {TABS.map((t) => (
          <li key={t.id} className="flex flex-1">
            <NavButton tab={t} active={active === t.id} onSelect={onSelect} badge={t.id === "trip" ? unread : 0} disabled={t.id === "ask" && !askAvailable} stacked />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Laptops and tablets: the same three tabs across the top. */
export function TopNav({ active, onSelect, unread, askAvailable }: NavProps) {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-2">
        {TABS.map((t) => (
          <li key={t.id}>
            <NavButton tab={t} active={active === t.id} onSelect={onSelect} badge={t.id === "trip" ? unread : 0} disabled={t.id === "ask" && !askAvailable} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavButton({
  tab,
  active,
  onSelect,
  badge,
  disabled,
  stacked,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onSelect: (t: Tab) => void;
  badge: number;
  disabled?: boolean;
  stacked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={active ? "page" : undefined}
      title={tab.hint}
      disabled={disabled}
      className={`relative flex items-center justify-center rounded-xl font-medium transition-colors disabled:opacity-50 ${
        stacked
          ? `flex-col gap-0.5 text-xs py-1.5 min-h-12 min-w-12 flex-1 ${active ? "text-white bg-slate-800/80 font-semibold" : "text-slate-400 hover:text-white"}`
          : `gap-1.5 px-3.5 py-1.5 text-sm ${
              active
                ? "bg-slate-800/90 text-white border border-slate-700/60 shadow-sm font-semibold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/40"
            }`
      }`}
    >
      <Icon name={tab.icon} className={stacked ? "size-5" : "size-4"} />
      <span>{tab.label}</span>
      {badge > 0 && (
        <span
          className={`flex items-center justify-center rounded-full bg-amber-600 text-white text-[11px] font-bold ${
            stacked
              ? "absolute top-1 right-[calc(50%-1.4rem)] size-4 text-[10px]"
              : "ml-1 px-1.5 min-w-5 h-5"
          }`}
        >
          {badge}
          <span className="sr-only"> items</span>
        </span>
      )}
    </button>
  );
}
