"use client";

import { useEffect, type ReactNode } from "react";
import { useTrip } from "@/client/store";
import { Icon, type IconName } from "./Icon";

/* Shared class strings, so every button and field looks and behaves the same. */

export const btn = {
  primary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-bold text-on-accent disabled:opacity-50",
  secondary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-base font-semibold text-ink hover:bg-sunken disabled:opacity-50",
  quiet: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold text-accent hover:bg-sunken disabled:opacity-50",
  danger: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold text-danger hover:bg-sunken disabled:opacity-50",
};

export const field =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export const label = "flex flex-col gap-1 text-sm font-semibold text-muted";

/** A round-cornered action with an icon: Directions, Call, Copy. Links when given href. */
export function ActionChip({
  icon,
  children,
  href,
  onClick,
  tone = "default",
}: {
  icon: IconName;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "default" | "ticket";
}) {
  const cls = `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-base font-semibold ${
    tone === "ticket" ? "bg-on-ticket text-ticket" : "border border-line bg-surface text-ink hover:bg-sunken"
  }`;
  if (href) {
    const external = /^https?:/.test(href);
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        <Icon name={icon} className="size-[1.1rem]" />
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon name={icon} className="size-[1.1rem]" />
      {children}
    </button>
  );
}

/** Copies text and says so. */
export function useCopy() {
  const { notify } = useTrip();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what} copied`);
    } catch {
      notify(`Couldn't copy. ${what}: ${text}`);
    }
  };
}

/** The message at the bottom after a change, with Undo when there's something to undo. */
export function ToastBar() {
  const { toast: shown, dismissToast, undo } = useTrip();
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(dismissToast, shown.entryId ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [shown, dismissToast]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      <div role="status" aria-live="polite" className="pointer-events-auto flex max-w-md min-w-0 items-center gap-2 rounded-2xl bg-ink py-1.5 pr-1.5 pl-4 text-base text-canvas shadow-lift">
        <p className="min-w-0 flex-1 py-1.5">{shown.message}</p>
        {shown.entryId && (
          <button
            type="button"
            onClick={() => {
              dismissToast();
              void undo(shown.entryId!);
            }}
            className="min-h-10 shrink-0 rounded-xl px-3 font-bold text-ticket hover:bg-white/10"
          >
            Undo
          </button>
        )}
        <button type="button" onClick={dismissToast} aria-label="Dismiss" className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-white/10">
          <Icon name="close" className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** A section heading inside a screen: sentence case, no label above it. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}
