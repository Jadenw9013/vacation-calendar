import { trip as v1 } from "@/data/trip";
import { migrateV1, type V1Trip } from "@/domain/migrate";
import type { Trip } from "@/domain/types";

/** The id the original trip lives under once migrated. */
export const SEED_TRIP_ID = "guatemala";

/** Adds what the old site showed as hardcoded panels: the cover photo and the entry and money notes. */
export function withExtras(trip: Trip): Trip {
  return {
    ...trip,
    cover: trip.cover ?? "/guatemala-hero-sunset.jpg",
    notes: [
      trip.notes,
      "Entry: US passports need no visa for stays under 90 days.",
      "Money: quetzales (GTQ). ATMs in Antigua and Panajachel. Bring small bills for boats and tuk-tuks.",
      "Acatenango: Q100 cash each for park fees.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The Guatemala trip from src/data/trip.ts (or a v1 trip from the old store) as a v2 trip. */
export function seedTrip(id = SEED_TRIP_ID, from: V1Trip = v1 as unknown as V1Trip): Trip {
  return withExtras(migrateV1(from, id));
}
