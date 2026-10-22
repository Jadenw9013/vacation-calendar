"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChangeEntry } from "@/domain/change";
import { costs } from "@/domain/derive";
import { formatRange, formatTime, localParts, monthDay, zoneName } from "@/domain/time";
import { useTheme, useSunlight, useTextSize, type Theme } from "@/client/prefs";
import { useTrip } from "@/client/store";
import { Avatar } from "@/ui/badges";
import { Icon } from "@/ui/Icon";
import { btn, field, label, SectionTitle } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { money } from "../item/ItemPage";

/** Trip: details, people and invites, trip-wide notes, costs, what changed, and display settings. */
export function TripSettings() {
  const { trip, me } = useTrip();
  const [editing, setEditing] = useState(false);
  const totals = costs(trip);

  return (
    <div className="flex flex-col gap-8 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header>
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <p className="text-base text-muted">
          {formatRange(trip.startDate, trip.endDate)} in {trip.destination}
        </p>
        <button type="button" onClick={() => setEditing(true)} className={`${btn.quiet} -ml-3`}>
          <Icon name="pencil" className="size-4" />
          Edit trip details
        </button>
      </header>

      <People />

      <section>
        <SectionTitle>Trip notes</SectionTitle>
        <TripNotes />
      </section>

      {totals.length > 0 && (
        <section>
          <SectionTitle>Costs</SectionTitle>
          <dl className="flex flex-col gap-1 text-base">
            {totals.map((t) => (
              <div key={t.currency} className="flex justify-between gap-3">
                <dt className="text-muted">{t.currency}</dt>
                <dd className="tnum text-right">
                  {money(t.booked, t.currency)} booked
                  {t.toBook > 0 && <span className="text-muted">, {money(t.toBook, t.currency)} still to book</span>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-sm text-muted">From the prices on reservations.</p>
        </section>
      )}

      <Activity />

      <Display />

      <section className="flex flex-col gap-2 pb-4">
        <p className="text-base text-muted">You&apos;re signed in to this trip as {me}.</p>
        <Link href="/?all=1" className={`${btn.secondary} self-start`}>
          <Icon name="suitcase" />
          All trips
        </Link>
      </section>

      {editing && <TripDetailsSheet onClose={() => setEditing(false)} />}
    </div>
  );
}

function People() {
  const { trip, me, apply, setMe, tripId, notify } = useTrip();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const everyone = [...new Set([me, ...trip.people])];
  const link = typeof window !== "undefined" ? `${window.location.origin}/t/${tripId}/join` : "";

  async function invite() {
    const text = `Join our ${trip.name} trip: ${link} (ask me for the passcode)`;
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, text, url: link });
        return;
      } catch {
        // Cancelled: fall through to copying.
      }
    }
    await navigator.clipboard.writeText(link).catch(() => {});
    notify("Invite link copied. Send the passcode separately.");
  }

  return (
    <section>
      <SectionTitle>People</SectionTitle>
      <ul className="flex flex-wrap gap-2">
        {everyone.map((p) => (
          <li key={p} className="flex min-h-10 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-1 pl-1 text-base font-semibold">
            <Avatar name={p} />
            {p}
            {p === me ? (
              <button type="button" onClick={() => setRenaming(true)} className="min-h-9 rounded-full px-2 text-sm text-accent hover:bg-sunken">
                (you) change
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void apply([{ op: "trip.update", set: { people: trip.people.filter((x) => x !== p) } }])}
                aria-label={`Remove ${p}`}
                className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-sunken"
              >
                <Icon name="close" className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n || everyone.includes(n)) return;
          const r = await apply([{ op: "trip.update", set: { people: [...trip.people, n] } }]);
          if (r.ok) setName("");
        }}
        className="mt-3 flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add someone (first name)" aria-label="Add someone" maxLength={30} className={field} />
        <button type="submit" disabled={!name.trim()} className={btn.secondary}>
          Add
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={invite} className={btn.primary}>
          <Icon name="share" />
          Invite someone
        </button>
        <button type="button" onClick={() => setPassOpen(true)} className={btn.quiet}>
          Change passcode
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">The link alone doesn&apos;t open the trip. They also need the passcode, so send it another way.</p>

      {renaming && <RenameSheet onClose={() => setRenaming(false)} setMe={setMe} me={me} />}
      {passOpen && <PasscodeSheet onClose={() => setPassOpen(false)} />}
    </section>
  );
}

function RenameSheet({ me, setMe, onClose }: { me: string; setMe: (n: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState(me);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Your name">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const err = await setMe(name.trim());
          if (err) setError(err);
          else onClose();
        }}
        className="flex flex-col gap-3 pt-1"
      >
        <label className={label}>
          First name
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" className={field} />
        </label>
        <p className="text-sm text-muted">It goes on the changes you make, and the assistant uses it when you say “I”.</p>
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} self-start`}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

function PasscodeSheet({ onClose }: { onClose: () => void }) {
  const { tripId, notify } = useTrip();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Change passcode">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const res = await fetch(`/api/t/${tripId}/me`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: cur, newPasscode: next }) });
            const body = await res.json();
            if (!res.ok) return setError(body.error);
            notify("Passcode changed. Anyone already in stays in.");
            onClose();
          } catch {
            setError("Changing the passcode needs a connection.");
          }
        }}
        className="flex flex-col gap-3 pt-1"
      >
        <label className={label}>
          Current passcode
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" className={field} />
        </label>
        <label className={label}>
          New passcode
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={4} autoComplete="new-password" className={field} />
        </label>
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={next.length < 4} className={`${btn.primary} self-start`}>
          Change passcode
        </button>
      </form>
    </Sheet>
  );
}

function TripNotes() {
  const { trip, apply } = useTrip();
  const [text, setText] = useState(trip.notes ?? "");
  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (t !== (trip.notes ?? "")) void apply([{ op: "trip.update", set: { notes: t || null } }], { message: "Trip notes saved" });
      }}
      rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
      maxLength={5000}
      placeholder="Entry rules, money, emergency numbers, the Wi-Fi password…"
      aria-label="Trip notes"
      className={`${field} resize-y leading-relaxed`}
    />
  );
}

function Activity() {
  const { tripId, version, undo, trip } = useTrip();
  const [entries, setEntries] = useState<ChangeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/t/${tripId}/history?limit=30`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => live && setEntries(b.entries))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [tripId, version]);
  return (
    <section>
      <SectionTitle>Activity</SectionTitle>
      {failed && !entries && <p className="text-base text-muted">The change history needs a connection.</p>}
      {entries?.length === 0 && <p className="text-base text-muted">No changes yet.</p>}
      <ol className="flex flex-col divide-y divide-line">
        {entries?.map((e) => {
          const at = localParts(e.at, trip.tz);
          return (
            <li key={e.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-base">
                  <span className="font-semibold">{e.author}</span> {e.summary.join(", ")}
                  {e.undoOf && <span className="text-muted"> (undo)</span>}
                </p>
                <p className="text-sm text-muted">
                  {monthDay(at.date)}, {formatTime(at.time)}
                </p>
              </div>
              {!e.undoOf && (
                <button type="button" onClick={() => void undo(e.id)} className="min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold text-accent hover:bg-sunken">
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Display() {
  const [theme, setTheme] = useTheme();
  const [sun, setSun] = useSunlight();
  const [size, setSize] = useTextSize();
  const seg = (on: boolean) => `min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold ${on ? "bg-surface text-ink shadow-lift" : "text-muted"}`;
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Display on this phone</SectionTitle>
      <div className="flex gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Theme">
        {(["system", "light", "dark"] as Theme[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} className={seg(theme === t)}>
            {t === "system" ? "Match phone" : t === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 text-base">
        <span>
          <span className="block font-semibold">Sunlight mode</span>
          <span className="block text-sm text-muted">Black on white with heavier text, for reading outdoors.</span>
        </span>
        <input type="checkbox" checked={sun} onChange={(e) => setSun(e.target.checked)} className="size-6 shrink-0 accent-[var(--accent)]" />
      </label>
      <div className="flex gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="Text size">
        {(["normal", "large"] as const).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)} className={`${seg(size === s)} ${s === "large" ? "text-base" : ""}`}>
            {s === "normal" ? "Normal text" : "Large text"}
          </button>
        ))}
      </div>
    </section>
  );
}

const COMMON_ZONES = [
  "America/Guatemala",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Athens",
  "Asia/Tokyo",
  "Asia/Bangkok",
  "Asia/Bali",
  "Australia/Sydney",
];

export function zoneOptions(current: string[]): string[] {
  let all: string[] = COMMON_ZONES;
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? COMMON_ZONES;
  } catch {
    // Older browsers: the short list.
  }
  return [...new Set([...current.filter(Boolean), ...all])];
}

function TripDetailsSheet({ onClose }: { onClose: () => void }) {
  const { trip, apply } = useTrip();
  const [v, setV] = useState({
    name: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    tz: trip.tz,
    homeTz: trip.homeTz ?? "",
    currency: trip.currency,
    homeCurrency: trip.homeCurrency ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const zones = zoneOptions([trip.tz, trip.homeTz ?? ""]);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Sheet open onClose={onClose} title="Trip details">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const changes: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v)) {
            const cur = (trip as unknown as Record<string, unknown>)[k] ?? "";
            const next = k.toLowerCase().includes("currency") ? val.trim().toUpperCase() : val.trim();
            if (next !== cur) changes[k] = next === "" ? null : next;
          }
          if (!Object.keys(changes).length) return onClose();
          const r = await apply([{ op: "trip.update", set: changes as never }], { message: "Trip details saved" });
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="flex flex-col gap-3 pt-1"
      >
        <label className={label}>
          Trip name
          <input value={v.name} onChange={set("name")} maxLength={200} className={field} />
        </label>
        <label className={label}>
          Destination
          <input value={v.destination} onChange={set("destination")} maxLength={200} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            First day
            <input type="date" value={v.startDate} onChange={set("startDate")} className={field} />
          </label>
          <label className={label}>
            Travel home
            <input type="date" value={v.endDate} onChange={set("endDate")} className={field} />
          </label>
        </div>
        <label className={label}>
          Time zone there
          <select value={v.tz} onChange={set("tz")} className={field}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")} ({zoneName(z)})
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Time zone at home
          <select value={v.homeTz} onChange={set("homeTz")} className={field}>
            <option value="">Not set</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            Currency there
            <input value={v.currency} onChange={set("currency")} maxLength={3} className={`${field} uppercase`} />
          </label>
          <label className={label}>
            Currency at home
            <input value={v.homeCurrency} onChange={set("homeCurrency")} maxLength={3} className={`${field} uppercase`} />
          </label>
        </div>
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} self-start`}>
          Save
        </button>
      </form>
    </Sheet>
  );
}
