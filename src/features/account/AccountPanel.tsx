"use client";

import { useEffect, useState } from "react";
import { btn } from "@/ui/kit";
import { Icon } from "@/ui/Icon";
import type { Account } from "@/server/auth";

interface AccountState { account: { name: string; email: string } | null; googleEnabled: boolean }

export function AccountPanel({ initialAccount = null }: { initialAccount?: Account | null }) {
  const [state, setState] = useState<AccountState | null>(initialAccount ? { account: initialAccount, googleEnabled: true } : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/account").then((res) => res.ok ? res.json() : null).then((body) => { if (live) setState(body); }).catch(() => {});
    const status = new URLSearchParams(window.location.search).get("auth");
    if (status === "failed" || status === "unavailable" || status === "cancelled") {
      // Read once on arrival from the sign-in redirect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(status === "cancelled" ? "Sign-in cancelled. You can keep planning here." : status === "failed" ? "Google sign-in did not finish. Please try again." : "Google sign-in is not available yet.");
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
  return <section aria-label="Your account" className="account-control">
    {state?.account ? <>
      <details className="account-menu"><summary aria-label={`Your account, ${state.account.name}`}><span className="account-avatar">{state.account.name.slice(0, 1).toUpperCase()}</span><span className="account-name">{state.account.name}</span><Icon name="chevronDown" className="size-3.5" /></summary><div className="account-popover"><p className="font-semibold">{state.account.name}</p><p className="break-words text-sm text-muted">{state.account.email}</p><p className="my-3 text-sm text-muted">Your trips and planning conversation follow you across devices.</p><button type="button" disabled={busy} onClick={() => void logout()} className={btn.secondary}>{busy ? "Signing out…" : "Sign out"}</button></div></details>
    </> : state?.googleEnabled ? <>
      <a href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className="google-sign-in"><svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path fill="currentColor" d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.1h5.5a4.7 4.7 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3-4.4 3-7.6ZM12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6a6.3 6.3 0 0 1-9.3-3.3H2.7v2.7A10.4 10.4 0 0 0 12 22ZM6.2 13.6a6.2 6.2 0 0 1 0-3.2V7.7H2.7a10 10 0 0 0 0 8.6l3.5-2.7ZM12 6c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 12 2a10.4 10.4 0 0 0-9.3 5.7l3.5 2.7A6.2 6.2 0 0 1 12 6Z" /></svg>Continue with Google</a>
    </> : null}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </section>;
}
