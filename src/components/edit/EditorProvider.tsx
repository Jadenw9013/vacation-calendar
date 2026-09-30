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

interface Editor {
  version: number;
  tripOffset: string;
  author: string;
  setAuthor: (name: string) => void;
  /** Sends ops; asks for confirmation when a booked item is touched. Resolves true when applied. */
  submit: (ops: Op[]) => Promise<boolean>;
  undo: () => Promise<void>;
  busy: boolean;
  notice: Notice | null;
  dismiss: () => void;
}

const EditorContext = createContext<Editor | null>(null);

export function useEditor(): Editor {
  const e = useContext(EditorContext);
  if (!e) throw new Error("useEditor outside EditorProvider");
  return e;
}

type ApiResult =
  | { status: 200; body: { ok: true; entry: ChangeEntry } }
  | { status: 409; body: { reason: "conflict" } }
  | { status: 422; body: { reason: "invalid"; issues: OpIssue[] } }
  | { status: number; body: { error?: string } };

async function post(url: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) } as ApiResult;
}

function withConfirmation(ops: Op[]): Op[] {
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

  const setAuthor = useCallback((name: string) => {
    try {
      localStorage.setItem(AUTHOR_KEY, name.trim());
    } catch {
      // Private mode: the name just won't be remembered.
    }
    window.dispatchEvent(new Event(AUTHOR_EVENT));
  }, []);

  const handle = useCallback(
    (res: ApiResult, okText: (e: ChangeEntry) => string): boolean => {
      if (res.status === 200 && "entry" in res.body) {
        setNotice({ kind: "ok", text: okText(res.body.entry), canUndo: true });
        router.refresh();
        return true;
      }
      if (res.status === 401) {
        router.push("/login");
        return false;
      }
      if (res.status === 409) {
        setNotice({ kind: "error", text: "Someone else changed the trip just now. The page has reloaded; check it and try again." });
        router.refresh();
        return false;
      }
      if (res.status === 422 && "issues" in res.body) {
        setNotice({ kind: "error", text: res.body.issues.map((i) => i.message).join(" ") });
        return false;
      }
      setNotice({ kind: "error", text: ("error" in res.body && res.body.error) || `Something went wrong (${res.status}).` });
      return false;
    },
    [router],
  );

  const submit = useCallback(
    async (ops: Op[]) => {
      if (!author) {
        setNotice({ kind: "error", text: "Put your first name in the box at the top first, so the log knows who changed what." });
        return false;
      }
      setBusy(true);
      try {
        let res = await post("/api/ops", { ops, expectedVersion: version, author });
        if (res.status === 422 && "issues" in res.body && res.body.issues[0]?.code === "needs_confirmation") {
          if (!window.confirm(`${res.body.issues[0].message}\n\nDo it anyway?`)) return false;
          res = await post("/api/ops", { ops: withConfirmation(ops), expectedVersion: version, author });
        }
        return handle(res, (e) => `Saved. ${e.summary.join(" ")}${e.redacted ? " (Removed sensitive numbers.)" : ""}`);
      } finally {
        setBusy(false);
      }
    },
    [author, version, handle],
  );

  const undo = useCallback(async () => {
    if (!author) return;
    setBusy(true);
    try {
      const res = await post("/api/undo", { expectedVersion: version, author });
      handle(res, (e) => `Undone. ${e.summary.join(" ")}`);
      setNotice((n) => (n?.kind === "ok" ? { ...n, canUndo: false } : n));
    } finally {
      setBusy(false);
    }
  }, [author, version, handle]);

  return (
    <EditorContext.Provider
      value={{ version, tripOffset, author, setAuthor, submit, undo, busy, notice, dismiss: () => setNotice(null) }}
    >
      {children}
    </EditorContext.Provider>
  );
}
