"use client";

import type { Mode } from "@/lib/now";
import { Icon, type IconName } from "@/components/ui/Icon";

export type Tab = "today" | "trip" | "ask";

interface NavProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
  /** Count of things still to book, shown on the Trip tab. */
  toBook: number;
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
export function BottomNav({ active, onSelect, toBook, askAvailable }: NavProps) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-md items-stretch justify-around gap-2 px-2">
        {TABS.map((t) => (
          <li key={t.id} className="flex flex-1">
            <NavButton tab={t} active={active === t.id} onSelect={onSelect} badge={t.id === "trip" ? toBook : 0} disabled={t.id === "ask" && !askAvailable} stacked />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Laptops and tablets: the same three tabs across the top. */
export function TopNav({ active, onSelect, toBook, askAvailable }: NavProps) {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-2">
        {TABS.map((t) => (
          <li key={t.id}>
            <NavButton tab={t} active={active === t.id} onSelect={onSelect} badge={t.id === "trip" ? toBook : 0} disabled={t.id === "ask" && !askAvailable} />
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
      className={`relative flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-xl font-semibold disabled:opacity-50 ${
        stacked ? "flex-col gap-0.5 text-sm" : "gap-2 px-4 text-base"
      } ${active ? "bg-ink text-canvas" : "text-muted hover:bg-sunken hover:text-ink"}`}
    >
      <Icon name={tab.icon} className={stacked ? "size-5" : "size-5"} />
      <span>{tab.label}</span>
      {badge > 0 && (
        <span
          className={`absolute flex min-w-5 items-center justify-center rounded-full bg-action px-1 text-xs font-bold text-on-fill ${
            stacked ? "top-0.5 right-[calc(50%-1.9rem)]" : "-top-1 -right-1"
          }`}
        >
          {badge}
          <span className="sr-only"> still to book</span>
        </span>
      )}
    </button>
  );
}
