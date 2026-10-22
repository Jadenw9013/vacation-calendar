"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatRange } from "@/domain/time";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { zoneOptions } from "../trip/TripSettings";

interface Summary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

/** Your trips, and a new one in one short form. */
export function Home({ trips, original }: { trips: Summary[]; original: { id: string; name: string; claimed: boolean } | null }) {
  const [creating, setCreating] = useState(trips.length === 0 && !original);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-10">
      <h1 className="text-3xl font-bold">Your trips</h1>

      {(trips.length > 0 || original) && (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => (
            <li key={t.id}>
              <a href={`/t/${t.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-sunken">
                <Icon name="suitcase" className="size-6 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{t.name}</span>
                  <span className="block text-base text-muted">{formatRange(t.startDate, t.endDate)}</span>
                </span>
                <Icon name="chevronRight" className="size-4 text-muted" />
              </a>
            </li>
          ))}
          {original && (
            <li>
              <a href={`/t/${original.id}/join`} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 hover:bg-sunken">
                <Icon name="suitcase" className="size-6 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{original.name}</span>
                  <span className="block text-base text-muted">{original.claimed ? "Join with the group's passcode" : "Join and set the group's passcode"}</span>
                </span>
                <Icon name="chevronRight" className="size-4 text-muted" />
              </a>
            </li>
          )}
        </ul>
      )}

      {creating ? (
        <CreateTrip />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className={`${btn.secondary} self-start`}>
          <Icon name="plus" />
          Plan a new trip
        </button>
      )}
    </main>
  );
}

function CreateTrip() {
  const router = useRouter();
  const here = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
  const [v, setV] = useState({ name: "", startDate: "", endDate: "", tz: here, homeTz: here, currency: "USD", me: "", passcode: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = zoneOptions([here]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">New trip</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/trips", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ ...v, destination: v.name, homeCurrency: "USD" }),
            });
            const body = await res.json();
            if (!res.ok) return setError(body.error);
            router.push(`/t/${body.id}`);
          } catch {
            setError("Creating a trip needs a connection.");
          } finally {
            setBusy(false);
          }
        }}
        className="flex flex-col gap-3"
      >
        <label className={label}>
          Where are you going?
          <input value={v.name} onChange={set("name")} required maxLength={200} placeholder="Oaxaca" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            First day
            <input type="date" value={v.startDate} onChange={set("startDate")} required className={field} />
          </label>
          <label className={label}>
            Travel home
            <input type="date" value={v.endDate} onChange={set("endDate")} required min={v.startDate} className={field} />
          </label>
        </div>
        <label className={label}>
          Time zone there
          <select value={v.tz} onChange={set("tz")} className={field}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Local currency
          <input value={v.currency} onChange={set("currency")} maxLength={3} required className={`${field} uppercase`} />
        </label>
        <label className={label}>
          Your first name
          <input value={v.me} onChange={set("me")} required maxLength={30} autoComplete="given-name" className={field} />
        </label>
        <label className={label}>
          A passcode for the group
          <input type="password" value={v.passcode} onChange={set("passcode")} required minLength={4} autoComplete="new-password" className={field} />
        </label>
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={busy} className={`${btn.primary} min-h-12`}>
          {busy ? "Creating…" : "Create the trip"}
        </button>
      </form>
    </section>
  );
}
