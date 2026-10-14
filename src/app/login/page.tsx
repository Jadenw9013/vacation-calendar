import { authMode, safeNext } from "@/lib/auth";

export const metadata = { title: "Guatemala · sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const failed = params.error === "1";
  const mode = authMode();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-ink text-canvas">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 19L9 7L13 14L16 9L21 19H3Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Guatemala</h1>
            <p className="text-base text-muted">Nov 24 – Nov 30, 2026</p>
          </div>
        </div>

        {mode === "misconfigured" ? (
          <p className="mt-4 rounded-xl border-2 border-action bg-action-soft p-3.5 text-base">
            The site has no passphrase set, so it&apos;s locked. Set <code className="font-bold">TRIP_PASSPHRASE</code> in the environment and restart.
          </p>
        ) : (
          <form method="post" action="/api/login" className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="passphrase" className="mb-1.5 block text-sm font-semibold">
                Passphrase
              </label>
              <input
                id="passphrase"
                name="passphrase"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                placeholder="Enter passphrase..."
                className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base"
              />
            </div>
            <input type="hidden" name="next" value={next} />
            {failed && (
              <p role="alert" className="rounded-xl border-2 border-action bg-action-soft px-3 py-2 text-base font-semibold">
                That&apos;s not it. Ask whoever sent you the link.
              </p>
            )}
            <button
              type="submit"
              className="min-h-12 w-full rounded-xl bg-ink px-4 text-base font-bold text-canvas"
            >
              Open the trip
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
