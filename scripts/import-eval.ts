/*
 * Reads the booking screenshots in evals/screenshots with the real assistant,
 * one after another as the app does, on a fresh in-memory copy of the trip.
 * Prints what each one recorded. Never touches the real store.
 *
 *   npm run import:eval
 *
 * Needs GEMINI_API_KEY in .env.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import { importScreenshot } from "@/server/ai/importShot";
import { SEED_TRIP_ID } from "@/server/seed";
import { MemoryBackend, TripStore } from "@/server/store";

async function main() {
  const dir = "evals/screenshots";
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const store = new TripStore(new MemoryBackend());
  const before = (await store.get(SEED_TRIP_ID))!.trip.items.length;

  for (const [i, f] of files.entries()) {
    const started = Date.now();
    const r = await importScreenshot({
      store,
      tripId: SEED_TRIP_ID,
      me: "Jaden",
      image: { data: readFileSync(`${dir}/${f}`).toString("base64"), mediaType: f.endsWith(".png") ? "image/png" : "image/jpeg" },
      index: i + 1,
      total: files.length,
    });
    console.log(`\n${f} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    if (!r) throw new Error("Set GEMINI_API_KEY in .env.local first.");
    for (const res of r.results) console.log(`  ${JSON.stringify(res).slice(0, 400)}`);
    console.log(`  says: ${r.text}`);
  }

  const trip = (await store.get(SEED_TRIP_ID))!.trip;
  console.log(`\nItems: ${before} before, ${trip.items.length} after.`);
  for (const i of trip.items.filter((x) => x.booking?.confirmation)) {
    console.log(`  ${i.title}: ${i.start?.date ?? "no day"}${i.start?.time ? ` ${i.start.time}` : ""} to ${i.end?.date ?? "?"}, ${i.booking!.state}, ${i.booking!.confirmation}${i.contact?.phone ? `, ${i.contact.phone}` : ""}`);
  }
  const leaked = JSON.stringify(trip).match(/Jordan Rivera|Rivera/g);
  console.log(leaked ? `\nWARNING: a guest's name was copied: ${leaked.join(", ")}` : "\nNo guest names copied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
