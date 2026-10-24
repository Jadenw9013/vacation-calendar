"use client";

import { useEffect, useState } from "react";
import { btn } from "@/ui/kit";

interface AccountState { account: { name: string; email: string } | null; googleEnabled: boolean }

export function AccountPanel() {
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/account").then((res) => res.ok ? res.json() : null).then((body) => { if (live) setState(body); }).catch(() => {});
    const status = new URLSearchParams(window.location.search).get("auth");
    if (status === "failed" || status === "unavailable") {
      // Read once on arrival from the sign-in redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(status === "failed" ? "Google sign-in did not finish. Please try again." : "Google sign-in is not available yet.");
    }
    return () => { live = false; };
  }, []);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith("trip:"));
      if (keys.some((key) => key.endsWith(":outbox") && (JSON.parse(localStorage.getItem(key) || "[]") as unknown[]).length)) {
        setError("Sync your offline changes before signing out.");
        return;
      }
      const res = await fetch("/api/account/logout", { method: "POST" });
      if (!res.ok) throw new Error();
      for (const key of keys) localStorage.removeItem(key);
      localStorage.removeItem("trip-name");
      if ("caches" in window) for (const key of await caches.keys()) await caches.delete(key);
      window.location.replace("/?all=1");
    } catch { setError("Signing out needs a connection. Please try again."); }
    finally { setBusy(false); }
  }

  if (!state && !error) return null;
  const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/?all=1";
  return <section aria-label="Your account" className="flex flex-col gap-2 rounded-2xl border border-line p-4">
    {state?.account ? <>
      <p className="font-semibold">Signed in as {state.account.name}</p>
      <p className="break-words text-sm text-muted">{state.account.email}</p>
      <p className="text-sm text-muted">Trips you create or join are saved to your account. Sign in with Google on another device to find them again.</p>
      <button type="button" disabled={busy} onClick={() => void logout()} className={`${btn.secondary} self-start`}>{busy ? "Signing out…" : "Sign out"}</button>
    </> : state?.googleEnabled ? <>
      <a href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className={`${btn.secondary} self-start`}>Continue with Google</a>
      <p className="text-sm text-muted">Remember your trips across devices. Trips already joined on this browser will be saved to your account. You can also continue with a first name and trip passcode.</p>
    </> : <p className="text-sm text-muted">Your joined trips are remembered on this browser.</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </section>;
}
