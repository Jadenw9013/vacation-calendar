import { z } from "zod";
import { isDate, isTime, isZone } from "./time";

/*
 * Schemas for everything stored, and for the ops that change it. The same
 * schemas check a manual edit, an offline edit replayed later and anything
 * the assistant proposes.
 */

export const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "Lowercase letters, digits, dashes and underscores");

/** First names only: one word. */
export const FirstName = z
  .string()
  .trim()
  .regex(/^\p{L}[\p{L}'-]{0,29}$/u, "First name only, one word");

const DateStr = z.string().refine(isDate, 'Use a date like "2026-11-28"');
const TimeStr = z.string().refine(isTime, 'Use a 24-hour time like "14:30"');
const Zone = z.string().max(64).refine(isZone, "Unknown time zone");
const Currency = z.string().regex(/^[A-Z]{3}$/, 'A 3-letter currency code like "USD"');
const Url = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    try {
      const p = new URL(u).protocol;
      return p === "https:" || p === "http:";
    } catch {
      return false;
    }
  }, "A web link starting with https://");
const Short = z.string().trim().min(1).max(200);
const Text = z.string().trim().max(5000);
const Line = z.string().trim().max(300);

export const WhenSchema = z.object({ date: DateStr, time: TimeStr.optional(), tz: Zone.optional() }).strict();

export const PlaceSchema = z
  .object({
    name: Line.optional(),
    address: Line.optional(),
    mapsUrl: Url.optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict();

export const MoneySchema = z.object({ amount: z.number().nonnegative().max(10_000_000), currency: Currency }).strict();

export const BookingSchema = z
  .object({
    state: z.enum(["todo", "booked"]),
    confirmation: z.string().trim().max(100).optional(),
    url: Url.optional(),
    price: MoneySchema.optional(),
    by: FirstName.optional(),
    note: Line.optional(),
  })
  .strict();

export const ContactSchema = z
  .object({
    phone: z.string().trim().max(40).optional(),
    whatsapp: z.string().trim().max(40).optional(),
    email: z.string().trim().max(200).optional(),
    website: Url.optional(),
    instagram: z.string().trim().max(100).optional(),
  })
  .strict();

export const LinkKindSchema = z.enum(["booking", "website", "maps", "tiktok", "instagram", "youtube", "article", "other"]);

export const LinkSchema = z
  .object({
    id: Id,
    url: Url,
    kind: LinkKindSchema,
    title: Line.optional(),
    image: Url.optional(),
    site: z.string().trim().max(100).optional(),
    addedBy: FirstName.optional(),
    addedAt: z.number().int().nonnegative(),
  })
  .strict();

export const CheckItemSchema = z.object({ id: Id, text: Line.min(1), done: z.boolean() }).strict();

export const ItemKindSchema = z.enum(["stay", "flight", "transport", "activity", "food", "other"]);

export const ItemSchema = z
  .object({
    id: Id,
    kind: ItemKindSchema,
    title: Short,
    start: WhenSchema.nullable().optional(),
    end: WhenSchema.nullable().optional(),
    place: PlaceSchema.optional(),
    booking: BookingSchema.optional(),
    contact: ContactSchema.optional(),
    links: z.array(LinkSchema).max(50).optional(),
    notes: Text.optional(),
    checklist: z.array(CheckItemSchema).max(100).optional(),
    who: FirstName.optional(),
    maybe: z.boolean().optional(),
    sleepsHere: z.boolean().optional(),
    peakM: z.number().int().positive().max(9000).optional(),
  })
  .strict();

export const TodoSchema = z
  .object({
    id: Id,
    text: Line.min(1),
    done: z.boolean(),
    who: FirstName.optional(),
    itemId: Id.optional(),
    note: Line.optional(),
  })
  .strict();

export const TripSchema = z
  .object({
    schema: z.literal(2),
    id: Id,
    name: Short,
    destination: Short,
    startDate: DateStr,
    endDate: DateStr,
    tz: Zone,
    homeTz: Zone.optional(),
    currency: Currency,
    homeCurrency: Currency.optional(),
    people: z.array(FirstName).max(30),
    cover: Url.or(z.string().regex(/^\/[\w./-]+$/)).optional(),
    notes: Text.optional(),
    items: z.array(ItemSchema).max(500),
    todos: z.array(TodoSchema).max(300),
  })
  .strict();

// ---------------------------------------------------------------------------
// Patches: null removes a field.

/* Nested details (place, contact, booking) merge one level deep: only the keys given change. */

export const PlacePatch = z
  .object({
    name: Line.nullable(),
    address: Line.nullable(),
    mapsUrl: Url.nullable(),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
  })
  .partial()
  .strict();

export const ContactPatch = z
  .object({
    phone: z.string().trim().max(40).nullable(),
    whatsapp: z.string().trim().max(40).nullable(),
    email: z.string().trim().max(200).nullable(),
    website: Url.nullable(),
    instagram: z.string().trim().max(100).nullable(),
  })
  .partial()
  .strict();

export const BookingPatch = z
  .object({
    state: z.enum(["todo", "booked"]),
    confirmation: z.string().trim().max(100).nullable(),
    url: Url.nullable(),
    price: MoneySchema.nullable(),
    by: FirstName.nullable(),
    note: Line.nullable(),
  })
  .partial()
  .strict();

export const ItemPatch = z
  .object({
    kind: ItemKindSchema,
    title: Short,
    start: WhenSchema.nullable(),
    end: WhenSchema.nullable(),
    place: PlacePatch.nullable(),
    booking: BookingPatch.nullable(),
    contact: ContactPatch.nullable(),
    notes: Text.nullable(),
    who: FirstName.nullable(),
    maybe: z.boolean().nullable(),
    sleepsHere: z.boolean().nullable(),
    peakM: z.number().int().positive().max(9000).nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

export const TodoPatch = z
  .object({ text: Line.min(1), done: z.boolean(), who: FirstName.nullable(), itemId: Id.nullable(), note: Line.nullable() })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

export const TripPatch = z
  .object({
    name: Short,
    destination: Short,
    startDate: DateStr,
    endDate: DateStr,
    tz: Zone,
    homeTz: Zone.nullable(),
    currency: Currency,
    homeCurrency: Currency.nullable(),
    people: z.array(FirstName).max(30),
    cover: z.string().max(2000).nullable(),
    notes: Text.nullable(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "No fields to change");

// ---------------------------------------------------------------------------
// Ops

const index = z.number().int().nonnegative().optional();

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("item.add"), item: ItemSchema, index }).strict(),
  z.object({ op: z.literal("item.update"), id: Id, set: ItemPatch }).strict(),
  z.object({ op: z.literal("item.remove"), id: Id }).strict(),
  z.object({ op: z.literal("link.add"), itemId: Id, link: LinkSchema, index }).strict(),
  z.object({ op: z.literal("link.update"), itemId: Id, linkId: Id, set: z.object({ title: Line.nullable(), image: Url.nullable(), kind: LinkKindSchema }).partial().strict() }).strict(),
  z.object({ op: z.literal("link.remove"), itemId: Id, linkId: Id }).strict(),
  z.object({ op: z.literal("check.add"), itemId: Id, check: CheckItemSchema, index }).strict(),
  z.object({ op: z.literal("check.set"), itemId: Id, checkId: Id, text: Line.min(1).optional(), done: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("check.remove"), itemId: Id, checkId: Id }).strict(),
  z.object({ op: z.literal("todo.add"), todo: TodoSchema, index }).strict(),
  z.object({ op: z.literal("todo.update"), id: Id, set: TodoPatch }).strict(),
  z.object({ op: z.literal("todo.remove"), id: Id }).strict(),
  z.object({ op: z.literal("trip.update"), set: TripPatch }).strict(),
]);

export type Op = z.infer<typeof OpSchema>;
export type ItemPatchT = z.infer<typeof ItemPatch>;
