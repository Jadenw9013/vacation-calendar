"use client";

import { useEffect } from "react";
import { extractUrls } from "@/domain/links";
import { Icon } from "@/ui/Icon";
import { btn } from "@/ui/kit";

/**
 * Something shared from another app. With one trip it goes straight there and
 * opens the composer with the link in it; with several, pick the trip first.
 */
export function ShareLanding({ shared, title, trips }: { shared: string; title: string; trips: { id: string; name: string }[] }) {
  const urls = extractUrls(shared);
  const text = urls.length ? `${urls[0]} ${title && !title.startsWith("http") ? title : ""}`.trim() : shared;
  const only = trips.length === 1 ? trips[0].id : null;
  const target = (id: string) => `/t/${id}/plan#compose=${encodeURIComponent(text)}`;

  useEffect(() => {
    if (only) window.location.replace(target(only));
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (only) return <p className="p-6 text-base text-muted">Opening {trips[0].name}…</p>;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight">Save to which trip?</h1>
        <p className="truncate text-base text-muted">{urls[0] ?? shared}</p>
        <ul className="flex flex-col gap-2.5">
          {trips.map((t) => (
            <li key={t.id}>
              <a href={target(t.id)} className={`${btn.secondary} w-full justify-start`}>
                <Icon name="suitcase" />
                {t.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
