"use client";

import { useEffect, useRef, type ReactNode } from "react";

const HISTORY_KEY = "planner-sheet";

/**
 * The planner as a native modal <dialog>: focus stays inside, Escape closes,
 * the page behind is inert, and focus goes back to whatever opened it.
 * Full height on phones, a 400px panel on the right from tablet width up.
 *
 * Back (button or gesture) closes the sheet instead of leaving the app: opening
 * pushes a history entry, and closing any other way takes it back off.
 */
export function ChatSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pushed = useRef(false);

  // Open and close the dialog with the state, and keep history in step.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      if (!pushed.current) {
        history.pushState({ ...(history.state ?? {}), [HISTORY_KEY]: true }, "");
        pushed.current = true;
      }
    }
    if (!open && d.open) d.close();
    if (!open && pushed.current) {
      pushed.current = false;
      // Closed by the button or Escape: drop the entry we added, without leaving the page.
      if (history.state?.[HISTORY_KEY]) history.back();
    }
  }, [open]);

  // Back closes the sheet.
  useEffect(() => {
    const onPop = () => {
      if (pushed.current && !history.state?.[HISTORY_KEY]) {
        pushed.current = false;
        onClose();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onClose]);

  // The iPhone keyboard covers the page without shrinking it: size the sheet to what's visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const d = ref.current;
    if (!vv || !d || !open) return;
    const fit = () => {
      d.style.setProperty("--sheet-top", `${vv.offsetTop}px`);
      d.style.setProperty("--sheet-height", `${vv.height}px`);
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Ask the planner"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-x-0 top-[var(--sheet-top,0px)] m-0 h-[var(--sheet-height,100dvh)] max-h-none w-full max-w-none overflow-hidden border-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop:bg-black/40 md:right-0 md:left-auto md:w-[400px] md:border-l md:border-line"
    >
      {open && children}
    </dialog>
  );
}
