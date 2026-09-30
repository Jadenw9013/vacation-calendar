import { authMode, safeNext } from "@/lib/auth";

export const metadata = { title: "Guatemala · sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const failed = params.error === "1";
  const mode = authMode();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <div className="rounded-3xl border border-stone-border bg-white p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-night text-white shadow-xs">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 19L9 7L13 14L16 9L21 19H3Z" />
            </svg>
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-volcano">Guatemala</h1>
            <p className="text-xs text-gray-500 font-sans">Nov 24 – Nov 30, 2026</p>
          </div>
        </div>

        {mode === "misconfigured" ? (
          <p className="mt-4 rounded-xl border border-maya-border bg-maya-light p-3.5 text-xs font-medium text-maya">
            The site has no passphrase set, so it&apos;s locked. Set <code className="font-mono font-bold">TRIP_PASSPHRASE</code> in the environment and restart.
          </p>
        ) : (
          <form method="post" action="/api/login" className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="passphrase" className="block text-xs font-semibold text-gray-700 mb-1.5">
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
                className="w-full rounded-xl border border-stone-border bg-stone-light/40 px-3.5 py-2.5 text-base text-volcano outline-none focus:border-lake focus:bg-white focus:ring-2 focus:ring-lake/20 transition-all"
              />
            </div>
            <input type="hidden" name="next" value={next} />
            {failed && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                That&apos;s not it. Ask whoever sent you the link.
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-lake px-4 py-3 text-sm font-bold text-white shadow-xs hover:bg-lake-hover transition-colors"
            >
              Open the trip
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
