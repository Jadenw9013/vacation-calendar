import { Brand } from "@/ui/Brand";

export default function UnavailablePreview() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-20">
      <div className="rounded-3xl border border-line bg-surface p-8 shadow-lift">
        <Brand />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">This viewing link is unavailable.</h1>
        <p className="mt-3 text-muted">The link may have been turned off or copied incorrectly. Ask your trip organiser for a new viewing link.</p>
      </div>
    </main>
  );
}
