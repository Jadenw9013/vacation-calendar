/*
 * Prints the seed trip the way the app sees it: where you sleep each night,
 * what's missing, what still needs booking. A quick check after editing
 * src/data/trip.ts (which only seeds an empty store).
 *
 *   npm run summary
 */
import { missing, nights, toBook } from "@/domain/derive";
import { formatDay } from "@/domain/time";
import { seedTrip } from "@/server/seed";

const trip = seedTrip();

console.log(`${trip.name}: ${formatDay(trip.startDate)} to ${formatDay(trip.endDate)}, ${trip.items.length} items, ${trip.todos.length} to-dos\n`);
console.log("NIGHTS");
for (const n of nights(trip)) console.log(`  ${formatDay(n.date)}  ${n.stay ? n.stay.title : "nowhere to stay yet"}`);
console.log("\nMISSING");
for (const m of missing(trip)) console.log(`  ${m.kind === "nights" ? `no place to stay ${formatDay(m.from)}${m.count > 1 ? ` to ${formatDay(m.to)}` : ""}` : "no flight home"}`);
console.log("\nTO BOOK");
for (const i of toBook(trip)) console.log(`  ${i.start ? formatDay(i.start.date) : "no day"}  ${i.title}${i.booking?.by ? ` (${i.booking.by})` : ""}`);
