"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh the existing server-rendered preview without changing its layout. */
export function PreviewUpdates({ version: initialVersion }: { version: number }) {
  const router = useRouter();
  useEffect(() => {
    let version = initialVersion;
    let stopped = false;
    let inFlight = false;
    let revoked = false;
    let active: AbortController | null = null;
    async function refresh() {
      if (stopped || inFlight || revoked || document.visibilityState === "hidden") return;
      inFlight = true;
      active = new AbortController();
      const timeout = window.setTimeout(() => active?.abort(), 10_000);
      try {
        const response = await fetch(`/api${window.location.pathname}`, { cache: "no-store", headers: { "If-None-Match": `"${version}"` }, signal: active.signal });
        if (stopped || response.status === 304) return;
        if (response.status === 404 || response.status === 410) { revoked = true; router.refresh(); return; }
        if (!response.ok) return;
        const body = await response.json() as { version: number };
        if (!stopped && body.version !== version) { version = body.version; router.refresh(); }
      } catch { /* Keep the current view and retry on the next interval or reconnection. */ }
      finally { window.clearTimeout(timeout); inFlight = false; active = null; }
    }
    const wake = () => { void refresh(); };
    const timer = window.setInterval(wake, 15_000);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => { stopped = true; active?.abort(); window.clearInterval(timer); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); };
  }, [initialVersion, router]);
  return null;
}
