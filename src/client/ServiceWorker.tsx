"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

/** Registers the offline service worker in production builds only. */
export function ServiceWorker({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
      {children}
    </SerwistProvider>
  );
}
