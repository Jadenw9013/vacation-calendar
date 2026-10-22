import type { ItemKind } from "@/domain/types";
import { Icon, KIND_ICON } from "./Icon";

/*
 * Color that carries meaning, never on its own: every kind has its icon, and
 * every status has an icon and a word. Class names are spelled out in full so
 * Tailwind finds them.
 */

const KIND_CHIP: Record<ItemKind, string> = {
  stay: "bg-k-stay-soft text-k-stay",
  flight: "bg-k-flight-soft text-k-flight",
  transport: "bg-k-transport-soft text-k-transport",
  activity: "bg-k-activity-soft text-k-activity",
  food: "bg-k-food-soft text-k-food",
  other: "bg-k-other-soft text-k-other",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  stay: "Place to stay",
  flight: "Flight",
  transport: "Getting around",
  activity: "Activity",
  food: "Food and drink",
  other: "Other",
};

/** The kind's icon on its own tint: lets a day be scanned by color and shape. */
export function KindChip({ kind, size = "md" }: { kind: ItemKind; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-11 rounded-2xl" : size === "sm" ? "size-7 rounded-lg" : "size-9 rounded-xl";
  const icon = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  return (
    <span className={`chip flex shrink-0 items-center justify-center ${box} ${KIND_CHIP[kind]}`} title={KIND_LABEL[kind]}>
      <Icon name={KIND_ICON[kind]} className={icon} />
    </span>
  );
}

type Status = "booked" | "todo" | "maybe" | "missing";

const STATUS: Record<Status, { cls: string; label: string }> = {
  booked: { cls: "bg-ok-soft text-ok", label: "Booked" },
  todo: { cls: "bg-todo-soft text-todo", label: "To book" },
  maybe: { cls: "bg-maybe-soft text-maybe", label: "Maybe" },
  missing: { cls: "bg-todo-soft text-todo", label: "Missing" },
};

function StatusMark({ status }: { status: Status }) {
  if (status === "booked") return <Icon name="check" className="size-3.5" />;
  if (status === "maybe") return <span aria-hidden="true" className="text-[0.8em] leading-none font-black">?</span>;
  return <span aria-hidden="true" className="size-2.5 rounded-full border-2 border-current" />;
}

/** "✓ Booked", "○ To book", "? Maybe": a filled pill with a mark and a word. */
export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status];
  return (
    <span className={`chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm leading-tight font-semibold ${s.cls}`}>
      <StatusMark status={status} />
      {label ?? s.label}
    </span>
  );
}

const AVATAR = [
  "bg-k-stay-soft text-k-stay",
  "bg-k-food-soft text-k-food",
  "bg-k-activity-soft text-k-activity",
  "bg-maybe-soft text-maybe",
  "bg-k-flight-soft text-k-flight",
  "bg-ok-soft text-ok",
];

/** The same color for the same name on every phone. */
function hue(name: string): string {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

/** A person's initial on their color: used for who's on what, and the people in the trip. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`chip inline-flex shrink-0 items-center justify-center rounded-full font-bold ${hue(name)} ${size === "sm" ? "size-6 text-xs" : "size-8 text-sm"}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
