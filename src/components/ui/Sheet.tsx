"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A modal that rises from the bottom on phones (thumb reach) and sits in the
 * middle on wider screens. Native <dialog>: focus trap, Escape and the
 * backdrop come for free.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const headingId = labelledBy ?? `sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl border border-line p-0 text-ink shadow-2xl sm:m-auto sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-3xl"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-line py-1 pr-1 pl-5">
          <h2 id={headingId} className="min-w-0 truncate text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-sunken">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </dialog>
  );
}

/** One full-width row in a sheet of actions: 48px tall, 8px apart. */
export function SheetAction({
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-base font-medium disabled:opacity-50 ${
        tone === "danger" ? "text-action hover:bg-action-soft" : "text-ink hover:bg-sunken"
      }`}
    >
      {children}
    </button>
  );
}
