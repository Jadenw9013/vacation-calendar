"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { useEffect, type ReactNode } from "react";

/** Registers the offline service worker in production builds only. */
export function ServiceWorker({ children }: { children: ReactNode }) {
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      // A restored document can contain an old router tree and old account state.
      // Reload once using current cookies; planner drafts live outside that tree.
      if (event.persisted && navigator.onLine) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
      {children}
    </SerwistProvider>
  );
}
