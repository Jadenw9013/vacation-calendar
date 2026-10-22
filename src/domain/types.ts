/**
 * The trip, v2. One kind of thing (an item) with optional details, instead of
 * segments, plan steps, statuses, gaps and questions.
 *
 * Times are wall-clock local times plus an IANA zone, the way people think of
 * them ("check-in 3 PM Antigua time"). The zone defaults to the trip's.
 */

export type ItemKind = "stay" | "flight" | "transport" | "activity" | "food" | "other";

export interface When {
  /** Local date, "YYYY-MM-DD". */
  date: string;
  /** Local time, "HH:MM" (24h). Missing when only the day is known. */
  time?: string;
  /** IANA zone, e.g. "America/Los_Angeles". Missing means the trip's zone. */
  tz?: string;
}

export interface Place {
  name?: string;
  address?: string;
  /** A Google Maps link for the exact place, when known. */
  mapsUrl?: string;
  lat?: number;
  lng?: number;
}

export interface Money {
  amount: number;
  /** ISO 4217, e.g. "GTQ". */
  currency: string;
}

export type BookingState = "todo" | "booked";

/** Present only when the item needs or has a reservation. */
export interface Booking {
  state: BookingState;
  confirmation?: string;
  /** Where it was booked (manage link) or where to book it. */
  url?: string;
  price?: Money;
  /** First name of who booked it, or who is booking it. */
  by?: string;
  /** Cancellation terms, "pay cash on arrival", etc. */
  note?: string;
}

export interface Contact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
}

export type LinkKind = "booking" | "website" | "maps" | "tiktok" | "instagram" | "youtube" | "article" | "other";

export interface Link {
  id: string;
  url: string;
  kind: LinkKind;
  title?: string;
  /** Preview picture, from oEmbed or Open Graph. */
  image?: string;
  /** "TikTok", "airbnb.com". */
  site?: string;
  addedBy?: string;
  /** Epoch ms. */
  addedAt: number;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Item {
  id: string;
  /** Used for icons and sensible defaults; never something people must pick. */
  kind: ItemKind;
  title: string;
  /** No start: an idea, saved but not on a day yet. */
  start?: When | null;
  /** Stays: checkout. Flights: arrival. Activities: when it ends. */
  end?: When | null;
  place?: Place;
  booking?: Booking;
  contact?: Contact;
  links?: Link[];
  notes?: string;
  checklist?: CheckItem[];
  /** Who's running it. */
  who?: string;
  /** Tentative: shown as "Maybe" until someone settles it. */
  maybe?: boolean;
  /** A non-stay item you sleep in, like an overnight hike's camp. */
  sleepsHere?: boolean;
  /** Highest point in metres, for climbs. */
  peakM?: number;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  who?: string;
  /** The item it's about, if any. */
  itemId?: string;
  note?: string;
}

export interface Trip {
  schema: 2;
  id: string;
  name: string;
  /** "Guatemala". Used in prompts and searches. */
  destination: string;
  /** First day, "YYYY-MM-DD". */
  startDate: string;
  /** The day you travel home. Nights run up to the night before it. */
  endDate: string;
  /** The destination's IANA zone. */
  tz: string;
  /** Where the group lives, for flight departures. */
  homeTz?: string;
  /** Local currency, ISO 4217. */
  currency: string;
  homeCurrency?: string;
  /** First names in the group. */
  people: string[];
  /** Cover picture URL. */
  cover?: string;
  /** Trip-wide notes: entry rules, money, emergency numbers. */
  notes?: string;
  items: Item[];
  todos: Todo[];
}

/** A stored trip and its version; the version goes up by one per change. */
export interface TripState {
  trip: Trip;
  version: number;
}
