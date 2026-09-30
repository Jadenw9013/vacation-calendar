import { authMode, safeNext } from "@/lib/auth";

export const metadata = { title: "Guatemala · sign in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const failed = params.error === "1";
  const mode = authMode();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="wide text-5xl leading-none">Guatemala</h1>
      <p className="mt-2 font-mono">Nov 24 – Nov 30, 2026</p>

      {mode === "misconfigured" ? (
        <p className="mt-8 border-l-4 border-basalt bg-card p-3 text-sm">
          The site has no passphrase set, so it&apos;s locked. Set <code className="font-mono">TRIP_PASSPHRASE</code> in
          the Vercel project and redeploy.
        </p>
      ) : (
        <form method="post" action="/api/login" className="mt-8 flex flex-col gap-3">
          <label htmlFor="passphrase" className="font-semibold">
            Passphrase
          </label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            className="border-2 border-basalt bg-card px-3 py-2 text-lg"
          />
          <input type="hidden" name="next" value={next} />
          {failed && (
            <p role="alert" className="hazard-label px-2 py-1 text-sm font-bold">
              That&apos;s not it. Ask whoever sent you the link.
            </p>
          )}
          <button type="submit" className="bg-basalt px-4 py-3 font-bold text-ash">
            Open the trip
          </button>
        </form>
      )}
    </main>
  );
}
