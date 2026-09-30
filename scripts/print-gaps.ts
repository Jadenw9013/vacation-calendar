// Plain-text dump of everything derived from src/data/trip.ts.
// Run with: npm run gaps
import { trip } from "../src/data/trip";
import { computeGaps, nightCoverage, stillToBook, validateTrip } from "../src/lib/derive";
import { formatDay } from "../src/lib/time";

const errors = validateTrip(trip);
if (errors.length) {
  console.log("DATA ERRORS");
  for (const e of errors) console.log(`  ! ${e}`);
  console.log();
}

console.log("NIGHTS");
for (const n of nightCoverage(trip)) {
  const where = n.booked ? n.booked.title : `NOTHING BOOKED${n.planned.length ? ` (planned: ${n.planned.map((p) => p.id).join(", ")})` : ""}`;
  console.log(`  ${formatDay(n.date).padEnd(11)} ${where}`);
}

console.log("\nGAPS");
for (const g of computeGaps(trip)) {
  console.log(`  [${g.kind}] ${g.title}`);
  console.log(`      ${g.window}  (${g.duration})`);
  if (g.detail) console.log(`      ${g.detail}`);
  if (g.related.length) console.log(`      would be filled by: ${g.related.join(", ")}`);
}

console.log("\nSTILL TO BOOK");
for (const { segment, blockedBy } of stillToBook(trip)) {
  console.log(`  ${segment.id} [${segment.status}] ${segment.title}`);
  for (const q of blockedBy) console.log(`      blocked by: ${q.question}`);
}
