"use client";

import { useSyncExternalStore } from "react";
import { useEditor } from "@/components/edit/EditorProvider";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";

/** Who's editing, and notes about this deployment. Out of the way until asked for. */
export function SettingsSheet({ open, onClose, notes }: { open: boolean; onClose: () => void; notes: string[] }) {
  const { author, openPicker } = useEditor();
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <section className="flex flex-col gap-2 py-2">
        <p className="text-base">
          {author ? (
            <>
              Editing as <strong>{author}</strong>
            </>
          ) : (
            "Nobody picked yet. Your first name goes on the changes you make."
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            onClose();
            openPicker();
          }}
          className="min-h-11 self-start rounded-xl border border-line px-4 font-semibold hover:bg-sunken"
        >
          {author ? "Change name" : "Pick your name"}
        </button>
      </section>

      <InstallHint />

      {notes.length > 0 && (
        <section className="border-t border-line py-4 text-sm text-muted">
          {notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </section>
      )}
    </Sheet>
  );
}

const noop = () => () => {};

function isIosBrowser(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** iOS has no install prompt: say how, once, where it's easy to find. */
export function InstallHint({ compact }: { compact?: boolean }) {
  const show = useSyncExternalStore(noop, isIosBrowser, () => false);
  if (!show) return null;
  return (
    <section className={`flex items-start gap-3 ${compact ? "rounded-2xl border border-line bg-surface p-4" : "border-t border-line py-4"}`}>
      <Icon name="share" className="mt-0.5 size-5 shrink-0" />
      <p className="text-base">
        <strong>Keep it on your home screen.</strong> In Safari, tap Share, then <em>Add to Home Screen</em>. It opens like an app and works
        with no signal.
      </p>
    </section>
  );
}
