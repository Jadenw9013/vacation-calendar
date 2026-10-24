import { z } from "zod";
import { FirstName, ItemKindSchema, WhenSchema } from "./schema";
import { daysBetween, instantOf, isDate, isZone } from "./time";
import type { Trip } from "./types";

const optionalText = z.string().trim().max(200).nullable();
export const PlannerDraftSchema = z.object({
  name: optionalText,
  destination: optionalText,
  startDate: z.string().refine(isDate).nullable(),
  endDate: z.string().refine(isDate).nullable(),
  tz: z.string().max(64).nullable(),
  currency: z.string().max(3).nullable(),
  homeCurrency: z.string().max(3).nullable(),
  travelerName: FirstName.nullable(),
  people: z.array(FirstName).max(30),
  notes: z.string().max(5000),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    kind: ItemKindSchema,
    start: WhenSchema.nullable(),
    end: WhenSchema.nullable(),
    placeName: optionalText,
    notes: z.string().max(2000),
  }).strict()).max(40),
}).strict();
export type PlannerDraft = z.infer<typeof PlannerDraftSchema>;

export const PlannerMessageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(6000) }).strict();
export const PlannerSnapshotSchema = z.object({
  id: z.string().uuid(),
  messages: z.array(PlannerMessageSchema).max(40),
  draft: PlannerDraftSchema.nullable(),
  suggestions: z.array(z.string().max(180)).max(3),
}).strict();
export type PlannerSnapshot = z.infer<typeof PlannerSnapshotSchema>;

export const PlannerReplySchema = z.object({
  message: z.string().min(1).max(6000),
  suggestions: z.array(z.string().max(180)).max(3),
  draft: PlannerDraftSchema,
}).strict();

export function plannerProblems(draft: PlannerDraft | null, name?: string): string[] {
  if (!draft) return ["Tell me where you want to go."];
  const problems: string[] = [];
  if (!draft.destination?.trim()) problems.push("Choose a destination.");
  if (!isDate(draft.startDate) || !isDate(draft.endDate)) problems.push("Set the dates before saving your trip.");
  else if (draft.endDate < draft.startDate || daysBetween(draft.startDate, draft.endDate) > 365) problems.push("Use a trip length of up to one year, ending after it starts.");
  if (!draft.tz || !isZone(draft.tz)) problems.push("Confirm the destination's time zone.");
  if (!draft.currency || !/^[A-Z]{3}$/.test(draft.currency)) problems.push("Confirm the local currency.");
  if (draft.homeCurrency && !/^[A-Z]{3}$/.test(draft.homeCurrency)) problems.push("Confirm your home currency.");
  if (!name && !draft.travelerName) problems.push("Tell me your first name so I can save your trip.");
  if (draft.tz && isZone(draft.tz)) {
    for (const item of draft.items) {
      if (item.start && draft.startDate && draft.endDate && (item.start.date < draft.startDate || item.start.date > draft.endDate) || item.end && draft.endDate && item.end.date > draft.endDate) {
        problems.push("Some plans fall outside your trip dates. Ask the planner to adjust them."); break;
      }
      if (item.start && item.end) {
        const start = instantOf(item.start, draft.tz), end = instantOf(item.end, draft.tz);
        if (start !== null && end !== null ? end < start : item.end.date < item.start.date) { problems.push("One of your plans ends before it starts. Ask the planner to correct it."); break; }
      }
    }
  }
  return problems;
}

export function plannerTrip(draft: PlannerDraft, args: { id: string; name: string; homeTz: string; homeCurrency: string }): Trip {
  return {
    schema: 2, id: args.id, name: draft.name || draft.destination!, destination: draft.destination!,
    startDate: draft.startDate!, endDate: draft.endDate!, tz: draft.tz!, currency: draft.currency!,
    homeTz: args.homeTz, homeCurrency: args.homeCurrency,
    people: [...new Set([args.name, ...draft.people])], notes: draft.notes,
    items: draft.items.map((item, index) => ({
      id: `planned-${index + 1}`, title: item.title, kind: item.kind,
      ...(item.start ? { start: item.start } : {}), ...(item.end ? { end: item.end } : {}),
      ...(item.placeName ? { place: { name: item.placeName } } : {}),
      ...(item.notes ? { notes: item.notes } : {}), who: args.name,
    })), todos: [],
  };
}
