"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ChangeEntry, OpIssue } from "@/lib/engine";
import type { Op } from "@/lib/ops";

const AUTHOR_KEY = "trip-author";
const AUTHOR_EVENT = "trip-author-change";

function readAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeAuthor(cb: () => void) {
  window.addEventListener(AUTHOR_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(AUTHOR_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export type Notice = { kind: "ok" | "error"; text: string; canUndo?: boolean };

export type ApplyOutcome =
  | { kind: "applied"; entry: ChangeEntry }
  | { kind: "conflict" }
  | { kind: "rejected"; issues: OpIssue[] }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export interface ApplyOptions {
  /** Version the ops were prepared against. Defaults to the version on screen. */
  expectedVersion?: number;
  /** The person already confirmed touching booked items (e.g. on a proposal card). */
  confirmed?: boolean;
}

interface Editor {
  version: number;
  tripOffset: string;
  author: string;
  setAuthor: (name: string) => void;
  /** True while the who's-talking picker should show. */
  pickerOpen: boolean;
  openPicker: () => void;
  /** Sends ops; asks for confirmation when a booked item is touched. Resolves true when applied. */
  submit: (ops: Op[]) => Promise<boolean>;
  /** Lower level: sends ops and reports exactly what happened. Used by proposal cards. */
  apply: (ops: Op[], options?: ApplyOptions) => Promise<ApplyOutcome>;
  undo: () => Promise<void>;
  busy: boolean;
  notice: Notice | null;
  dismiss: () => void;
  /** Bumped after every applied change, so the activity list can refetch. */
  changeCount: number;
}

const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const e = useContext(EditorContext);
  if (!e) throw new Error("useEditor outside EditorProvider");
  return e;
}

async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

export function withConfirmation(ops: Op[]): Op[] {
  return ops.map((o) => (o.op === "update_segment" || o.op === "remove_segment" ? { ...o, confirmBooked: true } : o));
}

export function EditorProvider({
  version,
  tripOffset,
  children,
}: {
  version: number;
  tripOffset: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const author = useSyncExternalStore(subscribeAuthor, readAuthor, () => "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pickerRequested, setPickerRequested] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  // Only decide on the picker once the browser value is readable.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const pickerOpen = hydrated && (pickerRequested || !author);

  const setAuthor = useCallback((name: string) => {
    try {
      localStorage.setItem(AUTHOR_KEY, name.trim());
    } catch {
      // Private mode: the name just won't be remembered.
    }
    window.dispatchEvent(new Event(AUTHOR_EVENT));
    setPickerRequested(false);
  }, []);

  const apply = useCallback(
    async (ops: Op[], options: ApplyOptions = {}): Promise<ApplyOutcome> => {
      if (!author) {
        setPickerRequested(true);
        return { kind: "cancelled" };
      }
      setBusy(true);
      try {
        const expectedVersion = options.expectedVersion ?? version;
        let sent = options.confirmed ? withConfirmation(ops) : ops;
        let res = await post("/api/ops", { ops: sent, expectedVersion, author });
        const issues = res.body.issues as OpIssue[] | undefined;
        if (res.status === 422 && issues?.[0]?.code === "needs_confirmation") {
          if (!window.confirm(`${issues[0].message}\n\nDo it anyway?`)) return { kind: "cancelled" };
          sent = withConfirmation(ops);
          res = await post("/api/ops", { ops: sent, expectedVersion, author });
        }
        if (res.status === 200) {
          const entry = res.body.entry as ChangeEntry;
          setNotice({
            kind: "ok",
            text: `Saved. ${entry.summary.join(" ")}${entry.redacted ? " (Removed sensitive numbers.)" : ""}`,
            canUndo: true,
          });
          setChangeCount((c) => c + 1);
          router.refresh();
          return { kind: "applied", entry };
        }
        if (res.status === 401) {
          router.push("/login");
          return { kind: "error", message: "Signed out" };
        }
        if (res.status === 409) {
          router.refresh();
          return { kind: "conflict" };
        }
        if (res.status === 422) return { kind: "rejected", issues: (res.body.issues as OpIssue[]) ?? [] };
        return { kind: "error", message: String(res.body.error ?? `Something went wrong (${res.status}).`) };
      } finally {
        setBusy(false);
      }
    },
    [author, version, router],
  );

  const submit = useCallback(
    async (ops: Op[]) => {
      const r = await apply(ops);
      if (r.kind === "conflict") {
        setNotice({ kind: "error", text: "Someone else changed the trip just now. The page has reloaded; check it and try again." });
      } else if (r.kind === "rejected") {
        setNotice({ kind: "error", text: r.issues.map((i) => i.message).join(" ") });
      } else if (r.kind === "error") {
        setNotice({ kind: "error", text: r.message });
      }
      return r.kind === "applied";
    },
    [apply],
  );

  const undo = useCallback(async () => {
    if (!author) return setPickerRequested(true);
    setBusy(true);
    try {
      const res = await post("/api/undo", { expectedVersion: version, author });
      if (res.status === 200) {
        const entry = res.body.entry as ChangeEntry;
        setNotice({ kind: "ok", text: `Undone. ${entry.summary.join(" ")}` });
        setChangeCount((c) => c + 1);
      } else if (res.status === 409) {
        setNotice({ kind: "error", text: "Someone else changed the trip just now. The page has reloaded; undo again if you still want to." });
      } else {
        setNotice({ kind: "error", text: String(res.body.error ?? (res.body.issues as OpIssue[] | undefined)?.[0]?.message ?? "Couldn't undo.") });
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [author, version, router]);

  return (
    <EditorContext.Provider
      value={{
        version,
        tripOffset,
        author,
        setAuthor,
        pickerOpen,
        openPicker: () => setPickerRequested(true),
        submit,
        apply,
        undo,
        busy,
        notice,
        dismiss: () => setNotice(null),
        changeCount,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}
