"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { AccountPanel } from "../account/AccountPanel";
import { Brand } from "@/ui/Brand";

/**
 * One step in: your first name and the trip's passcode. An invite link can
 * carry the passcode after #code=, which never leaves the phone.
 */
export function JoinForm({ tripId, tripName, hasPasscode, people, initialName = "" }: { tripId: string; tripName: string; hasPasscode: boolean; people: string[]; initialName?: string }) {
  const [name, setName] = useState(initialName);
  const [pass, setPass] = useState("");
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    // Read once from the link the person opened; nothing to sync afterwards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (code) setPass(code);
    try {
      const last = localStorage.getItem("trip-name");
      if (last && !initialName) setName(last);
    } catch {
      // Not remembered on this phone.
    }
  }, [initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tripId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), passcode: pass }) });
      const body = await res.json();
      if (!res.ok) {
        setError({ field: body.field, message: body.error });
        return;
      }
      try {
        localStorage.setItem("trip-name", body.name);
      } catch {
        // Fine.
      }
      window.location.replace(`/t/${tripId}`);
    } catch {
      setError({ message: "Joining needs a connection. Try again when you have signal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Brand />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{tripName}</h1>
        <p className="text-base text-muted">
          {hasPasscode
            ? "Enter your first name and the passcode the group shared with you."
            : "You're the first one here. Choose a passcode for the group: anyone with the link will need it to see the trip."}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className={label}>
          Your first name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            maxLength={30}
            required
            list="trip-people"
            aria-invalid={error?.field === "name"}
            className={`${field} text-lg`}
          />
          <datalist id="trip-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className={label}>
          {hasPasscode ? "Passcode" : "New passcode for the trip"}
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete={hasPasscode ? "current-password" : "new-password"}
            minLength={4}
            required
            aria-invalid={error?.field === "passcode"}
            className={`${field} text-lg`}
          />
        </label>
        {error && (
          <p role="alert" className="text-base font-semibold text-danger">
            {error.message}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} min-h-12 text-lg`}>
          {busy ? "Joining…" : hasPasscode ? "Join the trip" : "Set passcode and join"}
        </button>
      </form>
      <AccountPanel />
      <button type="button" className={`${btn.quiet} self-start`} onClick={() => window.location.assign(new URL("/?all=1", window.location.origin).href)}><Icon name="back" className="size-4" />Back to your trips</button>
    </main>
  );
}
